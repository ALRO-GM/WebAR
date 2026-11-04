import { describe, expect, it } from 'vitest';
import table from '../i18n/es/personajes.json';
import { avatarSVG, type Expression } from './avatar';
import { CHARACTER_TEXT_FIELDS, CHARACTERS, characterKey } from './data';
import { mascotSVG } from './mascot';

const T = table as Record<string, { texto: string; descripcion?: string }>;
const EXPRESSIONS: Expression[] = ['neutral', 'feliz', 'habla', 'sorpresa', 'piensa'];

describe('personajes', () => {
  it('ids únicos en kebab-case', () => {
    const ids = CHARACTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('cada personaje tiene todas sus claves de texto, con texto y descripción', () => {
    for (const c of CHARACTERS)
      for (const field of CHARACTER_TEXT_FIELDS) {
        const entry = T[characterKey(c.id, field)];
        expect(entry, characterKey(c.id, field)).toBeDefined();
        expect(entry.texto.trim().length, characterKey(c.id, field)).toBeGreaterThan(0);
        expect(entry.descripcion, characterKey(c.id, field)).toBeTruthy();
      }
  });

  it('las frases con su voz avisan de que no son citas reales', () => {
    for (const c of CHARACTERS)
      for (const f of ['saludo', 'frase.1', 'frase.2', 'frase.3', 'frase.4', 'anima'] as const)
        expect(T[characterKey(c.id, f)].descripcion).toContain('no es una cita real');
  });

  it('elementos con símbolo válido', () => {
    for (const c of CHARACTERS) for (const e of c.elements) expect(e).toMatch(/^[A-Z][a-z]?$/);
  });

  it('genera el SVG de cada personaje con cada expresión', () => {
    for (const c of CHARACTERS)
      for (const expression of EXPRESSIONS) {
        const svg = avatarSVG(c.id, { expression, size: 100 });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('pj-ojos');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
      }
  });

  it("'gato' sirve como avatar", () => {
    const svg = avatarSVG('gato', { size: 80 });
    expect(svg).toContain('gato-svg');
  });
});

describe('Schrödingato', () => {
  it('tiene nombre y al menos 40 frases', () => {
    expect(T['gato.nombre'].texto).toBeTruthy();
    const frases = Object.keys(T).filter((k) => k.startsWith('gato.frase.'));
    expect(frases.length).toBeGreaterThanOrEqual(40);
    for (const tema of ['saludo', 'inactivo', 'acierto', 'fallo', 'racha', 'reaccion', 'descubre', 'desaparece', 'colapso', 'animo', 'noche'])
      expect(T[`gato.frase.${tema}.1`], tema).toBeDefined();
  });

  it('genera su SVG', () => {
    for (const mood of ['neutral', 'feliz', 'triste', 'sorpresa', 'piensa'] as const) {
      const svg = mascotSVG({ mood });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toContain('undefined');
    }
  });
});
