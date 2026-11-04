/**
 * Personajes históricos de la química (y de la física que la explica).
 *
 * Aquí solo están los datos que no son texto: con qué elementos y temas se
 * relaciona cada persona y cómo se dibuja. Nombre, biografía, datos curiosos y
 * frases están en `i18n/es/personajes.json` (claves `personaje.<id>.*`).
 *
 * El aspecto se describe con parámetros para que el avatar plano (avatar.ts) y
 * la figura 3D (figure.ts) salgan iguales. Criterio: parecido respetuoso a los
 * retratos conocidos (peinado, gafas, barba, ropa de su época), sin exagerar
 * rasgos, con tonos de piel realistas y variados. De Jabir ibn Hayyan no hay
 * retrato de la época: se le viste como un erudito de Kufa del siglo VIII.
 */

export type HairStyle =
  | 'corto' // pelo corto peinado
  | 'entradas' // corto con entradas (frente despejada)
  | 'ondulado' // corto o media melena con ondas (años 40-50)
  | 'melena' // media melena lisa, con raya (años 20)
  | 'mono' // recogido en moño bajo
  | 'recogido' // recogido alto con volumen (hacia 1910)
  | 'largo' // largo y algo revuelto hasta los hombros
  | 'empolvado'; // peinado alto del siglo XVIII

export type FacialHair = 'ninguno' | 'bigote' | 'barba-corta' | 'barba-larga';
export type Glasses = 'ninguna' | 'redondas' | 'cuadradas';
export type OutfitStyle = 'bata' | 'vestido' | 'traje' | 'jersey' | 'sari' | 'tunica' | 'casaca';
export type Headwear = 'turbante';

export type Accessory =
  | 'matraz'
  | 'probeta'
  | 'libro'
  | 'estrella'
  | 'cristal'
  | 'atomo'
  | 'led'
  | 'hoja'
  | 'flor'
  | 'alambique'
  | 'adn'
  | 'tierra'
  | 'cronometro'
  | 'pluma'
  | 'benceno'
  | 'fision';

export interface Appearance {
  /** Tono de piel (hex). */
  skin: string;
  hair: { style: HairStyle; color: string };
  facialHair: FacialHair;
  /** Color de barba o bigote; si falta, el del pelo. */
  facialHairColor?: string;
  glasses: Glasses;
  /** `main`: prenda principal; `accent`: cuello, corbata, fajín o borde; `under`: lo que asoma debajo (camisa). */
  outfit: { style: OutfitStyle; main: string; accent: string; under?: string };
  accessory: Accessory;
  /** Color principal del accesorio (líquido, cristal, luz…). */
  accessoryColor: string;
  headwear?: { kind: Headwear; color: string };
}

export type Topic =
  | 'radiactividad'
  | 'elementos'
  | 'tabla'
  | 'estrellas'
  | 'espectros'
  | 'aire'
  | 'combustion'
  | 'masa'
  | 'ozono'
  | 'medio-ambiente'
  | 'alquimia'
  | 'laboratorio'
  | 'medicina'
  | 'plantas'
  | 'minerales'
  | 'cristales'
  | 'adn'
  | 'reacciones'
  | 'luz'
  | 'atomo'
  | 'nucleo'
  | 'enlace'
  | 'semiconductores';

export interface Character {
  /** kebab-case; prefijo de sus textos: `personaje.<id>.*`. */
  id: string;
  born: number;
  /** `null` si vive. */
  died: number | null;
  /** Año aproximado (fechas «hacia…»). */
  approximate?: boolean;
  sex: 'mujer' | 'hombre';
  /** Símbolos de elementos con los que tiene relación. */
  elements: string[];
  topics: Topic[];
  /** Color de su tarjeta y su fondo. */
  color: string;
  look: Appearance;
}

