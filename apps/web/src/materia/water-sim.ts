import * as THREE from 'three';
import { HOH_ANGLE, OH_LENGTH, iceChunk, type IceMolecules } from './lattices';

/**
 * Simulación (muy) simplificada del agua para ver los cambios de estado.
 * Unidades: Å y segundos «de mirar» (no picosegundos: todo va a cámara lenta).
 *
 * - Sólido: cada molécula en su sitio de la red del hielo, vibrando más cuanto
 *   más calor (amplitud según la temperatura).
 * - Fusión (≥ 0 °C): `melt` va de 0 a 1; las moléculas se sueltan de la red y
 *   pasan a moverse como líquido dentro de una gota (movimiento browniano:
 *   fricción + empujones al azar con velocidad ∝ √T absoluta, repulsión entre
 *   moléculas y la gota que las contiene).
 * - Evaporación: las más rápidas de la superficie escapan; la cantidad de vapor
 *   «en equilibrio» crece con la temperatura (como la presión de vapor) y a
 *   100 °C hierve: escapan de todas partes hasta que no queda líquido.
 * - Gas: vuelan en línea recta, chocan entre sí (choques elásticos) y con las
 *   paredes de una caja grande.
 * - Al enfriar, al revés: el vapor sobrante se pega a la gota (condensación) y
 *   bajo 0 °C, con todo líquido, cada molécula vuelve a su sitio (solidificación).
 */

export type WaterPhase = 'solido' | 'fusion' | 'liquido' | 'ebullicion' | 'gas' | 'condensacion' | 'solidificacion';

export const T_MIN = -30;
export const T_MAX = 150;
/** Moléculas por Å³ del agua líquida (1 g/cm³). */
const LIQUID_DENSITY = 0.0334;
/** Mitad del lado de la caja del gas (Å). */
export const BOX = 21;
/** Distancia mínima entre dos O (Å): más cerca se empujan. */
const CONTACT = 2.75;

const BODY_H: [THREE.Vector3, THREE.Vector3] = (() => {
  const half = THREE.MathUtils.degToRad(HOH_ANGLE / 2);
  return [
    new THREE.Vector3(Math.sin(half), -Math.cos(half), 0).multiplyScalar(OH_LENGTH),
    new THREE.Vector3(-Math.sin(half), -Math.cos(half), 0).multiplyScalar(OH_LENGTH),
  ];
})();

/** Generador pseudoaleatorio con semilla (las capturas y los tests salen iguales). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export interface Molecule {
  /** Posición del O (Å) y velocidad (Å/s). */
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  gas: boolean;
  /** Sitio en la red del hielo y orientación en él. */
  site: THREE.Vector3;
  siteQ: THREE.Quaternion;
  /** Fases aleatorias de su vibración. */
  phase: [number, number, number, number];
}

export class WaterSim {
  readonly ice: IceMolecules;
  readonly molecules: Molecule[];
  /** Temperatura (°C). */
  temperature: number;
  /** 0 = hielo, 1 = todo suelto (líquido o gas). */
  melt: number;
  /** Radio de la gota llena (Å). */
  readonly fullRadius: number;
  /** Mitad del lado del cubo de hielo (Å). */
  readonly iceHalf: number;
  time = 0;
  private escapeBudget = 0;
  private readonly random: () => number;

  constructor(temperature = -10, seed = 7) {
    this.random = rng(seed);
    this.ice = iceChunk(12);
    const n = this.ice.oxygens.length;
    this.fullRadius = Math.cbrt((3 * n) / (4 * Math.PI * LIQUID_DENSITY));
    this.iceHalf = Math.max(...this.ice.oxygens.flatMap((o) => o.map(Math.abs))) + 1.4;
    this.molecules = this.ice.oxygens.map((o, i) => {
      const site = new THREE.Vector3(o[0], o[2], -o[1]); // z de la red → arriba
      const [h1, h2] = this.ice.hydrogens[i].map((hp) => new THREE.Vector3(hp[0], hp[2], -hp[1]).sub(site));
      return {
        p: site.clone(),
        v: new THREE.Vector3(),
        q: new THREE.Quaternion(),
        w: new THREE.Vector3(),
        gas: false,
        site,
        siteQ: orientation(h1, h2),
        phase: [0, 1, 2, 3].map(() => this.random() * Math.PI * 2) as [number, number, number, number],
      };
    });
    for (const m of this.molecules) m.q.copy(m.siteQ);
    this.temperature = temperature;
    this.melt = temperature >= 0 ? 1 : 0;
    if (temperature >= 100) for (const m of this.molecules) this.makeGas(m, true);
    else if (temperature >= 0) for (let i = 0; i < Math.round(this.vaporTarget()); i++) this.makeGas(this.molecules[i * 7 % n], true);
  }

