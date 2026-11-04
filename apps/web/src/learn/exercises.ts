import { ELEMENTS, SPECIES, composition, getElement } from '@webar/chem';
import { has, t } from '../i18n';
import { elementName } from '../i18n/content';
import type { PathNode } from './path';

/**
 * Los ejercicios de una lección, generados a partir de las fichas de los
 * elementos (i18n/es/elementos-*.json). Primero se enseña (tarjetas con el
 * guía) y luego se pregunta; lo fallado vuelve al final, como en las apps de
 * idiomas, para fijarlo.
 */
export type Exercise =
  | { kind: 'ensena'; symbol: string; title: string; text: string; extra?: string; visual: 'atomo' | 'objeto' | 'guia' }
  | { kind: 'opcion'; prompt: string; quote?: string; options: string[]; answer: number; explain?: string; symbol?: string }
  | { kind: 'formula'; species: string; tiles: string[] };

const shuffle = <T>(list: T[], rnd = Math.random): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = <T>(list: T[], n: number, rnd = Math.random) => shuffle(list, rnd).slice(0, n);

function choice(prompt: string, right: string, wrong: string[], extra: Partial<Extract<Exercise, { kind: 'opcion' }>> = {}): Exercise {
  const options = shuffle([right, ...wrong.filter((w) => w !== right).slice(0, 3)]);
  return { kind: 'opcion', prompt, options, answer: options.indexOf(right), ...extra };
}

/** Otros elementos para despistar: los conocidos y, si faltan, los primeros de la tabla. */
function distractors(symbol: string, known: string[], n = 3): string[] {
  const pool = known.filter((s) => s !== symbol);
  const extra = ELEMENTS.slice(0, 20).map((e) => e.symbol).filter((s) => s !== symbol && !pool.includes(s));
  return [...pick(pool, n), ...pick(extra, n)].slice(0, n);
}

const key = (symbol: string, field: string) => `elemento.${symbol}.${field}`;

/** Pregunta de la ficha (si existe). */
function factQuestion(symbol: string): Exercise | null {
  const q = key(symbol, 'pregunta');
  if (!has(q)) return null;
  return choice(t(q), t(`${q}.ok`), [t(`${q}.mal1`), t(`${q}.mal2`), t(`${q}.mal3`)], { explain: t(`${q}.explicacion`), symbol });
}

function protonsQuestion(symbol: string): Exercise {
  const e = getElement(symbol);
  const wrong = [e.z + 1, Math.max(1, e.z - 1), e.massNumber, e.z * 2, e.massNumber - e.z].filter((n) => n !== e.z).map(String);
  return choice(t('leccion.protones', { nombre: elementName(symbol) }), String(e.z), [...new Set(wrong)], {
    explain: t('leccion.protones_explica', { nombre: elementName(symbol), z: e.z }),
    symbol,
  });
}

function symbolQuestion(symbol: string, known: string[]): Exercise {
  const e = getElement(symbol);
  // Símbolos parecidos: misma inicial primero.
  const similar = ELEMENTS.filter((x) => x.symbol !== symbol && x.symbol[0] === symbol[0]).map((x) => x.symbol);
  const wrong = [...pick(similar, 2), ...distractors(symbol, known)];
  return choice(t('leccion.simbolo', { nombre: elementName(symbol) }), e.symbol, [...new Set(wrong)]);
}

function clueQuestion(symbol: string, known: string[]): Exercise | null {
  const k = key(symbol, 'pista');
  if (!has(k)) return null;
  return choice(t('leccion.quien'), elementName(symbol), distractors(symbol, known).map(elementName), { quote: t(k), symbol });
}

/** Una sustancia que se pueda formar con lo conocido y que lleve `symbol`. */
function formulaFor(symbol: string, known: Set<string>): Exercise | null {
  const options = SPECIES.filter((s) => {
    const parts = Object.keys(composition(s));
    return parts.includes(symbol) && parts.every((p) => known.has(p)) && s.atoms.length <= 5;
  });
  const s = options[Math.floor(Math.random() * options.length)];
  if (!s) return null;
  const atoms = Object.entries(composition(s)).flatMap(([el, n]) => Array<string>(n).fill(el));
  const decoys = pick([...known].filter((k) => !atoms.includes(k)), 2);
  return { kind: 'formula', species: s.id, tiles: shuffle([...atoms, ...decoys, atoms[0]]) };
}

export function lessonExercises(node: PathNode, known: string[]): Exercise[] {
  const knownSet = new Set([...known, ...node.elements]);
  if (node.kind === 'leccion') {
    const s = node.elements[0];
    const name = elementName(s);
    const teach = ([
      { kind: 'ensena', symbol: s, title: t('leccion.conoce', { nombre: name }), text: has(key(s, 'descubrimiento')) ? t(key(s, 'descubrimiento')) : t(`elemento.${s}.historia`), visual: 'guia' },
      { kind: 'ensena', symbol: s, title: t('leccion.usos', { nombre: name }), text: t(key(s, 'usos')), extra: t(key(s, 'porque')), visual: 'objeto' },
      { kind: 'ensena', symbol: s, title: t('leccion.unico'), text: t(key(s, 'unico')), extra: t(key(s, 'curiosidad')), visual: 'atomo' },
    ] as Exercise[]).filter((x) => x.kind === 'ensena' && (has(key(s, 'usos')) || x.visual === 'guia'));
    const ask = [factQuestion(s), protonsQuestion(s), symbolQuestion(s, known), clueQuestion(s, known), formulaFor(s, knownSet)].filter(
      (x): x is Exercise => !!x,
    );
    return [...teach, ...ask];
  }
  // Repaso: preguntas variadas de lo aprendido (sin enseñar antes).
  const pool = pick(node.elements, 6);
  const out: Exercise[] = [];
  for (const s of pool) {
    const makers = [() => factQuestion(s), () => clueQuestion(s, node.elements), () => protonsQuestion(s), () => symbolQuestion(s, node.elements)];
    const ex = shuffle(makers).map((m) => m()).find(Boolean);
    if (ex) out.push(ex);
  }
  const f = formulaFor(pick(node.elements, 1)[0], knownSet);
  if (f) out.push(f);
  return out;
}
