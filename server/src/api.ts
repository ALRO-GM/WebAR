import { checkSecret, classCode, hashSecret, issueToken, newToken, resolveToken, sha256 } from './auth.ts';
import type { DB } from './db.ts';
import { closePastWeeks, freshNickname, GROUP_SIZE, previousWeek, quotas, weekOf, XP_PER_DAY, DEMOTE, PROMOTE } from './liga.ts';

export interface ApiRequest {
  method: string;
  path: string;
  token?: string;
  body: unknown;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}

export const COURSES = ['2ESO', '3ESO', '4ESO', '1BACH'] as const;
const EVENT_TYPES = new Set(['descubrir', 'reaccion', 'reto', 'elemento', 'leccion', 'lectura', 'adivina', 'compra', 'cofre', 'foto', 'racha']);
const MAX_EVENT_DATA = 2000;
const AVATAR = /^[a-z0-9-]{1,30}$/;
const MAX_EVENTS_PER_SYNC = 500;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

function str(value: unknown, field: string, min = 1, max = 200): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `Campo «${field}» no válido`);
  return (value as string).trim();
}

type Row = Record<string, unknown>;

/**
 * La API de clases. Todo en JSON; errores como { error }. Sin dependencias:
 * main.ts la conecta a node:http y los tests la llaman directamente.
 */
export interface ApiOptions {
  /** Reloj (los tests lo cambian para simular semanas). */
  now?: () => Date;
}

