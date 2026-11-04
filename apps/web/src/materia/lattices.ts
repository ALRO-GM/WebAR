/**
 * Geometría de las redes cristalinas, sin three.js (se prueba en Node).
 *
 * Unidades: ångström (1 Å = 10⁻¹⁰ m). Ejes: x, y en el plano horizontal y z
 * hacia arriba (el eje c de las hexagonales). La vista 3D cambia z ↔ y.
 *
 * Fuentes de los parámetros de red (temperatura ambiente salvo el hielo):
 * tablas de la CRC / Wikipedia («Lattice constant») y, para el hielo Ih,
 * Goto et al. (1990) a −30 °C: a = 4,511 Å, c = 7,346 Å, O en 4f con z = 0,0623.
 */

export type Vec3 = [number, number, number];

export type StructureId =
  | 'cubica-simple'
  | 'bcc'
  | 'fcc'
  | 'hcp'
  | 'nacl'
  | 'cscl'
  | 'fluorita'
  | 'diamante'
  | 'grafito'
  | 'grafeno'
  | 'hielo';

/** Tipo de enlace que mantiene unida la red (para la explicación y los colores). */
export type BondKind = 'metalico' | 'ionico' | 'covalente' | 'puentes';

export interface BasisAtom {
  /** Símbolo del elemento; `$` es el metal elegido (Fe, Cu, Mg…). */
  el: string;
  /** Coordenadas fraccionarias dentro de la celda. */
  f: Vec3;
}

/** Un metal de ejemplo para una red metálica (con su parámetro de red). */
export interface MetalExample {
  el: string;
  a: number;
  c?: number;
}

export interface StructureDef {
  id: StructureId;
  /** Celda: cúbica (a) o hexagonal (a, c; γ = 120°). */
  cell: 'cubica' | 'hexagonal';
  a: number;
  c?: number;
  basis: BasisAtom[];
  bond: BondKind;
  /** Para las redes metálicas: los metales que se pueden elegir (el primero, por defecto). */
  metals?: MetalExample[];
  /** Radio de cada átomo/ion en el modelo compacto (Å). Sin dato: la mitad de la distancia a su vecino más cercano. */
  radii?: Record<string, number>;
  /** Pinta capas A/B(/C) de colores distintos. */
  layers?: 'ab' | 'abc';
  /** Solo una capa (el grafeno): no se repite hacia arriba. */
  flat?: boolean;
  /** Hidrógenos del hielo (se calculan aparte). */
  water?: boolean;
  /** Números que se enseñan (y que comprueban los tests). */
  coordination: number | [number, number];
  /** Fracción del espacio ocupado (modelo compacto), redondeada a %. */
  packing: number;
}

// --- Bases ----------------------------------------------------------------------

const FCC: Vec3[] = [
  [0, 0, 0],
  [0.5, 0.5, 0],
  [0.5, 0, 0.5],
  [0, 0.5, 0.5],
];
const shift = (list: Vec3[], d: Vec3): Vec3[] => list.map(([x, y, z]) => [x + d[0], y + d[1], z + d[2]]);

