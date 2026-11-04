/**
 * Todos los textos de la interfaz están en tablas (es/*.json): clave → texto y
 * una descripción para quien traduzca. Cada sección tiene su fichero (ui,
 * personajes, elementos…); se juntan aquí. Otro idioma = otra carpeta con las
 * mismas claves (basta con «texto»); lo que falte sale en español.
 */
export interface TextEntry {
  texto: string;
  descripcion?: string;
}
export type TextTable = Record<string, TextEntry>;

/** Junta los ficheros de una carpeta de idioma en una sola tabla. */
function merge(files: Record<string, unknown>): TextTable {
  const table: TextTable = {};
  for (const mod of Object.values(files)) Object.assign(table, (mod as { default: TextTable }).default);
  return table;
}

const TABLES: Record<string, TextTable> = {
  es: merge(import.meta.glob('./es/*.json', { eager: true })),
  en: merge(import.meta.glob('./en/*.json', { eager: true })),
};
let current: TextTable = TABLES.es;

export function setLanguage(lang: string): void {
  current = TABLES[lang] ?? TABLES[lang.split('-')[0]] ?? TABLES.es;
  if (typeof document !== 'undefined') document.documentElement.lang = TABLES[lang] ? lang : 'es';
}

/** Añade un idioma (p. ej. cargado bajo demanda). */
export function registerLanguage(lang: string, table: TextTable): void {
  TABLES[lang] = table;
}

/**
 * El texto de `key` con sus {variables} sustituidas. Si no existe, la clave
 * entre corchetes. Plurales: si `n` vale 1 y existe `<clave>_1`, se usa esa
 * («1 lección» frente a «{n} lecciones»).
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  // El singular del idioma actual; el del español solo si el idioma no tiene ni la forma normal.
  if (Number(vars.n) === 1 && (current[`${key}_1`] || (!current[key] && TABLES.es[`${key}_1`]))) key = `${key}_1`;
  const entry = current[key] ?? TABLES.es[key];
  if (!entry) return `[${key}]`;
  return entry.texto.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export function has(key: string): boolean {
  return key in current || key in TABLES.es;
}

/** Todas las claves en español que empiezan por `prefix` (p. ej. las frases del gato). */
export function keysWithPrefix(prefix: string): string[] {
  return Object.keys(TABLES.es).filter((k) => k.startsWith(prefix));
}

/** Traduce el HTML: data-t="clave" (texto) y data-t-attr="atributo:clave;otro:clave". */
export function translate(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t!)));
  root.querySelectorAll<HTMLElement>('[data-t-attr]').forEach((el) => {
    for (const pair of el.dataset.tAttr!.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
}
