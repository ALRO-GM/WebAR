import { getElement } from './elements';
import type { ElementData } from './types';

/** Un subnivel ocupado: «3d⁶» es { n: 3, l: 2, electrons: 6 }. */
export interface Subshell {
  n: number;
  /** 0 = s, 1 = p, 2 = d, 3 = f. */
  l: number;
  electrons: number;
}

export const L_LETTERS = 'spdf';

/** Lo que tiene un átomo neutro del isótopo dibujado. */
export interface AtomComposition {
  protons: number;
  neutrons: number;
  electrons: number;
  massNumber: number;
  /** Todos los subniveles, del más interno al más externo. */
  subshells: Subshell[];
  /** Electrones por capa (n = 1, 2, 3…), como en el modelo de Bohr. */
  shells: number[];
}

export function atomComposition(element: ElementData): AtomComposition {
  const subshells = parseConfiguration(element.configuration);
  return {
    protons: element.z,
    neutrons: element.massNumber - element.z,
    electrons: element.z,
    massNumber: element.massNumber,
    subshells,
    shells: electronShells(subshells),
  };
}

/** Lee «[Ar]4s2 3d6» y devuelve todos los subniveles, núcleo de gas noble incluido. */
export function parseConfiguration(configuration: string): Subshell[] {
  const byKey = new Map<string, Subshell>();
  const core = /^\[(\w+)\]/.exec(configuration);
  if (core) {
    for (const s of parseConfiguration(getElement(core[1]).configuration)) byKey.set(`${s.n}${s.l}`, s);
  }
  for (const [, n, l, e] of configuration.matchAll(/(\d)([spdf])(\d+)/g)) {
    const sub = { n: Number(n), l: L_LETTERS.indexOf(l), electrons: Number(e) };
    byKey.set(`${sub.n}${sub.l}`, sub);
  }
  return [...byKey.values()].sort((a, b) => a.n - b.n || a.l - b.l);
}

export function electronShells(subshells: Subshell[]): number[] {
  const shells: number[] = [];
  for (const s of subshells) shells[s.n - 1] = (shells[s.n - 1] ?? 0) + s.electrons;
  return Array.from(shells, (e) => e ?? 0);
}

/**
 * Cómo se reparten los electrones de un subnivel entre sus 2l+1 orbitales
 * (regla de Hund: primero uno en cada orbital, luego se emparejan).
 */
export function orbitalOccupancy(subshell: Subshell): number[] {
  const orbitals = 2 * subshell.l + 1;
  return Array.from({ length: orbitals }, (_, i) => (subshell.electrons > i ? 1 : 0) + (subshell.electrons > orbitals + i ? 1 : 0));
}

/** «1s² 2s² 2p⁴». Con `full: false`, abreviada con el gas noble como en los datos. */
export function formatConfiguration(element: ElementData, full = false): string {
  const sup = (n: number) => String(n).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  if (!full) return element.configuration.replace(/([spdf])(\d+)/g, (_, l, e) => l + sup(Number(e)));
  return parseConfiguration(element.configuration)
    .map((s) => `${s.n}${L_LETTERS[s.l]}${sup(s.electrons)}`)
    .join(' ');
}

// Reglas de Slater: grupos (1s)(2s,2p)(3s,3p)(3d)(4s,4p)(4d)(4f)(5s,5p)…
const slaterGroup = (s: { n: number; l: number }) => s.n * 10 + (s.l <= 1 ? 0 : s.l === 2 ? 1 : 2);

/**
 * Carga nuclear efectiva que nota un electrón del subnivel `target` (reglas de
 * Slater). Sirve para el tamaño de cada nube: los electrones internos «ven»
 * casi todo el núcleo y están muy cerca; los externos, apantallados, lejos.
 */
export function effectiveCharge(z: number, subshells: Subshell[], target: Subshell): number {
  const g = slaterGroup(target);
  let shielding = 0;
  for (const s of subshells) {
    const gs = slaterGroup(s);
    if (gs === g) {
      const others = s.n === target.n && s.l === target.l ? s.electrons - 1 : s.electrons;
      shielding += others * (target.n === 1 ? 0.3 : 0.35);
    } else if (gs < g) {
      if (target.l <= 1) shielding += s.electrons * (s.n === target.n - 1 ? 0.85 : 1);
      else shielding += s.electrons;
    }
  }
  return Math.max(z - shielding, 1);
}
