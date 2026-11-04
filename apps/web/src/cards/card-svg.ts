import { MARKER_COUNT, markerSVG } from '@webar/ar-core/markers';
import { atomComposition, contentFormula, getElement, getSpecies, type Content, type ElementData } from '@webar/chem';
import { t } from '../i18n';
import { elementName, familyName, num, speciesName, speciesUse } from '../i18n/content';
import { CARD, type CardSpec } from './deck';

/**
 * La tarjeta dibujada UNA vez, en SVG: la misma sirve para imprimirla
 * (cartas.html) y, convertida en textura, para la mesa virtual y la cara que
 * se superpone a la tarjeta real en la cámara. Así lo virtual es idéntico al
 * papel, marcador incluido.
 *
 * Unidades: décimas de milímetro (la tarjeta mide 630 × 880). Lo que no se
 * puede mover sin romper la detección: el marcador (40 mm de negro, a 8 mm del
 * borde superior y centrado) y su margen blanco de 5 mm alrededor; encima del
 * margen no se dibuja nada.
 */
export const SVG_W = Math.round(CARD.width * 10000);
export const SVG_H = Math.round(CARD.height * 10000);
const MARKER = Math.round(CARD.marker * 10000); // 400
const QUIET = MARKER / 8; // un módulo del marcador: 50
const MARKER_X = (SVG_W - MARKER) / 2;
const MARKER_Y = Math.round(CARD.markerTop * 10000);
/**
 * El panel blanco que contiene el marcador y su margen (con 0,8 mm de holgura a
 * los lados, para dejar sitio a los enlaces; 2 mm abajo).
 */
const PANEL = { x: MARKER_X - QUIET - 8, y: MARKER_Y - QUIET - 8, w: MARKER + 2 * QUIET + 16, h: MARKER + 2 * QUIET + 32 };

/** Color de cada familia: vivos (la cámara los ve claros y el marcador destaca) y con degradado en la tarjeta. */
export const FAMILY_COLORS: Record<string, string> = {
  'no-metal': '#3fd08a', 'gas-noble': '#c99bff', alcalino: '#ff7b7b', alcalinoterreo: '#ffab3d', metaloide: '#d9cb3a',
  halogeno: '#3fd3b6', 'metal-postransicion': '#9db3cf', 'metal-transicion': '#ff8fc2', lantanido: '#ffd23f', actinido: '#ef9ae6',
};
const MOLECULE_COLOR = '#7c5cff';
const IONIC_COLOR = '#1cb0f6';
const INK = '#23232b';
const FONT = `'Nunito Variable', 'Nunito', system-ui, sans-serif`;
const PROTON = '#ff4d5a';
const NEUTRON = '#7d8696';
const ELECTRON = '#1c9fe0';

export interface CardSVGOptions {
  /** CSS extra dentro del SVG (p. ej. la @font-face incrustada para usarlo como imagen). */
  css?: string;
  /** Sin el perfil gris de corte (para la textura no hace falta). */
  noCutLine?: boolean;
}

/**
 * La tarjeta `spec` en SVG. Con `content` distinto de su elemento (una
 * molécula formada), la «tarjeta de molécula» con el mismo diseño.
 */
let uid = 0;