export const CHARACTERS: Character[] = [
  {
    id: 'marie-curie',
    born: 1867,
    died: 1934,
    sex: 'mujer',
    elements: ['Po', 'Ra', 'U', 'Cm'],
    topics: ['radiactividad', 'elementos', 'atomo'],
    color: '#2ec4a6',
    look: {
      skin: '#f2d6c4',
      hair: { style: 'mono', color: '#7a6658' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'vestido', main: '#34323f', accent: '#ece6da' },
      accessory: 'probeta',
      accessoryColor: '#7dffd8',
    },
  },
  {
    id: 'dmitri-mendeleiev',
    born: 1834,
    died: 1907,
    sex: 'hombre',
    elements: ['Ga', 'Ge', 'Sc', 'Md'],
    topics: ['tabla', 'elementos'],
    color: '#7c5cff',
    look: {
      skin: '#eecbb2',
      hair: { style: 'largo', color: '#8d8174' },
      facialHair: 'barba-larga',
      glasses: 'ninguna',
      outfit: { style: 'traje', main: '#3d4250', accent: '#2a2d36', under: '#f1ede4' },
      accessory: 'libro',
      accessoryColor: '#7c5cff',
    },
  },
  {
    id: 'cecilia-payne-gaposchkin',
    born: 1900,
    died: 1979,
    sex: 'mujer',
    elements: ['H', 'He'],
    topics: ['estrellas', 'espectros', 'elementos'],
    color: '#1cb0f6',
    look: {
      skin: '#f4dccd',
      hair: { style: 'melena', color: '#5c3b28' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'vestido', main: '#3a5ba0', accent: '#f3efe6' },
      accessory: 'estrella',
      accessoryColor: '#ffc800',
    },
  },
  {
    id: 'marie-anne-paulze-lavoisier',
    born: 1758,
    died: 1836,
    sex: 'mujer',
    elements: ['O', 'H', 'C'],
    topics: ['aire', 'combustion', 'masa', 'laboratorio'],
    color: '#ff86b0',
    look: {
      skin: '#f5dfd2',
      hair: { style: 'empolvado', color: '#d9d2cb' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'vestido', main: '#6f93cf', accent: '#fbf7f0' },
      accessory: 'pluma',
      accessoryColor: '#fbf7f0',
    },
  },
  {
    id: 'mario-molina',
    born: 1943,
    died: 2020,
    sex: 'hombre',
    elements: ['Cl', 'O', 'F', 'C'],
    topics: ['ozono', 'aire', 'medio-ambiente', 'reacciones'],
    color: '#58c322',
    look: {
      skin: '#c99673',
      hair: { style: 'entradas', color: '#cfcac4' },
      facialHair: 'ninguno',
      glasses: 'cuadradas',
      outfit: { style: 'traje', main: '#2f4b6e', accent: '#d9534f', under: '#f3f4f7' },
      accessory: 'tierra',
      accessoryColor: '#3fa9f5',
    },
  },
  {
    id: 'jabir-ibn-hayyan',
    born: 721,
    died: 815,
    approximate: true,
    sex: 'hombre',
    elements: ['S', 'Hg'],
    topics: ['alquimia', 'laboratorio', 'cristales'],
    color: '#e0a33a',
    look: {
      skin: '#bf8a64',
      hair: { style: 'corto', color: '#2c221d' },
      facialHair: 'barba-larga',
      facialHairColor: '#3b2d25',
      glasses: 'ninguna',
      outfit: { style: 'tunica', main: '#2c7d74', accent: '#e3b04b' },
      accessory: 'alambique',
      accessoryColor: '#d98c3f',
      headwear: { kind: 'turbante', color: '#efe5cf' },
    },
  },
  {
    id: 'alice-ball',
    born: 1892,
    died: 1916,
    sex: 'mujer',
    elements: ['C', 'H', 'O'],
    topics: ['medicina', 'plantas', 'laboratorio'],
    color: '#ff9600',
    look: {
      skin: '#7b4a30',
      hair: { style: 'recogido', color: '#1e1612' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'bata', main: '#fbfbfd', accent: '#5b7bd6', under: '#5b7bd6' },
      accessory: 'matraz',
      accessoryColor: '#ffd23f',
    },
  },
  {
    id: 'tu-youyou',
    born: 1930,
    died: null,
    sex: 'mujer',
    elements: ['C', 'H', 'O'],
    topics: ['medicina', 'plantas', 'reacciones'],
    color: '#ff4b4b',
    look: {
      skin: '#ecc9a6',
      hair: { style: 'ondulado', color: '#26252b' },
      facialHair: 'ninguno',
      glasses: 'redondas',
      outfit: { style: 'bata', main: '#fbfbfd', accent: '#c9443c', under: '#c9443c' },
      accessory: 'hoja',
      accessoryColor: '#58b04a',
    },
  },
  {
    id: 'andres-manuel-del-rio',
    born: 1764,
    died: 1849,
    sex: 'hombre',
    elements: ['V', 'Pb'],
    topics: ['minerales', 'elementos', 'cristales'],
    color: '#c0392b',
    look: {
      skin: '#e7c3a5',
      hair: { style: 'entradas', color: '#bdb5ad' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'casaca', main: '#7b3540', accent: '#f4ecdc' },
      accessory: 'cristal',
      accessoryColor: '#d4472f',
    },
  },
  {
    id: 'rosalind-franklin',
    born: 1920,
    died: 1958,
    sex: 'mujer',
    elements: ['C', 'N', 'P'],
    topics: ['adn', 'cristales', 'enlace'],
    color: '#ce82ff',
    look: {
      skin: '#f1d2bd',
      hair: { style: 'ondulado', color: '#3b2a21' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'jersey', main: '#3f8f7c', accent: '#f4f1ea' },
      accessory: 'adn',
      accessoryColor: '#ce82ff',
    },
  },
  {
    id: 'ahmed-zewail',
    born: 1946,
    died: 2016,
    sex: 'hombre',
    elements: ['I', 'Na', 'C', 'N'],
    topics: ['reacciones', 'luz', 'enlace'],
    color: '#1cb0f6',
    look: {
      skin: '#b88162',
      hair: { style: 'corto', color: '#4b4744' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'traje', main: '#2b3a4f', accent: '#d9a21b', under: '#f3f4f7' },
      accessory: 'cronometro',
      accessoryColor: '#ff4d5a',
    },
  },
  {
    id: 'niels-bohr',
    born: 1885,
    died: 1962,
    sex: 'hombre',
    elements: ['H', 'Bh', 'Hf'],
    topics: ['atomo', 'espectros', 'nucleo'],
    color: '#7c5cff',
    look: {
      skin: '#f0d0b9',
      hair: { style: 'corto', color: '#6e5240' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'traje', main: '#4a505e', accent: '#2a2d36', under: '#f1ede4' },
      accessory: 'atomo',
      accessoryColor: '#1cb0f6',
    },
  },
  {
    id: 'lise-meitner',
    born: 1878,
    died: 1968,
    sex: 'mujer',
    elements: ['U', 'Ba', 'Kr', 'Pa', 'Mt'],
    topics: ['nucleo', 'radiactividad', 'elementos'],
    color: '#ff9600',
    look: {
      skin: '#efd0bb',
      hair: { style: 'mono', color: '#8f837a' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'vestido', main: '#56497a', accent: '#f1ece4' },
      accessory: 'fision',
      accessoryColor: '#ff7a1a',
    },
  },
  {
    id: 'kathleen-lonsdale',
    born: 1903,
    died: 1971,
    sex: 'mujer',
    elements: ['C', 'H'],
    topics: ['cristales', 'enlace', 'minerales'],
    color: '#2ec4a6',
    look: {
      skin: '#f3d8c7',
      hair: { style: 'ondulado', color: '#b9b2ac' },
      facialHair: 'ninguno',
      glasses: 'redondas',
      outfit: { style: 'vestido', main: '#8b5aa0', accent: '#f4efe8' },
      accessory: 'benceno',
      accessoryColor: '#2ec4a6',
    },
  },
  {
    id: 'asima-chatterjee',
    born: 1917,
    died: 2006,
    sex: 'mujer',
    elements: ['N', 'C', 'O'],
    topics: ['plantas', 'medicina', 'reacciones'],
    color: '#ff4d8d',
    look: {
      skin: '#a8714f',
      hair: { style: 'mono', color: '#1f1b1b' },
      facialHair: 'ninguno',
      glasses: 'redondas',
      outfit: { style: 'sari', main: '#f4efe6', accent: '#d6336c' },
      accessory: 'flor',
      accessoryColor: '#ff6fae',
    },
  },
  {
    id: 'shuji-nakamura',
    born: 1954,
    died: null,
    sex: 'hombre',
    elements: ['Ga', 'N', 'In'],
    topics: ['luz', 'semiconductores', 'cristales'],
    color: '#1c6fd6',
    look: {
      skin: '#e8c4a0',
      hair: { style: 'corto', color: '#1c1c21' },
      facialHair: 'ninguno',
      glasses: 'ninguna',
      outfit: { style: 'bata', main: '#fbfbfd', accent: '#1c6fd6', under: '#3a4a63' },
      accessory: 'led',
      accessoryColor: '#3d7bff',
    },
  },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string): Character {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Personaje desconocido: ${id}`);
  return c;
}

/** Personajes relacionados con un elemento (símbolo, p. ej. «Ra»). */
export function charactersForElement(symbol: string): Character[] {
  return CHARACTERS.filter((c) => c.elements.includes(symbol));
}

/** Personajes relacionados con un tema. */
export function charactersForTopic(topic: Topic): Character[] {
  return CHARACTERS.filter((c) => c.topics.includes(topic));
}

/** Las claves de texto que tiene cada personaje (sin el prefijo `personaje.<id>.`). */
export const CHARACTER_TEXT_FIELDS = [
  'nombre',
  'vida',
  'pais',
  'campo',
  'bio',
  'logro',
  'dato.1',
  'dato.2',
  'dato.3',
  'saludo',
  'frase.1',
  'frase.2',
  'frase.3',
  'frase.4',
  'anima',
] as const;
export type CharacterTextField = (typeof CHARACTER_TEXT_FIELDS)[number];

export const characterKey = (id: string, field: CharacterTextField): string => `personaje.${id}.${field}`;

// --- Color ------------------------------------------------------------------

/** Aclara (amt > 0) u oscurece (amt < 0) un color hex; amt entre -1 y 1. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa aproximada (0 negro, 1 blanco). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
