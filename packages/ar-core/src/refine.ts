import type { Point2 } from './pose';

/** Imagen en escala de grises (1 byte por píxel), como la que deja el detector. */
export interface GreyImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** Medio ancho, en píxeles, de la franja donde se busca el borde a cada lado del lado aproximado. */
const SEARCH = 3;
const STEP = 0.5;

function sample(img: GreyImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= img.width || y0 + 1 >= img.height) return NaN;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * img.width + x0;
  const d = img.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + img.width] * (1 - fx) + d[i + img.width + 1] * fx) * fy;
}

interface Line {
  /** Un punto de la recta y su dirección (unitaria). */
  px: number;
  py: number;
  dx: number;
  dy: number;
}

/**
 * Ajusta la recta de un lado: busca el borde (el máximo del gradiente) en
 * perpendicular a lo largo del lado, con precisión de décimas de píxel, y
 * ajusta una recta a todos esos puntos (mínimos cuadrados totales).
 */
function fitSide(img: GreyImage, a: Point2, b: Point2): Line | null {
  const lx = b.x - a.x;
  const ly = b.y - a.y;
  const length = Math.hypot(lx, ly);
  if (length < 8) return null;
  const nx = -ly / length;
  const ny = lx / length;
  const count = Math.max(6, Math.min(40, Math.round(length / 2)));
  const steps = Math.round((2 * SEARCH) / STEP);
  const xs: number[] = [];
  const ys: number[] = [];
  const profile = new Array<number>(steps + 1);
  for (let k = 0; k < count; k++) {
    // Sin los extremos: cerca de las esquinas el borde se dobla.
    const f = 0.15 + (0.7 * k) / (count - 1);
    const cx = a.x + lx * f;
    const cy = a.y + ly * f;
    let ok = true;
    for (let s = 0; s <= steps; s++) {
      const o = -SEARCH + s * STEP;
      profile[s] = sample(img, cx + nx * o, cy + ny * o);
      if (Number.isNaN(profile[s])) ok = false;
    }
    if (!ok) continue;
    let best = -1;
    let bestG = 0;
    for (let s = 1; s < steps; s++) {
      const g = Math.abs(profile[s + 1] - profile[s - 1]);
      if (g > bestG) [best, bestG] = [s, g];
    }
    if (best < 2 || best > steps - 2 || bestG < 20) continue;
    // Parábola por los 3 gradientes alrededor del máximo: posición subpíxel.
    const g0 = Math.abs(profile[best] - profile[best - 2]);
    const g2 = Math.abs(profile[best + 2] - profile[best]);
    const den = g0 - 2 * bestG + g2;
    const shift = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (g0 - g2)) / den)) : 0;
    const o = -SEARCH + (best + shift) * STEP;
    xs.push(cx + nx * o);
    ys.push(cy + ny * o);
  }
  if (xs.length < 4) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { px: mx, py: my, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function intersect(l1: Line, l2: Line): Point2 | null {
  const den = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(den) < 1e-6) return null;
  const s = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / den;
  return { x: l1.px + l1.dx * s, y: l1.py + l1.dy * s };
}

/**
 * Afina las 4 esquinas de un marcador a décimas de píxel.
 *
 * El detector da las esquinas en píxeles enteros (vértices del contorno), y
 * un píxel de error en un marcador de 60 px son grados de giro: eso es el
 * temblor. Aquí cada lado se ajusta como una recta a lo largo de todo el borde
 * y las esquinas salen de cruzar las rectas, como hace OpenCV (ArUco con
 * `CORNER_REFINE_SUBPIX`/`CONTOUR`) o AprilTag. Si algo no cuadra, devuelve
 * las esquinas de partida.
 */
export function refineCorners(img: GreyImage, corners: readonly Point2[]): Point2[] {
  const lines = corners.map((c, i) => fitSide(img, c, corners[(i + 1) % 4]));
  const out: Point2[] = [];
  for (let i = 0; i < 4; i++) {
    const before = lines[(i + 3) % 4];
    const after = lines[i];
    const p = before && after ? intersect(before, after) : null;
    const c = corners[i];
    out.push(p && Math.hypot(p.x - c.x, p.y - c.y) < 2.5 ? p : { x: c.x, y: c.y });
  }
  return out;
}
