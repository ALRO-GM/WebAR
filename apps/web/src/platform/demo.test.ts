import { describe, expect, it } from 'vitest';
import { demoEvents } from './demo';
import { computeProgress } from './progress';

describe('demostración del alumnado', () => {
  it('un mes de uso: racha larga, camino avanzado, colección y nivel', () => {
    const now = new Date('2026-11-04T21:00:00');
    const p = computeProgress(demoEvents(now), now);
    expect(p.streak).toBe(30);
    expect(p.lessons.size).toBeGreaterThan(30);
    expect(p.species.size).toBeGreaterThan(10);
    expect(p.level).toBeGreaterThan(5);
    expect(p.badges.size).toBeGreaterThan(5);
  });
});
