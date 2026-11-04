import * as THREE from 'three';
import { Emitter, type ARAnchor } from '@webar/ar-core';
import { assignProducts, findOutcome, isMolecule, type AtomModel, type Content, type Outcome } from '@webar/chem';
import type { Effects } from '../effects';
import { CardVisual } from './card-visual';
import type { CardSpec } from './deck';
import { clusterCards } from './clusters';

/** Tarjetas a menos de esto (centro a centro, metros) cuentan como juntas. */
export const JOIN_DISTANCE = 0.1;
/** Segundos juntas para que reaccionen; también lo que hay que mantener «Descomponer». */
export const HOLD_SECONDS = 3;

export interface CardGameEvents {
  /** Han reaccionado unas tarjetas. */
  reaction: { outcome: Outcome; cards: number[]; products: Content[] };
  /** Una tarjeta ha vuelto a su elemento. */
  decompose: { cardId: number; from: Content; to: Content };
  /** La carga más avanzada (para el HUD), o null si no hay ninguna. */
  charging: { outcome: Outcome; progress: number } | null;
}

interface CardState {
  spec: CardSpec;
  visual: CardVisual;
  /** Ya ha reaccionado y sigue junto a las otras: no repetir hasta separarla. */
  cooldown: boolean;
}

interface Charge {
  outcome: Outcome;
  cards: number[];
  t: number;
  seen: boolean;
}

/**
 * Las reglas del juego de tarjetas: si unas tarjetas juntas pueden reaccionar,
 * se cargan durante 3 s (vibran, brillan y se acercan) y reaccionan: la
 * sustancia nueva aparece en la tarjeta del elemento más pesado, con un
 * destello y fuego o hielo según el calor; las demás quedan libres.
 */
