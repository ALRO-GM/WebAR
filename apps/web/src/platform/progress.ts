import { ELEMENTS, REACTIONS, SPECIES, composition, reactionEnthalpy } from '@webar/chem';
import { FEATURES } from '../features';
import { NODES, START_ELEMENTS, nodeById, type PathNode } from '../learn/path';

/**
 * El progreso de un alumno sale de su registro de eventos (que solo crece):
 * así funciona igual sin conexión, en varios dispositivos y al sincronizar.
 * Todo lo demás (XP, racha, quarks, misiones, camino) se recalcula de ahí.
 */
export type EventType = 'descubrir' | 'reaccion' | 'reto' | 'leccion' | 'lectura' | 'adivina' | 'compra' | 'cofre' | 'foto';

export interface ProgressEvent {
  id: string;
  tipo: EventType;
  datos: Record<string, unknown>;
  /** ISO 8601. */
  fecha: string;
}

/** Cursos (LOMLOE) y las sustancias que se estudian en cada uno (docs/investigacion-plataforma.md). */
export const COURSES = ['2ESO', '3ESO', '4ESO', '1BACH'] as const;
export type Course = (typeof COURSES)[number];

export const COURSE_SPECIES: Record<Course, string[]> = {
  '2ESO': ['H2', 'O2', 'N2', 'Cl2', 'O3', 'H2O', 'CO2', 'NaCl', 'CH4'],
  '3ESO': ['CO', 'SO2', 'SO3', 'NO', 'NO2', 'N2O', 'MgO', 'CaO', 'CuO', 'Cu2O', 'ZnO', 'Fe2O3', 'Al2O3', 'FeS', 'HF', 'HCl', 'HBr', 'HI', 'H2S', 'NH3', 'H2O2', 'KCl', 'NaF', 'CaCl2', 'MgCl2'],
  '4ESO': ['NaOH', 'KOH', 'Ca(OH)2', 'HNO3', 'CaCO3', 'C2H2', 'CH2O', 'ZnCl2', 'AgCl', 'SiO2'],
  '1BACH': ['HCN', 'CS2', 'CCl4', 'F2', 'Br2', 'I2'],
};

export function courseOf(species: string): Course | undefined {
  return COURSES.find((c) => COURSE_SPECIES[c].includes(species));
}

export { START_ELEMENTS };

export const XP = {
  species: 50, perAtom: 10, reaction: 30, repeat: 5, challenge: 100,
  /** Lección: lo pone la lección (10 + aciertos + bonus), con este tope. */
  lessonMax: 30,
  guessMax: 20,
  /** Leer la ficha de un elemento por primera vez. */
  reading: 5,
};
export const QUARKS = { lesson: 5, perfect: 5, quest: 10, allQuests: 20, levelUp: 20, streakWeek: 50, chestMin: 20 };
export const SHOP = {
  /** Protege la racha un día sin jugar (se gasta solo). Como mucho 2 a la vez. */
  protector: { cost: 100, max: 2 },
  /** Doble de XP durante 15 minutos. */
  impulso: { cost: 60, minutes: 15 },
} as const;
export type ShopItem = keyof typeof SHOP;

export const LEVELS = [0, 60, 150, 300, 500, 800, 1200, 1700, 2400, 3200, 4200, 5500, 7000, 9000, 12000];

/** Las misiones del día: tres, distintas cada día (la primera, siempre de XP). */
export type QuestMetric = 'xp' | 'lecciones' | 'perfectas' | 'reacciones' | 'aciertos' | 'lecturas' | 'nuevas';
export interface Quest {
  id: string;
  metric: QuestMetric;
  goal: number;
  value: number;
  done: boolean;
}
const QUEST_POOL: Array<{ metric: QuestMetric; goals: number[] }> = [
  { metric: 'lecciones', goals: [1, 2, 3] },
  { metric: 'perfectas', goals: [1] },
  { metric: 'reacciones', goals: [2, 3, 5] },
  { metric: 'aciertos', goals: [3, 5, 8] },
  { metric: 'lecturas', goals: [1, 2] },
  { metric: 'nuevas', goals: [1] },
];

