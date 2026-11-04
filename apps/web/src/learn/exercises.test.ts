import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@webar/chem';
import { lessonExercises, particleQuestion } from './exercises';
import { NODES } from './path';

describe('ejercicios', () => {
  it('las preguntas de partículas tienen 4 opciones distintas, en cifra, y la buena es la que toca', () => {
    for (const e of ELEMENTS) {
      for (const kind of ['protones', 'electrones', 'neutrones'] as const) {
        const q = particleQuestion(e.symbol, kind);
        if (q.kind !== 'opcion') throw new Error('no es de opciones');
        expect(new Set(q.options).size, `${e.symbol} ${kind}`).toBe(4);
        for (const o of q.options) expect(o).toMatch(/^\d+$/);
        expect(Number(q.options[q.answer])).toBe(kind === 'neutrones' ? e.massNumber - e.z : e.z);
        expect(q.prompt).not.toMatch(/\[|\{/);
        expect(q.explain).not.toMatch(/\[|\{/);
      }
    }
  });

  it('cada lección del camino tiene preguntas de 4 opciones distintas y textos completos', () => {
    for (const node of NODES.filter((n) => n.kind === 'leccion')) {
      for (const ex of lessonExercises(node, ['H', 'He', 'C', 'O', 'N'])) {
        if (ex.kind === 'opcion') {
          expect(new Set(ex.options).size, `${node.id}: ${ex.prompt}`).toBe(4);
          expect(ex.prompt + ex.options.join('') + (ex.explain ?? '')).not.toMatch(/\[[a-z]+\.|\{\w+\}/);
        }
        if (ex.kind === 'ensena') expect(ex.text + (ex.extra ?? '')).not.toMatch(/\[[a-z]+\./);
      }
    }
  });
});
