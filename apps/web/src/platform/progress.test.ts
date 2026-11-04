import { describe, expect, it } from 'vitest';
import { SPECIES } from '@webar/chem';
import { NODES, PATH } from '../learn/path';
import { COURSE_SPECIES, SHOP, START_ELEMENTS, computeProgress, progressDiff, questsFor, type ProgressEvent } from './progress';

let n = 0;
const ev = (tipo: ProgressEvent['tipo'], datos: Record<string, unknown>, fecha = '2026-11-04T10:00:00'): ProgressEvent => ({ id: `e${n++}`, tipo, datos, fecha: new Date(fecha).toISOString() });
const NOW = new Date('2026-11-04T20:00:00');

describe('progreso', () => {
  it('cada sustancia está en un curso, y solo en uno', () => {
    const all = Object.values(COURSE_SPECIES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(SPECIES.map((s) => s.id).sort());
  });

  it('el camino presenta los 118 elementos, una vez cada uno, empezando por el hidrógeno', () => {
    const lessons = NODES.filter((x) => x.kind === 'leccion').map((x) => x.elements[0]);
    expect(lessons.length).toBe(118);
    expect(new Set(lessons).size).toBe(118);
    expect(lessons[0]).toBe('H');
    expect(new Set(NODES.map((x) => x.id)).size).toBe(NODES.length);
    // Cada laboratorio pide una sustancia con elementos ya presentados.
    const seen = new Set<string>();
    for (const node of NODES) {
      if (node.kind === 'leccion') seen.add(node.elements[0]);
      if (node.kind === 'laboratorio') for (const el of node.elements) expect(seen.has(el), `${node.id}: ${el}`).toBe(true);
    }
    expect(PATH.length).toBeGreaterThan(15);
  });

  it('se empieza solo con el hidrógeno; cada lección desbloquea su elemento', () => {
    const empty = computeProgress([], NOW);
    expect([...empty.unlocked]).toEqual(START_ELEMENTS);
    expect(empty.current?.id).toBe(NODES[0].id);
    const p = computeProgress([ev('leccion', { nodo: 'u2-leccion-He', aciertos: 5, total: 5, xp: 20 })], NOW);
    expect(p.unlocked.has('He')).toBe(true);
    expect(p.xp).toBe(20);
    expect(p.perfectLessons).toBe(1);
  });

  it('descubrir da XP una vez, desbloquea sus elementos y completa el laboratorio', () => {
    const p = computeProgress([ev('descubrir', { sustancia: 'H2' }), ev('descubrir', { sustancia: 'H2' })], NOW);
    expect(p.species.size).toBe(1);
    expect(p.xp).toBe(50 + 20);
    expect(p.done.has('u1-lab-H2')).toBe(true);
    expect(progressDiff(computeProgress([], NOW), p).species).toEqual(['H2']);
  });

  it('racha diaria: hoy sin jugar no la rompe; un día sin jugar sí, salvo con protector', () => {
    const days = ['2026-11-01T10:00:00', '2026-11-02T10:00:00', '2026-11-03T10:00:00'];
    const p = computeProgress(days.map((f) => ev('lectura', { elemento: f }, f)), NOW);
    expect(p.streak).toBe(3);
    expect(p.streakToday).toBe(false);
    const broken = computeProgress([ev('lectura', { elemento: 'a' }, days[0]), ev('lectura', { elemento: 'b' }, days[2])], NOW);
    expect(broken.streak).toBe(1);
    // Con quarks de sobra (lecciones) y un protector comprado el día 1, el día 2 se salva.
    const rich = Array.from({ length: 12 }, (_, i) => ev('leccion', { nodo: `x${i}`, aciertos: 1, total: 1, xp: 10 }, days[0]));
    const saved = computeProgress([...rich, ev('compra', { articulo: 'protector' }, days[0]), ev('lectura', { elemento: 'b' }, days[2])], NOW);
    expect(saved.frozenDays.has('2026-11-02')).toBe(true);
    expect(saved.streak).toBe(2);
    expect(saved.protectors).toBe(0);
  });

  it('no se puede comprar sin quarks', () => {
    const p = computeProgress([ev('compra', { articulo: 'protector' })], NOW);
    expect(p.protectors).toBe(0);
    expect(p.quarks).toBeLessThan(SHOP.protector.cost);
  });

  it('las misiones del día son tres, la primera de XP, y estables', () => {
    const q = questsFor('2026-11-04');
    expect(q).toHaveLength(3);
    expect(q[0].metric).toBe('xp');
    expect(new Set(q.map((x) => x.metric)).size).toBe(3);
    expect(questsFor('2026-11-04')).toEqual(q);
  });
});
