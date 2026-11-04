import { has, t } from '../i18n';
import table from '../i18n/es/personajes.json';

/**
 * Textos del módulo de personajes. Pasa por la tabla general (`t`) para que se
 * traduzcan como el resto; si la tabla general aún no incluye personajes.json,
 * se lee directamente de él (en español).
 */
const LOCAL = table as Record<string, { texto: string; descripcion?: string }>;

export function tx(key: string, vars: Record<string, string | number> = {}): string {
  if (has(key)) return t(key, vars);
  const entry = LOCAL[key];
  if (!entry) return `[${key}]`;
  return entry.texto.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

export function hasText(key: string): boolean {
  return key in LOCAL || has(key);
}

/** Claves de este módulo que empiezan por `prefix` (el orden es el del fichero). */
export function textKeys(prefix: string): string[] {
  return Object.keys(LOCAL).filter((k) => k.startsWith(prefix));
}

/** Una clave al azar de las que empiezan por `prefix`, evitando repetir `avoid`. */
export function randomKey(prefix: string, avoid?: string): string | undefined {
  const keys = textKeys(prefix);
  if (keys.length === 0) return undefined;
  const pool = keys.length > 1 && avoid ? keys.filter((k) => k !== avoid) : keys;
  return pool[Math.floor(Math.random() * pool.length)];
}