export function cardSVG(spec: CardSpec, content: Content = spec.symbol, options: CardSVGOptions = {}): string {
  const molecule = getSpecies(content);
  const element = molecule ? null : getElement(spec.symbol);
  const body = molecule ? moleculeBody(content, spec) : elementBody(spec);
  const color = molecule ? (molecule.ionic ? IONIC_COLOR : MOLECULE_COLOR) : FAMILY_COLORS[element!.family];
  const cut = options.noCutLine ? '' : `<rect x="1.5" y="1.5" width="${SVG_W - 3}" height="${SVG_H - 3}" rx="31" fill="none" stroke="#000" stroke-opacity="0.28" stroke-width="3"/>`;
  // Ids únicos: en la hoja de imprimir hay muchas tarjetas en la misma página.
  const id = `c${++uid}`;
  const shells = element ? atomComposition(element).shells.length : 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="${CARD.width * 1000}mm" height="${CARD.height * 1000}mm" font-family="${FONT}">` +
    (options.css ? `<style>${options.css}</style>` : '') +
    `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${mix(color, '#ffffff', 0.28)}"/><stop offset="0.55" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, '#000000', 0.16)}"/></linearGradient>` +
    `<clipPath id="${id}c"><rect width="${SVG_W}" height="${SVG_H}" rx="32"/></clipPath></defs>` +
    `<rect width="${SVG_W}" height="${SVG_H}" rx="32" fill="url(#${id}g)"/>` +
    // El marcador hace de núcleo: órbitas alrededor (una por capa del átomo).
    `<g clip-path="url(#${id}c)">${orbits(shells)}</g>` +
    `<rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="26" fill="#fff"/>` +
    (element ? bondStubs(element) : '') +
    body +
    cut +
    `</svg>`;
}

/** Mezcla dos colores #rrggbb (t = cuánto del segundo). */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Órbitas suaves centradas en el marcador: se ven en los márgenes y abajo, detrás de los textos. */
function orbits(shells: number): string {
  const cx = SVG_W / 2;
  const cy = SVG_H * 0.52;
  let out = '';
  for (let i = 0; i < shells; i++) {
    const r = 300 + i * 46;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity="${(0.42 - i * 0.04).toFixed(2)}" stroke-width="6"/>`;
    // Un electrón por órbita, cada uno en un ángulo (en los márgenes o abajo, donde se ven).
    const a = [0.78, 0.22, 0.62, 0.36, 0.84, 0.15, 0.7][i] * Math.PI;
    out += `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="11" fill="#fff" fill-opacity="0.85"/>`;
  }
  return out;
}

/**
 * Enlaces que puede formar el átomo (los habituales en la ESO): H, halógenos
 * y alcalinos 1, O y alcalinotérreos 2, N y B 3, C y Si 4; gases nobles 0. En
 * los metales de transición, su valencia más común en los compuestos del juego.
 */
const BOND_OVERRIDES: Record<string, number> = { H: 1, He: 0, B: 3, Al: 3, Ga: 3, Fe: 3, Cu: 2, Zn: 2, Ag: 1, Au: 3, Ni: 2, Co: 2, Mn: 2, Cr: 3, Ti: 4, V: 3, Pt: 2, Pb: 2, Sn: 4 };
export function bondCount(e: ElementData): number {
  if (e.symbol in BOND_OVERRIDES) return BOND_OVERRIDES[e.symbol];
  if (e.group === null) return 3; // lantánidos y actínidos: +3
  if (e.group <= 2) return e.group;
  if (e.group >= 13) {
    const valence = e.group - 10;
    return Math.min(valence, 8 - valence);
  }
  return 2;
}

/**
 * Alturas fijas de los enlaces en los bordes izquierdo y derecho, por orden:
 * el primero en el centro del marcador, luego arriba, abajo y más arriba.
 * Como todas las tarjetas usan las mismas alturas, al juntar dos tarjetas los
 * trazos coinciden: tantas rayas seguidas como el enlace que pueden formar
 * (H–O una, O=C dos, N≡N tres).
 */
export const BOND_SLOTS = [288, 198, 378, 108] as const;

/** Medio enlace saliendo por cada lado; los metales (que ceden electrones: enlace iónico), discontinuo. */
function bondStubs(e: ElementData): string {
  const n = Math.min(bondCount(e), BOND_SLOTS.length);
  const metal = !['no-metal', 'halogeno', 'gas-noble', 'metaloide'].includes(e.family);
  const len = PANEL.x - 4;
  const h = 34;
  let out = '';
  for (const y of BOND_SLOTS.slice(0, n)) {
    for (const side of [0, 1]) {
      const x0 = side ? SVG_W - len : 0;
      const xEnd = side ? SVG_W - len : len; // el extremo de dentro, con el electrón
      out += metal
        ? `<line x1="${side ? SVG_W : 0}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="${INK}" stroke-width="${h}" stroke-dasharray="11 8" stroke-opacity="0.9"/>`
        : `<rect x="${x0}" y="${y - h / 2}" width="${len}" height="${h}" fill="${INK}" fill-opacity="0.9"/>`;
      out += `<circle cx="${xEnd}" cy="${y}" r="15" fill="#fff" stroke="${INK}" stroke-width="7"/>`;
    }
  }
  return out;
}

