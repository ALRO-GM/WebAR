import { SKILLS, type Skill } from '../learn/exercises';
import { PATH } from '../learn/path';
import { computeProgress, dayKey, type EventType, type Progress, type ProgressEvent } from '../platform/progress';

/**
 * Las estadísticas de una clase para el profesorado, calculadas en el panel a
 * partir de los eventos del alumnado (los mismos que dan el progreso en la
 * app). Puras y con tests: aquí no hay textos ni DOM.
 *
 * Qué responden: cuánto y cuándo se usa, qué preguntas y temas cuestan más
 * (para trabajarlos en clase), cómo avanza cada unidad y elemento, quién va
 * más retrasado o más adelantado, y cómo juntar al alumnado de distinto nivel
 * para que se ayude (tutoría entre iguales).
 */

export interface StudentInfo {
  id: number;
  alias: string;
}

export interface ClassEvent {
  alumno: number;
  tipo: EventType;
  datos: Record<string, unknown>;
  /** ISO 8601. */
  fecha: string;
}

/** Respuestas a un grupo de preguntas. `aciertos` cuenta solo los aciertos a la primera. */
export interface Rate {
  intentos: number;
  aciertos: number;
  /** Alumnos distintos que han respondido / que han fallado alguna vez. */
  alumnos: number;
  fallaron: number;
}

export type Status = 'sin-empezar' | 'inactivo' | 'retrasado' | 'en-marcha' | 'avanzado';

/** Un motivo del estado de un alumno: clave de texto (estadisticas.motivo.*) y sus variables. */
export interface Reason {
  key: string;
  vars: Record<string, number | string>;
}

export interface StudentStats extends StudentInfo {
  progress: Progress;
  /** Nodos del camino completados y la unidad por la que va (la primera con lecciones sin hacer; PATH.length: todas hechas). */
  done: number;
  unit: number;
  lessons: number;
  answers: Rate;
  bySkill: Map<Skill, Rate>;
  byTopic: Map<string, Rate>;
  events: number;
  /** Días con actividad en los últimos 30. */
  activeDays: number;
  lastActive: string | null;
  /** Minutos en lecciones (lo que miden ellas). */
  minutes: number;
  /** 0–1: avance en el camino y acierto, para ordenar y emparejar. */
  mastery: number;
  status: Status;
  reasons: Reason[];
}

export interface Day {
  day: string;
  events: number;
  active: number;
  lessons: number;
}

export interface UnitProgress {
  unit: number;
  elements: string[];
  completed: number;
  inProgress: number;
  notYet: number;
}

export interface ElementProgress {
  symbol: string;
  unit: number;
  /** Alumnos que han hecho su lección. */
  students: number;
  rate: Rate;
}

export interface Pair {
  /** Quien explica (más avance) y quien aprende; a veces un tercero (grupos impares). */
  tutor: number;
  learners: number[];
  /** Tipos de pregunta en los que quien explica va bien y quien aprende no. */
  skills: Skill[];
  /** La unidad de quien aprende, si quien explica ya la ha terminado. */
  unit: number | null;
}

export interface ClassStats {
  students: StudentStats[];
  /** Los que han hecho algo alguna vez. */
  started: number;
  /** Activos en los últimos 7 días. */
  active7: number;
  answers: Rate;
  daily: Day[];
  /** Actividad por día de la semana (0 = lunes) y hora (0–23). */
  heat: number[][];
  bySkill: Array<{ skill: Skill } & Rate>;
  byTopic: Array<{ topic: string } & Rate>;
  /** Pregunta concreta: tipo + tema (p. ej. neutrones del oxígeno). */
  items: Array<{ skill: Skill; topic: string } & Rate>;
  units: UnitProgress[];
  elements: ElementProgress[];
  medianDone: number;
  pairs: Pair[];
  teams: number[][];
}

/** Respuestas mínimas para que un porcentaje signifique algo. */
export const MIN_ANSWERS = 5;
const DAY = 86400000;

const emptyRate = (): Rate => ({ intentos: 0, aciertos: 0, alumnos: 0, fallaron: 0 });
export const rate = (r: Rate) => (r.intentos ? r.aciertos / r.intentos : 0);

