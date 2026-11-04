import { getCharacter, luminance, shade, type Accessory, type Appearance, type Character } from './data';
import { mascotSVG, type MascotMood } from './mascot';
import { tx } from './text';

/**
 * Avatar plano (SVG) de un personaje: busto con cabeza grande y ojos
 * expresivos, dibujado a partir de sus parámetros de aspecto.
 *
 * Las animaciones van en characters.css y se activan con clases en el <svg>:
 *  - `pj-reposo` (por defecto): respira, flota un poco y parpadea.
 *  - `pj-saluda`: saluda con la mano.  - `pj-celebra`: saltito con chispas.
 *  - `pj-habla`: mueve la boca.
 * `animateAvatar(el, 'saluda')` pone y quita la clase sola.
 */

export type Expression = 'neutral' | 'feliz' | 'habla' | 'sorpresa' | 'piensa';
export type AvatarAction = 'saluda' | 'celebra' | 'habla';

export interface AvatarOptions {
  expression?: Expression;
  /** Ancho en px (el alto es 1,2 veces). Por defecto 160. */
  size?: number;
  /** Disco de color detrás (por defecto, sí). */
  background?: boolean;
  /** Sin animación de reposo (para listas largas o impresión). */
  still?: boolean;
  /** Solo decorativo (aria-hidden) en vez de imagen con el nombre. */
  decorative?: boolean;
}

const INK = '#2b2730';
const MOUTH = '#5a2228';
let uid = 0;

/** Id especial: la mascota como avatar (p. ej. el del usuario). */
export const MASCOT_AVATAR_ID = 'gato';

export function avatarSVG(id: string, opts: AvatarOptions = {}): string {
  if (id === MASCOT_AVATAR_ID) {
    const mood: MascotMood = opts.expression === 'habla' || opts.expression === 'feliz' ? 'feliz' : opts.expression === 'sorpresa' || opts.expression === 'piensa' ? opts.expression : 'neutral';
    return mascotSVG({ mood, size: opts.size ?? 160, background: opts.background !== false, decorative: opts.decorative });
  }
  const ch = getCharacter(id);
  const size = opts.size ?? 160;
  const expression = opts.expression ?? 'neutral';
  const n = ++uid;
  const L = ch.look;
  const classes = ['pj', `pj-${ch.id}`];
  if (!opts.still) classes.push('pj-reposo');
  if (expression === 'habla') classes.push('pj-habla');
  // Cada avatar parpadea a su ritmo.
  const delay = ((n * 1.37) % 4).toFixed(2);
  const a11y = opts.decorative
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${escapeAttr(tx('personaje.avatar.aria', { nombre: tx(`personaje.${id}.nombre`) }))}"`;

  const clip = `pj-clip-${n}`;
  const bg = opts.background !== false;
  const figure = [
    // La cabeza baja un poco (translate) para que el cuello no quede largo.
    `<g transform="translate(0 11)">${hairBack(L)}</g>`,
    waveArm(L),
    neck(L),
    torso(L),
    `<g transform="translate(0 11)">${head(L, expression)}</g>`,
    holdArm(L),
    `<g class="pj-accesorio" transform="translate(134 192)">${accessorySVG(L.accessory, L.accessoryColor)}</g>`,
  ].join('');

  return `<svg class="${classes.join(' ')}" viewBox="0 0 200 240" width="${size}" height="${Math.round(size * 1.2)}" style="--pj-color:${ch.color};--pj-delay:-${delay}s" ${a11y} xmlns="http://www.w3.org/2000/svg">${
    bg
      ? `<defs><clipPath id="${clip}"><rect x="0" y="0" width="200" height="132"/><circle cx="100" cy="132" r="94"/></clipPath></defs><circle class="pj-fondo" cx="100" cy="132" r="94" fill="${shade(ch.color, 0.72)}"/><circle cx="100" cy="132" r="94" fill="none" stroke="${shade(ch.color, 0.45)}" stroke-width="4"/>`
      : ''
  }<g class="pj-figura"${bg ? ` clip-path="url(#${clip})"` : ''}>${figure}</g>${sparkles()}</svg>`;
}