  get count(): number {
    return this.molecules.length;
  }
  get gasCount(): number {
    return this.molecules.filter((m) => m.gas).length;
  }
  get liquidCount(): number {
    return this.count - this.gasCount;
  }
  /** Radio actual de la gota (Å): su volumen es proporcional a las moléculas que quedan. */
  get dropRadius(): number {
    return this.fullRadius * Math.cbrt(this.liquidCount / this.count);
  }

  /** Moléculas que «quiere» haber en el vapor a esta temperatura (crece como la presión de vapor). */
  vaporTarget(): number {
    const T = this.temperature;
    if (T < 0) return 0;
    if (T >= 100) return this.count;
    return this.count * 0.3 * (T / 100) ** 3;
  }

  /** Velocidad típica (Å/s) en el líquido y en el gas: ∝ √(temperatura absoluta). */
  speed(gas: boolean): number {
    const kelvin = Math.max(this.temperature + 273.15, 150);
    return (gas ? 11 : 2.6) * Math.sqrt(kelvin / 373);
  }

  phase(): WaterPhase {
    const gas = this.gasCount;
    if (this.melt <= 0) return 'solido';
    if (this.melt < 1 || (this.temperature < 0 && gas === 0)) return this.temperature >= 0 ? 'fusion' : 'solidificacion';
    if (gas === this.count) return this.temperature >= 100 ? 'gas' : 'condensacion';
    if (this.temperature >= 100) return 'ebullicion';
    if (gas > this.vaporTarget() + 1.5) return 'condensacion';
    return 'liquido';
  }

  /** Amplitud de la vibración en el hielo (Å): crece al acercarse a 0 °C. */
  vibration(): number {
    const u = THREE.MathUtils.clamp((this.temperature - T_MIN) / -T_MIN, 0, 1);
    return 0.05 + 0.2 * u * u;
  }

  step(dt: number): void {
    this.time += dt;
    const T = this.temperature;
    const n = this.count;

    // Fusión y solidificación (la solidificación espera a que no quede gas).
    if (T >= 0 && this.melt < 1) this.melt = Math.min(1, this.melt + dt / 2.5);
    else if (T < 0 && this.melt > 0 && this.gasCount === 0) this.melt = Math.max(0, this.melt - dt / 2.5);
    if (this.melt <= 0) {
      this.vibrate();
      return;
    }

    // Evaporación y ebullición: sale una molécula de vez en cuando.
    const target = this.vaporTarget();
    const deficit = target - this.gasCount;
    this.escapeBudget += T >= 100 ? (4 + (T - 100) * 0.08) * dt : deficit > 0 ? deficit * 0.8 * dt : 0;
    if (this.escapeBudget >= 1 && this.melt >= 1) {
      this.escapeBudget -= 1;
      this.escape(T >= 100);
    }
    if (this.escapeBudget > 1) this.escapeBudget = 1;
    const condensing = this.gasCount > target + 0.5;
    // Sin gota y con vapor de sobra: la molécula más cercana al centro hace de semilla.
    if (condensing && this.liquidCount === 0) {
      let best = this.molecules[0];
      for (const m of this.molecules) if (m.p.lengthSq() < best.p.lengthSq()) best = m;
      best.gas = false;
      best.v.multiplyScalar(0.1);
    }

    const R = this.dropRadius;
    const liquidSpeed = this.speed(false);
    const gasSpeed = this.speed(true);
    const friction = 2.2;
    const kick = liquidSpeed * Math.sqrt(2 * friction);
    const tmp = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const a = this.molecules[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.molecules[j];
        tmp.subVectors(a.p, b.p);
        const d = tmp.length();
        if (d >= CONTACT || d === 0) continue;
        tmp.divideScalar(d);
        if (a.gas || b.gas) {
          // Choque elástico entre masas iguales: se intercambian la velocidad a lo largo del choque.
          const rel = tmp.dot(new THREE.Vector3().subVectors(a.v, b.v));
          if (rel < 0) {
            a.v.addScaledVector(tmp, -rel);
            b.v.addScaledVector(tmp, rel);
          }
        } else {
          const push = (CONTACT - d) * 18 * dt;
          a.v.addScaledVector(tmp, push);
          b.v.addScaledVector(tmp, -push);
        }
      }
    }