/** Acierto con prudencia: con pocas respuestas se acerca al de la clase (media bayesiana). */
const shrunk = (r: Rate, prior: number, weight = 5) => (r.aciertos + prior * weight) / (r.intentos + weight);

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

interface RawAnswer {
  tipo: Skill;
  tema: string;
  ok: boolean;
}

function answersOf(e: ClassEvent): RawAnswer[] {
  const list = e.datos.preguntas;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (a): a is RawAnswer => !!a && SKILLS.includes((a as RawAnswer).tipo) && typeof (a as RawAnswer).tema === 'string' && typeof (a as RawAnswer).ok === 'boolean',
  );
}

/** Suma respuestas a una tabla de tasas, contando alumnos distintos. */
class Tally<K> {
  readonly rates = new Map<K, Rate>();
  private readonly seen = new Map<K, Set<number>>();
  private readonly failed = new Map<K, Set<number>>();

  add(key: K, student: number, ok: boolean): void {
    const r = this.rates.get(key) ?? emptyRate();
    this.rates.set(key, r);
    r.intentos++;
    if (ok) r.aciertos++;
    const seen = this.seen.get(key) ?? new Set();
    this.seen.set(key, seen);
    seen.add(student);
    r.alumnos = seen.size;
    if (!ok) {
      const failed = this.failed.get(key) ?? new Set();
      this.failed.set(key, failed);
      failed.add(student);
      r.fallaron = failed.size;
    }
  }
}

/** Nodos de lección de cada unidad (lo que cuenta para «unidad terminada»). */
const UNIT_LESSONS = PATH.map((u) => u.nodes.filter((n) => n.kind === 'leccion').map((n) => n.id));

