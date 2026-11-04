import { describe, expect, it } from 'vitest';
import {
  STRUCTURES,
  STRUCTURE_IDS,
  buildLattice,
  cellOf,
  coordinationNumbers,
  iceChunk,
  latticeIce,
  nearestDistance,
  orientIceBonds,
  packingFraction,
  unitCellEdges,
  OH_LENGTH,
  type Vec3,
} from './lattices';

const d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle = (o: Vec3, a: Vec3, b: Vec3) => {
  const u = a.map((x, k) => x - o[k]);
  const v = b.map((x, k) => x - o[k]);
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
};

describe('redes cristalinas', () => {
  it('átomos por celda', () => {
    const expected: Record<string, number> = {
      'cubica-simple': 1,
      bcc: 2,
      fcc: 4,
      hcp: 2,
      nacl: 8,
      cscl: 2,
      fluorita: 12,
      diamante: 8,
      grafito: 4,
      grafeno: 2,
      hielo: 4,
    };
    for (const id of STRUCTURE_IDS) expect(STRUCTURES[id].basis.length, id).toBe(expected[id]);
  });

  it('distancia a primeros vecinos (Å)', () => {
    const nn = (id: keyof typeof STRUCTURES) => nearestDistance(STRUCTURES[id], cellOf(STRUCTURES[id]));
    expect(nn('cubica-simple')).toBeCloseTo(3.359, 3); // a
    expect(nn('bcc')).toBeCloseTo((2.8665 * Math.sqrt(3)) / 2, 3); // Fe: 2,48 Å
    expect(nn('fcc')).toBeCloseTo(3.6149 / Math.SQRT2, 3); // Cu: 2,56 Å
    expect(nn('nacl')).toBeCloseTo(5.6402 / 2, 3); // Na–Cl: 2,82 Å
    expect(nn('cscl')).toBeCloseTo((4.123 * Math.sqrt(3)) / 2, 3); // 3,57 Å
    expect(nn('diamante')).toBeCloseTo(1.5445, 3); // C–C: 1,54 Å
    expect(nn('grafito')).toBeCloseTo(1.4226, 3); // C–C en la capa: 1,42 Å
    expect(nn('fluorita')).toBeCloseTo((5.4626 * Math.sqrt(3)) / 4, 3); // Ca–F: 2,37 Å
    expect(nn('hielo')).toBeCloseTo(2.75, 1); // O···O: 2,75 Å
  });

  it('número de coordinación', () => {
    for (const id of STRUCTURE_IDS) {
      const def = STRUCTURES[id];
      const cn = coordinationNumbers(def, cellOf(def));
      const want = def.coordination;
      if (Array.isArray(want)) {
        const els = [...new Set(def.basis.map((b) => b.el))];
        expect(els.map((el) => cn[el]), id).toEqual(want);
      } else for (const value of Object.values(cn)) expect(value, id).toBe(want);
    }
  });

  it('fracción de espacio ocupado (como en el texto)', () => {
    expect(packingFraction(STRUCTURES['cubica-simple'])).toBeCloseTo(Math.PI / 6, 3); // 52 %
    expect(packingFraction(STRUCTURES.bcc)).toBeCloseTo((Math.PI * Math.sqrt(3)) / 8, 3); // 68 %
    expect(packingFraction(STRUCTURES.fcc)).toBeCloseTo(Math.PI / (3 * Math.SQRT2), 3); // 74 %
    expect(packingFraction(STRUCTURES.diamante)).toBeCloseTo((Math.PI * Math.sqrt(3)) / 16, 3); // 34 %
    for (const id of STRUCTURE_IDS) {
      if (id === 'grafeno') continue;
      expect(Math.round(packingFraction(STRUCTURES[id]) * 100), id).toBe(STRUCTURES[id].packing);
    }
  });

  it('el bloque n×n×n tiene las esquinas y los átomos esperados', () => {
    expect(buildLattice(STRUCTURES['cubica-simple'], 1).atoms).toHaveLength(8);
    expect(buildLattice(STRUCTURES['cubica-simple'], 3).atoms).toHaveLength(64);
    expect(buildLattice(STRUCTURES.bcc, 2).atoms).toHaveLength(27 + 8);
    expect(buildLattice(STRUCTURES.fcc, 1).atoms).toHaveLength(14);
    expect(buildLattice(STRUCTURES.nacl, 1).atoms).toHaveLength(27);
    expect(buildLattice(STRUCTURES.cscl, 1).atoms).toHaveLength(9);
    expect(unitCellEdges(buildLattice(STRUCTURES.fcc, 2))).toHaveLength(12);
    expect(unitCellEdges(buildLattice(STRUCTURES.grafeno, 2))).toHaveLength(4);
  });

  it('enlaces: cada átomo interior tiene sus primeros vecinos', () => {
    const lattice = buildLattice(STRUCTURES.diamante, 3);
    const count = new Array(lattice.atoms.length).fill(0);
    for (const [i, j] of lattice.bonds) {
      count[i]++;
      count[j]++;
    }
    expect(Math.max(...count)).toBe(4);
    const nacl = buildLattice(STRUCTURES.nacl, 2);
    const center = nacl.atoms.findIndex((a) => Math.hypot(...a.p) < 1e-6);
    expect(nacl.bonds.filter(([i, j]) => i === center || j === center)).toHaveLength(6);
  });

  it('capas ABAB en la hexagonal compacta y ABCABC en la cúbica centrada en las caras', () => {
    expect(new Set(buildLattice(STRUCTURES.hcp, 2).atoms.map((a) => a.layer))).toEqual(new Set([0, 1]));
    expect(new Set(buildLattice(STRUCTURES.fcc, 2).atoms.map((a) => a.layer))).toEqual(new Set([0, 1, 2]));
  });

  it('el orden de crecimiento es una permutación y empieza por abajo', () => {
    const lattice = buildLattice(STRUCTURES.hcp, 2);
    const orders = lattice.atoms.map((a) => a.order).sort((a, b) => a - b);
    expect(orders).toEqual(lattice.atoms.map((_, i) => i));
    const first = lattice.atoms.find((a) => a.order === 0)!;
    expect(first.p[2]).toBeCloseTo(Math.min(...lattice.atoms.map((a) => a.p[2])));
  });
});

