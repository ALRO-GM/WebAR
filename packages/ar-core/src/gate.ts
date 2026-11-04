import type { Point2 } from './pose';

export interface Detection {
  id: number;
  corners: Point2[];
  /** Bits leídos distintos del código: 0 = lectura perfecta. */
  hammingDistance: number;
}

export interface IdentityGateOptions {
  /** Fotogramas seguidos (casi) en el mismo sitio para dar por buena una tarjeta nueva. */
  confirmFrames?: number;
  /** Milisegundos máximos entre esos fotogramas. */
  confirmWindow?: number;
  /** Milisegundos que una tarjeta ya conocida reserva su sitio aunque no se vea. */
  hold?: number;
}

/** Qué se decidió con cada lectura del último fotograma (para el modo diagnóstico). */
export type DetectionStatus = 'aceptada' | 'pendiente' | 'solapada' | 'repetida' | 'ocupado';

interface Pending {
  count: number;
  last: number;
  center: Point2;
}

function center(c: readonly Point2[]): Point2 {
  return { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4 };
}

function side(c: readonly Point2[]): number {
  return (Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) + Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)) / 2;
}

function area(c: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += c[i].x * c[(i + 1) % 4].y - c[(i + 1) % 4].x * c[i].y;
  return Math.abs(sum) / 2;
}

/** ¿Está `p` dentro del cuadrilátero, agrandado un `margin` (fracción) desde su centro? */
function inside(p: Point2, quad: readonly Point2[], margin = 0.25): boolean {
  const m = center(quad);
  const q = quad.map((c) => ({ x: m.x + (c.x - m.x) * (1 + margin), y: m.y + (c.y - m.y) * (1 + margin) }));
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * Decide qué detecciones de un fotograma son tarjetas de verdad y con qué
 * identidad, como el «tracking by detection» de los sistemas reales:
 *
 * - **una tarjeta nueva se confirma** viéndola varios fotogramas seguidos en
 *   el mismo sitio (un reflejo o un trozo de dibujo que por casualidad
 *   parece un código no aguanta tres fotogramas);
 * - **la identidad se mantiene**: donde hay una tarjeta conocida (vista hace
 *   poco) no puede aparecer otra distinta, aunque un fotograma borroso la lea
 *   con otro número; la tarjeta sigue siendo el átomo que era;
 * - si en un mismo fotograma dos lecturas se solapan, gana la más fiable
 *   (menos bits erróneos y, a igualdad, la más grande).
 */
export class IdentityGate {
  private readonly pending = new Map<number, Pending>();
  private readonly known = new Map<number, { corners: Point2[]; lastSeen: number }>();
  private readonly confirmFrames: number;
  private readonly confirmWindow: number;
  private readonly hold: number;
  /** Las lecturas del último fotograma y qué se hizo con cada una. */
  last: Array<{ detection: Detection; status: DetectionStatus }> = [];

  constructor(options: IdentityGateOptions = {}) {
    this.confirmFrames = options.confirmFrames ?? 3;
    this.confirmWindow = options.confirmWindow ?? 500;
    this.hold = options.hold ?? 1000;
  }

  filter<T extends Detection>(detections: readonly T[], time: number): T[] {
    const ordered = [...detections].sort((a, b) => a.hammingDistance - b.hammingDistance || area(b.corners) - area(a.corners));
    const kept: T[] = [];
    this.last = [];
    for (const d of ordered) {
      const c = center(d.corners);
      // Solapada con otra lectura mejor de este mismo fotograma (el mismo marcador leído dos veces).
      if (kept.some((k) => inside(c, k.corners) || inside(center(k.corners), d.corners))) {
        this.last.push({ detection: d, status: 'solapada' });
        continue;
      }
      // El mismo número en dos sitios: dos tarjetas iguales (solo cuenta la primera).
      if (kept.some((k) => k.id === d.id)) {
        this.last.push({ detection: d, status: 'repetida' });
        continue;
      }
      // En el sitio de una tarjeta conocida con otro número (y que no se ve en otra parte).
      const usurps = [...this.known].some(
        ([id, k]) => id !== d.id && time - k.lastSeen < this.hold && inside(c, k.corners) && !detections.some((o) => o.id === id),
      );
      if (usurps) {
        this.last.push({ detection: d, status: 'ocupado' });
        continue;
      }
      kept.push(d);
    }

    const accepted: T[] = [];
    for (const d of kept) {
      const c = center(d.corners);
      const known = this.known.get(d.id);
      if (!known || time - known.lastSeen >= this.hold) {
        const p = this.pending.get(d.id);
        const near = p && time - p.last <= this.confirmWindow && Math.hypot(p.center.x - c.x, p.center.y - c.y) < side(d.corners);
        const count = near ? p.count + 1 : 1;
        this.pending.set(d.id, { count, last: time, center: c });
        if (count < this.confirmFrames) {
          this.last.push({ detection: d, status: 'pendiente' });
          continue;
        }
        this.pending.delete(d.id);
      }
      this.last.push({ detection: d, status: 'aceptada' });
      this.known.set(d.id, { corners: d.corners.map((p) => ({ ...p })), lastSeen: time });
      accepted.push(d);
    }
    for (const [id, p] of this.pending) if (time - p.last > this.confirmWindow) this.pending.delete(id);
    for (const [id, k] of this.known) if (time - k.lastSeen > this.hold * 4) this.known.delete(id);
    return accepted;
  }

  reset(): void {
    this.pending.clear();
    this.known.clear();
  }
}
