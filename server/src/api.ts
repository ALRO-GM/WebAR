import { checkSecret, classCode, hashSecret, issueToken, resolveToken } from './auth.ts';
import type { DB } from './db.ts';

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
const EVENT_TYPES = new Set(['descubrir', 'reaccion', 'reto', 'elemento']);
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
export function createApi(db: DB) {
  const q = (sql: string) => db.prepare(sql);

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
          const time = typeof e.fecha === 'string' && !Number.isNaN(Date.parse(e.fecha)) ? new Date(e.fecha as string).toISOString() : new Date().toISOString();
          insert.run(e.id, student.id as number, student.class_id as number, e.tipo as string, JSON.stringify(e.datos ?? {}).slice(0, 2000), time);
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
  ];

  return function handle(req: ApiRequest): ApiResponse {
    for (const [method, pattern, handler] of routes) {
      const m = req.path.match(pattern);
      if (!m) continue;
      if (method !== req.method) continue;
      try {
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