describe('hielo', () => {
  it('orientar los puentes: en cada O, como mucho 2 H y en el interior exactamente 2', () => {
    // Un anillo de 6 (como en el hielo) y un cuadrado con diagonal.
    const ring = orientIceBonds(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
    expect(ring.map((x) => x.length)).toEqual([1, 1, 1, 1, 1, 1]);
    const k4 = orientIceBonds(5, [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [3, 4]]);
    expect(k4[0]).toHaveLength(2);
  });

  it('el trozo de la simulación: ~50 moléculas de agua con su forma', () => {
    const ice = iceChunk();
    expect(ice.oxygens.length).toBeGreaterThanOrEqual(40);
    expect(ice.oxygens.length).toBeLessThanOrEqual(80);
    ice.oxygens.forEach((o, i) => {
      const [h1, h2] = ice.hydrogens[i];
      expect(d(o, h1)).toBeCloseTo(OH_LENGTH, 3);
      expect(d(o, h2)).toBeCloseTo(OH_LENGTH, 3);
      expect(angle(o, h1, h2)).toBeCloseTo(104.5, 1);
    });
    // Cada puente: el H del dador apunta al O aceptor (H···O ≈ 1,8 Å).
    for (const [i, h, j] of ice.hbonds) expect(d(ice.hydrogens[i][h], ice.oxygens[j])).toBeLessThan(2.0);
    // Ningún O recibe más de 2 puentes ni da más de 2.
    const accepted = new Array(ice.oxygens.length).fill(0);
    for (const [, , j] of ice.hbonds) accepted[j]++;
    expect(Math.max(...accepted)).toBeLessThanOrEqual(2);
  });

  it('los H del bloque de cristal de hielo', () => {
    const lattice = buildLattice(STRUCTURES.hielo, 2);
    const ice = latticeIce(lattice, 2);
    expect(ice.hydrogens).toHaveLength(lattice.atoms.length);
    for (const [i, h, j] of ice.hbonds) expect(d(ice.hydrogens[i][h], ice.oxygens[j])).toBeLessThan(2.0);
  });
});