export function classStats(students: StudentInfo[], events: ClassEvent[], now = new Date()): ClassStats {
  const byStudent = new Map<number, ClassEvent[]>(students.map((s) => [s.id, []]));
  for (const e of events) byStudent.get(e.alumno)?.push(e);

  const skills = new Tally<Skill>();
  const topics = new Tally<string>();
  const items = new Tally<string>();
  const dayList: Day[] = [];
  for (let i = 29; i >= 0; i--) dayList.push({ day: dayKey(now.getTime() - i * DAY), events: 0, active: 0, lessons: 0 });
  const dayIndex = new Map(dayList.map((d, i) => [d.day, i]));
  const activeByDay = dayList.map(() => new Set<number>());
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  const result: StudentStats[] = students.map((s) => {
    const list = byStudent.get(s.id)!;
    const progress = computeProgress(
      list.map((e, i): ProgressEvent => ({ id: String(i), tipo: e.tipo, datos: e.datos, fecha: e.fecha })),
      now,
    );
    const mine = { skills: new Tally<Skill>(), topics: new Tally<string>() };
    const days = new Set<string>();
    let lessons = 0;
    let seconds = 0;
    let last: string | null = null;
    for (const e of list) {
      const date = new Date(e.fecha);
      const day = dayKey(date);
      const i = dayIndex.get(day);
      if (i !== undefined) {
        dayList[i].events++;
        activeByDay[i].add(s.id);
        if (e.tipo === 'leccion') dayList[i].lessons++;
        days.add(day);
      }
      heat[(date.getDay() + 6) % 7][date.getHours()]++;
      if (!last || e.fecha > last) last = e.fecha;
      if (e.tipo === 'leccion') {
        lessons++;
        seconds += Math.min(Math.max(Number(e.datos.segundos) || 0, 0), 3600);
      }
      for (const a of answersOf(e)) {
        skills.add(a.tipo, s.id, a.ok);
        topics.add(a.tema, s.id, a.ok);
        items.add(`${a.tipo}|${a.tema}`, s.id, a.ok);
        mine.skills.add(a.tipo, s.id, a.ok);
        mine.topics.add(a.tema, s.id, a.ok);
      }
    }
    const answers = [...mine.skills.rates.values()].reduce((sum, r) => ({ ...sum, intentos: sum.intentos + r.intentos, aciertos: sum.aciertos + r.aciertos }), emptyRate());
    // La unidad por la que va: la primera con lecciones sin hacer (los laboratorios piden RA y no frenan).
    const pending = UNIT_LESSONS.findIndex((ids) => ids.some((id) => !progress.done.has(id)));
    const unit = pending < 0 ? PATH.length : pending;
    return {
      ...s,
      progress,
      done: progress.done.size,
      unit,
      lessons,
      answers,
      bySkill: mine.skills.rates,
      byTopic: mine.topics.rates,
      events: list.length,
      activeDays: days.size,
      lastActive: last,
      minutes: Math.round(seconds / 60),
      mastery: 0,
      status: 'sin-empezar' as Status,
      reasons: [],
    };
  });
  dayList.forEach((d, i) => (d.active = activeByDay[i].size));

  const started = result.filter((s) => s.events > 0);
  const total = [...skills.rates.values()].reduce((sum, r) => ({ ...sum, intentos: sum.intentos + r.intentos, aciertos: sum.aciertos + r.aciertos }), emptyRate());
  total.alumnos = started.filter((s) => s.answers.intentos > 0).length;
  total.fallaron = started.filter((s) => s.answers.aciertos < s.answers.intentos).length;
  const classRate = total.intentos ? rate(total) : 0.75;
  const medianDone = median(started.map((s) => s.done));
  const topDone = quantile(started.map((s) => s.done), 0.75);
  const maxDone = Math.max(1, ...started.map((s) => s.done));
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const active7 = started.filter((s) => s.lastActive && s.lastActive >= weekAgo).length;

  for (const s of started) {
    const acc = shrunk(s.answers, classRate);
    s.mastery = 0.6 * (s.done / maxDone) + 0.4 * acc;
    const behind = s.done < medianDone * 0.6 && medianDone - s.done >= 2;
    const struggling = s.answers.intentos >= 10 && rate(s.answers) < 0.6;
    const away = !!s.lastActive && s.lastActive < weekAgo && active7 > 0;
    if (behind) s.reasons.push({ key: 'poco_avance', vars: { n: s.done, mediana: Math.round(medianDone) } });
    if (struggling) s.reasons.push({ key: 'acierto_bajo', vars: { pct: Math.round(rate(s.answers) * 100) } });
    if (away) s.reasons.push({ key: 'sin_entrar', vars: { n: Math.floor((now.getTime() - Date.parse(s.lastActive!)) / DAY) } });
    const weak = [...s.bySkill].filter(([, r]) => r.intentos >= 3 && rate(r) < 0.5).sort((a, b) => rate(a[1]) - rate(b[1]))[0];
    if (weak) s.reasons.push({ key: 'flojo_en', vars: { tipo: weak[0], pct: Math.round(rate(weak[1]) * 100) } });
    if (behind || struggling) s.status = 'retrasado';
    else if (away) s.status = 'inactivo';
    else if (s.done >= topDone && s.done > medianDone && s.answers.intentos >= MIN_ANSWERS && rate(s.answers) >= 0.8) {
      s.status = 'avanzado';
      s.reasons.unshift({ key: 'adelantado', vars: { n: s.done, pct: Math.round(rate(s.answers) * 100) } });
    } else s.status = 'en-marcha';
  }

  // Avance por unidades: hasta la siguiente a la más lejana a la que ha llegado alguien.
  const reach = Math.min(PATH.length - 1, Math.max(0, ...started.map((s) => s.unit)) + 1);
  const units: UnitProgress[] = PATH.slice(0, reach + 1).map((u) => {
    let completed = 0;
    let inProgress = 0;
    for (const s of started) {
      const lessonsDone = UNIT_LESSONS[u.index].filter((id) => s.progress.done.has(id)).length;
      if (lessonsDone === UNIT_LESSONS[u.index].length) completed++;
      else if (lessonsDone > 0 || s.unit === u.index) inProgress++;
    }
    return { unit: u.index, elements: u.elements, completed, inProgress, notYet: started.length - completed - inProgress };
  });

  const elements: ElementProgress[] = PATH.slice(0, reach + 1).flatMap((u) =>
    u.nodes
      .filter((n) => n.kind === 'leccion')
      .map((n) => ({
        symbol: n.elements[0],
        unit: u.index,
        students: started.filter((s) => s.progress.done.has(n.id)).length,
        rate: topics.rates.get(n.elements[0]) ?? emptyRate(),
      })),
  );

  return {
    students: result,
    started: started.length,
    active7,
    answers: total,
    daily: dayList,
    heat,
    bySkill: [...skills.rates].map(([skill, r]) => ({ skill, ...r })).sort((a, b) => rate(a) - rate(b)),
    byTopic: [...topics.rates].map(([topic, r]) => ({ topic, ...r })).sort((a, b) => rate(a) - rate(b)),
    items: [...items.rates]
      .map(([key, r]) => {
        const [skill, topic] = key.split('|') as [Skill, string];
        return { skill, topic, ...r };
      })
      .sort((a, b) => rate(a) - rate(b) || b.intentos - a.intentos),
    units,
    elements,
    medianDone,
    pairs: pairUp(started, classRate),
    teams: teamsOf(started),
  };
}

