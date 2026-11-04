import { ELEMENTS, SPECIES, composition } from '@webar/chem';

/**
 * El camino de aprendizaje: unidades en orden, cada una con su guía (un
 * personaje histórico) y sus nodos. Se empieza solo con el hidrógeno; cada
 * lección presenta un elemento y lo desbloquea para el laboratorio, y los
 * nodos de laboratorio piden formar las moléculas que ya se pueden hacer.
 * Poco a poco, para que dé tiempo a entender y recordar.
 */
export type NodeKind = 'leccion' | 'laboratorio' | 'adivina' | 'repaso' | 'cofre';

export interface PathNode {
  id: string;
  kind: NodeKind;
  unit: number;
  /** Lección: el elemento que presenta. Repaso/adivina: los que entran. */
  elements: string[];
  /** Laboratorio: la sustancia que hay que formar. */
  species?: string;
}

export interface Unit {
  index: number;
  /** Id del personaje que guía la unidad (characters/data.ts). */
  guide: string;
  elements: string[];
  nodes: PathNode[];
}

/** Las primeras unidades, pensadas a mano: elementos que permiten moléculas de ESO enseguida. */
const HANDMADE: Array<{ guide: string; elements: string[]; labs: string[] }> = [
  { guide: 'niels-bohr', elements: ['H'], labs: ['H2'] },
  { guide: 'cecilia-payne-gaposchkin', elements: ['He'], labs: [] },
  { guide: 'kathleen-lonsdale', elements: ['C'], labs: ['CH4'] },
  { guide: 'marie-anne-paulze-lavoisier', elements: ['O'], labs: ['H2O', 'O2', 'CO2'] },
  { guide: 'mario-molina', elements: ['N'], labs: ['N2', 'NH3', 'O3'] },
  { guide: 'dmitri-mendeleiev', elements: ['Na', 'Cl'], labs: ['NaCl', 'HCl'] },
  { guide: 'ahmed-zewail', elements: ['Li', 'K'], labs: ['KCl', 'NaOH'] },
  { guide: 'jabir-ibn-hayyan', elements: ['S'], labs: ['H2S', 'SO2'] },
  { guide: 'asima-chatterjee', elements: ['Mg', 'Ca'], labs: ['MgO', 'CaO'] },
  { guide: 'alice-ball', elements: ['F', 'Br', 'I'], labs: ['HF', 'NaF'] },
  { guide: 'andres-manuel-del-rio', elements: ['Fe', 'Cu', 'Zn', 'V'], labs: ['Fe2O3', 'CuO'] },
  { guide: 'shuji-nakamura', elements: ['Al', 'Si', 'Ga'], labs: ['Al2O3', 'SiO2'] },
  { guide: 'rosalind-franklin', elements: ['P', 'B'], labs: [] },
  { guide: 'tu-youyou', elements: ['Ag', 'Au', 'Pt'], labs: ['AgCl'] },
  { guide: 'cecilia-payne-gaposchkin', elements: ['Ne', 'Ar', 'Kr', 'Xe'], labs: [] },
  { guide: 'marie-curie', elements: ['Po', 'Ra', 'U'], labs: [] },
  { guide: 'lise-meitner', elements: ['Pa', 'Mt'], labs: [] },
];

/** Guías para el resto, por turnos (los que tengan relación con algún elemento de la unidad van primero). */
const GUIDES = [
  'marie-curie', 'dmitri-mendeleiev', 'rosalind-franklin', 'mario-molina', 'tu-youyou', 'ahmed-zewail', 'lise-meitner', 'alice-ball',
  'andres-manuel-del-rio', 'kathleen-lonsdale', 'asima-chatterjee', 'niels-bohr', 'jabir-ibn-hayyan', 'shuji-nakamura',
  'marie-anne-paulze-lavoisier', 'cecilia-payne-gaposchkin',
];

/** Cada cuántas unidades hay un repaso de lo anterior (memoria a largo plazo). */
const REVIEW_EVERY = 2;
const PER_AUTO_UNIT = 4;

function buildPath(): Unit[] {
  const units: Unit[] = [];
  const handled = new Set(HANDMADE.flatMap((u) => u.elements));
  const rest = ELEMENTS.map((e) => e.symbol).filter((s) => !handled.has(s));
  const plan = [...HANDMADE];
  for (let i = 0; i < rest.length; i += PER_AUTO_UNIT) {
    plan.push({ guide: GUIDES[(plan.length + i) % GUIDES.length], elements: rest.slice(i, i + PER_AUTO_UNIT), labs: [] });
  }
  const learned: string[] = [];
  plan.forEach((u, index) => {
    const nodes: PathNode[] = [];
    const id = (kind: string, extra = '') => `u${index + 1}-${kind}${extra ? `-${extra}` : ''}`;
    for (const el of u.elements) {
      nodes.push({ id: id('leccion', el), kind: 'leccion', unit: index, elements: [el] });
      learned.push(el);
    }
    for (const s of u.labs) nodes.push({ id: id('lab', s), kind: 'laboratorio', unit: index, elements: Object.keys(composition(SPECIES.find((x) => x.id === s)!)), species: s });
    // «Adivina» a partir de la segunda unidad: con uno solo no hay a qué jugar.
    if (learned.length >= 3) nodes.push({ id: id('adivina'), kind: 'adivina', unit: index, elements: [...learned] });
    if ((index + 1) % REVIEW_EVERY === 0 && learned.length >= 3) nodes.push({ id: id('repaso'), kind: 'repaso', unit: index, elements: [...learned] });
    nodes.push({ id: id('cofre'), kind: 'cofre', unit: index, elements: [] });
    units.push({ index, guide: u.guide, elements: u.elements, nodes });
  });
  return units;
}

export const PATH: readonly Unit[] = buildPath();
export const NODES: readonly PathNode[] = PATH.flatMap((u) => u.nodes);
const BY_ID = new Map(NODES.map((n) => [n.id, n]));
export const nodeById = (id: string) => BY_ID.get(id);

/** El primer elemento, con el que se empieza. */
export const START_ELEMENTS = ['H'];

/** La lección que presenta cada elemento. */
export const lessonFor = (symbol: string) => NODES.find((n) => n.kind === 'leccion' && n.elements[0] === symbol);
