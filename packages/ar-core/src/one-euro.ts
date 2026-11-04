import * as THREE from 'three';

/**
 * Filtro «1 €» (Casiez, Roussel y Vogel, CHI 2012), el estándar para quitar el
 * temblor de un seguimiento sin añadir retraso al moverse: lo usan MindAR,
 * MediaPipe y muchos visores de RA/RV.
 *
 * Es un paso bajo cuya frecuencia de corte sube con la velocidad: quieto,
 * corta mucho (adiós temblor); rápido, deja pasar casi todo (sin arrastre).
 */
export interface OneEuroOptions {
  /** Corte en reposo, en Hz: más bajo = menos temblor, más «flotante». */
  minCutoff: number;
  /** Cuánto sube el corte por unidad de velocidad: más alto = menos retraso al moverse. */
  beta: number;
  /** Corte del filtro de la velocidad, en Hz. */
  dCutoff?: number;
}

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

/** Filtra una posición (o cualquier vector 3D). */
export class OneEuroVector {
  private readonly value = new THREE.Vector3();
  private readonly speed = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private started = false;

  constructor(private readonly options: OneEuroOptions) {}

  reset(to: THREE.Vector3): void {
    this.value.copy(to);
    this.speed.set(0, 0, 0);
    this.started = true;
  }

  /** `dt` en segundos. Devuelve el valor filtrado (el mismo objeto cada vez). */
  filter(x: THREE.Vector3, dt: number): THREE.Vector3 {
    if (!this.started || dt <= 0) {
      if (!this.started) this.reset(x);
      return this.value;
    }
    this.delta.subVectors(x, this.value).divideScalar(dt);
    this.speed.lerp(this.delta, alpha(this.options.dCutoff ?? 1, dt));
    const cutoff = this.options.minCutoff + this.options.beta * this.speed.length();
    return this.value.lerp(x, alpha(cutoff, dt));
  }
}

/** Filtra una orientación: la velocidad es la angular (rad/s) y se mezcla con slerp. */
export class OneEuroQuaternion {
  private readonly value = new THREE.Quaternion();
  private speed = 0;
  private started = false;

  constructor(private readonly options: OneEuroOptions) {}

  reset(to: THREE.Quaternion): void {
    this.value.copy(to);
    this.speed = 0;
    this.started = true;
  }

  filter(q: THREE.Quaternion, dt: number): THREE.Quaternion {
    if (!this.started || dt <= 0) {
      if (!this.started) this.reset(q);
      return this.value;
    }
    const rate = this.value.angleTo(q) / dt;
    this.speed += (rate - this.speed) * alpha(this.options.dCutoff ?? 1, dt);
    const cutoff = this.options.minCutoff + this.options.beta * this.speed;
    return this.value.slerp(q, alpha(cutoff, dt));
  }
}
