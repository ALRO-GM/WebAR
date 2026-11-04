import { seededRandom } from './random';

/** Posiciones de protones y neutrones en el núcleo, en radios de nucleón. */
export interface NucleusLayout {
  /** x, y, z por nucleón. */
  positions: Float32Array;
  /** 1 si el nucleón i es un protón. */
  isProton: Uint8Array;
  /** Radio del núcleo, en radios de nucleón. */
  radius: number;
}

/**
 * Un núcleo como gota compacta: los nucleones se apilan como naranjas (red
 * cúbica centrada en las caras, la más densa) y se toman los más cercanos al
 * centro, así que el radio crece como A^(1/3), igual que en los núcleos reales
 * (r ≈ 1,2 fm · A^(1/3)). Protones y neutrones van mezclados al azar, con
 * semilla fija para que el mismo isótopo salga siempre igual.
 */
export function nucleusLayout(protons: number, neutrons: number, spacing = 1.85): NucleusLayout {
  const total = protons + neutrons;
  const random = seededRandom(protons * 1000 + neutrons);
  const reach = Math.ceil(Math.cbrt(total)) + 2;
  const points: Array<{ p: [number, number, number]; d: number }> = [];
  const unit = spacing / Math.SQRT2; // vecinos a distancia `spacing`
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++)
      for (let k = -reach; k <= reach; k++) {
        if ((i + j + k) % 2 !== 0) continue;
        const p: [number, number, number] = [i * unit, j * unit, k * unit];
        // Un poco de azar para deshacer empates y que no salga un cubo perfecto.
        points.push({ p, d: Math.hypot(...p) + random() * 0.01 });
      }
  points.sort((a, b) => a.d - b.d);
  const chosen = points.slice(0, total);

  const center = [0, 0, 0];
  for (const { p } of chosen) for (let c = 0; c < 3; c++) center[c] += p[c] / total;

  const positions = new Float32Array(total * 3);
  let radius = 0;
  chosen.forEach(({ p }, i) => {
    for (let c = 0; c < 3; c++) positions[i * 3 + c] = p[c] - center[c];
    radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) + 1);
  });

  // Barajado con semilla: los primeros `protons` son protones.
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const isProton = new Uint8Array(total);
  for (let i = 0; i < protons; i++) isProton[order[i]] = 1;

  return { positions, isProton, radius };
}