export interface Badge {
  id: string;
  /** Sustancias que hay que tener todas (si las hay). */
  species?: string[];
  test?: (p: Omit<Progress, 'badges'>) => boolean;
}

const OXIDES = ['CO', 'CO2', 'SO2', 'SO3', 'NO', 'NO2', 'N2O', 'MgO', 'CaO', 'CuO', 'Cu2O', 'ZnO', 'Fe2O3', 'Al2O3', 'SiO2'];
export const BADGES: Badge[] = [
  { id: 'primera', test: (p) => p.species.size >= 1 },
  { id: 'leccion1', test: (p) => p.lessons.size >= 1 },
  { id: 'racha3', test: (p) => p.longestStreak >= 3 },
  { id: 'racha7', test: (p) => p.longestStreak >= 7 },
  { id: 'racha30', test: (p) => p.longestStreak >= 30 },
  { id: 'perfecto', test: (p) => p.perfectLessons >= 5 },
  { id: 'agua', species: ['H2O'] },
  { id: 'aire', species: ['N2', 'O2', 'CO2'] },
  { id: 'fuego', test: (p) => p.exothermic >= 5 },
  { id: 'hielo', test: (p) => p.endothermic >= 3 },
  { id: 'detective', test: (p) => p.guessed >= 25 },
  { id: 'lector', test: (p) => p.read.size >= 20 },
  { id: 'oxidos', species: OXIDES },
  { id: 'sales', species: ['NaCl', 'KCl', 'NaF', 'AgCl', 'MgCl2', 'CaCl2', 'ZnCl2'] },
  { id: 'acidos', species: ['HF', 'HCl', 'HBr', 'HI', 'H2S', 'HNO3'] },
  { id: 'industria', test: (p) => p.reactions.has('haber') && p.reactions.has('contacto') },
  ...COURSES.map((c) => ({ id: `curso-${c}`, species: COURSE_SPECIES[c] })),
  { id: 'coleccion', test: (p) => p.species.size >= 25 },
  { id: 'todas', test: (p) => p.species.size >= SPECIES.length },
  // Con la foto en pausa (features.ts), su insignia no se puede conseguir: no se enseña.
  ...(FEATURES.foto ? [{ id: 'fotografo', test: (p: Omit<Progress, 'badges'>) => p.photos >= 1 }] : []),
  { id: 'tabla', test: (p) => p.unlocked.size >= ELEMENTS.length },
  { id: 'retos', test: (p) => p.challenges.size >= 3 },
];

export interface Progress {
  species: Set<string>;
  reactions: Set<string>;
  challenges: Set<string>;
  /** Elementos que se pueden usar (lecciones hechas + los de lo ya formado). */
  unlocked: Set<string>;
  /** Nodos del camino completados. */
  done: Set<string>;
  /** El siguiente nodo del camino (null: camino terminado). */
  current: PathNode | null;
  lessons: Set<string>;
  perfectLessons: number;
  /** Elementos cuya ficha se ha leído. */
  read: Set<string>;
  guessed: number;
  photos: number;
  xp: number;
  level: number;
  /** XP del nivel actual y del siguiente (para la barra). */
  levelFloor: number;
  levelNext: number | null;
  exothermic: number;
  endothermic: number;
  /** Días seguidos con algo hecho (hoy cuenta si ya se ha jugado; si no, la racha sigue viva hasta medianoche). */
  streak: number;
  longestStreak: number;
  /** Hoy ya ha sumado a la racha. */
  streakToday: boolean;
  /** Protectores de racha disponibles. */
  protectors: number;
  /** Días salvados con protector (para el calendario). */
  frozenDays: Set<string>;
  /** Días con actividad (YYYY-MM-DD local). */
  activeDays: Set<string>;
  xpToday: number;
  /** XP de la semana (lunes a domingo): para las ligas. */
  xpWeek: number;
  quarks: number;
  quests: Quest[];
  /** Hasta cuándo dura el impulso de doble XP (ms), si hay. */
  boostUntil: number;
  badges: Set<string>;
}

/** Fecha local YYYY-MM-DD. */
export const dayKey = (d: Date | string | number) => {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
};
/** Lunes (local) de la semana de una fecha. */
const mondayOf = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));