    for (const m of this.molecules) {
      if (m.gas) {
        // Si sobra vapor (al enfriar), una ligera atracción hacia la gota acelera la condensación.
        if (condensing) {
          const toward = tmp.copy(m.p).normalize().multiplyScalar(-m.v.length());
          m.v.lerp(toward, Math.min(1, dt * (T < 0 ? 0.9 : 0.4)));
        }
        // Mantiene la rapidez del gas acorde con la temperatura (termostato suave).
        const s = m.v.length() || 1;
        m.v.multiplyScalar(1 + (gasSpeed / s - 1) * Math.min(1, dt * 1.5));
        m.p.addScaledVector(m.v, dt);
        for (const axis of ['x', 'y', 'z'] as const)
          if (Math.abs(m.p[axis]) > BOX) {
            m.p[axis] = Math.sign(m.p[axis]) * BOX;
            m.v[axis] *= -1;
          }
        // Choca con la gota: se queda (condensa) si sobra vapor; si no, rebota.
        const d = m.p.length();
        if (this.liquidCount > 0 && d < R + 1.8 && m.p.dot(m.v) < 0) {
          if (condensing) {
            m.gas = false;
            m.v.multiplyScalar(liquidSpeed / (m.v.length() || 1));
          } else m.v.reflect(tmp.copy(m.p).normalize());
        }
        this.tumble(m, dt, 3);
        continue;
      }
      // Líquido: fricción + empujones al azar (browniano) y la gota lo contiene.
      m.v.multiplyScalar(1 - friction * dt);
      m.v.x += (this.random() - 0.5) * 2 * kick * Math.sqrt(dt * 3);
      m.v.y += (this.random() - 0.5) * 2 * kick * Math.sqrt(dt * 3);
      m.v.z += (this.random() - 0.5) * 2 * kick * Math.sqrt(dt * 3);
      const d = m.p.length();
      const limit = Math.max(R - 1.1, 0.5);
      if (d > limit) m.v.addScaledVector(m.p, (-(d - limit) * 14 * dt) / d);
      // Mientras se funde, aún tira un poco de su sitio en la red.
      if (this.melt < 1) {
        tmp.subVectors(m.site, m.p).multiplyScalar((1 - this.melt) * 6 * dt);
        m.v.add(tmp);
      }
      m.p.addScaledVector(m.v, dt);
      this.tumble(m, dt, 0.9 * this.melt);
    }