// --- Tarjeta de elemento ---------------------------------------------------------

function elementBody(spec: CardSpec): string {
  const e = getElement(spec.symbol);
  const c = atomComposition(e);
  const color = FAMILY_COLORS[e.family];
  // El marcador con su margen blanco: un SVG de 10 unidades con el negro en 1-9.
  const markerId = spec.marker ?? spec.id;
  const marker = markerId >= MARKER_COUNT ? '' : markerSVG(markerId).replace('<svg ', `<svg x="${MARKER_X - QUIET}" y="${MARKER_Y - QUIET}" width="${MARKER + 2 * QUIET}" height="${MARKER + 2 * QUIET}" shape-rendering="crispEdges" `);

  const tile = { x: 45, y: 588, w: 210, h: 238 };
  const right = 278;
  const rightW = SVG_W - 45 - right;
  const name = elementName(e.symbol);
  const family = familyName(e.family);
  const pills = [
    [c.protons, 'p', '+', PROTON],
    [c.neutrons, 'n', '0', NEUTRON],
    [c.electrons, 'e', '−', ELECTRON],
  ] as const;
  const pillW = (rightW - 2 * 8) / 3;
  const shells = t('explorar.capas', { capas: c.shells.join('·') });

  return (
    marker +
    // Casilla de la tabla periódica: número atómico, símbolo y masa.
    `<rect x="${tile.x}" y="${tile.y}" width="${tile.w}" height="${tile.h}" rx="22" fill="#fff"/>` +
    `<rect x="${tile.x}" y="${tile.y + tile.h - 10}" width="${tile.w}" height="10" fill="${color}" fill-opacity="0.35"/>` +
    `<text x="${tile.x + 20}" y="${tile.y + 50}" font-size="42" font-weight="900" fill="${INK}">${e.z}</text>` +
    text(e.symbol, tile.x + tile.w / 2, tile.y + 168, { size: 132, weight: 900, fill: INK, max: tile.w - 24 }) +
    text(`${num(e.atomicMass, e.atomicMass < 100 ? 3 : 1)} u`, tile.x + tile.w / 2, tile.y + 212, { size: 26, weight: 700, fill: INK, opacity: 0.7, max: tile.w - 20 }) +
    // Nombre, familia, partículas y capas.
    text(name, right, 636, { size: 52, weight: 900, fill: INK, max: rightW, anchor: 'start' }) +
    text(family, right, 676, { size: 28, weight: 700, fill: INK, opacity: 0.72, max: rightW, anchor: 'start' }) +
    pills
      .map(([n, letter, sign, col], i) => {
        const x = right + i * (pillW + 8);
        return (
          `<rect x="${x}" y="696" width="${pillW}" height="58" rx="29" fill="#fff"/>` +
          `<text x="${x + pillW / 2}" y="737" text-anchor="middle" font-weight="900" fill="${col}" font-size="${n >= 100 ? 28 : 32}">${n}` +
          `<tspan font-size="22" font-weight="800" fill="${INK}" fill-opacity="0.6" dx="5">${letter}</tspan><tspan font-size="16" font-weight="900" fill="${INK}" fill-opacity="0.6" dy="-10">${sign}</tspan></text>`
        );
      })
      .join('') +
    bohrIcon(right + 30, 796, 30, c.shells, color) +
    text(shells, right + 72, 806, { size: 28, weight: 800, fill: INK, max: rightW - 72, anchor: 'start' }) +
    text(`${bondCount(e) ? t('cara.enlaces', { n: bondCount(e) }) : t('cara.sin_enlaces')} · webar.peer4u.app · nº ${markerId}`, SVG_W / 2, 862, { size: 21, weight: 800, fill: INK, opacity: 0.55, max: SVG_W - 80 })
  );
}

/** Icono del modelo de Bohr: núcleo y una órbita por capa con sus electrones. */
function bohrIcon(cx: number, cy: number, r: number, shells: number[], color: string): string {
  const n = shells.length;
  const nucleus = Math.max(5, r * 0.26);
  let out = `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#fff"/>`;
  shells.forEach((count, i) => {
    const radius = nucleus + ((r - nucleus) * (i + 1)) / n;
    out += `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(1)}" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="1.6"/>`;
    const dots = Math.min(count, 8);
    for (let k = 0; k < dots; k++) {
      const a = (k / dots) * Math.PI * 2 + i * 0.6 - Math.PI / 2;
      out += `<circle cx="${(cx + Math.cos(a) * radius).toFixed(1)}" cy="${(cy + Math.sin(a) * radius).toFixed(1)}" r="2.6" fill="${ELECTRON}"/>`;
    }
  });
  return out + `<circle cx="${cx}" cy="${cy}" r="${nucleus}" fill="${PROTON}" stroke="${color}" stroke-width="1.5"/>`;
}

