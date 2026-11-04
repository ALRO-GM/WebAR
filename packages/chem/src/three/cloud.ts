import * as THREE from 'three';
import { L_LETTERS, effectiveCharge, orbitalOccupancy, type Subshell } from '../configuration';
import { orbitalPeakRadius, sampleOrbital } from '../orbitals';
import { seededRandom } from '../random';

/** Color de cada tipo de orbital: s, p, d, f. */
export const ORBITAL_COLORS = [0x58a6ff, 0xff9f43, 0x2ee6a6, 0xd38bff];

export interface CloudOptions {
  /** Puntos de la nube en todo el átomo (rendimiento en móviles). */
  maxPoints?: number;
  /** Fracción de puntos que se vuelven a sortear cada segundo (el «parpadeo»). */
  refreshRate?: number;
}

/**
 * Modelo cuántico: cada orbital ocupado es una nube de puntos donde es
 * probable encontrar a su electrón, con su forma real (s, p, d, f) y la fase
 * de cada lóbulo en un tono distinto.
 *
 * Los electrones no giran: la nube no cambia, pero cada «medida» lo encuentra
 * en un sitio distinto. Por eso los puntos se renuevan sin parar y cada
 * electrón (la chispa blanca) salta de un punto probable a otro.
 */
export class ElectronCloud {
  readonly object = new THREE.Group();
  /** Escala aplicada a las nubes (metros por pm). */
  readonly metersPerPm: number;

  private readonly points: THREE.Points;
  private readonly pool: Float32Array; // muestras de reserva, por orbital
  private readonly poolStart: Int32Array; // primera muestra de reserva del orbital de cada punto
  private readonly poolSize: Int32Array;
  private readonly pointSign: Int8Array; // fase (+1/-1) de cada punto visible
  private readonly pointType: Uint8Array; // l del orbital de cada punto
  private readonly palette: Array<[THREE.Color, THREE.Color]>; // [positivo, negativo] por l
  private readonly sparks: THREE.InstancedMesh;
  private readonly sparkOrbital: Int32Array;
  private readonly sparkFrom: Float32Array;
  private readonly sparkTo: Float32Array;
  private readonly sparkClock: Float32Array;
  private readonly orbitals: Array<{ start: number; size: number }> = [];
  private readonly refreshRate: number;
  private readonly matrix = new THREE.Matrix4();
  private refreshDebt = 0;

