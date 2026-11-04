import * as THREE from 'three';
import type { ARAnchor } from '@webar/ar-core';
import { AtomView, MoleculeView, getElement, getSpecies, type AtomModel, type Content } from '@webar/chem';
import { glowTexture, ringTexture } from '../effects';
import { calm } from '../settings';
import { cardFaceTexture } from './card-face';
import { CARD, type CardSpec } from './deck';
import { CARD_SHADOW, cardShadowTexture, roundShadowTexture } from './table-scene';

/**
 * Tamaños sobre una tarjeta de 6,3 cm. A escala real el H mediría 6 mm y sus
 * partículas serían motas invisibles; aquí el radio se comprime (H ≈ 13 mm,
 * Cs ≈ 35 mm): los grandes siguen siendo más grandes, pero todos se ven.
 */
// Más grandes que al principio (se veían pequeños sobre la tarjeta): H ≈ 1,9 cm de radio.
const atomRadius = (pm: number) => 0.012 + pm * 0.00013;
const METERS_PER_ANGSTROM = 0.015;
/** Cuánto tarda el contenido en alcanzar la tarjeta al moverla (más = más «flotante»). */
const FOLLOW = 7;

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
/** Límites del tamaño del contenido (control «Tamaño» del HUD y pellizco en la cámara). */
export const MIN_CONTENT_SCALE = 1;
export const MAX_CONTENT_SCALE = 3;
/** Altura de la cara sobre el papel; al arrastrarla sube un poco más. */
const FACE_Y = 0.0006;
const LIFT = 0.012;

/**
 * Lo que se ve de una tarjeta: su cara virtual (pegada al papel) y, encima, el
 * átomo o la molécula que tiene, que la sigue con suavidad.
 */
export class CardVisual {
  readonly face: THREE.Mesh;
  /** Pose suavizada que persigue a la tarjeta (en la escena, no en el ancla). */
  readonly holder = new THREE.Group();
  /** Temblor y acercamiento, encima de la pose suavizada. */
  private readonly shake = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly ring: THREE.Sprite;
  /** Sombra del contenido sobre la tarjeta (de contacto, falsa: barata). */
  private readonly contactShadow: THREE.Mesh;
  /** Sombra de la tarjeta sobre la mesa (solo en la mesa virtual). */
  private cardShadow?: THREE.Mesh;
  private view?: AtomView | MoleculeView;
  /** Objeto extra al lado del contenido (`setExtra`). */
  private readonly extraHolder = new THREE.Group();
  private extra: { object: THREE.Object3D; wrapper: THREE.Group; radius: number; pop: number } | null = null;
  private scale = 1;
  private targetScale = 1;
  private liftNow = 0;
  private _content: Content;
  private pop = 1;
  private presence = 0;
  private placed = false;
  private time = Math.random() * 10;

  /** 0-1: carga de una reacción o de una descomposición (vibra y brilla). */
  charge = 0;
  /** Desplazamiento (en la escena) hacia las otras tarjetas mientras se carga. */
  readonly approach = new THREE.Vector3();
  /** Marcada como objetivo del botón «Descomponer». */
  targeted = false;
  /** Elegida en la mesa para juntarle otra (anillo amarillo). */
  selected = false;
  /** Cogida con el dedo en la mesa: se levanta un poco y su sombra se abre. */
  lifted = false;