/** Número pseudoaleatorio estable a partir de un texto (misiones del día, cofres). */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function questsFor(day: string): Array<{ metric: QuestMetric; goal: number }> {
  const h = hash(day);
  const pool = [...QUEST_POOL];
  const picked: Array<{ metric: QuestMetric; goal: number }> = [{ metric: 'xp', goal: [20, 30, 50][h % 3] }];
  for (let i = 0; i < 2; i++) {
    const q = pool.splice((h >>> (4 + i * 5)) % pool.length, 1)[0];
    picked.push({ metric: q.metric, goal: q.goals[(h >>> (14 + i * 3)) % q.goals.length] });
  }
  return picked;
}

export const chestQuarks = (nodeId: string) => QUARKS.chestMin + (hash(nodeId) % 4) * 10;

type DayStats = Record<QuestMetric, number>;
const emptyDay = (): DayStats => ({ xp: 0, lecciones: 0, perfectas: 0, reacciones: 0, aciertos: 0, lecturas: 0, nuevas: 0 });

export function computeProgress(events: ProgressEvent[], now = new Date()): Progress {
  const species = new Set<string>();
  const reactions = new Set<string>();
  const challenges = new Set<string>();
  const lessons = new Set<string>();
  const read = new Set<string>();
  const done = new Set<string>();
  const unlocked = new Set(START_ELEMENTS);
  const days = new Map<string, DayStats>();
  const purchases: Array<{ day: string; item: string }> = [];
  let xp = 0;
  let quarks = 0;
  let exothermic = 0;
  let endothermic = 0;
  let perfectLessons = 0;
  let guessed = 0;
  let photos = 0;
  let boostUntil = 0;
  let level = 0;
  const thisMonday = mondayOf(now);
  let xpWeek = 0;

  const sorted = [...events].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const e of sorted) {
    const time = Date.parse(e.fecha);
    const day = dayKey(time);
    const stats = days.get(day) ?? emptyDay();
    days.set(day, stats);
    let gained = 0;
    const d = e.datos;
    switch (e.tipo) {
      case 'descubrir': {
        const s = SPECIES.find((x) => x.id === String(d.sustancia));
        if (!s || species.has(s.id)) break;
        species.add(s.id);
        stats.nuevas++;
        gained = XP.species + XP.perAtom * s.atoms.length;
        for (const el of Object.keys(composition(s))) unlocked.add(el);
        break;
      }
      case 'reaccion': {
        const id = String(d.reaccion);
        const deltaH = Number(d.deltaH ?? reactionEnthalpy(REACTIONS.find((r) => r.id === id) ?? { reactants: [], products: [] }));
        if (deltaH < -5) exothermic++;
        else if (deltaH > 5) endothermic++;
        gained = reactions.has(id) ? XP.repeat : XP.reaction;
        reactions.add(id);
        stats.reacciones++;
        break;
      }
      case 'reto': {
        const id = String(d.reto);
        if (!challenges.has(id)) gained = XP.challenge;
        challenges.add(id);
        break;
      }
      case 'leccion': {
        const node = nodeById(String(d.nodo));
        const total = Number(d.total) || 0;
        const right = Math.min(Number(d.aciertos) || 0, total);
        gained = Math.min(Math.max(Number(d.xp) || 0, 0), XP.lessonMax);
        stats.lecciones++;
        quarks += QUARKS.lesson;
        if (total > 0 && right === total && d.perfecta !== false) {
          perfectLessons++;
          stats.perfectas++;
          quarks += QUARKS.perfect;
        }
        stats.aciertos += 0;
        if (node) {
          done.add(node.id);
          lessons.add(node.id);
          if (node.kind === 'leccion') for (const el of node.elements) unlocked.add(el);
        }
        break;
      }
      case 'adivina': {
        const right = Math.max(0, Number(d.aciertos) || 0);
        guessed += right;
        stats.aciertos += right;
        gained = Math.min(Math.max(Number(d.xp) || 0, 0), XP.guessMax);
        if (d.nodo && nodeById(String(d.nodo))) done.add(String(d.nodo));
        break;
      }
      case 'lectura': {
        const el = String(d.elemento ?? d.tema ?? '');
        if (el && !read.has(el)) {
          read.add(el);
          gained = XP.reading;
        }
        stats.lecturas++;
        break;
      }
      case 'cofre': {
        const id = String(d.nodo);
        if (nodeById(id) && !done.has(id)) {
          done.add(id);
          quarks += chestQuarks(id);
        }
        break;
      }
      case 'compra': {
        const item = String(d.articulo) as ShopItem;
        const spec = SHOP[item];
        if (!spec || quarks < spec.cost) break;
        quarks -= spec.cost;
        purchases.push({ day, item });
        if (item === 'impulso') boostUntil = Math.max(boostUntil, time) + SHOP.impulso.minutes * 60000;
        break;
      }
      case 'foto':
        photos++;
        break;
    }
    if (gained > 0 && time < boostUntil) gained *= 2;
    xp += gained;
    stats.xp += gained;
    if (day >= thisMonday) xpWeek += gained;
    while (level + 1 < LEVELS.length && xp >= LEVELS[level + 1]) {
      level++;
      quarks += QUARKS.levelUp;
    }
  }

  // Laboratorio del camino: hecho si la sustancia ya se ha formado (cuando sea).
  for (const node of NODES) if (node.kind === 'laboratorio' && species.has(node.species!)) done.add(node.id);
  const current = NODES.find((n) => !done.has(n.id)) ?? null;

  // Misiones de cada día (las pasadas también dieron sus quarks).
  for (const [day, stats] of days) {
    const qs = questsFor(day);
    const completed = qs.filter((q) => stats[q.metric] >= q.goal).length;
    quarks += completed * QUARKS.quest + (completed === qs.length ? QUARKS.allQuests : 0);
  }
  const today = dayKey(now);
  const todayStats = days.get(today) ?? emptyDay();
  const quests: Quest[] = questsFor(today).map((q) => ({ id: `${today}-${q.metric}`, ...q, value: todayStats[q.metric], done: todayStats[q.metric] >= q.goal }));

  // Racha diaria con protectores: se recorre día a día desde el primero activo.
  const activeDays = new Set([...days].filter(([, s]) => s.xp > 0).map(([d]) => d));
  const frozenDays = new Set<string>();
  let streak = 0;
  let longestStreak = 0;
  let protectors = 0;
  const first = [...activeDays].sort()[0];
  if (first) {
    for (let d = first; d <= today; d = addDays(d, 1)) {
      // Los protectores comprados un día sirven para los días siguientes.
      if (activeDays.has(d)) {
        streak++;
        if (streak % 7 === 0) quarks += QUARKS.streakWeek;
      } else if (d !== today) {
        if (protectors > 0 && streak > 0) {
          protectors--;
          frozenDays.add(d);
        } else streak = 0;
      }
      for (const p of purchases) if (p.day === d && p.item === 'protector') protectors = Math.min(protectors + 1, SHOP.protector.max);
      longestStreak = Math.max(longestStreak, streak);
    }
  }

  const base = {
    species, reactions, challenges, unlocked, done, current, lessons, perfectLessons, read, guessed, photos,
    xp, level, exothermic, endothermic, streak, longestStreak, streakToday: activeDays.has(today), protectors, frozenDays, activeDays,
    xpToday: todayStats.xp, xpWeek, quarks, quests, boostUntil,
    levelFloor: LEVELS[level],
    levelNext: LEVELS[level + 1] ?? null,
  };
  const badges = new Set(BADGES.filter((b) => (b.species ? b.species.every((s) => species.has(s)) : b.test!(base))).map((b) => b.id));
  return { ...base, badges };
}

/** Lo que ha cambiado entre dos progresos: para las celebraciones. */
export function progressDiff(before: Progress, after: Progress) {
  return {
    species: [...after.species].filter((s) => !before.species.has(s)),
    elements: [...after.unlocked].filter((s) => !before.unlocked.has(s)),
    badges: [...after.badges].filter((b) => !before.badges.has(b)),
    levelUp: after.level > before.level,
    streakUp: after.streakToday && !before.streakToday,
    quests: after.quests.filter((q) => q.done && !before.quests.find((b) => b.id === q.id)?.done),
    nodes: [...after.done].filter((n) => !before.done.has(n)),
  };
}
