import * as THREE from 'three';
import type { ARAnchor } from '@webar/ar-core';
import { AtomView, MoleculeView, getElement, getSpecies, type AtomModel, type Content } from '@webar/chem';
import { glowTexture, ringTexture } from '../effects';
import { calm } from '../settings';
import { cardFaceTexture } from './card-face';
import { CARD, type CardSpec } from './deck';

/**
 * Tamaños sobre una tarjeta de 6,3 cm. A escala real el H mediría 6 mm y sus
 * partículas serían motas invisibles; aquí el radio se comprime (H ≈ 13 mm,
 * Cs ≈ 35 mm): los grandes siguen siendo más grandes, pero todos se ven.
 */
const atomRadius = (pm: number) => 0.008 + pm * 0.00009;
const METERS_PER_ANGSTROM = 0.011;
/** Cuánto tarda el contenido en alcanzar la tarjeta al moverla (más = más «flotante»). */
const FOLLOW = 7;

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

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
  private view?: AtomView | MoleculeView;
  private _content: Content;
  private height = 0.02;
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
    this.face.position.y = 0.0006;
    this.face.userData.cardId = spec.id;
    anchor.object.add(this.face);

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

  /** Radio del contenido, en metros. */
  get radius(): number {
    return this.view?.radius ?? 0.01;
  }

  setContent(content: Content, animate = true): void {
    this._content = content;
    this.view?.dispose();
    const species = getSpecies(content);
    this.view = species
      ? new MoleculeView(species, { metersPerAngstrom: METERS_PER_ANGSTROM })
      : this.atomView(content);
    this.shake.add(this.view.object);
    this.height = this.view.radius + 0.012;
    this.halo.scale.setScalar(this.view.radius * 4);
    this.ring.scale.setScalar(this.view.radius * 3.2);
    this.pop = animate ? 0 : 1;

    const material = this.face.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.map = cardFaceTexture(content, this.spec.symbol, this.spec.id);
    material.needsUpdate = true;
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
    this.presence = THREE.MathUtils.damp(this.presence, tracking ? 1 : 0, tracking ? 10 : 4, dt);
    this.holder.visible = this.presence > 0.02;
    if (!this.holder.visible) return;

    // Persigue la pose de la tarjeta (más un poco por encima) con retardo.
    this.anchor.object.updateWorldMatrix(true, false);
    const { p, q, s } = this.target;
    this.anchor.object.matrixWorld.decompose(p, q, s);
    const up = new THREE.Vector3(0, this.height, 0).applyQuaternion(q);
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
    this.view!.object.scale.setScalar(Math.max(0.001, easeOutBack(this.pop) * this.presence));
    this.halo.material.opacity = this.charge * (0.75 + 0.25 * Math.sin(this.time * 18));
    this.ring.material.color.set(this.selected ? 0xffd166 : 0x7fe3ff);
    this.ring.material.opacity = this.targeted || this.selected ? 0.6 + 0.3 * Math.sin(this.time * 6) : 0;
    this.view!.update(dt * (1 + this.charge * 3));
  }

  dispose(): void {
    this.view?.dispose();
    this.holder.removeFromParent();
    this.face.removeFromParent();
    this.face.geometry.dispose();
    (this.face.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.face.material as THREE.Material).dispose();
    this.halo.material.dispose();
    this.ring.material.dispose();
  }
}