export class CardGame extends Emitter<CardGameEvents> {
  private readonly cards = new Map<number, CardState>();
  private readonly charges = new Map<string, Charge>();
  private hold: { cardId: number; progress: number } | null = null;
  private model: AtomModel;
  private lastCharging = '';
  private contentScale = 1;
  /** Tarjeta elegida a mano como objetivo de «Descomponer» (si tiene molécula). */
  preferred?: number;
  /** El objetivo de «Descomponer» en el último frame. */
  currentTarget: CardVisual | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly effects: Effects,
    model: AtomModel,
  ) {
    super();
    this.model = model;
  }

  addCard(spec: CardSpec, anchor: ARAnchor): CardVisual {
    this.removeCard(spec.id);
    const visual = new CardVisual(this.scene, anchor, spec, this.model);
    visual.setScale(this.contentScale, false);
    this.cards.set(spec.id, { spec, visual, cooldown: false });
    return visual;
  }

  removeCard(id: number): void {
    this.cards.get(id)?.visual.dispose();
    this.cards.delete(id);
  }

  clear(): void {
    for (const id of [...this.cards.keys()]) this.removeCard(id);
    this.charges.clear();
    this.hold = null;
  }

  get visibleCount(): number {
    return [...this.cards.values()].filter((c) => c.visual.anchor.tracking).length;
  }

  visuals(): CardVisual[] {
    return [...this.cards.values()].map((c) => c.visual);
  }

  /** Tamaño de los átomos y moléculas de todas las tarjetas (1× a 3×). */
  setContentScale(scale: number): void {
    this.contentScale = scale;
    for (const c of this.cards.values()) c.visual.setScale(scale);
  }

  setModel(model: AtomModel): void {
    this.model = model;
    for (const c of this.cards.values()) c.visual.setModel(model);
  }

  /** La tarjeta con molécula más cerca del centro de la pantalla (o la preferida, si vale). */
  target(camera: THREE.Camera, preferred?: number): CardVisual | null {
    const visible = [...this.cards.values()].filter((c) => c.visual.anchor.tracking && isMolecule(c.visual.content));
    const chosen = visible.find((c) => c.spec.id === preferred);
    if (chosen) return chosen.visual;
    let best: CardVisual | null = null;
    let bestDistance = Infinity;
    const p = new THREE.Vector3();
    for (const { visual } of visible) {
      visual.contentPosition(p).project(camera);
      const d = Math.hypot(p.x, p.y);
      if (p.z < 1 && d < bestDistance) [best, bestDistance] = [visual, d];
    }
    return best;
  }

  /** Progreso (0-1) del botón «Descomponer» sobre una tarjeta; null al soltar. */
  setHold(cardId: number | null, progress = 0): void {
    this.hold = cardId === null ? null : { cardId, progress };
    if (this.hold && progress >= 1) {
      this.decompose(this.hold.cardId);
      this.hold = null;
    }
  }

  /** Devuelve la tarjeta a su elemento, liberando la energía de sus enlaces. */
  decompose(cardId: number): void {
    const card = this.cards.get(cardId);
    if (!card || !isMolecule(card.visual.content)) return;
    const from = card.visual.content;
    this.effects.energy(card.visual.contentPosition(), Math.max(card.visual.radius * 1.5, 0.03));
    card.visual.setContent(card.spec.symbol);
    card.cooldown = true;
    this.emit('decompose', { cardId, from, to: card.spec.symbol });
  }

  update(dt: number, camera: THREE.Camera): void {
    const present = [...this.cards.values()].filter((c) => c.visual.anchor.tracking);
    const positions = present.map((c) => c.visual.cardPosition());
    const clusters = clusterCards(positions, JOIN_DISTANCE);

    for (const c of this.charges.values()) c.seen = false;
    for (const c of this.cards.values()) {
      c.visual.charge = 0;
      c.visual.approach.set(0, 0, 0);
      c.visual.targeted = false;
    }

    for (const cluster of clusters) {
      const members = cluster.map((i) => present[i]);
      if (members.length < 2) {
        members[0].cooldown = false; // separada: vuelve a poder reaccionar
        continue;
      }
      if (members.some((m) => m.cooldown)) continue;
      const outcome = findOutcome(members.map((m) => m.visual.content));
      if (!outcome) continue;
      const key = members.map((m) => m.spec.id).sort((a, b) => a - b).join(',') + '|' + outcome.reaction.id;
      const charge = this.charges.get(key) ?? { outcome, cards: members.map((m) => m.spec.id), t: 0, seen: true };
      charge.seen = true;
      charge.t += dt;
      this.charges.set(key, charge);

      const progress = Math.min(charge.t / HOLD_SECONDS, 1);
      const centroid = cluster.reduce((sum, i) => sum.add(positions[i]), new THREE.Vector3()).divideScalar(cluster.length);
      cluster.forEach((i) => {
        const v = present[i].visual;
        v.charge = progress;
        v.approach.subVectors(centroid, positions[i]).multiplyScalar(0.3 * progress * progress);
      });
      if (charge.t >= HOLD_SECONDS) {
        this.charges.delete(key);
        this.react(members, outcome, centroid);
      }
    }
    for (const [key, c] of this.charges) if (!c.seen) this.charges.delete(key);

    // Descomponer: se marca el objetivo; tiembla y brilla mientras se mantiene el botón.
    this.currentTarget = this.target(camera, this.preferred);
    if (this.currentTarget) this.currentTarget.targeted = true;
    if (this.hold) {
      const v = this.cards.get(this.hold.cardId)?.visual;
      if (v) {
        v.charge = this.hold.progress;
        v.targeted = true;
      }
    }

    const charging = [...this.charges.values()].sort((a, b) => b.t - a.t)[0];
    const signature = charging ? `${charging.outcome.equation}:${Math.floor(charging.t * 10)}` : '';
    if (signature !== this.lastCharging) {
      this.lastCharging = signature;
      this.emit('charging', charging ? { outcome: charging.outcome, progress: Math.min(charging.t / HOLD_SECONDS, 1) } : null);
    }

    for (const c of this.cards.values()) c.visual.update(dt);
    this.effects.update(dt, camera);
  }

  private react(members: CardState[], outcome: Outcome, centroid: THREE.Vector3): void {
    const assignment = assignProducts(members.map((m) => m.spec.symbol), outcome.reaction);
    this.effects.flash(centroid, 0.05);
    const products: Content[] = [];
    members.forEach((m, i) => {
      const next = assignment[i] ?? m.spec.symbol;
      m.cooldown = true;
      if (next !== m.visual.content) m.visual.setContent(next);
      if (assignment[i]) {
        products.push(assignment[i]!);
        const size = Math.max(m.visual.radius * 1.4, 0.03);
        const at = m.visual.cardPosition().add(new THREE.Vector3(0, size * 0.7, 0).applyQuaternion(m.visual.cardQuaternion()));
        if (outcome.deltaH <= -5) this.effects.fire(at, size, m.visual.cardQuaternion());
        else if (outcome.deltaH >= 5) this.effects.ice(at, size, m.visual.cardQuaternion());
      }
    });
    this.emit('reaction', { outcome, cards: members.map((m) => m.spec.id), products });
  }
}