// Iones de Shannon (Å): Na⁺ (NC 6) 1,02; Cl⁻ 1,81; Cs⁺ (NC 8) 1,74; Ca²⁺ (NC 8) 1,12; F⁻ (NC 4) 1,31.
export const STRUCTURES: Record<StructureId, StructureDef> = {
  'cubica-simple': {
    id: 'cubica-simple',
    cell: 'cubica',
    a: 3.359,
    basis: [{ el: '$', f: [0, 0, 0] }],
    bond: 'metalico',
    metals: [{ el: 'Po', a: 3.359 }],
    coordination: 6,
    packing: 52,
  },
  bcc: {
    id: 'bcc',
    cell: 'cubica',
    a: 2.8665,
    basis: [
      { el: '$', f: [0, 0, 0] },
      { el: '$', f: [0.5, 0.5, 0.5] },
    ],
    bond: 'metalico',
    metals: [
      { el: 'Fe', a: 2.8665 },
      { el: 'Na', a: 4.2906 },
      { el: 'W', a: 3.1652 },
    ],
    coordination: 8,
    packing: 68,
  },
  fcc: {
    id: 'fcc',
    cell: 'cubica',
    a: 3.6149,
    basis: FCC.map((f) => ({ el: '$', f })),
    bond: 'metalico',
    metals: [
      { el: 'Cu', a: 3.6149 },
      { el: 'Al', a: 4.0495 },
      { el: 'Au', a: 4.0782 },
      { el: 'Ag', a: 4.0853 },
    ],
    layers: 'abc',
    coordination: 12,
    packing: 74,
  },
  hcp: {
    id: 'hcp',
    cell: 'hexagonal',
    a: 3.2094,
    c: 5.2108,
    basis: [
      { el: '$', f: [0, 0, 0] },
      { el: '$', f: [1 / 3, 2 / 3, 0.5] },
    ],
    bond: 'metalico',
    metals: [
      { el: 'Mg', a: 3.2094, c: 5.2108 },
      { el: 'Zn', a: 2.6649, c: 4.9468 },
      { el: 'Ti', a: 2.9508, c: 4.6855 },
    ],
    layers: 'ab',
    coordination: 12,
    packing: 74,
  },
  nacl: {
    id: 'nacl',
    cell: 'cubica',
    a: 5.6402,
    basis: [...FCC.map((f) => ({ el: 'Na', f })), ...shift(FCC, [0.5, 0, 0]).map((f) => ({ el: 'Cl', f }))],
    bond: 'ionico',
    radii: { Na: 1.02, Cl: 1.81 },
    coordination: [6, 6],
    packing: 65,
  },
  cscl: {
    id: 'cscl',
    cell: 'cubica',
    a: 4.123,
    basis: [
      { el: 'Cl', f: [0, 0, 0] },
      { el: 'Cs', f: [0.5, 0.5, 0.5] },
    ],
    bond: 'ionico',
    radii: { Cs: 1.74, Cl: 1.81 },
    coordination: [8, 8],
    packing: 67,
  },
  fluorita: {
    id: 'fluorita',
    cell: 'cubica',
    a: 5.4626,
    basis: [
      ...FCC.map((f) => ({ el: 'Ca', f })),
      ...[0.25, 0.75].flatMap((x) => [0.25, 0.75].flatMap((y) => [0.25, 0.75].map((z) => ({ el: 'F', f: [x, y, z] as Vec3 })))),
    ],
    bond: 'ionico',
    radii: { Ca: 1.12, F: 1.31 },
    coordination: [8, 4],
    packing: 61,
  },
  diamante: {
    id: 'diamante',
    cell: 'cubica',
    a: 3.5668,
    basis: [...FCC, ...shift(FCC, [0.25, 0.25, 0.25])].map((f) => ({ el: 'C', f })),
    bond: 'covalente',
    coordination: 4,
    packing: 34,
  },
  grafito: {
    id: 'grafito',
    cell: 'hexagonal',
    a: 2.464,
    c: 6.711,
    // Apilamiento AB (Bernal): dos capas por celda, desplazadas.
    basis: [
      { el: 'C', f: [0, 0, 0] },
      { el: 'C', f: [1 / 3, 2 / 3, 0] },
      { el: 'C', f: [0, 0, 0.5] },
      { el: 'C', f: [2 / 3, 1 / 3, 0.5] },
    ],
    bond: 'covalente',
    layers: 'ab',
    coordination: 3,
    packing: 17,
  },
  grafeno: {
    id: 'grafeno',
    cell: 'hexagonal',
    a: 2.464,
    c: 6.711,
    basis: [
      { el: 'C', f: [0, 0, 0] },
      { el: 'C', f: [1 / 3, 2 / 3, 0] },
    ],
    bond: 'covalente',
    flat: true,
    coordination: 3,
    packing: 0,
  },
  hielo: {
    id: 'hielo',
    cell: 'hexagonal',
    a: 4.511,
    c: 7.346,
    basis: [
      { el: 'O', f: [1 / 3, 2 / 3, 0.0623] },
      { el: 'O', f: [2 / 3, 1 / 3, 0.5623] },
      { el: 'O', f: [2 / 3, 1 / 3, 1 - 0.0623] },
      { el: 'O', f: [1 / 3, 2 / 3, 0.5 - 0.0623] },
    ],
    bond: 'puentes',
    water: true,
    coordination: 4,
    packing: 34,
  },
};

