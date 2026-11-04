import { ELEMENTS, getElement } from '@webar/chem';

/** Medidas de la tarjeta impresa (metros): tamaño naipe de póquer. */
export const CARD = {
  width: 0.063,
  height: 0.088,
  /** Lado del cuadrado negro del marcador. */
  marker: 0.04,
  /** Del borde superior de la tarjeta al borde superior del cuadrado negro. */
  markerTop: 0.008,
};
/** Del centro del marcador al centro de la tarjeta (hacia abajo). */
export const MARKER_TO_CENTER = CARD.height / 2 - CARD.markerTop - CARD.marker / 2;

export interface CardSpec {
  /** Id del marcador ArUco impreso (único por tarjeta física). */
  id: number;
  symbol: string;
  /** 1 = primera copia de ese elemento. */
  copy: number;
  /**
   * Tarjetas virtuales (mesa): el marcador de la tarjeta impresa a la que
   * equivalen, para dibujarla igual que la de papel. Si falta, `id`.
   */
  marker?: number;
}

/**
 * Copias extra de los elementos que más se combinan (hacen falta varias H y O
 * para encadenar reacciones: 2 H₂ + O₂ → 2 H₂O). La primera copia de cada
 * elemento lleva su número atómico como id; las extra, del 119 en adelante.
 * No cambiar el orden: los ids ya impresos dependen de él.
 */
const EXTRA_COPIES: Array<[string, number]> = [
  ['H', 3], ['O', 3], ['C', 1], ['N', 1], ['Na', 1], ['Cl', 1], ['Mg', 1], ['S', 1],
  ['Ca', 1], ['Fe', 1], ['Al', 1], ['Cu', 1], ['K', 1], ['F', 1],
];

export const DECK: readonly CardSpec[] = (() => {
  const deck: CardSpec[] = ELEMENTS.map((e) => ({ id: e.z, symbol: e.symbol, copy: 1 }));
  let next = 119;
  for (const [symbol, extra] of EXTRA_COPIES) for (let c = 2; c <= extra + 1; c++) deck.push({ id: next++, symbol, copy: c });
  return deck;
})();

const BY_ID = new Map(DECK.map((c) => [c.id, c]));
export const cardById = (id: number) => BY_ID.get(id);

/** Juegos de tarjetas para imprimir (nombre y descripción en la tabla de textos: kit.<id>.*). */
export const KITS: Record<string, { symbols: string[] }> = {
  basico: {
    symbols: 'H H H H O O O O C C N N Na Na Cl Cl Mg Mg S S Ca Ca Fe Fe Al Al Cu Cu K K F F Zn Si'.split(' '),
  },
  minimo: {
    symbols: 'H H H H O O O C N'.split(' '),
  },
  tabla: {
    symbols: ELEMENTS.map((e) => e.symbol),
  },
};

/** Las tarjetas concretas (con su id) de una lista de símbolos: H H → H nº1 y H nº2. */
export function cardsFor(symbols: string[]): CardSpec[] {
  const used = new Map<string, number>();
  const cards: CardSpec[] = [];
  for (const raw of symbols) {
    const symbol = getElement(raw).symbol;
    const copy = (used.get(symbol) ?? 0) + 1;
    used.set(symbol, copy);
    const card = DECK.find((c) => c.symbol === symbol && c.copy === copy);
    if (card) cards.push(card);
  }
  return cards;
}