/** Pone una animación puntual en un avatar ya montado y la quita al acabar. */
export function animateAvatar(el: Element, action: AvatarAction, ms?: number): void {
  const svg = el instanceof SVGSVGElement ? el : el.querySelector('svg.pj');
  if (!svg) return;
  const cls = `pj-${action}`;
  const dur = ms ?? { saluda: 1800, celebra: 1100, habla: 2400 }[action];
  svg.classList.remove(cls);
  // Reinicia la animación aunque ya estuviera puesta.
  void (svg as SVGElement).getBoundingClientRect();
  svg.classList.add(cls);
  const prev = (svg as unknown as { _pjTimer?: Record<string, number> })._pjTimer ?? {};
  clearTimeout(prev[cls]);
  prev[cls] = window.setTimeout(() => svg.classList.remove(cls), dur);
  (svg as unknown as { _pjTimer?: Record<string, number> })._pjTimer = prev;
}

/** Cambia la expresión de un avatar montado (lo vuelve a dibujar en su sitio). */
export function setExpression(el: Element, id: string, expression: Expression, opts: AvatarOptions = {}): void {
  const svg = el instanceof SVGSVGElement ? el : el.querySelector('svg.pj');
  if (!svg) return;
  const width = Number(svg.getAttribute('width')) || undefined;
  svg.outerHTML = avatarSVG(id, { ...opts, size: opts.size ?? width, expression });
}

// --- Partes -------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const browColor = (L: Appearance) => (luminance(L.hair.color) > 0.55 ? shade(L.hair.color, -0.38) : shade(L.hair.color, -0.1));

function hairBack(L: Appearance): string {
  const c = shade(L.hair.color, -0.12);
  if (L.headwear) return '';
  switch (L.hair.style) {
    case 'ondulado':
      return `<path fill="${c}" d="M46 104C38 58 68 34 100 34s62 24 54 70c5 14 4 28-5 38-9-5-10-15-4-24H55c6 9 5 19-4 24-9-10-10-24-5-38Z"/>`;
    case 'melena':
      return `<path fill="${c}" d="M44 100C40 52 70 33 100 33s60 19 56 67l2 38c-6 8-14 8-20 3H62c-6 5-14 5-20-3Z"/>`;
    case 'mono':
      return `<circle fill="${c}" cx="100" cy="42" r="17"/><path fill="${shade(c, -0.08)}" d="M86 46q14 6 28 0" stroke="${shade(c, -0.2)}" stroke-width="2" fill-opacity="0"/>`;
    case 'recogido':
      return `<ellipse fill="${c}" cx="100" cy="50" rx="50" ry="26"/><circle fill="${c}" cx="100" cy="26" r="15"/>`;
    case 'largo':
      return `<path fill="${c}" d="M44 98C36 52 68 30 100 31c34-1 66 21 56 69l8 58c-6 9-15 8-21 2l-4 6c-5-2-7-6-7-10H60c0 4-2 8-7 10l-4-6c-6 6-15 7-21-2Z"/>`;
    case 'empolvado':
      return `<g fill="${c}"><ellipse cx="100" cy="40" rx="54" ry="34"/><circle cx="46" cy="96" r="15"/><circle cx="154" cy="96" r="15"/><circle cx="50" cy="124" r="13"/><circle cx="150" cy="124" r="13"/><circle cx="52" cy="150" r="11"/><circle cx="148" cy="150" r="11"/></g>`;
    default:
      return '';
  }
}

