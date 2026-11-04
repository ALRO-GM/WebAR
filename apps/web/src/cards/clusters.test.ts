import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clusterCards } from './clusters';
import { DECK, cardsFor } from './deck';

describe('tarjetas', () => {
  it('agrupa las que se tocan, también en cadena', () => {
    const v = (x: number) => new THREE.Vector3(x, 0, 0);
    const groups = clusterCards([v(0), v(0.07), v(0.14), v(0.5)], 0.1);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 3]);
  });
  it('cada tarjeta física tiene un marcador distinto y válido', () => {
    expect(new Set(DECK.map((c) => c.id)).size).toBe(DECK.length);
    expect(Math.max(...DECK.map((c) => c.id))).toBeLessThan(250);
    expect(cardsFor(['H', 'H', 'O']).map((c) => c.id)).toEqual([1, 119, 8]);
  });
});
