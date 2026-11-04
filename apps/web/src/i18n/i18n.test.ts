import { describe, expect, it } from 'vitest';

// Las tablas de textos: sin claves repetidas entre ficheros y todas con texto.
const load = (files: Record<string, unknown>) =>
  Object.entries(files).map(([file, mod]) => [file, (mod as { default: Record<string, { texto?: string }> }).default] as const);

describe('tablas de textos', () => {
  for (const [lang, files] of [
    ['es', load(import.meta.glob('./es/*.json', { eager: true }))],
    ['en', load(import.meta.glob('./en/*.json', { eager: true }))],
  ] as const) {
    it(`${lang}: ninguna clave en dos ficheros y todas con texto`, () => {
      const seen = new Map<string, string>();
      for (const [file, table] of files) {
        for (const [key, entry] of Object.entries(table)) {
          expect(seen.get(key), `${key} está en ${seen.get(key)} y en ${file}`).toBeUndefined();
          seen.set(key, file);
          expect(typeof entry.texto, `${file}: ${key}`).toBe('string');
        }
      }
    });
  }
});