function hairFront(L: Appearance): string {
  const c = L.hair.color;
  const hl = `<path fill="none" stroke="${shade(c, 0.22)}" stroke-width="3" stroke-linecap="round" opacity=".7"`;
  switch (L.hair.style) {
    case 'corto':
      return `<path fill="${c}" d="M50 104C44 60 70 38 100 38s58 22 50 66c-3-14-8-24-14-30-12 6-32 6-44-2-12 8-28 12-34 16-4 4-6 10-8 16Z"/>${hl} d="M76 50q14-6 30-4"/>`;
    case 'entradas':
      return `<path fill="${c}" d="M50 110c-4-26 2-46 14-54-3 14-4 30-3 52Zm100 0c4-26-2-46-14-54 3 14 4 30 3 52Z"/><path fill="${c}" opacity=".55" d="M72 52c18-9 38-9 56 0-18-4-38-4-56 0Z"/>`;
    case 'ondulado':
      return `<path fill="${c}" d="M48 102C44 60 72 39 100 39s56 21 52 63c-6-16-16-28-32-33-8 9-24 10-34 2-14 4-28 16-38 31Z"/>${hl} d="M78 52q10-5 22-4M112 50q10 2 16 8"/>`;
    case 'melena':
      return `<path fill="${c}" d="M47 106C44 60 70 39 100 39c32 0 56 22 52 66-2-18-12-34-40-42-16 10-40 20-65 43Z"/><path fill="${c}" d="M44 100h12v40H42Zm100 0h12l2 38-14 2Z"/>${hl} d="M70 60q16-12 36-14"/>`;
    case 'mono':
      return `<path fill="${c}" d="M50 106C44 64 70 40 100 40s56 24 50 66c-4-22-18-40-48-46l-2 4-2-4c-30 6-44 24-48 46Z"/>${hl} d="M74 56q10-8 22-10M126 56q-10-8-22-10"/>`;
    case 'recogido':
      return `<path fill="${c}" d="M50 106C44 72 62 46 100 46s56 26 50 60c-4-22-20-36-50-36S54 84 50 106Z"/>${hl} d="M72 58q28-14 56 0"/>`;
    case 'largo':
      return `<path fill="${c}" d="M50 106C46 62 70 42 100 42s56 20 50 64c-2-18-10-34-26-42-16 4-32 2-46-4-14 10-24 24-28 46Z"/><path fill="${c}" d="M48 100c-6 16-6 34 0 48l8-4c-4-14-4-30 0-44Zm104 0c6 16 6 34 0 48l-8-4c4-14 4-30 0-44Z"/>${hl} d="M84 54q14 4 30 2"/>`;
    case 'empolvado':
      return `<path fill="${c}" d="M50 102C46 58 72 40 100 40s54 18 50 62c-8-20-26-32-50-32S58 82 50 102Z"/>${hl} d="M64 40q16-14 36-14M110 28q20 0 32 14"/><path fill="#6f93cf" d="M92 14l8 6 8-6-2 12h-12Z"/>`;
  }
}

function turban(L: Appearance): string {
  if (!L.headwear) return '';
  const c = L.headwear.color;
  const d = shade(c, -0.14);
  return `<path fill="${shade(L.hair.color, 0)}" d="M50 112c-3-10-3-20 0-28l8 2c-2 8-2 18 0 26Zm100 0c3-10 3-20 0-28l-8 2c2 8 2 18 0 26Z"/><path fill="${c}" d="M45 98C38 48 70 22 100 22s62 26 55 76c-12-16-32-24-55-24S57 82 45 98Z"/><path fill="none" stroke="${d}" stroke-width="3" stroke-linecap="round" d="M52 70q40-30 96-6M50 86q46-34 100-10M68 40q34 6 70 30"/><circle cx="100" cy="74" r="6" fill="${L.outfit.accent}"/>`;
}

function neck(L: Appearance): string {
  return `<rect x="86" y="136" width="28" height="44" rx="10" fill="${shade(L.skin, -0.12)}"/>`;
}

function head(L: Appearance, ex: Expression): string {
  const skin = L.skin;
  const ear = shade(skin, -0.06);
  const parts = [
    `<g class="pj-cabeza">`,
    `<ellipse cx="51" cy="106" rx="9" ry="12" fill="${ear}"/><ellipse cx="149" cy="106" rx="9" ry="12" fill="${ear}"/>`,
    `<ellipse cx="52" cy="107" rx="4" ry="6" fill="${shade(skin, -0.16)}"/><ellipse cx="148" cy="107" rx="4" ry="6" fill="${shade(skin, -0.16)}"/>`,
    `<ellipse cx="100" cy="98" rx="50" ry="54" fill="${skin}"/>`,
    // Sombra suave bajo el pelo y mejillas
    `<ellipse cx="72" cy="126" rx="8" ry="5" fill="#ff6b7d" opacity=".22"/><ellipse cx="128" cy="126" rx="8" ry="5" fill="#ff6b7d" opacity=".22"/>`,
    `<ellipse cx="100" cy="118" rx="4.5" ry="3.2" fill="${shade(skin, -0.16)}"/>`,
    beard(L),
    mouth(ex, L),
    mustache(L),
    eyes(ex),
    brows(L, ex),
    L.headwear ? turban(L) : hairFront(L),
    glasses(L),
    `</g>`,
  ];
  return parts.join('');
}

