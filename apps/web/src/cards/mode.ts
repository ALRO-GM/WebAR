import * as THREE from 'three';
import { MarkerTrackingProvider, type ARSession, type ViewerProvider } from '@webar/ar-core';
import { REACTIONS, SPECIES, composition, contentFormula, formatEquation, reactionEnthalpy, type AtomModel, type Outcome } from '@webar/chem';
import { t } from '../i18n';
import { contentName, num, reactionConditions, reactionName, reactionNote, speciesName } from '../i18n/content';
import { Effects } from '../effects';
import { CARD, MARKER_TO_CENTER, cardById, type CardSpec } from './deck';
import { CardGame, HOLD_SECONDS } from './game';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const kj = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))} kJ/mol`;

export type CardsKind = 'camara' | 'mesa';

export interface CardsModeDeps {
  ar: ARSession;
  viewer: ViewerProvider;
  model: () => AtomModel;
  /** Abre la tabla periódica y llama a `onPick` con el símbolo elegido. */
  pickElement: (onPick: (symbol: string) => void) => void;
  /** Para el progreso del alumno: qué se ha formado. */
  onReaction?: (outcome: Outcome, products: string[]) => void;
  /** Elementos disponibles en la mesa virtual (los desbloqueados). */
  isUnlocked?: (symbol: string) => boolean;
  /** El reto en juego: texto para el HUD y átomos que hacen falta en la mesa. */
  challenge?: () => { label: string; atoms: string[] } | null;
}

/** Las cartas por defecto en la mesa virtual. */
const DEFAULT_TABLE = 'H H H H O O O C N N Na Cl'.split(' ');

/**
 * El modo tarjetas: con la cámara (marcadores impresos) o en una mesa virtual
 * donde las tarjetas se arrastran con el dedo. Mismas reglas en los dos.
 */
export class CardsMode {
  readonly marker = new MarkerTrackingProvider({
    markerSize: CARD.marker,
    anchorOffset: new THREE.Matrix4().makeTranslation(0, 0, MARKER_TO_CENTER),
    accept: (id) => !!cardById(id),
  });
  private readonly effects: Effects;
  readonly game: CardGame;
  private kind: CardsKind = 'camara';
  private active = false;
  private table?: THREE.Mesh;
  private virtualId = 1000;
  private drag?: { card: THREE.Object3D; anchorId: number; moved: boolean; start: { x: number; y: number } };
  private holding = false;
  private holdTime = 0;
  private bannerTimer = 0;
  private initialCards: string[] = DEFAULT_TABLE;
  /** Mesa: tarjeta tocada para juntarle otra con un segundo toque (alternativa a arrastrar). */
  private selected: number | null = null;
  private together = false;

  constructor(private readonly deps: CardsModeDeps) {
    this.effects = new Effects(deps.ar.scene);
    this.game = new CardGame(deps.ar.scene, this.effects, deps.model());
    this.marker.on('marker', ({ id, anchor }) => {
      const spec = cardById(id);
      if (this.active && spec) this.game.addCard(spec, anchor);
    });
    this.game.on('reaction', ({ outcome, products }) => {
      this.showReaction(outcome);
      deps.onReaction?.(outcome, products);
    });
    this.game.on('decompose', ({ from, to }) =>
      this.showBanner(t('juego.descomposicion'), `${contentFormula(from)} → ${to} + …`, t('juego.descomposicion_texto', { nombre: contentName(from) }), 'energia'),
    );
    this.game.on('charging', (c) => this.showCharging(c));
    this.setupHud();
  }

  get provider() {
    return this.kind === 'camara' ? this.marker : this.deps.viewer;
  }

  /** Prepara el modo; luego hay que arrancar la sesión con `provider`. */
  prepare(kind: CardsKind, cards?: string[], together = false): void {
    this.kind = kind;
    if (cards?.length) this.initialCards = cards;
    this.together = together;
  }

  onStart(): void {
    this.active = true;
    $('hud-tarjetas').hidden = false;
    $('t-anadir').hidden = this.kind !== 'mesa';
    $('t-reiniciar').hidden = this.kind !== 'mesa';
    this.game.setModel(this.deps.model());
    if (this.kind === 'mesa') this.setupTable();
  }

  onEnd(): void {
    this.active = false;
    this.selected = null;
    this.game.clear();
    this.effects.clear();
    this.teardownTable();
    $('hud-tarjetas').hidden = true;
  }

  setModel(model: AtomModel): void {
    this.game.setModel(model);
  }

  frame(dt: number): void {
    if (!this.active) return;
    const camera = this.deps.ar.camera;
    // Descomponer: hay que mantener el botón 3 s apuntando a la molécula.
    const target = this.game.currentTarget;
    const button = $<HTMLButtonElement>('t-descomponer');
    button.disabled = !target;
    if (this.holding && target) {
      this.holdTime += dt;
      this.game.setHold(target.spec.id, this.holdTime / HOLD_SECONDS);
      if (this.holdTime >= HOLD_SECONDS) this.stopHold();
    }
    button.style.setProperty('--p', String(this.holding ? Math.min(this.holdTime / HOLD_SECONDS, 1) : 0));
    this.game.update(dt, camera);

    const visible = this.game.visibleCount;
    $('t-estado').hidden = this.kind === 'mesa' ? visible > 0 : visible > 1;
    const selected = this.game.visuals().find((v) => v.spec.id === this.selected);
    if (selected) $('t-estado').hidden = false;
    $('t-estado').textContent = selected
      ? t('juego.seleccionada', { nombre: contentName(selected.content) })
      : visible === 0
        ? this.kind === 'camara'
          ? t('juego.apunta')
          : t('juego.anade')
        : t('juego.junta');

    if (this.bannerTimer > 0 && (this.bannerTimer -= dt) <= 0) $('t-banner').hidden = true;
    const challenge = this.deps.challenge?.();
    $('t-reto').hidden = !challenge;
    if (challenge && $('t-reto').textContent !== challenge.label) $('t-reto').textContent = challenge.label;
  }

  // --- HUD ------------------------------------------------------------------

  private setupHud(): void {
    const button = $('t-descomponer');
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.holding = true;
      this.holdTime = 0;
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) button.addEventListener(ev, () => this.stopHold());
    button.addEventListener('contextmenu', (e) => e.preventDefault());

    $('t-anadir').addEventListener('click', () => this.deps.pickElement((symbol) => this.addVirtualCard(symbol)));
    $('t-reiniciar').addEventListener('click', () => {
      this.game.clear();
      this.setupTable();
    });
    $('t-recetas').addEventListener('click', () => {
      this.renderRecipes();
      $('recetas').hidden = false;
    });
    $('cerrar-recetas').addEventListener('click', () => ($('recetas').hidden = true));
  }

  private stopHold(): void {
    this.holding = false;
    this.holdTime = 0;
    this.game.setHold(null);
  }

  private showCharging(c: { outcome: Outcome; progress: number } | null): void {
    $('t-carga').hidden = !c;
    if (!c) return;
    $('t-carga-ecuacion').textContent = c.outcome.equation;
    $('t-carga').style.setProperty('--p', String(c.progress));
  }

  private showReaction(outcome: Outcome): void {
    const kind = Math.abs(outcome.deltaH) < 5 ? '' : outcome.deltaH < 0 ? 'exo' : 'endo';
    const amount = num(Math.abs(outcome.deltaH));
    const heat = kind === 'exo' ? t('juego.exo', { kj: amount }) : kind === 'endo' ? t('juego.endo', { kj: amount }) : t('juego.neutro');
    const conditions = reactionConditions(outcome.reaction);
    this.showBanner(
      reactionName(outcome.reaction),
      outcome.equation,
      `${heat} (ΔH = ${kj(outcome.deltaH)}${conditions ? `, ${conditions}` : ''}). ${reactionNote(outcome.reaction)}`,
      kind,
    );
  }

  private showBanner(title: string, equation: string, text: string, kind: string): void {
    const banner = $('t-banner');
    banner.className = `banner ${kind}`;
    $('t-banner-titulo').textContent = title;
    $('t-banner-ecuacion').textContent = equation;
    $('t-banner-texto').textContent = text;
    banner.hidden = false;
    this.bannerTimer = 8;
  }

  private renderRecipes(): void {
    const list = $('recetas-lista');
    if (list.childElementCount) return;
    const reactions = REACTIONS.map((r) => {
      const dh = reactionEnthalpy(r);
      return `<li><span class="ecuacion">${formatEquation(r)}</span><span class="dh ${dh < 0 ? 'exo' : 'endo'}">${dh < 0 ? '🔥' : '❄️'} ${kj(dh)}</span><small>${reactionName(r)}</small></li>`;
    }).join('');
    const species = SPECIES.map((s) => {
      const atoms = Object.entries(composition(s))
        .map(([el, n]) => (n > 1 ? `${n} ${el}` : el))
        .join(' + ');
      return `<li><span class="ecuacion">${atoms} → ${s.formula}</span><small>${speciesName(s.id)}</small></li>`;
    }).join('');
    list.innerHTML = `<h3>${t('recetas.reacciones')}</h3><ul>${reactions}</ul><h3>${t('recetas.moleculas')}</h3><p class="pequeno">${t('recetas.pasos')}</p><ul>${species}</ul>`;
  }

  // --- Mesa virtual -----------------------------------------------------------

  private setupTable(): void {
    const { viewer, ar } = this.deps;
    if (!this.table) {
      this.table = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.6).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x1d3b33, roughness: 0.95 }),
      );
      this.table.position.y = -0.001;
      ar.scene.add(this.table);
      const canvas = ar.renderer.domElement;
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointermove', this.onPointerMove);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('pointercancel', this.onPointerUp);
    }
    viewer.setView(new THREE.Vector3(0, 0.38, 0.3), new THREE.Vector3(0, 0, 0.02));
    const cards = this.tableCards();
    const columns = this.together ? cards.length : Math.min(6, cards.length);
    const spacing = this.together ? CARD.width + 0.004 : CARD.width + 0.03;
    cards.forEach((symbol, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = (col - (columns - 1) / 2) * spacing;
      const z = (row - (Math.ceil(cards.length / columns) - 1) / 2) * (CARD.height + 0.02);
      this.addVirtualCard(symbol, new THREE.Vector3(x, 0, z));
    });
  }

  /** Las tarjetas de la mesa: las pedidas (o las de siempre que estén desbloqueadas) y las que pida el reto. */
  private tableCards(): string[] {
    const unlocked = this.deps.isUnlocked ?? (() => true);
    const base = this.initialCards === DEFAULT_TABLE ? DEFAULT_TABLE.filter(unlocked) : [...this.initialCards];
    for (const atom of this.deps.challenge?.()?.atoms ?? []) {
      const need = (this.deps.challenge!()!.atoms.filter((a) => a === atom).length);
      while (base.filter((b) => b === atom).length < need) base.push(atom);
    }
    return base;
  }

  private addVirtualCard(symbol: string, position?: THREE.Vector3): void {
    const spec: CardSpec = { id: this.virtualId++, symbol, copy: 0 };
    const at = position ?? new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0.15 + Math.random() * 0.05);
    this.game.addCard(spec, this.deps.viewer.createAnchor(at));
  }

  private teardownTable(): void {
    if (!this.table) return;
    const canvas = this.deps.ar.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.table.removeFromParent();
    this.table.geometry.dispose();
    (this.table.material as THREE.Material).dispose();
    this.table = undefined;
  }

  private readonly raycaster = new THREE.Raycaster();
  private ray(e: PointerEvent): THREE.Raycaster {
    const rect = this.deps.ar.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.deps.ar.camera);
    return this.raycaster;
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    const faces = this.game.visuals().map((v) => v.face);
    const hit = this.ray(e).intersectObjects(faces, false)[0];
    if (!hit) {
      this.select(null);
      return;
    }
    this.deps.viewer.setControlsEnabled(false);
    this.drag = { card: hit.object, anchorId: hit.object.userData.cardId, moved: false, start: { x: e.clientX, y: e.clientY } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    if (Math.hypot(e.clientX - this.drag.start.x, e.clientY - this.drag.start.y) > 4) this.drag.moved = true;
    const point = this.ray(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    const visual = this.game.visuals().find((v) => v.spec.id === this.drag!.anchorId);
    if (point && visual) visual.anchor.setPose(new THREE.Matrix4().makeTranslation(point.x, 0, point.z));
  };

  private readonly onPointerUp = () => {
    if (!this.drag) return;
    const id = this.drag.anchorId;
    if (!this.drag.moved) {
      // Un toque: la elige como objetivo de «Descomponer» y, si ya había otra
      // elegida, la pone a su lado (juntar sin arrastrar).
      this.game.preferred = id;
      if (this.selected !== null && this.selected !== id) this.joinNextTo(id, this.selected);
      else this.select(this.selected === id ? null : id);
    } else this.select(null);
    this.drag = undefined;
    this.deps.viewer.setControlsEnabled(true);
  };

  private select(id: number | null): void {
    this.selected = id;
    for (const v of this.game.visuals()) v.selected = v.spec.id === id;
  }

  /** Mueve la tarjeta `moving` justo a la derecha de `target`. */
  private joinNextTo(moving: number, target: number): void {
    const visuals = this.game.visuals();
    const a = visuals.find((v) => v.spec.id === target);
    const b = visuals.find((v) => v.spec.id === moving);
    if (a && b) {
      const p = a.cardPosition();
      // Si a la derecha ya hay otra, debajo.
      const right = new THREE.Vector3(p.x + CARD.width + 0.004, 0, p.z);
      const busy = visuals.some((v) => v !== b && v.cardPosition().distanceTo(right) < CARD.width * 0.6);
      const to = busy ? new THREE.Vector3(p.x, 0, p.z + CARD.height + 0.004) : right;
      b.anchor.setPose(new THREE.Matrix4().makeTranslation(to.x, 0, to.z));
    }
    this.select(null);
  }
}