export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[];

// --- Celda y átomos -------------------------------------------------------------

export interface Cell {
  a: number;
  c: number;
  /** Vectores de la celda en Å. */
  vectors: [Vec3, Vec3, Vec3];
}

export function cellOf(def: StructureDef, metal?: MetalExample): Cell {
  const a = metal?.a ?? def.a;
  const c = metal?.c ?? def.c ?? a;
  if (def.cell === 'cubica')
    return {
      a,
      c: a,
      vectors: [
        [a, 0, 0],
        [0, a, 0],
        [0, 0, a],
      ],
    };
  return {
    a,
    c,
    vectors: [
      [a, 0, 0],
      [-a / 2, (a * Math.sqrt(3)) / 2, 0],
      [0, 0, c],
    ],
  };
}

export function toCartesian(cell: Cell, f: Vec3): Vec3 {
  const [u, v, w] = cell.vectors;
  return [0, 1, 2].map((k) => f[0] * u[k] + f[1] * v[k] + f[2] * w[k]) as Vec3;
}

export function cellVolume(cell: Cell): number {
  const [u, v, w] = cell.vectors;
  const cross: Vec3 = [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]];
  return Math.abs(u[0] * cross[0] + u[1] * cross[1] + u[2] * cross[2]);
}

export interface LatticeAtom {
  el: string;
  /** Posición en Å, con el bloque centrado en el origen. */
  p: Vec3;
  /** Capa del apilamiento compacto (0 = A, 1 = B, 2 = C) o −1 si no aplica. */
  layer: number;
  /** Orden de llegada en la animación de crecimiento (0 = el primero). */
  order: number;
}

export interface Lattice {
  def: StructureDef;
  cell: Cell;
  atoms: LatticeAtom[];
  /** Pares de átomos enlazados (primeros vecinos), por índice. */
  bonds: Array<[number, number]>;
  /** Radio de cada elemento en el modelo compacto (Å). */
  radii: Record<string, number>;
  /** Centro del bloque (lo que se restó para centrar), en Å. */
  offset: Vec3;
  /** Radio de la esfera que envuelve el bloque (con los radios de los átomos), en Å. */
  extent: number;
}

const EPS = 1e-6;
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Los átomos de la base, plegados dentro de la celda [0, 1). */
function wrapped(def: StructureDef): BasisAtom[] {
  return def.basis.map(({ el, f }) => ({ el, f: f.map((x) => ((x % 1) + 1) % 1) as Vec3 }));
}

/** Átomos de un bloque n×n×n de celdas, con las caras completas (las esquinas de la última celda incluidas). */
function blockAtoms(def: StructureDef, cell: Cell, n: number, symbol: string): Array<{ el: string; f: Vec3; p: Vec3 }> {
  const nz = def.flat ? 1 : n;
  const out: Array<{ el: string; f: Vec3; p: Vec3 }> = [];
  for (const b of wrapped(def)) {
    for (let i = -1; i <= n; i++)
      for (let j = -1; j <= n; j++)
        for (let k = -1; k <= nz; k++) {
          const f: Vec3 = [b.f[0] + i, b.f[1] + j, b.f[2] + k];
          const inside = f[0] > -EPS && f[0] < n + EPS && f[1] > -EPS && f[1] < n + EPS && (def.flat ? f[2] > -EPS && f[2] < EPS : f[2] > -EPS && f[2] < nz + EPS);
          if (inside) out.push({ el: b.el === '$' ? symbol : b.el, f, p: toCartesian(cell, f) });
        }
  }
  return out;
}

/** Distancia a los primeros vecinos de cada elemento en la red infinita. */
export function nearestDistance(def: StructureDef, cell: Cell): number {
  const base = wrapped(def).map((b) => toCartesian(cell, b.f));
  let best = Infinity;
  for (const p of base)
    for (const b of wrapped(def))
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = def.flat ? 0 : -1; k <= (def.flat ? 0 : 1); k++) {
            const q = toCartesian(cell, [b.f[0] + i, b.f[1] + j, b.f[2] + k]);
            const d = dist(p, q);
            if (d > 0.1) best = Math.min(best, d);
          }
  return best;
}