function eyes(ex: Expression): string {
  if (ex === 'feliz') {
    const arc = (x: number) => `<path d="M${x - 9} 108q9-11 18 0" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;
    return `<g class="pj-ojos">${arc(80)}${arc(120)}</g>`;
  }
  const [gx, gy] = ex === 'piensa' ? [2.5, -3.5] : [0.5, 0.5];
  const r = ex === 'sorpresa' ? 5 : 6.5;
  const eye = (x: number) =>
    `<ellipse cx="${x}" cy="104" rx="9.5" ry="11.5" fill="#fff"/><circle cx="${x + gx}" cy="${105 + gy}" r="${r}" fill="${INK}"/><circle cx="${x + gx + 2.3}" cy="${102 + gy}" r="2.3" fill="#fff"/>`;
  return `<g class="pj-ojos">${eye(80)}${eye(120)}</g>`;
}

function brows(L: Appearance, ex: Expression): string {
  const up = ex === 'sorpresa' ? -7 : ex === 'feliz' ? -3 : 0;
  const left = `M70 ${88 + up}q10-5 20-1`;
  const right = ex === 'piensa' ? `M110 ${82}q10-6 20 0` : `M110 ${87 + up}q10-4 20 1`;
  return `<path class="pj-cejas" d="${left}M${right.slice(1)}" fill="none" stroke="${browColor(L)}" stroke-width="4" stroke-linecap="round"/>`;
}

function mouth(ex: Expression, L: Appearance): string {
  // La boca de hablar está siempre (oculta) para poder animarla con la clase pj-habla.
  const talk = `<g class="pj-boca-habla"><ellipse cx="100" cy="135" rx="8" ry="6" fill="${MOUTH}"/><ellipse cx="100" cy="138.5" rx="4.5" ry="2.2" fill="#ff8a94"/></g>`;
  let m: string;
  switch (ex) {
    case 'feliz':
      m = `<path d="M85 128h30q-2 18-15 18t-15-18Z" fill="${MOUTH}"/><path d="M88 128h24l-1 4H89Z" fill="#fff"/><ellipse cx="100" cy="141" rx="6" ry="3" fill="#ff8a94"/>`;
      break;
    case 'sorpresa':
      m = `<ellipse cx="100" cy="136" rx="6" ry="7.5" fill="${MOUTH}"/>`;
      break;
    case 'piensa':
      m = `<path d="M92 135q8-4 17-1" fill="none" stroke="${MOUTH}" stroke-width="3.5" stroke-linecap="round"/>`;
      break;
    default:
      m = `<path d="M88 130q12 11 24 0" fill="none" stroke="${MOUTH}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  void L;
  return `<g class="pj-boca">${m}</g>${talk}`;
}

function beard(L: Appearance): string {
  const c = L.facialHairColor ?? L.hair.color;
  if (L.facialHair === 'barba-larga')
    return `<path fill="${c}" d="M51 102c-2 34 10 56 28 64 6 24 14 38 21 38s15-14 21-38c18-8 30-30 28-64-4 22-14 36-28 40-6-4-14-6-21-6s-15 2-21 6c-14-4-24-18-28-40Z"/><path fill="none" stroke="${shade(c, 0.2)}" stroke-width="2.5" stroke-linecap="round" opacity=".6" d="M84 160q4 14 10 26M116 160q-4 14-10 26"/>`;
  if (L.facialHair === 'barba-corta')
    return `<path fill="${c}" d="M52 104c0 30 20 50 48 50s48-20 48-50c-4 20-14 32-28 36-6-4-13-5-20-5s-14 1-20 5c-14-4-24-16-28-36Z"/>`;
  return '';
}

function mustache(L: Appearance): string {
  if (L.facialHair === 'ninguno') return '';
  const c = L.facialHairColor ?? L.hair.color;
  return `<path fill="${c}" d="M82 129c6-8 14-8 18-3 4-5 12-5 18 3-6 3-12 3-18 0-6 3-12 3-18 0Z"/>`;
}

function glasses(L: Appearance): string {
  if (L.glasses === 'ninguna') return '';
  const s = `fill="#fff" fill-opacity=".18" stroke="#34303a" stroke-width="3"`;
  const lens =
    L.glasses === 'redondas'
      ? `<circle cx="80" cy="105" r="13" ${s}/><circle cx="120" cy="105" r="13" ${s}/>`
      : `<rect x="66" y="95" width="28" height="21" rx="6" ${s}/><rect x="106" y="95" width="28" height="21" rx="6" ${s}/>`;
  return `${lens}<path d="M93 104q7-5 14 0M67 102l-15-3M133 102l15-3" fill="none" stroke="#34303a" stroke-width="3" stroke-linecap="round"/>`;
}

function torso(L: Appearance): string {
  const { main, accent } = L.outfit;
  const under = L.outfit.under ?? accent;
  const edge = shade(main, luminance(main) > 0.8 ? -0.14 : -0.22);
  const base = `<path d="M26 242c0-40 24-60 60-67h28c36 7 60 27 60 67Z" fill="${main}" stroke="${edge}" stroke-width="2.5"/>`;
  let detail = '';
  switch (L.outfit.style) {
    case 'vestido':
      detail = `<path d="M86 175q-14 16 6 20l8-11 8 11q20-4 6-20Z" fill="${accent}" stroke="${shade(accent, -0.15)}" stroke-width="2"/><circle cx="100" cy="200" r="3.5" fill="${shade(main, 0.35)}"/>`;
      break;
    case 'traje':
      detail = `<path d="M87 175l13 34 13-34Z" fill="${under}"/><path d="M97 182h6l3 30-6 8-6-8Z" fill="${accent}"/><path d="M96 178h8l-1 5h-6Z" fill="${shade(accent, -0.2)}"/><path d="M86 175l14 36-18-12-6-20Zm28 0l-14 36 18-12 6-20Z" fill="${shade(main, -0.18)}"/>`;
      break;
    case 'bata':
      detail = `<path d="M88 175l12 40 12-40Z" fill="${under}"/><path d="M86 175l14 46-20-14-8-26Zm28 0l-14 46 20-14 8-26Z" fill="${shade(main, -0.06)}" stroke="${edge}" stroke-width="2"/><path d="M100 221v21" stroke="${edge}" stroke-width="2"/><rect x="52" y="214" width="22" height="16" rx="3" fill="${shade(main, -0.04)}" stroke="${edge}" stroke-width="2"/><path d="M58 208v10M65 206v12" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'jersey':
      detail = `<path d="M84 175q16 14 32 0l2 6q-18 16-36 0Z" fill="${shade(main, -0.15)}"/><path d="M88 178l12 10-10 6Zm24 0l-12 10 10 6Z" fill="${accent}"/><path d="M40 230h120" stroke="${shade(main, -0.12)}" stroke-width="3" opacity=".5"/>`;
      break;
    case 'sari':
      detail = `<path d="M86 175q14 10 28 0l2 4q-16 12-32 0Z" fill="${shade(main, -0.1)}"/><path d="M50 196c22-20 44-22 58-14 16 14 26 36 32 60h-24c-8-24-18-40-34-46-12-2-22 2-32 8Z" fill="${accent}"/><path d="M50 196c22-20 44-22 58-14 16 14 26 36 32 60" fill="none" stroke="#f2c14e" stroke-width="4"/>`;
      break;
    case 'tunica':
      detail = `<path d="M86 175l14 22 14-22" fill="none" stroke="${accent}" stroke-width="5" stroke-linejoin="round"/><path d="M100 197v45" stroke="${accent}" stroke-width="5"/><path d="M30 226q70 12 140 0v8q-70 12-140 0Z" fill="${shade(accent, -0.08)}"/>`;
      break;
    case 'casaca':
      detail = `<path d="M100 178v64" stroke="${shade(main, -0.25)}" stroke-width="2"/><g fill="#e8c35a"><circle cx="92" cy="214" r="3"/><circle cx="92" cy="228" r="3"/><circle cx="108" cy="214" r="3"/><circle cx="108" cy="228" r="3"/></g><path d="M88 174q12 4 24 0l-2 8q6 4 0 10 4 6-4 10-6 4-12 0-8-4-4-10-6-6 0-10Z" fill="${accent}" stroke="${shade(accent, -0.15)}" stroke-width="2"/>`;
      break;
  }
  return `<g class="pj-torso">${base}${detail}</g>`;
}

function sleeve(L: Appearance, d: string): string {
  const main = L.outfit.main;
  const edge = shade(main, luminance(main) > 0.8 ? -0.14 : -0.22);
  return `<path d="${d}" fill="none" stroke="${edge}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${main}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function hand(L: Appearance, x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="10.5" fill="${L.skin}" stroke="${shade(L.skin, -0.18)}" stroke-width="2"/>`;
}

/** Brazo que saluda: va detrás del cuerpo y sube con la animación. */
function waveArm(L: Appearance): string {
  return `<g class="pj-saludo">${sleeve(L, 'M58 204L44 146')}${hand(L, 42, 134)}<path d="M36 128v-6M42 125v-7M48 127v-6" stroke="${L.skin}" stroke-width="5" stroke-linecap="round"/></g>`;
}

/** Brazo que sujeta el accesorio delante del pecho. */
function holdArm(L: Appearance): string {
  return `<g class="pj-brazo">${sleeve(L, 'M152 190c14 12 8 26-14 24')}${hand(L, 134, 214)}</g>`;
}

function sparkles(): string {
  const star = (x: number, y: number, c: string, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-10L3-3 10 0 3 3 0 10-3 3-10 0-3-3Z" fill="${c}" opacity="0"/></g>`;
  return `<g class="pj-chispas" aria-hidden="true">${star(30, 50, '#ffc800', 1.2)}${star(172, 44, '#ce82ff', 1)}${star(20, 110, '#2ec4a6', 0.8)}${star(182, 104, '#ff9600', 1.1)}</g>`;
}

// --- Accesorios (centrados en 0,0; caben en ±24) ------------------------------

const GLASS = '#eef7ff';
const GLASS_EDGE = '#9fb2c6';

export function accessorySVG(kind: Accessory, color: string): string {
  const dark = shade(color, -0.25);
  const light = shade(color, 0.35);
  switch (kind) {
    case 'matraz':
      return `<path d="M-6-24h12M-5-22v12l-13 24q-3 7 5 7h26q8 0 5-7L5-10v-12" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="2.5" stroke-linejoin="round"/><path d="M-10 2h20l7 12q2 5-3 5h-28q-5 0-3-5Z" fill="${color}"/><circle cx="-3" cy="10" r="2.2" fill="#fff" opacity=".8"/><circle cx="5" cy="6" r="1.6" fill="#fff" opacity=".8"/><path d="M-2-18v8" stroke="#fff" stroke-width="2" opacity=".8"/>`;
    case 'probeta':
      return `<circle r="20" fill="${color}" opacity=".35" class="pj-brillo"/><g transform="rotate(-16)"><rect x="-7" y="-26" width="14" height="48" rx="7" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="2.5"/><path d="M-5.8 0h11.6v15a5.8 5.8 0 0 1-11.6 0Z" fill="${color}"/><rect x="-9" y="-28" width="18" height="5" rx="2.5" fill="${GLASS_EDGE}"/><path d="M-2-18v12" stroke="#fff" stroke-width="2" opacity=".9"/></g>`;
    case 'libro': {
      // Portada con una tabla periódica en miniatura.
      const cells: string[] = [];
      const cell = (c: number, r: number, f: string) => cells.push(`<rect x="${-13 + c * 3.4}" y="${-10 + r * 3.6}" width="2.8" height="3" rx=".6" fill="${f}"/>`);
      cell(0, 0, '#fff');
      cell(7, 0, '#ffc800');
      for (let r = 1; r < 5; r++) {
        cell(0, r, '#fff');
        cell(1, r, '#fff');
        if (r > 2) for (let c = 2; c < 6; c++) cell(c, r, '#ffd9e0');
        if (r > 0) for (let c = 6; c < 8; c++) cell(c, r, r === 1 && c === 6 ? '#fff' : '#bff3e8');
      }
      return `<g transform="rotate(-8)"><rect x="-18" y="-18" width="36" height="32" rx="3" fill="#fff" stroke="${dark}" stroke-width="2"/><rect x="-20" y="-20" width="36" height="32" rx="3" fill="${color}" stroke="${dark}" stroke-width="2"/><rect x="-20" y="-20" width="5" height="32" rx="2" fill="${dark}"/>${cells.join('')}</g>`;
    }
    case 'estrella':
      return `<circle r="22" fill="${color}" opacity=".22" class="pj-brillo"/><path d="M0-20l5.9 11.9 13.1 1.9-9.5 9.3 2.2 13.1L0 9.9-11.7 16.2l2.2-13.1-9.5-9.3 13.1-1.9Z" fill="${color}" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/><path d="M-3-8l2-4" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M18-18l1.5 3.5L23-13l-3.5 1.5L18-8l-1.5-3.5L13-13l3.5-1.5Z" fill="#fff"/>`;
    case 'cristal':
      return `<g transform="rotate(-10)"><path d="M-8-6l8-18 8 18v20l-8 8-8-8Z" fill="${color}"/><path d="M0-24l8 18v20l-8 8Z" fill="${dark}"/><path d="M-8-6l8-18v40l-8-2Z" fill="${light}" opacity=".6"/></g><g transform="translate(12 6) rotate(18) scale(.6)"><path d="M-8-6l8-18 8 18v20l-8 8-8-8Z" fill="${color}"/><path d="M0-24l8 18v20l-8 8Z" fill="${dark}"/></g><g transform="translate(-13 8) rotate(-30) scale(.5)"><path d="M-8-6l8-18 8 18v20l-8 8-8-8Z" fill="${light}"/><path d="M0-24l8 18v20l-8 8Z" fill="${color}"/></g>`;
    case 'atomo':
      return `<g fill="none" stroke="${color}" stroke-width="2.6"><ellipse rx="22" ry="8"/><ellipse rx="22" ry="8" transform="rotate(60)"/><ellipse rx="22" ry="8" transform="rotate(120)"/></g><circle r="6" fill="#ff4d5a"/><circle cx="-1.6" cy="-1.6" r="2" fill="#fff" opacity=".7"/><circle cx="22" r="3" fill="${dark}"/><circle cx="-11" cy="19" r="3" fill="${dark}"/><circle cx="-11" cy="-19" r="3" fill="${dark}"/>`;
    case 'led':
      return `<circle cy="-6" r="15" fill="${color}" opacity=".3" class="pj-brillo"/><path d="M-4 8v16M4 8v12" stroke="#9aa3b2" stroke-width="2.5" stroke-linecap="round"/><path d="M-10 6v-14a10 10 0 0 1 20 0v14Z" fill="${color}"/><path d="M-5-10a5 5 0 0 1 5-5" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="-12" y="4" width="24" height="5" rx="2" fill="${dark}"/>`;
    case 'hoja': {
      // Ramita de Artemisia annua: hojas finas y recortadas.
      const leaves: string[] = [];
      for (let i = 0; i < 6; i++) {
        const y = 18 - i * 7;
        const s = 1 - i * 0.1;
        leaves.push(`<ellipse cx="${-7 * s}" cy="${y - 2}" rx="${8 * s}" ry="${3 * s}" transform="rotate(${-30} ${-7 * s} ${y - 2})" fill="${i % 2 ? color : dark}"/>`);
        leaves.push(`<ellipse cx="${7 * s}" cy="${y - 5}" rx="${8 * s}" ry="${3 * s}" transform="rotate(${30} ${7 * s} ${y - 5})" fill="${i % 2 ? dark : color}"/>`);
      }
      return `<g transform="rotate(10)"><path d="M0 24q2-20 0-46" stroke="${dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>${leaves.join('')}<ellipse cy="-24" rx="3" ry="5" fill="${light}"/></g>`;
    }
    case 'flor': {
      // Vinca de Madagascar: cinco pétalos rosas y el centro más oscuro.
      const petals = [0, 72, 144, 216, 288].map((a) => `<ellipse cy="-10" rx="7" ry="10" transform="rotate(${a})" fill="${color}" stroke="${dark}" stroke-width="1.5"/>`);
      return `<path d="M0 6q4 12 0 20" stroke="#3f8f3a" stroke-width="3" fill="none"/><ellipse cx="10" cy="18" rx="9" ry="4" transform="rotate(-25 10 18)" fill="#58b04a"/><g transform="translate(0 -4)">${petals.join('')}<circle r="4.5" fill="#b0174f"/><circle r="1.6" fill="#ffe08a"/></g>`;
    }
    case 'alambique':
      return `<path d="M-4-6q0-14 10-16 10 0 10 10L24 6" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><circle cx="-4" cy="6" r="15" fill="${color}" stroke="${dark}" stroke-width="2.5"/><path d="M-14 4a10 10 0 0 1 8-9" stroke="${light}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-10-8h12l-2-6h-8Z" fill="${dark}"/><path d="M22 8q2 4 0 7" stroke="#6fc3ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-12 22q8-6 16 0" fill="#ff9600"/>`;
    case 'adn': {
      const pts: string[] = [];
      const a: string[] = [];
      const b: string[] = [];
      for (let i = 0; i <= 20; i++) {
        const y = -24 + i * 2.4;
        const x = 11 * Math.sin(i * 0.5);
        a.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
        b.push(`${i ? 'L' : 'M'}${(-x).toFixed(1)} ${y.toFixed(1)}`);
        if (i % 2 === 1) pts.push(`<path d="M${x.toFixed(1)} ${y.toFixed(1)}H${(-x).toFixed(1)}" stroke="${i % 4 === 1 ? '#ffc800' : '#2ec4a6'}" stroke-width="2.5"/>`);
      }
      return `<g transform="rotate(-14)">${pts.join('')}<path d="${a.join('')}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="${b.join('')}" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/></g>`;
    }
    case 'tierra':
      return `<circle r="24" fill="none" stroke="#9be7ff" stroke-width="3" stroke-dasharray="4 4" class="pj-brillo"/><circle r="17" fill="${color}"/><path d="M-12-7q6-6 12-3 4 5-2 8-6 0-6 6-6 2-6-5Zm14 6q8-4 12 2 0 8-7 10-5-4-5-12Zm-6-14q6-2 9 1-3 3-9-1Z" fill="#58c322"/><path d="M-12 6a12 12 0 0 0 8 8" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`;
    case 'cronometro':
      return `<rect x="-4" y="-25" width="8" height="6" rx="2" fill="${dark}"/><path d="M12-16l4-4" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><circle cy="2" r="19" fill="${color}"/><circle cy="2" r="14.5" fill="#fff"/><path d="M0-9v3M0 13v-3M-11 2h3M11 2H8" stroke="${INK}" stroke-width="2"/><path d="M0 2l6-7" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><circle cy="2" r="2" fill="${INK}"/>`;
    case 'pluma':
      return `<g transform="rotate(-6)"><rect x="-20" y="-16" width="30" height="36" rx="2" fill="#fffdf6" stroke="#cdbf9e" stroke-width="2"/><circle cx="-8" cy="-2" r="6" fill="none" stroke="#7a6a52" stroke-width="1.5"/><path d="M-8 4v8h-6M-2-2h8M-16 14h20" stroke="#7a6a52" stroke-width="1.5" fill="none"/></g><path d="M20-24C8-18 2-4 4 10l3-1C10-4 14-14 20-24Z" fill="${color}" stroke="#b6a98c" stroke-width="1.5"/><path d="M4 10l-2 8" stroke="#3b3340" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'benceno': {
      const hex = [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return [17 * Math.cos(a), 17 * Math.sin(a)];
      });
      const poly = hex.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      const dots = hex.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#4a4f5a"/>`).join('');
      return `<polygon points="${poly}" fill="${shade(color, 0.8)}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><circle r="8.5" fill="none" stroke="${dark}" stroke-width="3"/>${dots}`;
    }
    case 'fision': {
      const nuc = (cx: number, cy: number, r: number) => {
        const out: string[] = [];
        const ps: [number, number][] = [[0, 0], [-0.5, -0.4], [0.5, -0.4], [-0.5, 0.45], [0.5, 0.45], [0, -0.75], [0, 0.8]];
        ps.forEach(([x, y], i) => out.push(`<circle cx="${(cx + x * r).toFixed(1)}" cy="${(cy + y * r).toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${i % 2 ? '#ff4d5a' : '#9aa3b2'}"/>`));
        return out.join('');
      };
      return `<circle r="22" fill="${color}" opacity=".25" class="pj-brillo"/><path d="M0-14l3 8 8 2-8 3-3 9-3-9-8-3 8-2Z" fill="#ffc800"/>${nuc(-12, 2, 9)}${nuc(13, -2, 8)}<circle cx="2" cy="-20" r="2.6" fill="#9aa3b2"/><circle cx="-2" cy="20" r="2.6" fill="#9aa3b2"/><path d="M6-22l8-3M-6 22l-8 3" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    }
  }
}

/** Para listas: el personaje con su nombre listo para usar como texto alternativo. */
export function characterName(ch: Character | string): string {
  const id = typeof ch === 'string' ? ch : ch.id;
  return tx(`personaje.${id}.nombre`);
}
