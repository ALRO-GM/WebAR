import { describe, expect, it } from 'vitest';
import { SPECIES } from '@webar/chem';
import { COURSE_SPECIES, START_ELEMENTS, computeProgress, progressDiff, type ProgressEvent } from './progress';

let n = 0;
const ev = (tipo: ProgressEvent['tipo'], datos: Record<string, unknown>, fecha = '2026-11-04T10:00:00Z'): ProgressEvent => ({ id: `e${n++}`, tipo, datos, fecha });

describe('progreso', () => {
  it('cada sustancia está en un curso, y solo en uno', () => {
    const all = Object.values(COURSE_SPECIES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(SPECIES.map((s) => s.id).sort());
  });

  it('empieza con H, C, N y O, y descubrir desbloquea elementos y da XP una vez', () => {
    const empty = computeProgress([]);
    expect([...empty.unlocked].sort()).toEqual([...START_ELEMENTS].sort());
    const p = computeProgress([ev('descubrir', { sustancia: 'H2O' }), ev('descubrir', { sustancia: 'H2O' }), ev('reaccion', { reaccion: 'combustion-c', deltaH: -393.5 })]);
    expect(p.species.size).toBe(1);
    expect(p.xp).toBe(50 + 30 + 30);
    expect(p.unlocked.size).toBe(4 + 3 + 1);
    expect(p.badges.has('agua')).toBe(true);
    expect(progressDiff(empty, p).elements).toEqual(['Na', 'Cl', 'S', 'Mg']);
  });

  it('la racha cuenta semanas seguidas y perdona la semana en curso', () => {
    const weeks = ['2026-10-14T10:00:00Z', '2026-10-21T10:00:00Z', '2026-10-28T10:00:00Z'];
    const p = computeProgress(weeks.map((f) => ev('reaccion', { reaccion: 'x' }, f)), '2026-11-04T10:00:00Z');
    expect(p.weekStreak).toBe(3);
    expect(computeProgress(weeks.slice(0, 2).map((f) => ev('reaccion', { reaccion: 'x' }, f)), '2026-11-04T10:00:00Z').weekStreak).toBe(0);
  });
});
