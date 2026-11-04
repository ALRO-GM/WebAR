import { FAMILY_NAMES, getElement, getSpecies, type Content, type ElementFamily, type Outcome, type Reaction } from '@webar/chem';
import { has, t } from './index';

// Los nombres y textos de @webar/chem, pasados por la tabla de textos (el
// paquete trae el español por defecto; la app los muestra en el idioma elegido).

const or = (key: string, fallback: string, vars?: Record<string, string | number>) => (has(key) ? t(key, vars) : fallback);

export const elementName = (symbol: string) => or(`elemento.${symbol}.nombre`, getElement(symbol).name);
export const familyName = (family: ElementFamily) => or(`familia.${family}`, FAMILY_NAMES[family]);
export const speciesName = (id: string) => or(`especie.${id}.nombre`, getSpecies(id)?.name ?? id);
export const speciesUse = (id: string) => or(`especie.${id}.uso`, getSpecies(id)?.note ?? '');

/** Nombre de lo que hay en una carta: «Agua», «Hierro». */
export const contentName = (content: Content) => (getSpecies(content) ? speciesName(content) : elementName(content));

export function reactionName(reaction: Reaction): string {
  if (reaction.id.startsWith('sintesis-')) return t('reaccion.sintesis', { nombre: contentName(reaction.products[0].content).toLowerCase() });
  return or(`reaccion.${reaction.id}.nombre`, reaction.name);
}

export function reactionNote(reaction: Reaction): string {
  if (reaction.id.startsWith('sintesis-')) return speciesUse(reaction.products[0].content);
  return or(`reaccion.${reaction.id}.nota`, reaction.note);
}

export const reactionConditions = (reaction: Reaction) => (reaction.conditions ? or(`reaccion.${reaction.id}.condiciones`, reaction.conditions) : '');

export const outcomeName = (o: Outcome) => reactionName(o.reaction);

/** Número con el formato del idioma actual. */
export const num = (n: number, digits = 1) => n.toLocaleString(document.documentElement.lang || 'es', { maximumFractionDigits: digits });