  private readonly target = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };

  constructor(
    scene: THREE.Scene,
    readonly anchor: ARAnchor,
    readonly spec: CardSpec,
    private model: AtomModel,
  ) {
    this._content = spec.symbol;
    this.face = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD.width, CARD.height).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 }),
    );
    this.face.position.y = FACE_Y;
    this.face.userData.cardId = spec.id;
    anchor.object.add(this.face);

    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: roundShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.contactShadow.position.y = FACE_Y + 0.0003;
    anchor.object.add(this.contactShadow);
    this.shake.add(this.extraHolder);

    const additive = (map: THREE.Texture, color: number) =>
      new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.halo = new THREE.Sprite(additive(glowTexture(), 0xfff0b3));
    this.ring = new THREE.Sprite(additive(ringTexture(), 0x7fe3ff));
    this.shake.add(this.halo, this.ring);
    this.holder.add(this.shake);
    scene.add(this.holder);
    this.setContent(spec.symbol, false);
  }

  get content(): Content {
    return this._content;
  }

  /** Se está viendo (o acaba de dejar de verse): si no, no hace falta animarla. */
  get isVisible(): boolean {
    return this.holder.visible;
  }

  /** Radio del contenido tal como se ve (con su tamaño 1×-3×), en metros. */
  get radius(): number {
    return (this.view?.radius ?? 0.01) * this.scale;
  }

  setContent(content: Content, animate = true): void {
    this._content = content;
    this.view?.dispose();
    const species = getSpecies(content);
    this.view = species
      ? new MoleculeView(species, { metersPerAngstrom: METERS_PER_ANGSTROM })
      : this.atomView(content);
    this.shake.add(this.view.object);
    this.pop = animate ? 0 : 1;
    this.setExtra(null);

    const material = this.face.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = cardFaceTexture(content, this.spec);
    material.needsUpdate = true;
  }

  /** Tamaño del átomo o la molécula (1× a 3×), para verlos mejor. Se anima. */
  setScale(scale: number, animate = true): void {
    this.targetScale = THREE.MathUtils.clamp(scale, MIN_CONTENT_SCALE, MAX_CONTENT_SCALE);
    if (!animate) this.scale = this.targetScale;
  }

  /**
   * Un objeto 3D extra al lado del átomo o la molécula (p. ej. algo que se
   * fabrica con ella), que sigue a la tarjeta y aparece con un pequeño salto.
   * `null` lo quita; también se quita al cambiar el contenido de la tarjeta.
   * El objeto pasa a ser de la tarjeta, pero no se libera al quitarlo.
   */
  /** Tiene un objeto extra puesto (se quita al cambiar de contenido). */
  get hasExtra(): boolean {
    return !!this.extra;
  }

  setExtra(object: THREE.Object3D | null): void {
    if (this.extra) {
      this.extra.object.removeFromParent();
      this.extra.wrapper.removeFromParent();
    }
    this.extra = null;
    if (!object) return;
    // Centrado por su esfera envolvente, para ponerlo justo al lado sin tocar su escala.
    object.updateWorldMatrix(false, true);
    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const valid = Number.isFinite(sphere.radius) && sphere.radius > 0;
    const inner = new THREE.Group();
    if (valid) inner.position.copy(sphere.center).negate();
    inner.add(object);
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.scale.setScalar(0.001);
    this.extraHolder.add(wrapper);
    this.extra = { object, wrapper, radius: valid ? sphere.radius : 0.02, pop: 0 };
  }

  /** Sombra de la tarjeta sobre la mesa (la mesa virtual la pone; en la cámara ya está la real). */
  setCardShadow(enabled: boolean): void {
    if (enabled && !this.cardShadow) {
      this.cardShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_SHADOW.width, CARD_SHADOW.height).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: cardShadowTexture(), transparent: true, opacity: 0.32, depthWrite: false }),
      );
      this.cardShadow.position.set(0.0015, 0.0002, 0.002);
      this.cardShadow.renderOrder = -1;
      this.anchor.object.add(this.cardShadow);
    } else if (!enabled && this.cardShadow) {
      this.cardShadow.removeFromParent();
      this.cardShadow.geometry.dispose();
      (this.cardShadow.material as THREE.Material).dispose();
      this.cardShadow = undefined;
    }
  }

  private atomView(symbol: string): AtomView {
    const element = getElement(symbol);
    return new AtomView(element, { model: this.model, metersPerPm: atomRadius(element.radius) / element.radius, cloud: { maxPoints: 4000 } });
  }

  setModel(model: AtomModel): void {
    this.model = model;
    if (this.view instanceof AtomView) this.view.setModel(model);
  }

  /** Centro de la tarjeta en la escena. */
  cardPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.setFromMatrixPosition(this.anchor.object.matrixWorld);
  }

  cardQuaternion(out = new THREE.Quaternion()): THREE.Quaternion {
    this.anchor.object.matrixWorld.decompose(this.target.p, out, this.target.s);
    return out;
  }

  /** Dónde se ve el contenido ahora mismo. */
  contentPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.shake.getWorldPosition(out);
  }

  update(dt: number): void {
    this.time += dt;
    const tracking = this.anchor.tracking;
    this.face.visible = tracking;
    this.contactShadow.visible = tracking;
    if (this.cardShadow) this.cardShadow.visible = tracking;
    this.scale = THREE.MathUtils.damp(this.scale, this.targetScale, 8, dt);
    // Levantar la tarjeta al cogerla: sube un poco y la sombra se abre y aclara.
    this.liftNow = THREE.MathUtils.damp(this.liftNow, this.lifted ? 1 : 0, 14, dt);
    this.face.position.y = FACE_Y + this.liftNow * LIFT;
    if (this.cardShadow) {
      this.cardShadow.scale.setScalar(1 + this.liftNow * 0.12);
      this.cardShadow.position.set(0.0015 + this.liftNow * 0.004, 0.0002, 0.002 + this.liftNow * 0.006);
      (this.cardShadow.material as THREE.MeshBasicMaterial).opacity = 0.32 - this.liftNow * 0.12;
    }
    this.presence = THREE.MathUtils.damp(this.presence, tracking ? 1 : 0, tracking ? 10 : 4, dt);
    this.holder.visible = this.presence > 0.02;
    if (!this.holder.visible) return;

    // Persigue la pose de la tarjeta (más un poco por encima) con retardo.
    this.anchor.object.updateWorldMatrix(true, false);
    const { p, q, s } = this.target;
    this.anchor.object.matrixWorld.decompose(p, q, s);
    const radius = this.radius;
    const up = new THREE.Vector3(0, radius + 0.012 + this.liftNow * LIFT, 0).applyQuaternion(q);
    p.add(up);
    if (!this.placed) {
      this.holder.position.copy(p);
      this.holder.quaternion.copy(q);
      this.placed = true;
    } else {
      const k = 1 - Math.exp(-FOLLOW * dt);
      this.holder.position.lerp(p, k);
      this.holder.quaternion.slerp(q, k);
    }

    // Acercamiento hacia las otras tarjetas y temblor creciente con la carga.
    const local = this.approach.clone().applyQuaternion(this.holder.quaternion.clone().invert());
    const amp = calm() ? 0 : this.charge * this.charge * this.radius * 0.18;
    this.shake.position.set(
      local.x + Math.sin(this.time * 61) * amp,
      local.y + Math.sin(this.time * 53 + 1) * amp,
      local.z + Math.sin(this.time * 47 + 2) * amp,
    );

    this.pop = Math.min(1, this.pop + dt / 0.6);
    this.view!.object.scale.setScalar(Math.max(0.001, easeOutBack(this.pop) * this.presence * this.scale));
    this.halo.scale.setScalar(radius * 4);
    this.ring.scale.setScalar(radius * 3.2);

    // Sombra de contacto: bajo el contenido, más pequeña y clara cuanto más alto.
    const below = this.anchor.object.worldToLocal(this.shake.getWorldPosition(new THREE.Vector3()));
    const heightOver = Math.max(below.y, 0.001);
    this.contactShadow.position.set(below.x, FACE_Y + 0.0003 + this.liftNow * LIFT, below.z);
    this.contactShadow.scale.setScalar(radius * 2.4 * this.presence);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.55 - heightOver * 4, 0.18, 0.5) * this.presence;

    if (this.extra) {
      const e = this.extra;
      e.pop = Math.min(1, e.pop + dt / 0.7);
      const s = Math.max(0.001, easeOutBack(e.pop) * this.presence * this.scale);
      e.wrapper.scale.setScalar(s);
      this.extraHolder.position.set(radius + 0.008 + e.radius * this.scale, Math.sin(this.time * 2) * 0.002, 0);
      this.extraHolder.rotation.y = calm() ? 0 : Math.sin(this.time * 0.7) * 0.3;
    }
    this.halo.material.opacity = this.charge * (0.75 + 0.25 * Math.sin(this.time * 18));
    this.ring.material.color.set(this.selected ? 0xffd166 : 0x7fe3ff);
    this.ring.material.opacity = this.targeted || this.selected ? 0.6 + 0.3 * Math.sin(this.time * 6) : 0;
    // Transparentes del todo: fuera (si no, se dibujan igual y cuestan).
    this.halo.visible = this.halo.material.opacity > 0.01;
    this.ring.visible = this.ring.material.opacity > 0.01;
    this.view!.update(dt * (1 + this.charge * 3));
  }

  dispose(): void {
    this.view?.dispose();
    this.setExtra(null);
    this.holder.removeFromParent();
    this.face.removeFromParent();
    this.face.geometry.dispose();
    this.setCardShadow(false);
    this.contactShadow.removeFromParent();
    this.contactShadow.geometry.dispose();
    (this.contactShadow.material as THREE.Material).dispose();
    (this.face.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.face.material as THREE.Material).dispose();
    this.halo.material.dispose();
    this.ring.material.dispose();
  }
}
