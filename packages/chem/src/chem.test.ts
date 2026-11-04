import { describe, expect, it } from 'vitest';
import {
  ELEMENTS,
  atomComposition,
  effectiveCharge,
  formatConfiguration,
  getElement,
  nucleusLayout,
  orbitalOccupancy,
  parseConfiguration,
  sampleOrbital,
  orbitalPeakRadius,
  BOHR_RADIUS_PM,
  tablePosition,
} from './index';
import { seededRandom } from './random';

describe('tabla periódica', () => {
  it('tiene los 118 elementos en orden y sin símbolos repetidos', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
  });

  it('cada átomo neutro tiene tantos electrones como protones y respeta Pauli', () => {
    for (const e of ELEMENTS) {
      const c = atomComposition(e);
      expect(c.subshells.reduce((s, x) => s + x.electrons, 0), e.symbol).toBe(e.z);
      expect(c.neutrons, e.symbol).toBeGreaterThanOrEqual(0);
      for (const s of c.subshells) expect(s.electrons, `${e.symbol} ${s.n}${s.l}`).toBeLessThanOrEqual(2 * (2 * s.l + 1));
      expect(e.radius, e.symbol).toBeGreaterThan(20);
    }
  });

  it('cuenta neutrones del isótopo más abundante', () => {
    const neutrons = (s: string) => atomComposition(getElement(s)).neutrons;
    expect(neutrons('H')).toBe(0);
    expect(neutrons('C')).toBe(6);
    expect(neutrons('Cl')).toBe(18);
    expect(neutrons('Fe')).toBe(30);
    expect(neutrons('Cu')).toBe(34);
    expect(neutrons('Au')).toBe(118);
    expect(neutrons('Pb')).toBe(126);
    expect(neutrons('U')).toBe(146);
  });

  it('reparte los electrones en capas como el modelo de Bohr', () => {
    const shells = (s: string) => atomComposition(getElement(s)).shells;
    expect(shells('K')).toEqual([2, 8, 8, 1]);
    expect(shells('Fe')).toEqual([2, 8, 14, 2]);
    expect(shells('Au')).toEqual([2, 8, 18, 32, 18, 1]);
    expect(shells('Og')).toEqual([2, 8, 18, 32, 32, 18, 8]);
  });

  it('expande y escribe configuraciones', () => {
    expect(formatConfiguration(getElement('O'), true)).toBe('1s² 2s² 2p⁴');
    expect(formatConfiguration(getElement('Cr'))).toBe('[Ar]3d⁵ 4s¹');
    expect(parseConfiguration('[Ne]3s2 3p4').at(-1)).toEqual({ n: 3, l: 1, electrons: 4 });
  });

  it('coloca lantánidos y actínidos en sus filas de abajo', () => {
    expect(tablePosition(getElement('Fe'))).toEqual({ row: 4, column: 8 });
    expect(tablePosition(getElement('La'))).toEqual({ row: 9, column: 3 });
    expect(tablePosition(getElement('Lr'))).toEqual({ row: 10, column: 17 });
  });
});

describe('reglas de Slater y de Hund', () => {
  const zeff = (s: string, n: number, l: number) => {
    const e = getElement(s);
    const subs = parseConfiguration(e.configuration);
    return effectiveCharge(e.z, subs, subs.find((x) => x.n === n && x.l === l)!);
  };
  it('dan las cargas efectivas de los libros', () => {
    expect(zeff('C', 2, 1)).toBeCloseTo(3.25);
    expect(zeff('Na', 3, 0)).toBeCloseTo(2.2);
    expect(zeff('Zn', 4, 0)).toBeCloseTo(4.35);
    expect(zeff('Zn', 3, 2)).toBeCloseTo(8.85);
  });
  it('llenan primero un electrón por orbital', () => {
    expect(orbitalOccupancy({ n: 2, l: 1, electrons: 4 })).toEqual([2, 1, 1]);
    expect(orbitalOccupancy({ n: 3, l: 2, electrons: 5 })).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('núcleo', () => {
  it('pone todos los nucleones, con su número de protones, y crece como A^⅓', () => {
    const u = nucleusLayout(92, 146);
    expect(u.isProton.length).toBe(238);
    expect(u.isProton.reduce((a, b) => a + b, 0)).toBe(92);
    const c = nucleusLayout(6, 6);
    expect(u.radius / c.radius).toBeGreaterThan(Math.cbrt(238 / 12) * 0.75);
    expect(u.radius / c.radius).toBeLessThan(Math.cbrt(238 / 12) * 1.3);
  });
});

describe('orbitales', () => {
  it('el 1s del hidrógeno tiene su máximo en a₀ y radio medio 1,5 a₀', () => {
    expect(orbitalPeakRadius(1, 0, 1)).toBeCloseTo(BOHR_RADIUS_PM, 0);
    const { positions } = sampleOrbital({ n: 1, l: 0, m: 0, zeff: 1 }, 20000, seededRandom(1));
    let sum = 0;
    for (let i = 0; i < positions.length; i += 3) sum += Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
    expect(sum / 20000 / BOHR_RADIUS_PM).toBeCloseTo(1.5, 1);
  });
  it('los lóbulos de un 2p tienen fases opuestas a cada lado del plano nodal', () => {
    const { positions, signs } = sampleOrbital({ n: 2, l: 1, m: 2, zeff: 1 }, 2000, seededRandom(2));
    for (let i = 0; i < signs.length; i++) expect(Math.sign(positions[i * 3 + 2])).toBe(signs[i]);
  });
});