/** Lo que más cuesta a la clase: tasas con suficientes respuestas (y de más de una persona), de peor a mejor. */
export function hardest<T extends Rate>(list: T[], max = 5, below = 0.7): T[] {
  return list.filter((r) => r.intentos >= MIN_ANSWERS && r.alumnos >= 2 && rate(r) < below).sort((a, b) => rate(a) - rate(b) || b.fallaron - a.fallaron).slice(0, max);
}

/** Lo que mejor llevan: de mejor a peor. */
export function easiest<T extends Rate>(list: T[], max = 5, above = 0.85): T[] {
  return list.filter((r) => r.intentos >= MIN_ANSWERS && r.alumnos >= 2 && rate(r) >= above).sort((a, b) => rate(b) - rate(a) || b.intentos - a.intentos).slice(0, max);
}

const byMastery = (list: StudentStats[]) => [...list].sort((a, b) => b.mastery - a.mastery || a.alias.localeCompare(b.alias));

/**
 * Parejas de tutoría entre iguales, como en PALS o la tutoría entre iguales
 * de toda la clase: se ordena por nivel, se parte la lista por la mitad y el
 * primero de cada mitad va con el primero de la otra (1.º con el n/2+1.º…).
 * Así cada pareja tiene distinto nivel, pero no tan distinto como para no
 * entenderse (el primero con el último). Si son impares, un trío.
 */
export function pairUp(students: StudentStats[], classRate = 0.75): Pair[] {
  const ranked = byMastery(students);
  if (ranked.length < 2) return [];
  const half = Math.floor(ranked.length / 2);
  const tutors = ranked.slice(0, half);
  const learners = ranked.slice(half);
  const pairs: Pair[] = tutors.map((tutor, i) => ({ tutor: tutor.id, learners: [learners[i].id], skills: [], unit: null }));
  if (learners.length > tutors.length) pairs[pairs.length - 1].learners.push(learners[learners.length - 1].id);
  const find = new Map(students.map((s) => [s.id, s]));
  for (const p of pairs) {
    const tutor = find.get(p.tutor)!;
    const gaps = new Map<Skill, number>();
    for (const id of p.learners) {
      const learner = find.get(id)!;
      for (const [skill, r] of learner.bySkill) {
        const theirs = tutor.bySkill.get(skill);
        if (!theirs || theirs.intentos < 3 || r.intentos < 2) continue;
        const gap = shrunk(theirs, classRate) - shrunk(r, classRate);
        if (shrunk(theirs, classRate) >= 0.7 && gap >= 0.15) gaps.set(skill, Math.max(gaps.get(skill) ?? 0, gap));
      }
    }
    p.skills = [...gaps].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
    const unit = Math.min(...p.learners.map((id) => find.get(id)!.unit));
    p.unit = tutor.unit > unit && unit < PATH.length ? unit : null;
  }
  return pairs;
}

/**
 * Equipos de 4 con todos los niveles (como en el aprendizaje cooperativo):
 * por orden de nivel, se reparten en serpiente (1, 2, 3… y vuelta) para que
 * cada equipo tenga alguien de cada cuarto de la clase.
 */
export function teamsOf(students: StudentStats[], size = 4): number[][] {
  const ranked = byMastery(students);
  if (ranked.length < 2) return [];
  const count = Math.max(1, Math.round(ranked.length / size));
  const teams: number[][] = Array.from({ length: count }, () => []);
  ranked.forEach((s, i) => {
    const round = Math.floor(i / count);
    const k = i % count;
    teams[round % 2 ? count - 1 - k : k].push(s.id);
  });
  return teams;
}
