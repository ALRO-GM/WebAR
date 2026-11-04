import { getElement } from '@webar/chem';
import { t } from '../i18n';
import { STRUCTURES, buildLattice, latticeIce, unitCellEdges, type StructureId, type Vec3 } from './lattices';

// Ilustraciones en SVG (ligeras, nítidas a cualquier tamaño y sin WebGL): las
// de los cristales se dibujan a partir de la misma geometría que el 3D.

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** Proyección isométrica suave: gira 30° alrededor de la vertical e inclina 20°. */
function project(p: Vec3, yaw = 0.55, tilt = 0.38): { x: number; y: number; depth: number } {
  const [x, y, z] = p;
  const x1 = x * Math.cos(yaw) - y * Math.sin(yaw);
  const y1 = x * Math.sin(yaw) + y * Math.cos(yaw);
  return { x: x1, y: -(z * Math.cos(tilt) - y1 * Math.sin(tilt)), depth: y1 * Math.cos(tilt) + z * Math.sin(tilt) };
}

/** Dibujo de una celda (o del bloque 2×2 en las planas) con sus átomos como bolas brillantes. */
export function crystalSVG(id: StructureId, label?: string): string {
  const def = STRUCTURES[id];
  const n = def.flat ? 3 : def.id === 'grafito' || def.id === 'hielo' ? 2 : 1;
  const lattice = buildLattice(def, n);
  const atoms: Array<{ el: string; p: Vec3; r: number }> = lattice.atoms.map((a) => ({
    el: a.el,
    p: a.p,
    r: def.water ? 0.45 : Math.max(0.3, lattice.radii[a.el] * (def.bond === 'covalente' ? 0.45 : 0.62)),
  }));
  const bonds: Array<[Vec3, Vec3]> = [];
  if (def.water) {
    const ice = latticeIce(lattice, n);
    ice.hydrogens.forEach((pair, i) =>
      pair.forEach((p) => {
        atoms.push({ el: 'H', p, r: 0.27 });
        bonds.push([lattice.atoms[i].p, p]);
      }),
    );
  } else if (def.bond === 'covalente' || def.bond === 'ionico') for (const [i, j] of lattice.bonds) bonds.push([lattice.atoms[i].p, lattice.atoms[j].p]);

  const yaw = def.flat ? 0.3 : 0.55;
  // El hielo, casi desde arriba: así se ven sus anillos hexagonales.
  const tilt = def.flat ? 0.9 : def.water ? 1.2 : 0.38;
  const pts = atoms.map((a) => ({ ...a, ...project(a.p, yaw, tilt) }));
  const xs = pts.flatMap((p) => [p.x - p.r, p.x + p.r]);
  const ys = pts.flatMap((p) => [p.y - p.r, p.y + p.r]);
  const pad = 0.4;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const f = (v: number) => v.toFixed(2);
  const id0 = `c${uid++}`;
  const colors = [...new Set(atoms.map((a) => a.el))];
  const gradients = colors
    .map(
      (el, k) =>
        `<radialGradient id="${id0}g${k}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.25" stop-color="${getElement(el).color}"/><stop offset="1" stop-color="${shade(getElement(el).color, -0.45)}"/></radialGradient>`,
    )
    .join('');
  const edges = unitCellEdges(lattice)
    .map(([a, b]) => {
      const p = project(a, yaw, tilt);
      const q = project(b, yaw, tilt);
      return `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"/>`;
    })
    .join('');
  const sticks = bonds
    .map(([a, b]) => {
      const p = project(a, yaw, tilt);
      const q = project(b, yaw, tilt);
      return `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}"/>`;
    })
    .join('');
  const balls = pts
    .sort((a, b) => a.depth - b.depth)
    .map((p) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" fill="url(#${id0}g${colors.indexOf(p.el)})"/>`)
    .join('');
  const aria = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg xmlns="${NS}" viewBox="${vb.map(f).join(' ')}" ${aria} class="mat-svg"><defs>${gradients}</defs><g stroke="#ffc800" stroke-width="${f(vb[2] / 90)}" stroke-linecap="round" opacity="0.9">${edges}</g><g stroke="#b9bfcc" stroke-width="${f(vb[2] / 60)}" stroke-linecap="round">${sticks}</g>${balls}</svg>`;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.max(0, Math.min(255, v + v * amount))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// --- Moléculas de agua y dibujos del apartado «Otras formas» ----------------------------

/** Una molécula de agua 2D: O en (x, y), los H abajo a ±52,25° (o girada `angle`). */
function water(x: number, y: number, s = 1, angle = 0, id = 'w'): string {
  const half = (104.5 / 2) * (Math.PI / 180);
  const hs = [-1, 1].map((sign) => {
    const a = Math.PI / 2 + sign * half + angle;
    return [x + Math.cos(a) * 14 * s, y + Math.sin(a) * 14 * s];
  });
  return `<g>${hs.map(([hx, hy]) => `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(7 * s).toFixed(1)}" fill="url(#${id}H)"/>`).join('')}<circle cx="${x}" cy="${y}" r="${(11 * s).toFixed(1)}" fill="url(#${id}O)"/></g>`;
}

const waterDefs = (id: string) =>
  `<defs><radialGradient id="${id}O" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffb3b3"/><stop offset="0.35" stop-color="#ff3b3b"/><stop offset="1" stop-color="#b30000"/></radialGradient><radialGradient id="${id}H" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c9ced8"/></radialGradient></defs>`;

const svg = (vb: string, alt: string, body: string) => `<svg xmlns="${NS}" viewBox="${vb}" role="img" aria-label="${alt.replace(/"/g, '&quot;')}" class="mat-svg">${body}</svg>`;

/** Hielo → gota → vapor, para la tarjeta destacada. */
export function waterStatesSVG(): string {
  const id = `w${uid++}`;
  const ice = [0, 1, 2].flatMap((i) => [0, 1].map((j) => water(38 + i * 26, 50 + j * 30, 0.62, 0, id))).join('');
  const drop = [
    [158, 58, 0.5],
    [182, 66, -0.8],
    [166, 84, 2.2],
    [190, 90, 1.2],
  ]
    .map(([x, y, a]) => water(x, y, 0.62, a, id))
    .join('');
  const gas = [
    [252, 34, 1],
    [292, 60, -1.4],
    [262, 104, 2.6],
    [306, 116, 0.4],
  ]
    .map(([x, y, a]) => water(x, y, 0.62, a, id))
    .join('');
  return `<svg xmlns="${NS}" viewBox="0 0 340 140" aria-hidden="true" class="mat-svg">${waterDefs(id)}
  <rect x="16" y="26" width="104" height="88" rx="16" fill="#dff4ff" stroke="#9fdcff" stroke-width="3"/>${ice}
  <path d="M132 70 h10" stroke="#ff9600" stroke-width="5" stroke-linecap="round"/><path d="M140 62 l8 8 -8 8" fill="none" stroke="#ff9600" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="174" cy="74" r="36" fill="#5fc0ff" fill-opacity="0.35" stroke="#5fc0ff" stroke-width="3"/>${drop}
  <path d="M220 70 h10" stroke="#ff4b4b" stroke-width="5" stroke-linecap="round"/><path d="M228 62 l8 8 -8 8" fill="none" stroke="#ff4b4b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="242" y="16" width="86" height="116" rx="10" fill="none" stroke="#cfd0d8" stroke-width="2" stroke-dasharray="5 5"/>${gas}
  <g stroke="#ff4b4b" stroke-width="2.5" stroke-linecap="round" opacity="0.7"><path d="M266 34 h10"/><path d="M276 102 l8 -6"/><path d="M290 76 v10"/></g></svg>`;
}

/** Cristal ordenado frente a vidrio desordenado. */
export function amorphousSVG(): string {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const ordered: string[] = [];
  const random: string[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const big = (i + j) % 2 === 0;
      ordered.push(`<circle cx="${22 + i * 22 + (j % 2) * 0}" cy="${34 + j * 20}" r="${big ? 8 : 5}" fill="${big ? '#ff6b6b' : '#ffc800'}"/>`);
      random.push(`<circle cx="${(178 + i * 22 + (rnd() - 0.5) * 16).toFixed(1)}" cy="${(34 + j * 20 + (rnd() - 0.5) * 14).toFixed(1)}" r="${big ? 8 : 5}" fill="${big ? '#ff6b6b' : '#ffc800'}"/>`);
    }
  return svg(
    '0 0 300 140',
    t('materia.o.amorfo.alt'),
    `<rect x="6" y="18" width="128" height="114" rx="14" fill="#f7f7f9" stroke="#e5e5ea" stroke-width="2"/><rect x="162" y="18" width="128" height="114" rx="14" fill="#f7f7f9" stroke="#e5e5ea" stroke-width="2"/>${ordered.join('')}${random.join('')}<text x="70" y="13" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.cristal')}</text><text x="226" y="13" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.vidrio')}</text>`,
  );
}

/** CO₂ en un cristal molecular (hielo seco). */
export function molecularSVG(): string {
  const co2 = (x: number, y: number, a: number) => {
    const dx = Math.cos(a) * 15;
    const dy = Math.sin(a) * 15;
    return `<g><line x1="${(x - dx).toFixed(1)}" y1="${(y - dy).toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y + dy).toFixed(1)}" stroke="#b9bfcc" stroke-width="4"/><circle cx="${(x - dx).toFixed(1)}" cy="${(y - dy).toFixed(1)}" r="8" fill="#ff3b3b"/><circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="8" fill="#ff3b3b"/><circle cx="${x}" cy="${y}" r="8" fill="#6b6b6b"/></g>`;
  };
  const items: string[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) items.push(co2(46 + i * 68, 32 + j * 40, (i + j) % 2 ? 0.6 : -0.6));
  return svg('0 0 300 140', t('materia.o.molecular.alt'), `<g stroke="#7fd0ff" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"><path d="M70 32 H112"/><path d="M138 72 H180"/><path d="M206 112 H248"/><path d="M46 52 V92"/><path d="M250 52 V92"/></g>${items.join('')}`);
}

/** El agua como molécula polar: ángulo de 104,5° y cargas parciales. */
export function polarSVG(): string {
  const id = `w${uid++}`;
  const half = (104.5 / 2) * (Math.PI / 180);
  const L = 62;
  const hx = (s: number) => 150 + s * Math.sin(half) * L;
  const hy = 52 + Math.cos(half) * L;
  return svg(
    '0 0 300 150',
    t('materia.o.polar.alt'),
    `${waterDefs(id)}<path d="M150 52 L${hx(-1).toFixed(1)} ${hy.toFixed(1)} M150 52 L${hx(1).toFixed(1)} ${hy.toFixed(1)}" stroke="#b9bfcc" stroke-width="9" stroke-linecap="round"/>
    <path d="M${(150 - Math.sin(half) * 30).toFixed(1)} ${(52 + Math.cos(half) * 30).toFixed(1)} A30 30 0 0 0 ${(150 + Math.sin(half) * 30).toFixed(1)} ${(52 + Math.cos(half) * 30).toFixed(1)}" fill="none" stroke="#ffc800" stroke-width="3"/>
    <circle cx="${hx(-1).toFixed(1)}" cy="${hy.toFixed(1)}" r="17" fill="url(#${id}H)"/><circle cx="${hx(1).toFixed(1)}" cy="${hy.toFixed(1)}" r="17" fill="url(#${id}H)"/><circle cx="150" cy="52" r="28" fill="url(#${id}O)"/>
    <text x="150" y="58" text-anchor="middle" class="mat-svg-txt" fill="#fff">O</text><text x="${hx(-1).toFixed(1)}" y="${(hy + 6).toFixed(1)}" text-anchor="middle" class="mat-svg-txt">H</text><text x="${hx(1).toFixed(1)}" y="${(hy + 6).toFixed(1)}" text-anchor="middle" class="mat-svg-txt">H</text>
    <text x="196" y="30" class="mat-svg-txt mat-menos">δ−</text><text x="${(hx(-1) - 48).toFixed(1)}" y="${(hy + 6).toFixed(1)}" class="mat-svg-txt mat-mas">δ+</text><text x="${(hx(1) + 24).toFixed(1)}" y="${(hy + 6).toFixed(1)}" class="mat-svg-txt mat-mas">δ+</text>
    <text x="150" y="${(52 + 30 + 22).toFixed(1)}" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.angulo')}</text>`,
  );
}

/** Puentes de hidrógeno entre tres moléculas de agua. */
export function hbondSVG(): string {
  const id = `w${uid++}`;
  // La del centro da sus dos H a las de los lados (que apuntan su O hacia ella).
  const half = (104.5 / 2) * (Math.PI / 180);
  const hpos = (s: number) => [150 + s * Math.sin(half) * 21, 40 + Math.cos(half) * 21];
  const [l, r] = [hpos(-1), hpos(1)];
  return svg(
    '0 0 300 150',
    t('materia.o.puentes.alt'),
    `${waterDefs(id)}<g stroke="#1cb0f6" stroke-width="3.5" stroke-dasharray="1 7" stroke-linecap="round"><path d="M${l[0].toFixed(1)} ${l[1].toFixed(1)} L72 106"/><path d="M${r[0].toFixed(1)} ${r[1].toFixed(1)} L228 106"/></g>
    ${water(150, 40, 1.5, 0, id)}${water(70, 108, 1.5, Math.PI * 0.82, id)}${water(230, 108, 1.5, -Math.PI * 0.82, id)}
    <text x="150" y="132" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.puente')}</text>`,
  );
}

/** Hielo con huecos frente a agua líquida más junta. */
export function floatsSVG(): string {
  const id = `w${uid++}`;
  const ring: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ring.push(water(72 + Math.cos(a) * 36, 74 + Math.sin(a) * 36, 0.75, a + Math.PI / 2, id));
  }
  let seed = 5;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const liquid: string[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) liquid.push(water(186 + i * 24 + (rnd() - 0.5) * 8, 40 + j * 24 + (rnd() - 0.5) * 8, 0.75, rnd() * 6.3, id));
  return svg(
    '0 0 300 150',
    t('materia.o.flota.alt'),
    `${waterDefs(id)}<rect x="8" y="20" width="128" height="114" rx="14" fill="#dff4ff"/><rect x="164" y="20" width="128" height="114" rx="14" fill="#cdeaff"/>${ring.join('')}${liquid.join('')}<text x="72" y="148" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.hielo')}</text><text x="228" y="148" text-anchor="middle" class="mat-svg-txt">${t('materia.o.svg.agua')}</text>`,
  );
}
