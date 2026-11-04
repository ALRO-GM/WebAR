import { ELEMENTS, REACTIONS, SPECIES, composition, reactionEnthalpy } from '@webar/chem';

/**
 * El progreso de un alumno sale de su registro de eventos (que solo crece):
 * así funciona igual sin conexión, en varios dispositivos y al sincronizar.
 */
export type EventType = 'descubrir' | 'reaccion' | 'reto';

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

/** Con qué elementos se empieza y en qué orden se desbloquean los demás. */
export const START_ELEMENTS = ['H', 'C', 'N', 'O'];
const UNLOCK_ORDER = [
  'Na', 'Cl', 'S', 'Mg', 'Ca', 'F', 'K', 'Fe', 'Al', 'Cu', 'Zn', 'Si', 'Ag', 'Br', 'I', 'He', 'Ne', 'Ar', 'Li', 'P', 'Au', 'Hg', 'Pb', 'U',
  ...ELEMENTS.map((e) => e.symbol),
].filter((s, i, all) => !START_ELEMENTS.includes(s) && all.indexOf(s) === i);

/** Cada sustancia nueva desbloquea 3 elementos y cada reacción distinta, 1. */
export const ELEMENTS_PER_SPECIES = 3;

export const XP = { species: 50, perAtom: 10, reaction: 30, repeat: 5, challenge: 100 };
export const LEVELS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

export interface Badge {
  id: string;
  /** Sustancias que hay que tener todas (si las hay). */
  species?: string[];
  test?: (p: Omit<Progress, 'badges'>) => boolean;
}

const OXIDES = ['CO', 'CO2', 'SO2', 'SO3', 'NO', 'NO2', 'N2O', 'MgO', 'CaO', 'CuO', 'Cu2O', 'ZnO', 'Fe2O3', 'Al2O3', 'SiO2'];
export const BADGES: Badge[] = [
  { id: 'primera', test: (p) => p.species.size >= 1 },
  { id: 'agua', species: ['H2O'] },
  { id: 'aire', species: ['N2', 'O2', 'CO2'] },
  { id: 'fuego', test: (p) => p.exothermic >= 5 },
  { id: 'hielo', test: (p) => p.endothermic >= 3 },
  { id: 'oxidos', species: OXIDES },
  { id: 'sales', species: ['NaCl', 'KCl', 'NaF', 'AgCl', 'MgCl2', 'CaCl2', 'ZnCl2'] },
  { id: 'acidos', species: ['HF', 'HCl', 'HBr', 'HI', 'H2S', 'HNO3'] },
  { id: 'industria', test: (p) => p.reactions.has('haber') && p.reactions.has('contacto') },
  ...COURSES.map((c) => ({ id: `curso-${c}`, species: COURSE_SPECIES[c] })),
  { id: 'coleccion', test: (p) => p.species.size >= 25 },
  { id: 'todas', test: (p) => p.species.size >= SPECIES.length },
  { id: 'tabla', test: (p) => p.unlocked.size >= ELEMENTS.length },
  { id: 'retos', test: (p) => p.challenges.size >= 3 },
  { id: 'racha', test: (p) => p.weekStreak >= 4 },
];

export interface Progress {
  species: Set<string>;
  reactions: Set<string>;
  challenges: Set<string>;
  unlocked: Set<string>;
  xp: number;
  level: number;
  /** XP del nivel actual y del siguiente (para la barra). */
  levelFloor: number;
  levelNext: number | null;
  exothermic: number;
  endothermic: number;
  /** Semanas seguidas (hasta esta) con algo hecho: una racha suave. */
  weekStreak: number;
  badges: Set<string>;
}

/** Lunes de la semana de una fecha (UTC), como número de semana absoluto. */
const weekIndex = (iso: string) => Math.floor((Date.parse(iso) / 86400000 + 3) / 7);

export function computeProgress(events: ProgressEvent[], now = new Date().toISOString()): Progress {
  const species = new Set<string>();
  const reactions = new Set<string>();
  const challenges = new Set<string>();
  let xp = 0;
  let exothermic = 0;
  let endothermic = 0;
  const weeks = new Set<number>();
  const sorted = [...events].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const e of sorted) {
    weeks.add(weekIndex(e.fecha));
    if (e.tipo === 'descubrir') {
      const id = String(e.datos.sustancia);
      const s = SPECIES.find((x) => x.id === id);
      if (!s || species.has(id)) continue;
      species.add(id);
      xp += XP.species + XP.perAtom * s.atoms.length;
    } else if (e.tipo === 'reaccion') {
      const id = String(e.datos.reaccion);
      const deltaH = Number(e.datos.deltaH ?? reactionEnthalpy(REACTIONS.find((r) => r.id === id) ?? { reactants: [], products: [] }));
      if (deltaH < -5) exothermic++;
      else if (deltaH > 5) endothermic++;
      xp += reactions.has(id) ? XP.repeat : XP.reaction;
      reactions.add(id);
    } else if (e.tipo === 'reto') {
      const id = String(e.datos.reto);
      if (!challenges.has(id)) xp += XP.challenge;
      challenges.add(id);
    }
  }

  const unlockCount = ELEMENTS_PER_SPECIES * species.size + reactions.size;
  const unlocked = new Set([...START_ELEMENTS, ...UNLOCK_ORDER.slice(0, unlockCount)]);
  // Lo que ya se ha formado cuenta como «visto»: sus elementos se desbloquean seguro.
  for (const id of species) for (const el of Object.keys(composition(SPECIES.find((s) => s.id === id)!))) unlocked.add(el);

  let level = 0;
  while (level + 1 < LEVELS.length && xp >= LEVELS[level + 1]) level++;

  let weekStreak = 0;
  for (let w = weekIndex(now); weeks.has(w); w--) weekStreak++;
  // Esta semana aún no ha hecho nada: la racha sigue viva si la anterior sí.
  if (weekStreak === 0) for (let w = weekIndex(now) - 1; weeks.has(w); w--) weekStreak++;

  const base = {
    species, reactions, challenges, unlocked, xp, level, exothermic, endothermic, weekStreak,
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
  };
}