// --- Tarjeta de molécula -------------------------------------------------------------

function moleculeBody(id: string, spec: CardSpec): string {
  const s = getSpecies(id)!;
  const kind = (s.ionic ? t('cara.ionico') : t('cara.molecula')).toUpperCase();
  const accent = s.ionic ? IONIC_COLOR : MOLECULE_COLOR;
  const dh = s.deltaHf;
  const dhColor = dh < 0 ? '#e8590c' : dh > 0 ? '#1c7ed6' : INK;
  const cx = PANEL.x + PANEL.w / 2;
  const use = wrapLines(speciesUse(id), 24, SVG_W - 100, 3);
  return (
    // Etiqueta arriba y la molécula dibujada (bolas y palitos) en el panel blanco.
    `<rect x="${cx - 150}" y="${PANEL.y + 22}" width="300" height="48" rx="24" fill="${accent}" fill-opacity="0.14"/>` +
    text(kind, cx, PANEL.y + 56, { size: 26, weight: 900, fill: accent, max: 280, spacing: 2 }) +
    moleculeDrawing(id, cx, PANEL.y + PANEL.h / 2 + 10, PANEL.w - 120, PANEL.h - 190) +
    text(`ΔHf° = ${num(dh, 2)} kJ/mol`, cx, PANEL.y + PANEL.h - 26, { size: 26, weight: 800, fill: dhColor, max: PANEL.w - 40 }) +
    // Fórmula, nombre y uso.
    formula(contentFormula(id), SVG_W / 2, 650, 88, SVG_W - 90) +
    text(speciesName(id), SVG_W / 2, 702, { size: 40, weight: 900, fill: '#fff', max: SVG_W - 90 }) +
    use.map((line, i) => text(line, SVG_W / 2, 742 + i * 30, { size: 24, weight: 700, fill: '#fff', opacity: 0.9, max: SVG_W - 90 })).join('') +
    text(`${t('cara.tarjeta', { simbolo: spec.symbol, n: spec.marker ?? spec.id })} · ${t('cara.descomponer', { simbolo: spec.symbol })}`, SVG_W / 2, 862, {
      size: 19, weight: 800, fill: '#fff', opacity: 0.75, max: SVG_W - 70,
    })
  );
}

/** Proyección sencilla de la geometría 3D (Å): un poco girada para que se vea el volumen. */
function moleculeDrawing(id: string, cx: number, cy: number, w: number, h: number): string {
  const s = getSpecies(id)!;
  const tilt = 0.45;
  const pts = s.atoms.map((a) => {
    const [x, y, z] = a.position;
    return { x: x, y: -(y * Math.cos(tilt) - z * Math.sin(tilt)), z: y * Math.sin(tilt) + z * Math.cos(tilt), el: getElement(a.symbol) };
  });
  const radiusOf = (pm: number) => 0.32 + pm * 0.0028; // Å «de dibujo»
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    const r = radiusOf(p.el.radius);
    minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r);
  }
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY), 150);
  const ox = cx - ((minX + maxX) / 2) * scale;
  const oy = cy - ((minY + maxY) / 2) * scale;
  const P = (p: (typeof pts)[number]) => [ox + p.x * scale, oy + p.y * scale] as const;

  let out = '';
  for (const [i, j, order] of s.bonds) {
    const [x1, y1] = P(pts[i]);
    const [x2, y2] = P(pts[j]);
    if (s.ionic || order < 1) {
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-opacity="0.35" stroke-width="7" stroke-dasharray="4 12" stroke-linecap="round"/>`;
      continue;
    }
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [nx, ny] = [-(y2 - y1) / len, (x2 - x1) / len];
    for (let k = 0; k < order; k++) {
      const off = (k - (order - 1) / 2) * 15;
      out += `<line x1="${x1 + nx * off}" y1="${y1 + ny * off}" x2="${x2 + nx * off}" y2="${y2 + ny * off}" stroke="#b9bfcc" stroke-width="${order > 1 ? 9 : 13}" stroke-linecap="round"/>`;
    }
  }
  for (const p of [...pts].sort((a, b) => a.z - b.z)) {
    const [x, y] = P(p);
    const r = radiusOf(p.el.radius) * scale;
    const fill = p.el.color;
    const light = luminance(p.el.color) > 0.55;
    out +=
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-opacity="0.25" stroke-width="3"/>` +
      `<circle cx="${x - r * 0.32}" cy="${y - r * 0.34}" r="${r * 0.3}" fill="#fff" fill-opacity="0.45"/>` +
      `<text x="${x}" y="${y + r * 0.3}" text-anchor="middle" font-size="${Math.min(r * 0.85, 60)}" font-weight="900" fill="${light ? INK : '#fff'}">${p.el.symbol}</text>`;
  }
  return out;
}

