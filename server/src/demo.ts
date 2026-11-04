import { hashSecret, issueToken, newToken } from './auth.ts';
import type { DB } from './db.ts';
import { weekOf } from './liga.ts';

/**
 * Modo demostración, para presentar Labtory sin datos reales:
 *
 * - un profesor de demostración con una clase (3.º ESO) de 24 alias
 *   inventados y unas semanas de actividad realista: lecciones con sus
 *   respuestas (unos fallan más los neutrones, otros los símbolos…), horarios
 *   de clase y de tarde, quien va adelantado y quien lleva días sin entrar;
 *   además, un reto y dos actividades lanzadas con sus resultados;
 * - un alumno «Demo» en esa clase, para la app con todo desbloqueado.
 *
 * Se entra sin contraseña (POST /api/demo): no hay nada privado. Los datos
 * inventados se rehacen cada 12 horas para que «esta semana» siga teniendo
 * actividad; el alumno «Demo» se conserva (su token sigue valiendo).
 */
const DEMO_EMAIL = 'demo@labtory.invalid';
const CLASS_NAME = '3.º B · demostración';
const REFRESH_MS = 12 * 3600 * 1000;
export const DEMO_STUDENT = 'Demo';

/** Las primeras unidades del camino (como en apps/web/src/learn/path.ts): id de nodo = u<n>-leccion-<símbolo>. */
const UNITS = [['H'], ['He'], ['C'], ['O'], ['N'], ['Na', 'Cl'], ['Li', 'K'], ['S'], ['Mg', 'Ca'], ['F', 'Br', 'I'], ['Fe', 'Cu', 'Zn', 'V'], ['Al', 'Si', 'Ga']];
/** Lo difícil que es cada tipo de pregunta (acierto base). */
const SKILLS: Record<string, number> = { dato: 0.86, protones: 0.84, electrones: 0.74, neutrones: 0.46, simbolo: 0.68, pista: 0.8, formula: 0.6 };
const ALIASES = [
  'Argón', 'Boro', 'Cobre', 'Dalton', 'Erbio', 'Flúor', 'Galio', 'Helio', 'Indio', 'Kriptón', 'Litio', 'Neón',
  'Osmio', 'Plata', 'Radón', 'Silicio', 'Titanio', 'Uranio', 'Vanadio', 'Xenón', 'Zinc', 'Yodo', 'Bismuto', 'Curio',
];
const SPECIES_BY_UNIT: Record<number, string[]> = { 0: ['H2'], 3: ['H2O', 'O2', 'CO2'], 4: ['N2', 'NH3'], 5: ['NaCl', 'HCl'], 6: ['KCl'], 7: ['H2S'], 8: ['MgO', 'CaO'] };

type Row = Record<string, unknown>;