/** Número de coordinación de cada átomo de la base en la red infinita (vecinos a la distancia mínima de ese átomo). */
export function coordinationNumbers(def: StructureDef, cell: Cell): Record<string, number> {
  const out: Record<string, number> = {};
  for (const atom of wrapped(def)) {
    const p = toCartesian(cell, atom.f);
    const ds: number[] = [];
    for (const b of wrapped(def))
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++)
          for (let k = def.flat ? 0 : -2; k <= (def.flat ? 0 : 2); k++) {
            const d = dist(p, toCartesian(cell, [b.f[0] + i, b.f[1] + j, b.f[2] + k]));
            if (d > 0.1) ds.push(d);
          }
    const min = Math.min(...ds);
    out[atom.el] = ds.filter((d) => d < min * 1.04).length;
  }
  return out;
}

/** Radios del modelo compacto: los del dato o la mitad de la distancia a primeros vecinos. */
export function compactRadii(def: StructureDef, cell: Cell, symbol: string): Record<string, number> {
  if (def.radii) return { ...def.radii };
  const r = nearestDistance(def, cell) / 2;
  const els = new Set(def.basis.map((b) => (b.el === '$' ? symbol : b.el)));
  const radii: Record<string, number> = {};
  for (const el of els) radii[el] = r;
  return radii;
}

/** Fracción del volumen de la celda ocupada por las esferas del modelo compacto. */
export function packingFraction(def: StructureDef, metal?: MetalExample): number {
  const cell = cellOf(def, metal);
  const symbol = metal?.el ?? def.metals?.[0]?.el ?? '';
  const radii = compactRadii(def, cell, symbol);
  let volume = 0;
  for (const b of def.basis) volume += (4 / 3) * Math.PI * radii[b.el === '$' ? symbol : b.el] ** 3;
  return volume / cellVolume(cell);
}

/** Capa del apilamiento compacto: ABAB en hexagonales (por z) y ABCABC en la cúbica centrada en las caras (planos 111). */
function layerOf(def: StructureDef, f: Vec3): number {
  if (def.layers === 'ab') return Math.round(f[2] * 2) % 2;
  if (def.layers === 'abc') return ((Math.round(f[0] + f[1] + f[2]) % 3) + 3) % 3;
  return -1;
}

/** Monta el bloque de n×n×n celdas del cristal, centrado, con enlaces y orden de crecimiento. */
export function buildLattice(def: StructureDef, n = 2, metal?: MetalExample): Lattice {
  const cell = cellOf(def, metal);
  const symbol = metal?.el ?? def.metals?.[0]?.el ?? '';
  const raw = blockAtoms(def, cell, n, symbol);
  // Centro del bloque: la media de las esquinas.
  const center = toCartesian(cell, [n / 2, n / 2, def.flat ? 0 : n / 2]);
  const atoms: LatticeAtom[] = raw.map(({ el, f, p }) => ({
    el,
    p: [p[0] - center[0], p[1] - center[1], p[2] - center[2]],
    layer: layerOf(def, f),
    order: 0,
  }));

  // Crece de abajo arriba (o por planos 111 en la FCC), y en cada capa desde el centro.
  const growthKey = (a: LatticeAtom, i: number) => {
    const f = raw[i].f;
    const level = def.layers === 'abc' ? Math.round((f[0] + f[1] + f[2]) * 4) : Math.round(a.p[2] * 4);
    return level * 1000 + Math.hypot(a.p[0], a.p[1]);
  };
  atoms
    .map((a, i) => ({ i, key: growthKey(a, i) }))
    .sort((x, y) => x.key - y.key)
    .forEach(({ i }, order) => (atoms[i].order = order));

  // Enlaces: pares a la distancia de primeros vecinos (en el hielo, O–O = puentes de hidrógeno).
  // En la hexagonal compacta del cinc (c/a = 1,86, lejos del ideal 1,63) los 6 vecinos de arriba y abajo están un 9 % más lejos.
  const nn = nearestDistance(def, cell) * (def.id === 'hcp' ? 1.08 : 1);
  const bonds: Array<[number, number]> = [];
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) if (dist(atoms[i].p, atoms[j].p) < nn * 1.04) bonds.push([i, j]);

  const radii = compactRadii(def, cell, symbol);
  let extent = 0;
  for (const a of atoms) extent = Math.max(extent, Math.hypot(...a.p) + (radii[a.el] ?? 1));
  return { def, cell, atoms, bonds, radii, offset: center, extent };
}