function luminance(color: string): number {
  const hex = parseInt(color.replace('#', ''), 16);
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// --- Texto -------------------------------------------------------------------------------

/** Anchura aproximada de un texto en Nunito (em por carácter), para encajarlo sin medirlo. */
function estimate(text: string, size: number, weight: number): number {
  let em = 0;
  for (const ch of text) em += /[A-ZÁÉÍÓÚÑ]/.test(ch) ? 0.68 : /[ilíj.,·'|!:]/.test(ch) ? 0.3 : ch === ' ' ? 0.27 : /[mwMW]/.test(ch) ? 0.85 : 0.56;
  return em * size * (weight >= 800 ? 1.06 : 1);
}

interface TextOptions {
  size: number;
  weight: number;
  fill: string;
  max: number;
  opacity?: number;
  anchor?: 'start' | 'middle' | 'end';
  spacing?: number;
}

/** Un texto que encoge su letra hasta caber en `max`. */
function text(content: string, x: number, y: number, o: TextOptions): string {
  const width = estimate(content, o.size, o.weight) + (o.spacing ?? 0) * content.length;
  const size = width > o.max ? Math.max(10, (o.size * o.max) / width) : o.size;
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? 'middle'}" font-size="${size.toFixed(1)}" font-weight="${o.weight}" fill="${o.fill}"${o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ''}${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${escape(content)}</text>`;
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const SUP: Record<string, string> = { '⁺': '+', '⁻': '−', '⁰': '0', '¹': '1', '²': '2', '³': '3' };

/** Fórmula con subíndices de verdad (la letra no tiene los caracteres ₂, ⁺…). */
function formula(f: string, x: number, y: number, size: number, max: number): string {
  const plain = [...f].map((ch) => (SUB.includes(ch) ? String(SUB.indexOf(ch)) : SUP[ch] ?? ch)).join('');
  const width = estimate(plain, size, 900) * 0.92;
  const s = width > max ? (size * max) / width : size;
  let out = '';
  let mode: 'n' | 'sub' | 'sup' = 'n';
  for (const ch of f) {
    const next = SUB.includes(ch) ? 'sub' : ch in SUP ? 'sup' : 'n';
    const glyph = next === 'sub' ? String(SUB.indexOf(ch)) : next === 'sup' ? SUP[ch] : escape(ch);
    const dy = next === mode ? 0 : (next === 'sub' ? 0.22 : next === 'sup' ? -0.38 : 0) - (mode === 'sub' ? 0.22 : mode === 'sup' ? -0.38 : 0);
    out += `<tspan${dy ? ` dy="${(dy * s).toFixed(1)}"` : ''}${next !== 'n' ? ` font-size="${(s * 0.6).toFixed(1)}"` : ''}>${glyph}</tspan>`;
    mode = next;
  }
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${s.toFixed(1)}" font-weight="900" fill="#fff">${out}</text>`;
}

function wrapLines(content: string, size: number, max: number, lines: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of content.split(/\s+/).filter(Boolean)) {
    const test = current ? `${current} ${word}` : word;
    if (current && estimate(test, size, 700) > max) {
      out.push(current);
      current = word;
    } else current = test;
  }
  if (current) out.push(current);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return out;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