function random(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function ensureDemo(db: DB, now = new Date()): { teacherToken: string; classId: number; code: string } {
  const q = (sql: string) => db.prepare(sql);
  db.exec('create table if not exists demo_state (id integer primary key check (id = 1), generated text not null)');
  let teacher = q('select id from teachers where email = ?').get(DEMO_EMAIL) as Row | undefined;
  if (!teacher) {
    // Sin contraseña utilizable: solo se entra con POST /api/demo.
    q('insert into teachers (email, name, password) values (?, ?, ?)').run(DEMO_EMAIL, 'Demostración', hashSecret(newToken()));
    teacher = q('select id from teachers where email = ?').get(DEMO_EMAIL) as Row;
  }
  const teacherId = teacher.id as number;
  let cls = q('select id, code from classes where teacher_id = ? and name = ?').get(teacherId, CLASS_NAME) as Row | undefined;
  if (!cls) {
    q("insert into classes (teacher_id, name, course, code) values (?, ?, '3ESO', ?)").run(teacherId, CLASS_NAME, `DEMO${String(teacherId).padStart(2, '0')}`.slice(0, 6));
    cls = q('select id, code from classes where teacher_id = ? and name = ?').get(teacherId, CLASS_NAME) as Row;
    q('delete from demo_state').run();
  }
  const classId = cls.id as number;
  const state = q('select generated from demo_state where id = 1').get() as Row | undefined;
  if (!state || now.getTime() - Date.parse(state.generated as string) > REFRESH_MS) generate(db, classId, now);
  return { teacherToken: issueToken(db, 'teacher', teacherId), classId, code: cls.code as string };
}

/** El alumno «Demo» de la clase de demostración (lo crea si falta) y un token suyo. */
export function demoStudent(db: DB, now = new Date()): { token: string; alumno: { id: number; alias: string }; clase: Row } {
  const { classId } = ensureDemo(db, now);
  const q = (sql: string) => db.prepare(sql);
  let student = q('select id from students where class_id = ? and alias = ?').get(classId, DEMO_STUDENT) as Row | undefined;
  if (!student) {
    q('insert into students (class_id, alias, pin) values (?, ?, ?)').run(classId, DEMO_STUDENT, hashSecret(newToken()));
    student = q('select id from students where class_id = ? and alias = ?').get(classId, DEMO_STUDENT) as Row;
  }
  const id = student.id as number;
  return { token: issueToken(db, 'student', id), alumno: { id, alias: DEMO_STUDENT }, clase: q('select id, name, course from classes where id = ?').get(classId) as Row };
}

/** Rehace los alias inventados y su actividad (las últimas 4 semanas), el reto y las actividades. */
function generate(db: DB, classId: number, now: Date): void {
  const q = (sql: string) => db.prepare(sql);
  const rnd = random(Math.floor(now.getTime() / REFRESH_MS));
  db.exec('begin');
  try {
    for (const alias of ALIASES) q('delete from students where class_id = ? and alias = ?').run(classId, alias);
    q('delete from challenges where class_id = ?').run(classId);
    q('delete from activities where class_id = ?').run(classId);
    q('insert into challenges (class_id, title, description, targets) values (?, ?, ?, ?)').run(classId, 'Los óxidos del aire', 'Formad los gases que salen al quemar cosas.', JSON.stringify(['CO2', 'SO2', 'NO2']));
    const riddle = Number(q("insert into activities (class_id, kind, config, created) values (?, 'acertijo', ?, datetime('now', '-2 days'))").run(classId, JSON.stringify({ acertijo: 'H2O' })).lastInsertRowid);
    const guess = Number(q("insert into activities (class_id, kind, config, created) values (?, 'adivina', ?, datetime('now', '-1 days'))").run(classId, JSON.stringify({ elementos: ['H', 'He', 'C', 'O', 'N', 'Na', 'Cl', 'Fe', 'Cu', 'Au'] })).lastInsertRowid);
    const addStudent = q('insert into students (class_id, alias, pin, created, last_seen) values (?, ?, ?, ?, ?)');
    const addEvent = q('insert into events (id, student_id, class_id, type, data, client_time, server_time) values (?, ?, ?, ?, ?, ?, ?)');
    const day = 86400000;
    ALIASES.forEach((alias, i) => {
      // Perfiles: 3 que van como un tiro, 4 que se atascan, 3 que dejaron de entrar, 1 sin empezar.
      const ability = i < 3 ? 0.95 : i >= 19 ? 0.3 + rnd() * 0.1 : 0.45 + rnd() * 0.45;
      const units = i === 23 ? 0 : Math.max(1, Math.round(ability * UNITS.length * (0.65 + rnd() * 0.45)));
      const away = [6, 14, 20].includes(i) ? 8 + (i % 6) : 0;
      const weakness = ['neutrones', 'simbolo', 'formula', 'electrones'][i % 4];
      const lessons = UNITS.slice(0, units).flat().length;
      const span = (26 - away) * day;
      const created = new Date(now.getTime() - 28 * day).toISOString().replace('T', ' ').slice(0, 19);
      const sid = Number(addStudent.run(classId, alias, hashSecret(newToken()), created, null).lastInsertRowid);
      let k = 0;
      let last = '';
      const put = (type: string, data: Row, at: Date) => {
        const iso = at.toISOString();
        last = iso > last ? iso : last;
        addEvent.run(`demo-${sid}-${k++}`, sid, classId, type, JSON.stringify(data), iso, iso.replace('T', ' ').slice(0, 19));
      };
      let n = 0;
      UNITS.slice(0, units).forEach((els, u) => {
        for (const el of els) {
          const at = new Date(now.getTime() - 27 * day + ((n++ + rnd()) / Math.max(1, lessons)) * span);
          // En clase (9–14 h) o por la tarde (17–22 h).
          at.setHours(rnd() < 0.6 ? 9 + Math.floor(rnd() * 5) : 17 + Math.floor(rnd() * 5), Math.floor(rnd() * 60));
          if (at.getTime() > now.getTime() - away * day) at.setTime(now.getTime() - away * day - rnd() * 6 * 3600000);
          const preguntas = Object.entries(SKILLS)
            .filter(() => rnd() < 0.8)
            .map(([tipo, base]) => ({ tipo, tema: tipo === 'formula' ? 'H2O' : el, ok: rnd() < Math.min(0.98, base * (tipo === weakness ? 0.6 : 1) * (0.55 + ability * 0.6)) }));
          const right = preguntas.filter((p) => p.ok).length;
          put('leccion', { nodo: `u${u + 1}-leccion-${el}`, aciertos: right, total: preguntas.length, xp: Math.min(30, 10 + right), segundos: 90 + Math.floor(rnd() * 200), preguntas }, at);
          if (rnd() < 0.45) {
            const objetos = [el, 'H', 'O'].map((tema) => ({ tipo: 'objeto', tema, ok: rnd() < 0.5 + ability * 0.45 }));
            put('adivina', { aciertos: objetos.filter((o) => o.ok).length, total: 3, xp: 6, preguntas: objetos }, new Date(at.getTime() + 600000));
          }
        }
        for (const s of SPECIES_BY_UNIT[u] ?? []) if (rnd() < 0.5 + ability / 2) put('descubrir', { sustancia: s }, new Date(Math.min(now.getTime() - away * day, Date.parse(last) + 1800000)));
        put('cofre', { nodo: `u${u + 1}-cofre` }, new Date(last));
      });
      // Las dos actividades: las hace quien entra estos días.
      if (units && !away && rnd() < 0.85) {
        const solved = rnd() < 0.4 + ability / 2;
        put('actividad', { actividad: riddle, tipo: 'acertijo', puntos: solved ? Math.round(55 + ability * 40) : 0, resuelto: solved }, new Date(now.getTime() - day - rnd() * day));
      }
      if (units && !away && rnd() < 0.75) {
        const right = Math.round(5 * Math.min(1, 0.4 + ability * 0.6 * (0.8 + rnd() * 0.4)));
        put('actividad', { actividad: guess, tipo: 'adivina', puntos: right * 20, aciertos: right, total: 5 }, new Date(now.getTime() - rnd() * day));
      }
      if (last) q('update students set last_seen = ? where id = ?').run(last.replace('T', ' ').slice(0, 19), sid);
      // Liga de la clase de esta semana: quien entra estos días suma XP.
      if (units && !away) q('insert or replace into class_xp (week, student_id, xp) values (?, ?, ?)').run(weekOf(now).id, sid, Math.round(40 + ability * 260 * (0.6 + rnd() * 0.6)));
    });
    q("insert into demo_state (id, generated) values (1, ?) on conflict (id) do update set generated = excluded.generated").run(now.toISOString());
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