/** Las 12 aristas de la celda unidad (la de la esquina del bloque), en Å y centradas como el bloque. */
export function unitCellEdges(lattice: Lattice): Array<[Vec3, Vec3]> {
  const corners: Vec3[] = [];
  for (const i of [0, 1]) for (const j of [0, 1]) for (const k of lattice.def.flat ? [0] : [0, 1]) corners.push([i, j, k]);
  const edges: Array<[Vec3, Vec3]> = [];
  const off = lattice.offset;
  const at = (f: Vec3): Vec3 => {
    const p = toCartesian(lattice.cell, f);
    return [p[0] - off[0], p[1] - off[1], p[2] - off[2]];
  };
  for (let a = 0; a < corners.length; a++)
    for (let b = a + 1; b < corners.length; b++) {
      const diff = corners[a].reduce((s, x, k) => s + Math.abs(x - corners[b][k]), 0);
      if (diff === 1) edges.push([at(corners[a]), at(corners[b])]);
    }
  return edges;
}

/** Átomos que «pertenecen» a una celda (contando 1/8 por esquina, 1/4 por arista, 1/2 por cara). */
export function atomsPerCell(def: StructureDef): number {
  return def.basis.length;
}

// --- Hidrógenos del hielo -------------------------------------------------------

/**
 * Orienta los enlaces O···O de un trozo de hielo para cumplir las reglas del
 * hielo (Bernal–Fowler): cada O tiene dos H cerca (es una molécula de agua) y
 * en cada puente hay un solo H. Es orientar un grafo de grado ≤ 4 dejando
 * entradas = salidas: con un circuito de Euler (Hierholzer) tras unir los
 * vértices de grado impar a un vértice extra. Devuelve, por cada O, los
 * vecinos a los que «da» un H (dador → aceptor).
 */
export function orientIceBonds(count: number, bonds: Array<[number, number]>): number[][] {
  const extra = count; // vértice auxiliar
  type Edge = { a: number; b: number; used: boolean };
  const edges: Edge[] = bonds.map(([a, b]) => ({ a, b, used: false }));
  const degree = new Array(count).fill(0);
  for (const [a, b] of bonds) {
    degree[a]++;
    degree[b]++;
  }
  for (let v = 0; v < count; v++) if (degree[v] % 2) edges.push({ a: v, b: extra, used: false });
  const adj: number[][] = Array.from({ length: count + 1 }, () => []);
  edges.forEach((e, i) => {
    adj[e.a].push(i);
    adj[e.b].push(i);
  });
  const donors: number[][] = Array.from({ length: count }, () => []);
  const pointer = new Array(count + 1).fill(0);
  for (let start = 0; start <= count; start++) {
    // Hierholzer iterativo: cada arista se recorre una vez, en el sentido del circuito.
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      while (pointer[v] < adj[v].length && edges[adj[v][pointer[v]]].used) pointer[v]++;
      if (pointer[v] === adj[v].length) {
        stack.pop();
        continue;
      }
      const e = edges[adj[v][pointer[v]]];
      e.used = true;
      const w = e.a === v ? e.b : e.a;
      if (v !== extra && w !== extra) donors[v].push(w);
      stack.push(w);
    }
  }
  return donors;
}

/** Distancia O–H en el agua (Å) y ángulo H–O–H (grados). */
export const OH_LENGTH = 0.9572;
export const HOH_ANGLE = 104.5;

