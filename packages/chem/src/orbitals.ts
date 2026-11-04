/**
 * Nubes de probabilidad: dónde es probable encontrar un electrón de un orbital.
 *
 * Cada orbital se aproxima por el del hidrógeno (ψ = R_nl(r) · Y_lm) con la
 * carga efectiva de Slater, y se sortean puntos con probabilidad |ψ|². Las
 * formas (esferas s, lóbulos p, tréboles d, flores f) y los nodos son los
 * reales; los tamaños, una aproximación.
 */

/** Radio de Bohr, en picómetros. */
export const BOHR_RADIUS_PM = 52.9;

export interface OrbitalSpec {
  n: number;
  l: number;
  /** Cuál de los 2l+1 orbitales del subnivel (0 … 2l). */
  m: number;
  /** Carga efectiva (Slater). */
  zeff: number;
}

export interface OrbitalSamples {
  /** x, y, z en picómetros. */
  positions: Float32Array;
  /** Signo de ψ en cada punto (+1/-1): la «fase» de cada lóbulo. */
  signs: Int8Array;
}

type Harmonic = (x: number, y: number, z: number) => number;

/** Armónicos esféricos reales (sin normalizar: solo importa la forma). */
const HARMONICS: Harmonic[][] = [
  [() => 1],
  [(x) => x, (_, y) => y, (_, __, z) => z],
  [
    (x, y) => x * y,
    (_, y, z) => y * z,
    (x, _, z) => x * z,
    (x, y) => x * x - y * y,
    (x, y, z) => 2 * z * z - x * x - y * y,
  ],
  [
    (x, y, z) => z * (2 * z * z - 3 * x * x - 3 * y * y),
    (x, y, z) => x * (4 * z * z - x * x - y * y),
    (x, y, z) => y * (4 * z * z - x * x - y * y),
    (x, y, z) => z * (x * x - y * y),
    (x, y, z) => x * y * z,
    (x, y) => x * (x * x - 3 * y * y),
    (x, y) => y * (3 * x * x - y * y),
  ],
];

const maxCache = new Map<Harmonic, number>();

/** Máximo de Y² sobre la esfera (para el muestreo por rechazo). */
function harmonicMax(h: Harmonic): number {
  let max = maxCache.get(h);
  if (max !== undefined) return max;
  max = 0;
  const count = 4000;
  for (let i = 0; i < count; i++) {
    // Puntos repartidos por igual en la esfera (espiral de Fibonacci).
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    max = Math.max(max, h(r * Math.cos(phi), y, r * Math.sin(phi)) ** 2);
  }
  max *= 1.05;
  maxCache.set(h, max);
  return max;
}

/** Polinomio de Laguerre generalizado L_k^α(x). */
function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let prev = 1;
  let curr = 1 + alpha - x;
  for (let i = 1; i < k; i++) [prev, curr] = [curr, ((2 * i + 1 + alpha - x) * curr - (i + alpha) * prev) / (i + 1)];
  return curr;
}

/** Tabla de la parte radial: CDF de r²R², para sortear radios. */
interface RadialTable {
  r: Float64Array; // pm
  cdf: Float64Array;
  /** Radio más probable, en pm. */
  peak: number;
}

const STEPS = 1024;

export function radialTable(n: number, l: number, zeff: number): RadialTable {
  const scale = (n * BOHR_RADIUS_PM) / (2 * zeff); // r = ρ · scale
  const rhoMax = 6 * n + 12;
  const r = new Float64Array(STEPS);
  const cdf = new Float64Array(STEPS);
  let total = 0;
  let peak = 0;
  let peakValue = -1;
  for (let i = 0; i < STEPS; i++) {
    const rho = (i / (STEPS - 1)) * rhoMax;
    const radial = rho ** l * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
    const p = rho * rho * radial * radial;
    r[i] = rho * scale;
    total += p;
    cdf[i] = total;
    if (p > peakValue) [peakValue, peak] = [p, r[i]];
  }
  for (let i = 0; i < STEPS; i++) cdf[i] /= total;
  return { r, cdf, peak };
}

/** Radio más probable del orbital, en pm. */
export function orbitalPeakRadius(n: number, l: number, zeff: number): number {
  return radialTable(n, l, zeff).peak;
}

export function sampleOrbital(spec: OrbitalSpec, count: number, random: () => number = Math.random): OrbitalSamples {
  const table = radialTable(spec.n, spec.l, spec.zeff);
  const harmonic = HARMONICS[spec.l][spec.m];
  const max = harmonicMax(harmonic);
  const radialNodes = spec.n - spec.l - 1;
  const scale = (spec.n * BOHR_RADIUS_PM) / (2 * spec.zeff);

  const positions = new Float32Array(count * 3);
  const signs = new Int8Array(count);
  for (let i = 0; i < count; i++) {
    // Radio: inversa de la CDF (búsqueda binaria + interpolación).
    const u = random();
    let lo = 0;
    let hi = STEPS - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table.cdf[mid] < u) lo = mid;
      else hi = mid;
    }
    const span = table.cdf[hi] - table.cdf[lo] || 1;
    const r = table.r[lo] + ((u - table.cdf[lo]) / span) * (table.r[hi] - table.r[lo]);

    // Dirección: uniforme y aceptada con probabilidad Y² / máx.
    let x = 0, y = 0, z = 0, value = 0;
    do {
      z = 2 * random() - 1;
      const phi = 2 * Math.PI * random();
      const s = Math.sqrt(1 - z * z);
      x = s * Math.cos(phi);
      y = s * Math.sin(phi);
      value = harmonic(x, y, z);
    } while (random() * max > value * value);

    positions[i * 3] = x * r;
    positions[i * 3 + 1] = y * r;
    positions[i * 3 + 2] = z * r;
    const radialSign = radialNodes ? Math.sign(laguerre(radialNodes, 2 * spec.l + 1, r / scale)) : 1;
    signs[i] = radialSign * Math.sign(value) >= 0 ? 1 : -1;
  }
  return { positions, signs };
}
