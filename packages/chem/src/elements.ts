import { ELEMENTS } from './data/elements';
import type { ElementData, ElementFamily } from './types';

export { ELEMENTS };

export const FAMILY_NAMES: Record<ElementFamily, string> = {
  'no-metal': 'No metal',
  'gas-noble': 'Gas noble',
  alcalino: 'Metal alcalino',
  alcalinoterreo: 'Metal alcalinotérreo',
  metaloide: 'Metaloide',
  halogeno: 'Halógeno',
  'metal-postransicion': 'Metal del bloque p',
  'metal-transicion': 'Metal de transición',
  lantanido: 'Lantánido',
  actinido: 'Actínido',
};

const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol.toLowerCase(), e]));

/** Busca un elemento por número atómico (1-118) o símbolo («O», «fe»). */
export function getElement(key: number | string): ElementData {
  const element = typeof key === 'number' ? ELEMENTS[key - 1] : BY_SYMBOL.get(key.toLowerCase());
  if (!element) throw new Error(`No existe el elemento ${key}`);
  return element;
}

/** Fila y columna en la tabla periódica larga (los lantánidos y actínidos, debajo). */
export function tablePosition(element: ElementData): { row: number; column: number } {
  if (element.group !== null) return { row: element.period, column: element.group };
  const first = element.period === 6 ? 57 : 89;
  return { row: element.period + 3, column: 3 + element.z - first };
}
