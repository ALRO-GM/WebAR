import { describe, expect, it } from 'vitest';
import { assignProducts, findOutcome, REACTIONS, reactionEnthalpy, termsComposition } from './reactions';
import { composition, compositionKey, SPECIES } from './species';
import { getElement } from './elements';

describe('sustancias', () => {
  it('tienen 5 átomos como mucho, elementos reales y enlaces válidos', () => {
    for (const s of SPECIES) {
      expect(s.atoms.length, s.id).toBeLessThanOrEqual(5);
      for (const a of s.atoms) expect(() => getElement(a.symbol)).not.toThrow();
      for (const [i, j] of s.bonds) expect(Math.max(i, j), s.id).toBeLessThan(s.atoms.length);
    }
  });
  it('la clave de cada sustancia coincide con la fórmula', () => {
    expect(compositionKey(composition(SPECIES.find((s) => s.id === 'Ca(OH)2')!))).toBe('Ca1,H2,O2');
  });
});

describe('reacciones', () => {
  it('están ajustadas, usan 5 cartas como mucho y caben en ellas', () => {
    for (const reaction of REACTIONS) {
      expect(termsComposition(reaction.reactants), reaction.id).toEqual(termsComposition(reaction.products));
      const cards = reaction.reactants.reduce((n, t) => n + t.count, 0);
      expect(cards, reaction.id).toBeLessThanOrEqual(5);
      const molecules = reaction.products.filter((t) => SPECIES.some((s) => s.id === t.content)).reduce((n, t) => n + t.count, 0);
      expect(molecules, reaction.id).toBeLessThanOrEqual(cards);
    }
  });

  it('dan las entalpías de los libros', () => {
    const dh = (id: string) => reactionEnthalpy(REACTIONS.find((x) => x.id === id)!);
    expect(dh('combustion-h2')).toBeCloseTo(-571.7, 0);
    expect(dh('combustion-c')).toBeCloseTo(-393.5, 0);
    expect(dh('combustion-c-incompleta')).toBeCloseTo(-221.1, 0);
    expect(dh('combustion-metano')).toBeCloseTo(-890.4, 0);
    expect(dh('haber')).toBeCloseTo(-92.2, 0);
    expect(dh('no-aire')).toBeCloseTo(180.5, 0);
    expect(dh('ozono')).toBeCloseTo(285.4, 0);
    expect(dh('boudouard')).toBeCloseTo(172.5, 0);
    expect(dh('termita')).toBeCloseTo(-851.5, 0);
  });

  it('encuentran reacciones de libro con las cartas en cualquier orden', () => {
    const o = findOutcome(['O2', 'C', 'C'])!;
    expect(o.reaction.id).toBe('combustion-c-incompleta');
    expect(o.equation).toBe('2 C + O₂ → 2 CO');
    expect(o.deltaH).toBeLessThan(0);
  });

  it('forman sustancias juntando átomos sueltos, desprendiendo la energía del enlace', () => {
    const o2 = findOutcome(['O', 'O'])!;
    expect(o2.reaction.products[0].content).toBe('O2');
    expect(o2.deltaH).toBeCloseTo(-498.3, 0); // energía del doble enlace O=O
    expect(findOutcome(['H', 'O', 'H'])!.reaction.products[0].content).toBe('H2O');
    expect(findOutcome(['H2', 'O'])!.reaction.products[0].content).toBe('H2O');
    expect(findOutcome(['N2', 'O2'])!.deltaH).toBeGreaterThan(0);
    expect(findOutcome(['He', 'He'])).toBeNull();
    expect(findOutcome(['O'])).toBeNull();
  });

  it('dejan el producto en la carta del elemento más pesado y liberan las otras', () => {
    expect(assignProducts(['H', 'O', 'H'], { products: [{ content: 'H2O', count: 1 }] })).toEqual([null, 'H2O', null]);
    // 2 C + O2 → 2 CO: la carta de O (con O2) y una de C se quedan un CO cada una.
    expect(assignProducts(['C', 'C', 'O'], { products: [{ content: 'CO', count: 2 }] })).toEqual(['CO', null, 'CO']);
    // Termita: Al2O3 a la carta de Al; el hierro vuelve a su carta.
    expect(assignProducts(['Fe', 'Al', 'Al'], { products: [{ content: 'Al2O3', count: 1 }, { content: 'Fe', count: 2 }] })).toEqual([null, 'Al2O3', null]);
  });
});