export function createApi(db: DB, options: ApiOptions = {}) {
  const q = (sql: string) => db.prepare(sql);
  const now = options.now ?? (() => new Date());

  function teacherFrom(req: ApiRequest): number {
    const who = resolveToken(db, req.token);
    if (!who || who.kind !== 'teacher') fail(401, 'Inicia sesión como profesor');
    return who!.ownerId;
  }

  function studentFrom(req: ApiRequest): Row {
    const who = resolveToken(db, req.token);
    if (!who || who.kind !== 'student') fail(401, 'Únete a una clase');
    const student = q('select * from students where id = ?').get(who!.ownerId) as Row | undefined;
    if (!student) fail(401, 'Ya no estás en esa clase');
    return student!;
  }

  function ownClass(teacherId: number, classId: number): Row {
    const row = q('select * from classes where id = ? and teacher_id = ?').get(classId, teacherId) as Row | undefined;
    if (!row) fail(404, 'Clase no encontrada');
    return row!;
  }

  function publicTeacher(id: number) {
    return q('select id, email, name from teachers where id = ?').get(id);
  }

  function challengesOf(classId: number) {
    return (q('select id, title, description, targets, ends, created from challenges where class_id = ? order by created desc').all(classId) as Row[]).map(
      (c) => ({ ...c, targets: JSON.parse(c.targets as string) }),
    );
  }

  /** Lo que la clase ha conseguido junta (meta cooperativa) y lo último que ha pasado. */
  function classSummary(classId: number) {
    const discovered = q(
      `select json_extract(data, '$.sustancia') as species, count(distinct student_id) as students
       from events where class_id = ? and type = 'descubrir' group by species`,
    ).all(classId) as Array<{ species: string; students: number }>;
    const feed = q(
      `select s.alias, e.type, e.data, e.client_time as time from events e join students s on s.id = e.student_id
       where e.class_id = ? and e.type in ('descubrir', 'reto') order by e.server_time desc, e.client_time desc limit 15`,
    ).all(classId) as Row[];
    return { discovered, feed: feed.map((f) => ({ ...f, data: JSON.parse(f.data as string) })) };
  }

  // --- Ligas ----------------------------------------------------------------

  function playerFrom(req: ApiRequest): Row {
    const row = req.token
      ? (q('select p.* from player_tokens t join players p on p.id = t.player_id where t.hash = ?').get(sha256(req.token)) as Row | undefined)
      : undefined;
    if (!row) fail(401, 'Únete a la liga');
    return row!;
  }

  const publicPlayer = (p: Row) => ({ id: p.id as number, apodo: p.nickname as string, avatar: (p.avatar as string | null) ?? null, liga: p.league as number });

  function avatarOf(value: unknown): string | null | undefined {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string' || !AVATAR.test(value)) fail(400, 'Avatar no válido');
    return value as string;
  }

  /** Quién suma XP: un jugador, o un alumno (con su jugador enlazado, si lo tiene). */
  function xpOwner(req: ApiRequest): { player: Row | null; studentId: number | null } {
    if (resolveToken(db, req.token)?.kind === 'student') {
      const student = studentFrom(req);
      const player = (q('select * from players where student_id = ?').get(student.id as number) as Row | undefined) ?? null;
      return { player, studentId: student.id as number };
    }
    const player = playerFrom(req);
    return { player, studentId: (player.student_id as number | null) ?? null };
  }

  /** Guarda el XP de la semana (el máximo recibido). Al primer XP > 0 entra en un grupo de su liga. */
  function setPlayerXp(player: Row, week: string, xp: number): void {
    const updated = q('update league_entries set xp = max(xp, ?) where week = ? and player_id = ?').run(xp, week, player.id as number);
    if (updated.changes || xp <= 0) return;
    const league = player.league as number;
    const last = q('select grp, count(*) as n from league_entries where week = ? and league = ? group by grp order by grp desc limit 1').get(week, league) as
      | { grp: number; n: number }
      | undefined;
    const grp = !last ? 0 : last.n < GROUP_SIZE ? last.grp : last.grp + 1;
    q('insert into league_entries (week, player_id, league, grp, xp) values (?, ?, ?, ?, ?)').run(week, player.id as number, league, grp, xp);
  }

  function classRanking(classId: number, week: string, me?: number) {
    const rows = q(
      `select s.id, s.alias, coalesce(x.xp, 0) as xp from students s left join class_xp x on x.student_id = s.id and x.week = ?
       where s.class_id = ? order by xp desc, s.alias`,
    ).all(week, classId) as Array<{ id: number; alias: string; xp: number }>;
    return rows.map((r, i) => ({ puesto: i + 1, id: r.id, alias: r.alias, xp: r.xp, yo: r.id === me }));
  }

  const routes: Array<[string, RegExp, (req: ApiRequest, m: RegExpMatchArray) => unknown]> = [
    // --- Profesores -------------------------------------------------------
    ['POST', /^\/api\/profesores$/, (req) => {
      const b = req.body as Row;
      const email = str(b.email, 'email', 5, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Correo no válido');
      const name = str(b.nombre, 'nombre', 1, 80);
      const password = str(b.password, 'password', 8, 200);
      if (q('select 1 from teachers where email = ?').get(email)) fail(409, 'Ya hay una cuenta con ese correo');
      const id = Number(q('insert into teachers (email, name, password) values (?, ?, ?)').run(email, name, hashSecret(password)).lastInsertRowid);
      return { token: issueToken(db, 'teacher', id), profesor: publicTeacher(id) };
    }],
    ['POST', /^\/api\/sesion$/, (req) => {
      const b = req.body as Row;
      const row = q('select id, password from teachers where email = ?').get(str(b.email, 'email').toLowerCase()) as Row | undefined;
      if (!row || !checkSecret(str(b.password, 'password'), row.password as string)) fail(401, 'Correo o contraseña incorrectos');
      return { token: issueToken(db, 'teacher', row!.id as number), profesor: publicTeacher(row!.id as number) };
    }],
    ['GET', /^\/api\/profesor$/, (req) => {
      const id = teacherFrom(req);
      const classes = q(
        `select c.id, c.name, c.course, c.code, (select count(*) from students s where s.class_id = c.id) as students
         from classes c where teacher_id = ? order by c.created desc`,
      ).all(id);
      return { profesor: publicTeacher(id), clases: classes };
    }],

    // --- Clases -------------------------------------------------------------
    ['POST', /^\/api\/clases$/, (req) => {
      const teacher = teacherFrom(req);
      const b = req.body as Row;
      const course = str(b.curso, 'curso');
      if (!(COURSES as readonly string[]).includes(course)) fail(400, 'Curso no válido');
      let code = classCode();
      while (q('select 1 from classes where code = ?').get(code)) code = classCode();
      const id = Number(q('insert into classes (teacher_id, name, course, code) values (?, ?, ?, ?)').run(teacher, str(b.nombre, 'nombre', 1, 80), course, code).lastInsertRowid);
      return q('select id, name, course, code from classes where id = ?').get(id);
    }],
    ['GET', /^\/api\/clases\/(\d+)$/, (req, m) => {
      const cls = ownClass(teacherFrom(req), Number(m[1]));
      const id = cls.id as number;
      const students = q(
        `select s.id, s.alias, s.created, s.last_seen,
           (select count(distinct json_extract(data, '$.sustancia')) from events e where e.student_id = s.id and e.type = 'descubrir') as discovered,
           (select count(*) from events e where e.student_id = s.id and e.type = 'reaccion') as reactions,
           (select count(*) from events e where e.student_id = s.id and e.type = 'reto') as challenges
         from students s where s.class_id = ? order by s.alias`,
      ).all(id);
      const activity = q(
        `select date(client_time) as day, count(*) as events from events
         where class_id = ? and client_time >= date('now', '-13 days') group by day order by day`,
      ).all(id);
      const reactions = q(
        `select json_extract(data, '$.reaccion') as reaction, count(*) as times from events
         where class_id = ? and type = 'reaccion' group by reaction order by times desc limit 15`,
      ).all(id);
      return { clase: cls, alumnos: students, retos: challengesOf(id), actividad: activity, reacciones: reactions, ...classSummary(id) };
    }],
    ['DELETE', /^\/api\/clases\/(\d+)$/, (req, m) => {
      ownClass(teacherFrom(req), Number(m[1]));
      q('delete from classes where id = ?').run(Number(m[1]));
      return { ok: true };
    }],
    ['PATCH', /^\/api\/clases\/(\d+)\/alumnos\/(\d+)$/, (req, m) => {
      ownClass(teacherFrom(req), Number(m[1]));
      const alias = str((req.body as Row).alias, 'alias', 1, 30);
      try {
        q('update students set alias = ? where id = ? and class_id = ?').run(alias, Number(m[2]), Number(m[1]));
      } catch {
        fail(409, 'Ya hay alguien con ese alias en la clase');
      }
      return { ok: true };
    }],
    ['DELETE', /^\/api\/clases\/(\d+)\/alumnos\/(\d+)$/, (req, m) => {
      ownClass(teacherFrom(req), Number(m[1]));
      q('delete from students where id = ? and class_id = ?').run(Number(m[2]), Number(m[1]));
      return { ok: true };
    }],
    ['POST', /^\/api\/clases\/(\d+)\/retos$/, (req, m) => {
      ownClass(teacherFrom(req), Number(m[1]));
      const b = req.body as Row;
      const targets = b.objetivos;
      if (!Array.isArray(targets) || !targets.length || targets.length > 40 || !targets.every((t) => typeof t === 'string' && t.length < 20)) fail(400, 'Objetivos no válidos');
      const ends = b.fin == null || b.fin === '' ? null : str(b.fin, 'fin', 10, 10);
      const id = Number(
        q('insert into challenges (class_id, title, description, targets, ends) values (?, ?, ?, ?, ?)')
          .run(Number(m[1]), str(b.titulo, 'titulo', 1, 80), typeof b.descripcion === 'string' ? b.descripcion.slice(0, 500) : '', JSON.stringify(targets), ends)
          .lastInsertRowid,
      );
      return { id };
    }],
    ['DELETE', /^\/api\/clases\/(\d+)\/retos\/(\d+)$/, (req, m) => {
      ownClass(teacherFrom(req), Number(m[1]));
      q('delete from challenges where id = ? and class_id = ?').run(Number(m[2]), Number(m[1]));
      return { ok: true };
    }],

    // --- Alumnos ------------------------------------------------------------
    ['POST', /^\/api\/unirse$/, (req) => {
      const b = req.body as Row;
      const code = str(b.codigo, 'codigo', 6, 6).toUpperCase();
      const alias = str(b.alias, 'alias', 1, 30);
      const pin = str(b.pin, 'pin', 4, 8);
      if (!/^\d+$/.test(pin)) fail(400, 'El PIN son números');
      const cls = q('select id, name, course from classes where code = ?').get(code) as Row | undefined;
      if (!cls) fail(404, 'No hay ninguna clase con ese código');
      const existing = q('select id, pin from students where class_id = ? and alias = ?').get(cls!.id as number, alias) as Row | undefined;
      let id: number;
      if (existing) {
        // Mismo alias y PIN: es el mismo alumno en otro dispositivo.
        if (!checkSecret(pin, existing.pin as string)) fail(409, 'Ese alias ya está cogido en la clase (o el PIN no es el tuyo)');
        id = existing.id as number;
      } else {
        id = Number(q('insert into students (class_id, alias, pin) values (?, ?, ?)').run(cls!.id as number, alias, hashSecret(pin)).lastInsertRowid);
      }
      return { token: issueToken(db, 'student', id), alumno: { id, alias }, clase: cls };
    }],
    ['POST', /^\/api\/sync$/, (req) => {
      const student = studentFrom(req);
      const events = (req.body as Row)?.eventos;
      if (!Array.isArray(events) || events.length > MAX_EVENTS_PER_SYNC) fail(400, 'Eventos no válidos');
      const insert = q('insert or ignore into events (id, student_id, class_id, type, data, client_time) values (?, ?, ?, ?, ?, ?)');
      const accepted: string[] = [];
      db.exec('begin');
      try {
        for (const e of events as Row[]) {
          if (typeof e?.id !== 'string' || e.id.length > 64 || !EVENT_TYPES.has(e.tipo as string)) continue;
          const data = JSON.stringify(e.datos ?? {});
          if (data.length > MAX_EVENT_DATA) continue;
          const time = typeof e.fecha === 'string' && !Number.isNaN(Date.parse(e.fecha)) ? new Date(e.fecha as string).toISOString() : new Date().toISOString();
          insert.run(e.id, student.id as number, student.class_id as number, e.tipo as string, data, time);
          accepted.push(e.id);
        }
        q("update students set last_seen = datetime('now') where id = ?").run(student.id as number);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
      const cls = q('select id, name, course from classes where id = ?').get(student.class_id as number) as Row;
      const classmates = (q('select count(*) as n from students where class_id = ?').get(cls.id as number) as Row).n;
      return { aceptados: accepted, alumno: { id: student.id, alias: student.alias }, clase: { ...cls, alumnos: classmates }, retos: challengesOf(cls.id as number), ...classSummary(cls.id as number) };
    }],

    // --- Jugadores (anónimos) y ligas --------------------------------------
    ['POST', /^\/api\/jugadores$/, (req) => {
      const avatar = avatarOf((req.body as Row | undefined)?.avatar) ?? null;
      let player: Row | undefined;
      if (resolveToken(db, req.token)?.kind === 'student') {
        // Alumno de clase: su jugador queda enlazado (uno por alumno; otro dispositivo, otro token).
        const student = studentFrom(req);
        player = q('select * from players where student_id = ?').get(student.id as number) as Row | undefined;
        if (player && avatar) q('update players set avatar = ? where id = ?').run(avatar, player.id as number);
        if (!player) q('insert into players (nickname, avatar, student_id) values (?, ?, ?)').run(freshNickname(db), avatar, student.id as number);
        player = q('select * from players where student_id = ?').get(student.id as number) as Row;
      } else {
        const id = Number(q('insert into players (nickname, avatar) values (?, ?)').run(freshNickname(db), avatar).lastInsertRowid);
        player = q('select * from players where id = ?').get(id) as Row;
      }
      const token = newToken();
      q('insert into player_tokens (hash, player_id) values (?, ?)').run(sha256(token), player.id as number);
      return { token, ...publicPlayer(player) };
    }],
    ['GET', /^\/api\/jugadores\/yo$/, (req) => publicPlayer(playerFrom(req))],
    ['PATCH', /^\/api\/jugadores\/yo$/, (req) => {
      const player = playerFrom(req);
      const b = (req.body ?? {}) as Row;
      const avatar = avatarOf(b.avatar);
      if (avatar !== undefined) q('update players set avatar = ? where id = ?').run(avatar, player.id as number);
      if (b.nuevoApodo === true) q('update players set nickname = ? where id = ?').run(freshNickname(db), player.id as number);
      return publicPlayer(q('select * from players where id = ?').get(player.id as number) as Row);
    }],
    ['DELETE', /^\/api\/jugadores\/yo$/, (req) => {
      // Se va de la liga mundial: jugador, tokens, grupos y resultados. El XP de su clase es del alumno y se queda.
      q('delete from players where id = ?').run(playerFrom(req).id as number);
      return { ok: true };
    }],
    ['PUT', /^\/api\/liga\/xp$/, (req) => {
      const raw = (req.body as Row | undefined)?.xp;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) fail(400, 'XP no válido');
      const week = weekOf(now());
      const cap = XP_PER_DAY * week.day;
      const xp = Math.min(Math.floor(raw as number), cap);
      const { player, studentId } = xpOwner(req);
      let stored = 0;
      if (player) {
        setPlayerXp(player, week.id, xp);
        stored = ((q('select xp from league_entries where week = ? and player_id = ?').get(week.id, player.id as number) as Row | undefined)?.xp as number) ?? 0;
      }
      if (studentId != null) {
        q('insert into class_xp (week, student_id, xp) values (?, ?, ?) on conflict (week, student_id) do update set xp = max(xp, excluded.xp)').run(week.id, studentId, xp);
        stored = Math.max(stored, (q('select xp from class_xp where week = ? and student_id = ?').get(week.id, studentId) as Row).xp as number);
      }
      return { semana: week.id, xp: stored, tope: cap };
    }],
    ['GET', /^\/api\/liga$/, (req) => {
      const player = playerFrom(req);
      const week = weekOf(now());
      const entry = q('select league, grp from league_entries where week = ? and player_id = ?').get(week.id, player.id as number) as Row | undefined;
      const rows = entry
        ? (q(
            `select p.id, p.nickname, p.avatar, e.xp from league_entries e join players p on p.id = e.player_id
             where e.week = ? and e.league = ? and e.grp = ? order by e.xp desc, e.rowid`,
          ).all(week.id, entry.league as number, entry.grp as number) as Row[])
        : [{ id: player.id, nickname: player.nickname, avatar: player.avatar, xp: 0 }];
      const { up, down } = entry ? quotas(rows.length) : { up: PROMOTE, down: DEMOTE };
      const prev = q('select league, rank, change from league_results where week = ? and player_id = ?').get(previousWeek(week).id, player.id as number) as Row | undefined;
      return {
        semana: week.id,
        termina: week.ends,
        liga: (entry?.league as number | undefined) ?? (player.league as number),
        enGrupo: !!entry,
        grupo: rows.map((r, i) => ({ puesto: i + 1, apodo: r.nickname, avatar: r.avatar ?? null, xp: r.xp, yo: r.id === player.id })),
        sube: up,
        baja: down,
        ...(prev ? { resultadoAnterior: { liga: prev.league, puesto: prev.rank, cambio: prev.change } } : {}),
      };
    }],
    ['GET', /^\/api\/liga\/clase$/, (req) => {
      const student = studentFrom(req);
      const week = weekOf(now());
      const ranking = classRanking(student.class_id as number, week.id, student.id as number).map(({ id: _, ...r }) => r);
      return { semana: week.id, termina: week.ends, ranking };
    }],
    ['GET', /^\/api\/clases\/(\d+)\/liga$/, (req, m) => {
      const cls = ownClass(teacherFrom(req), Number(m[1]));
      const week = weekOf(now());
      const alumnos = classRanking(cls.id as number, week.id).map(({ yo: _, ...r }) => r);
      return { semana: week.id, termina: week.ends, alumnos };
    }],
  ];

  return function handle(req: ApiRequest): ApiResponse {
    for (const [method, pattern, handler] of routes) {
      const m = req.path.match(pattern);
      if (!m) continue;
      if (method !== req.method) continue;
      try {
        // La semana se cierra perezosamente: en la primera petición de liga de la semana nueva.
        if (/^\/api\/(liga|jugadores)(\/|$)/.test(req.path)) closePastWeeks(db, weekOf(now()));
        return { status: 200, body: handler(req, m) };
      } catch (error) {
        if (error instanceof HttpError) return { status: error.status, body: { error: error.message } };
        console.error(error);
        return { status: 500, body: { error: 'Error del servidor' } };
      }
    }
    return { status: 404, body: { error: 'No existe' } };
  };
}