    // Solidificando: cada una vuelve a su sitio y a su orientación.
    if (T < 0 && this.melt < 1) {
      const pull = (1 - this.melt) ** 2;
      for (const m of this.molecules) {
        m.p.lerp(m.site, Math.min(1, pull * dt * 6));
        m.q.slerp(m.siteQ, Math.min(1, pull * dt * 6));
      }
    }
  }

  /** Vibración en el hielo: cada molécula oscila alrededor de su sitio. */
  private vibrate(): void {
    const A = this.vibration();
    const t = this.time * (6 + this.temperature * 0.05);
    for (const m of this.molecules) {
      const [a, b, c, d] = m.phase;
      m.p.set(m.site.x + A * Math.sin(t + a), m.site.y + A * Math.sin(t * 1.13 + b), m.site.z + A * Math.sin(t * 0.91 + c));
      m.q.copy(m.siteQ);
      m.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(A * 0.6 * Math.sin(t * 1.3 + d), A * 0.6 * Math.sin(t * 0.8 + a), 0)));
      m.v.set(0, 0, 0);
      m.gas = false;
    }
  }

  /** Giro al azar (las moléculas del líquido y del gas rotan). */
  private tumble(m: Molecule, dt: number, amount: number): void {
    m.w.multiplyScalar(1 - 2 * dt);
    m.w.x += (this.random() - 0.5) * amount * 8 * dt;
    m.w.y += (this.random() - 0.5) * amount * 8 * dt;
    m.w.z += (this.random() - 0.5) * amount * 8 * dt;
    const angle = m.w.length() * dt;
    if (angle > 0) m.q.premultiply(new THREE.Quaternion().setFromAxisAngle(m.w.clone().normalize(), angle));
  }

  /** Una molécula se va al gas: de la superficie la más rápida, o cualquiera si hierve. */
  private escape(boiling: boolean): void {
    const liquid = this.molecules.filter((m) => !m.gas);
    if (!liquid.length) return;
    const R = this.dropRadius;
    let pick: Molecule | undefined;
    if (boiling) pick = liquid[Math.floor(this.random() * liquid.length)];
    else {
      const surface = liquid.filter((m) => m.p.length() > R - 2.2);
      pick = (surface.length ? surface : liquid).reduce((x, y) => (y.v.lengthSq() > x.v.lengthSq() ? y : x));
    }
    this.makeGas(pick);
  }

  private makeGas(m: Molecule, scatter = false): void {
    m.gas = true;
    const out = m.p.lengthSq() > 0.01 ? m.p.clone().normalize() : new THREE.Vector3(this.random() - 0.5, 1, this.random() - 0.5).normalize();
    if (scatter) m.p.set((this.random() * 2 - 1) * BOX * 0.9, (this.random() * 2 - 1) * BOX * 0.9, (this.random() * 2 - 1) * BOX * 0.9);
    m.v.copy(out).multiplyScalar(this.speed(true));
    m.v.x += (this.random() - 0.5) * 4;
    m.v.y += (this.random() - 0.5) * 4;
    m.v.z += (this.random() - 0.5) * 4;
  }

  /** Posiciones de los dos H de la molécula `i` (Å). */
  hydrogens(i: number, out: [THREE.Vector3, THREE.Vector3]): [THREE.Vector3, THREE.Vector3] {
    const m = this.molecules[i];
    out[0].copy(BODY_H[0]).applyQuaternion(m.q).add(m.p);
    out[1].copy(BODY_H[1]).applyQuaternion(m.q).add(m.p);
    return out;
  }

  /**
   * Puentes de hidrógeno de este momento: [molécula, H (0|1), molécula aceptora].
   * Criterio geométrico habitual: O···O < 3,3 Å y H···O < 2,4 Å. Solo entre
   * moléculas del sólido o del líquido.
   */
  hydrogenBonds(): Array<[number, 0 | 1, number]> {
    const out: Array<[number, 0 | 1, number]> = [];
    const hs: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < this.count; i++) {
      const a = this.molecules[i];
      if (a.gas) continue;
      this.hydrogens(i, hs);
      for (let j = 0; j < this.count; j++) {
        if (i === j) continue;
        const b = this.molecules[j];
        if (b.gas || a.p.distanceToSquared(b.p) > 3.3 * 3.3) continue;
        for (const k of [0, 1] as const) if (hs[k].distanceToSquared(b.p) < 2.4 * 2.4) out.push([i, k, j]);
      }
    }
    return out;
  }
}

/** Cuaternión que lleva la molécula de referencia (H abajo, en el plano xy) a tener sus H en `h1`, `h2` (relativos al O). */
function orientation(h1: THREE.Vector3, h2: THREE.Vector3): THREE.Quaternion {
  const basis = (a: THREE.Vector3, b: THREE.Vector3) => {
    const bis = a.clone().add(b).normalize();
    const side = a.clone().sub(b).normalize();
    const normal = new THREE.Vector3().crossVectors(side, bis).normalize();
    return new THREE.Matrix4().makeBasis(side, bis, normal);
  };
  const from = basis(BODY_H[0], BODY_H[1]);
  const to = basis(h1, h2);
  return new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}