  constructor(z: number, subshells: Subshell[], atomRadius: number, options: CloudOptions = {}) {
    const maxPoints = options.maxPoints ?? 9000;
    this.refreshRate = options.refreshRate ?? 0.6;
    const random = seededRandom(z);

    // Tamaño: el orbital más externo tiene su máximo en el radio del átomo.
    const zeffs = subshells.map((s) => effectiveCharge(z, subshells, s));
    const outer = subshells.reduce((best, s, i) => (orbitalPeakRadius(s.n, s.l, zeffs[i]) > orbitalPeakRadius(subshells[best].n, subshells[best].l, zeffs[best]) ? i : best), 0);
    const outerPeak = orbitalPeakRadius(subshells[outer].n, subshells[outer].l, zeffs[outer]);
    const scale = atomRadius / outerPeak; // metros por pm
    this.metersPerPm = scale;

    // Reparto de puntos: por electrón, pero más a los orbitales grandes (los
    // internos ocupan muy poco y con muchos puntos serían una mancha blanca).
    const density = subshells.map((sub, i) =>
      Math.min(1.6, Math.max(0.2, Math.sqrt(orbitalPeakRadius(sub.n, sub.l, zeffs[i]) / outerPeak))),
    );
    const weight = subshells.reduce((sum, sub, i) => sum + sub.electrons * density[i], 0);
    const perUnit = Math.min(1100, maxPoints / weight);
    const positions: number[] = [];
    const colors: number[] = [];
    const pool: number[] = [];
    const poolStart: number[] = [];
    const poolSize: number[] = [];
    const pointSign: number[] = [];
    const pointType: number[] = [];
    const sparkOrbital: number[] = [];
    this.palette = ORBITAL_COLORS.map((c) => {
      const positive = new THREE.Color(c);
      return [positive, positive.clone().lerp(new THREE.Color(0x1b1f4a), 0.5)];
    });

    subshells.forEach((sub, si) => {
      orbitalOccupancy(sub).forEach((occupancy, m) => {
        if (!occupancy) return;
        const visible = Math.max(40, Math.ceil(perUnit * occupancy * density[si]));
        const reserve = visible * 3;
        const samples = sampleOrbital({ n: sub.n, l: sub.l, m, zeff: zeffs[si] }, visible + reserve, random);
        const orbital = this.orbitals.length;
        this.orbitals.push({ start: pool.length / 4, size: reserve });
        for (let i = 0; i < visible + reserve; i++) {
          const x = samples.positions[i * 3] * scale;
          const y = samples.positions[i * 3 + 1] * scale;
          const zz = samples.positions[i * 3 + 2] * scale;
          if (i < visible) {
            positions.push(x, y, zz);
            const color = this.palette[sub.l][samples.signs[i] > 0 ? 0 : 1];
            colors.push(color.r, color.g, color.b);
            pointSign.push(samples.signs[i]);
            pointType.push(sub.l);
            poolStart.push(this.orbitals[orbital].start);
            poolSize.push(reserve);
          } else {
            pool.push(x, y, zz, samples.signs[i]);
          }
        }
        for (let e = 0; e < occupancy; e++) sparkOrbital.push(orbital);
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.userData.subshells = subshells.map((s) => `${s.n}${L_LETTERS[s.l]}`);
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: Math.max(atomRadius * 0.03, 0.0008),
        map: dotTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.name = 'nube';
    this.object.add(this.points);
    this.pool = Float32Array.from(pool);
    this.poolStart = Int32Array.from(poolStart);
    this.poolSize = Int32Array.from(poolSize);
    this.pointSign = Int8Array.from(pointSign);
    this.pointType = Uint8Array.from(pointType);

    // Una chispa por electrón.
    const sparkGeometry = new THREE.SphereGeometry(Math.max(atomRadius * 0.014, 0.0007), 10, 8);
    this.sparks = new THREE.InstancedMesh(
      sparkGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
      sparkOrbital.length,
    );
    this.sparks.name = 'electrones';
    this.object.add(this.sparks);
    this.sparkOrbital = Int32Array.from(sparkOrbital);
    this.sparkFrom = new Float32Array(sparkOrbital.length * 3);
    this.sparkTo = new Float32Array(sparkOrbital.length * 3);
    this.sparkClock = Float32Array.from(sparkOrbital, () => Math.random());
    for (let i = 0; i < sparkOrbital.length; i++) this.jump(i, true);
    this.update(0);
  }

  update(dt: number): void {
    // 1. Parpadeo: una parte de los puntos se cambia por otras posiciones probables.
    const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const color = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.refreshDebt += position.count * this.refreshRate * dt;
    const swaps = Math.floor(this.refreshDebt);
    this.refreshDebt -= swaps;
    for (let s = 0; s < swaps; s++) {
      const i = Math.floor(Math.random() * position.count);
      const j = this.poolStart[i] + Math.floor(Math.random() * this.poolSize[i]);
      const [ox, oy, oz, os] = [position.getX(i), position.getY(i), position.getZ(i), this.pointSign[i]];
      const sign = this.pool[j * 4 + 3];
      position.setXYZ(i, this.pool[j * 4], this.pool[j * 4 + 1], this.pool[j * 4 + 2]);
      this.pool.set([ox, oy, oz, os], j * 4);
      if (sign !== os) {
        this.pointSign[i] = sign;
        const c = this.palette[this.pointType[i]][sign > 0 ? 0 : 1];
        color.setXYZ(i, c.r, c.g, c.b);
      }
    }
    if (swaps) {
      position.needsUpdate = true;
      color.needsUpdate = true;
    }

    // 2. Chispas: cada electrón salta a otra posición probable de su orbital.
    for (let i = 0; i < this.sparkOrbital.length; i++) {
      this.sparkClock[i] += dt * 7;
      if (this.sparkClock[i] >= 1) this.jump(i, false);
      const k = Math.min(this.sparkClock[i] * 3, 1); // salto rápido y quieto un rato
      const e = k * k * (3 - 2 * k);
      this.matrix.makeTranslation(
        this.sparkFrom[i * 3] + (this.sparkTo[i * 3] - this.sparkFrom[i * 3]) * e,
        this.sparkFrom[i * 3 + 1] + (this.sparkTo[i * 3 + 1] - this.sparkFrom[i * 3 + 1]) * e,
        this.sparkFrom[i * 3 + 2] + (this.sparkTo[i * 3 + 2] - this.sparkFrom[i * 3 + 2]) * e,
      );
      this.sparks.setMatrixAt(i, this.matrix);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
    this.object.rotation.y += dt * 0.12;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.Material).dispose();
  }

  private jump(i: number, immediate: boolean): void {
    const { start, size } = this.orbitals[this.sparkOrbital[i]];
    const j = start + Math.floor(Math.random() * size);
    for (let c = 0; c < 3; c++) {
      this.sparkFrom[i * 3 + c] = immediate ? this.pool[j * 4 + c] : this.sparkTo[i * 3 + c];
      this.sparkTo[i * 3 + c] = this.pool[j * 4 + c];
    }
    this.sparkClock[i] = immediate ? Math.random() : 0;
  }
}

let cachedDot: THREE.Texture | undefined;
function dotTexture(): THREE.Texture {
  if (cachedDot) return cachedDot;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return (cachedDot = new THREE.CanvasTexture(canvas));
}