export interface IceMolecules {
  /** Posición de cada O (Å). */
  oxygens: Vec3[];
  /** Los dos H de cada molécula (Å). */
  hydrogens: Array<[Vec3, Vec3]>;
  /** Puentes de hidrógeno: [molécula dadora, cuál de sus H (0|1), molécula aceptora]. */
  hbonds: Array<[number, 0 | 1, number]>;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Coloca los H de un trozo de hielo. `cluster` son los O del trozo y
 * `surroundings` los de un bloque mayor que lo contiene (para saber hacia
 * dónde apuntan los H sueltos de la superficie, que en el hielo real también
 * existen). Los dos H se cierran de 109,5° (tetraedro) a 104,5° (el agua).
 */
export function iceHydrogens(cluster: Vec3[], surroundings: Vec3[], oo = 2.76): IceMolecules {
  const near = oo * 1.06;
  const index = (p: Vec3) => cluster.findIndex((q) => dist(p, q) < 0.01);
  const bonds: Array<[number, number]> = [];
  for (let i = 0; i < cluster.length; i++)
    for (let j = i + 1; j < cluster.length; j++) if (dist(cluster[i], cluster[j]) < near) bonds.push([i, j]);
  const donors = orientIceBonds(cluster.length, bonds);
  const hydrogens: Array<[Vec3, Vec3]> = [];
  const hbonds: IceMolecules['hbonds'] = [];
  cluster.forEach((o, i) => {
    const dirs = donors[i].map((j) => norm(sub(cluster[j], o)));
    if (dirs.length < 2) {
      // H sueltos: hacia donde estaría un vecino que no está en el trozo.
      for (const q of surroundings) {
        if (dirs.length >= 2) break;
        if (dist(q, o) > 0.1 && dist(q, o) < near && index(q) < 0) dirs.push(norm(sub(q, o)));
      }
    }
    while (dirs.length < 2) dirs.push(dirs.length ? norm([-dirs[0][0], dirs[0][2], dirs[0][1]]) : [0, 0, 1]);
    const [d1, d2] = dirs;
    // Cierra el ángulo hacia la bisectriz hasta 104,5°.
    const bis = norm([d1[0] + d2[0], d1[1] + d2[1], d1[2] + d2[2]]);
    const half = ((HOH_ANGLE / 2) * Math.PI) / 180;
    const bend = (d: Vec3): Vec3 => {
      const along = d[0] * bis[0] + d[1] * bis[1] + d[2] * bis[2];
      const perp = norm([d[0] - along * bis[0], d[1] - along * bis[1], d[2] - along * bis[2]]);
      return [0, 1, 2].map((k) => o[k] + OH_LENGTH * (Math.cos(half) * bis[k] + Math.sin(half) * perp[k])) as Vec3;
    };
    hydrogens.push([bend(d1), bend(d2)]);
    donors[i].slice(0, 2).forEach((j, h) => hbonds.push([i, h as 0 | 1, j]));
  });
  return { oxygens: cluster, hydrogens, hbonds };
}

/** Un trozo cúbico de hielo Ih de lado `side` Å (para la simulación del agua: ~50 moléculas con 12 Å). */
export function iceChunk(side = 12): IceMolecules {
  const def = STRUCTURES.hielo;
  const big = buildLattice(def, 5).atoms.map((a) => a.p);
  const h = side / 2;
  const cluster = big.filter((p) => Math.abs(p[0]) <= h && Math.abs(p[1]) <= h && Math.abs(p[2]) <= h);
  // Centrado en su centro de masas para que quede simétrico.
  const n = cluster.length;
  const c = cluster.reduce<Vec3>((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
  return iceHydrogens(
    cluster.map((p) => sub(p, c)),
    big.map((p) => sub(p, c)),
    nearestDistance(def, cellOf(def)),
  );
}

/** Los H de un bloque de hielo de la vista de cristales (`lattice` es de STRUCTURES.hielo). */
export function latticeIce(lattice: Lattice, n: number): IceMolecules {
  // El bloque de n + 2 celdas tiene el mismo centro (se diferencia en un vector de la red).
  const big = buildLattice(lattice.def, n + 2).atoms.map((a) => a.p);
  return iceHydrogens(
    lattice.atoms.map((a) => a.p),
    big,
    nearestDistance(lattice.def, lattice.cell),
  );
}
