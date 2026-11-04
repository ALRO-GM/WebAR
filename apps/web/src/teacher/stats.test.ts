import { describe, expect, it } from 'vitest';
import { PATH } from '../learn/path';
import { classStats, easiest, hardest, rate, teamsOf, type ClassEvent } from './stats';

const NOW = new Date('2026-11-04T12:00:00');
const at = (daysAgo: number, hour = 10) => new Date(NOW.getTime() - daysAgo * 86400000 + (hour - 12) * 3600000).toISOString();

/** Lecciones de las primeras `units` unidades; falla los neutrones si `weak`, y el símbolo si `bad`. */
function lessons(alumno: number, units: number, opts: { weak?: boolean; bad?: boolean; daysAgo?: number } = {}): ClassEvent[] {
  const out: ClassEvent[] = [];
  let k = 0;
  for (const u of PATH.slice(0, units))
    for (const n of u.nodes) {
      if (n.kind === 'leccion') {
        const s = n.elements[0];
        const preguntas = [
          { tipo: 'neutrones', tema: s, ok: !opts.weak },
          { tipo: 'simbolo', tema: s, ok: !opts.bad },
          { tipo: 'dato', tema: s, ok: true },
        ];
        const aciertos = preguntas.filter((p) => p.ok).length;
        out.push({ alumno, tipo: 'leccion', datos: { nodo: n.id, aciertos, total: 3, xp: 15, segundos: 120, preguntas }, fecha: at((opts.daysAgo ?? 0) + (k++ % 3), 9 + (k % 4)) });
      }
      if (n.kind === 'cofre') out.push({ alumno, tipo: 'cofre', datos: { nodo: n.id }, fecha: at(opts.daysAgo ?? 0) });
    }
  return out;
}

describe('estadísticas de clase', () => {
  const students = ['Ada', 'Boro', 'Cobre', 'Dalton', 'Erbio', 'Flúor', 'Galio'].map((alias, i) => ({ id: i + 1, alias }));
  const events = [
    ...lessons(1, 8),
    ...lessons(2, 5, { weak: true }),
    ...lessons(3, 5, { weak: true }),
    ...lessons(4, 1, { weak: true, bad: true }),
    ...lessons(5, 4, { daysAgo: 12 }),
    ...lessons(7, 5),
    // Flúor (6) no ha empezado.
  ];
  const stats = classStats(students, events, NOW);
  const byAlias = (a: string) => stats.students.find((s) => s.alias === a)!;

  it('cuenta quién usa la app y cuándo', () => {
    expect(stats.started).toBe(6);
    expect(stats.active7).toBe(5);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)!.active).toBeGreaterThan(0);
    const total = stats.heat.flat().reduce((a, b) => a + b, 0);
    expect(total).toBe(events.length);
    expect(byAlias('Ada').minutes).toBeGreaterThan(0);
  });

  it('encuentra lo que más cuesta y lo que mejor se lleva', () => {
    const hard = hardest(stats.bySkill);
    expect(hard[0].skill).toBe('neutrones');
    expect(hard[0].fallaron).toBe(3);
    expect(easiest(stats.bySkill).map((s) => s.skill)).toContain('dato');
    expect(stats.items[0].skill).toBe('neutrones');
    expect(rate(stats.answers)).toBeGreaterThan(0.5);
  });

  it('clasifica al alumnado con sus motivos', () => {
    expect(byAlias('Ada').status).toBe('avanzado');
    expect(byAlias('Dalton').status).toBe('retrasado');
    expect(byAlias('Dalton').reasons.map((r) => r.key)).toContain('poco_avance');
    expect(byAlias('Erbio').status).toBe('inactivo');
    expect(byAlias('Flúor').status).toBe('sin-empezar');
    expect(byAlias('Boro').status).toBe('en-marcha');
    expect(byAlias('Boro').reasons.find((r) => r.key === 'flojo_en')?.vars.tipo).toBe('neutrones');
  });

  it('avance por unidades y elementos', () => {
    const u0 = stats.units[0];
    expect(u0.completed + u0.inProgress + u0.notYet).toBe(stats.started);
    expect(u0.completed).toBe(6);
    expect(stats.units.at(-1)!.completed).toBe(0);
    const h = stats.elements.find((e) => e.symbol === 'H')!;
    expect(h.students).toBe(6);
    expect(h.rate.intentos).toBe(18);
  });

  it('parejas de distinto nivel, con qué puede ayudar cada quien', () => {
    const inPairs = stats.pairs.flatMap((p) => [p.tutor, ...p.learners]).sort();
    expect(inPairs).toEqual([1, 2, 3, 4, 5, 7]);
    // Ada (la que más) no va con Dalton (el que menos): va con la mitad de abajo, pero no con el último.
    const ada = stats.pairs.find((p) => p.tutor === 1)!;
    expect(ada.learners).not.toContain(4);
    // Quien falla los neutrones recibe ayuda en eso de alguien que los acierta.
    const helped = stats.pairs.find((p) => p.learners.includes(2) || p.learners.includes(3));
    if (helped && [1, 7, 5].includes(helped.tutor)) expect(helped.skills).toContain('neutrones');
  });

  it('equipos de 4 con todos los niveles', () => {
    const started = stats.students.filter((s) => s.events > 0);
    const teams = teamsOf(started);
    expect(teams.flat().sort()).toEqual([1, 2, 3, 4, 5, 7]);
    // Los dos mejores no caen en el mismo equipo.
    const best = [...started].sort((a, b) => b.mastery - a.mastery).slice(0, 2).map((s) => s.id);
    expect(teams.some((t) => best.every((b) => t.includes(b)))).toBe(false);
  });

  it('una clase vacía no rompe nada', () => {
    const empty = classStats([], [], NOW);
    expect(empty.pairs).toEqual([]);
    expect(empty.units.length).toBeGreaterThan(0);
  });
});
