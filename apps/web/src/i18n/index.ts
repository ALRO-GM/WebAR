import en from './en.json';
import es from './es.json';

/**
 * Todos los textos de la interfaz están en una tabla (es.json): clave → texto y
 * una descripción para quien traduzca. Otro idioma = otro fichero con las
 * mismas claves (basta con «texto»); lo que falte sale en español.
 */
export interface TextEntry {
  texto: string;
  descripcion?: string;
}
export type TextTable = Record<string, TextEntry>;

const TABLES: Record<string, TextTable> = { es: es as TextTable, en: en as TextTable };
let current: TextTable = TABLES.es;

export function setLanguage(lang: string): void {
  current = TABLES[lang] ?? TABLES[lang.split('-')[0]] ?? TABLES.es;
  document.documentElement.lang = TABLES[lang] ? lang : 'es';
}

/** Añade un idioma (p. ej. cargado bajo demanda). */
export function registerLanguage(lang: string, table: TextTable): void {
  TABLES[lang] = table;
}

/** El texto de `key` con sus {variables} sustituidas. Si no existe, la clave entre corchetes. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const entry = current[key] ?? TABLES.es[key];
  if (!entry) return `[${key}]`;
  return entry.texto.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export function has(key: string): boolean {
  return key in current || key in TABLES.es;
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
