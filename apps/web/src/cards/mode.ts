import { calm } from '../settings';
import { createEveryday, hasEveryday, type EverydayObject } from '../objects';
import * as THREE from 'three';
import { MarkerTrackingProvider, type ARSession, type ViewerProvider } from '@webar/ar-core';
import { REACTIONS, SPECIES, composition, contentFormula, formatEquation, reactionEnthalpy, type AtomModel, type Outcome } from '@webar/chem';
import { t } from '../i18n';
import { contentName, num, reactionConditions, reactionName, reactionNote, speciesName } from '../i18n/content';
import { Effects } from '../effects';
import './cards.css';
import { MAX_CONTENT_SCALE, MIN_CONTENT_SCALE } from './card-visual';
import { CARD, DECK, MARKER_TO_CENTER, cardById, type CardSpec } from './deck';
import { CardGame, HOLD_SECONDS, JOIN_DISTANCE } from './game';
import { TableScene } from './table-scene';

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

/**
 * La mesa virtual empieza vacía: si se reparten muchas tarjetas, quedan tan
 * cerca que reaccionan solas. Se van poniendo con «Añadir elemento» (tabla periódica).
 */
const DEFAULT_TABLE: string[] = [];
/** Separación entre tarjetas sueltas: más que la distancia a la que se juntan. */
const LOOSE_GAP = JOIN_DISTANCE + 0.015;
const SCALE_KEY = 'webar:escala-tarjetas';
const SCALE_STEP = 0.25;

/**
 * La cámara de la mesa virtual: giro lento y con inercia, nunca por debajo de
 * 35° sobre la mesa (las tarjetas siempre se ven desde arriba), desplazamiento
 * en el plano de la mesa y zoom con límites para no perderla de vista.
 */
const TABLE_CONTROLS = {
  rotateSpeed: 0.45,
  dampingFactor: 0.07,
  zoomSpeed: 0.8,
  panSpeed: 0.8,
  enablePan: true,
  screenSpacePanning: false,
  zoomToCursor: true,
  minPolarAngle: 0,
  maxPolarAngle: THREE.MathUtils.degToRad(90 - 35),
  minDistance: 0.12,
  maxDistance: 0.85,
  panBounds: new THREE.Box3(new THREE.Vector3(-0.42, 0, -0.3), new THREE.Vector3(0.42, 0, 0.3)),
};

/**
 * El modo tarjetas: con la cámara (marcadores impresos) o en una mesa virtual
 * donde las tarjetas se arrastran con el dedo. Mismas reglas en los dos.
 */
export class CardsMode {
  /** Objetos cotidianos junto a las moléculas, por tarjeta. */
  private readonly extras = new Map<number, EverydayObject>();
  readonly marker = new MarkerTrackingProvider({
    markerSize: CARD.marker,
    anchorOffset: new THREE.Matrix4().makeTranslation(0, 0, MARKER_TO_CENTER),
    accept: (id) => !!cardById(id),
    coplanar: true,
    // Una tarjeta nueva aparece al segundo fotograma (no al tercero): la lectura ya es estricta.
    identity: { confirmFrames: 2 },
  });
  private readonly effects: Effects;
  readonly game: CardGame;
  private kind: CardsKind = 'camara';
  private active = false;
  private table?: TableScene;
  private virtualId = 1000;
  private drag?: { anchorId: number; moved: boolean; start: { x: number; y: number } };
  /** Tamaño de los átomos y moléculas (1×-3×), guardado entre visitas. */
  private contentScale = 1;
  private scaleOutput?: HTMLOutputElement;
  /** Pellizco con dos dedos en la cámara: cambia el tamaño. */
  private readonly pinch = new Map<number, { x: number; y: number }>();
  private pinchStart?: { distance: number; scale: number };
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
    this.game.on('reaction', ({ outcome, products, cards }) => {
      this.showReaction(outcome);
      // Junto a la molécula nueva, su objeto cotidiano (la esfera de agua, el clavo oxidado…).
      for (const visual of this.game.visuals()) {
        if (!cards.includes(visual.spec.id) || !products.includes(visual.content) || !hasEveryday(visual.content)) continue;
        this.extras.get(visual.spec.id)?.dispose();
        const extra = createEveryday(visual.content, { size: 0.016, calm: calm() });
        visual.setExtra(extra.object);
        this.extras.set(visual.spec.id, extra);
      }
      deps.onReaction?.(outcome, products);
    });
    this.game.on('decompose', ({ from, to }) =>
      this.showBanner(t('juego.descomposicion'), `${contentFormula(from)} → ${to} + …`, t('juego.descomposicion_texto', { nombre: contentName(from) }), 'energia'),
    );
    this.game.on('charging', (c) => this.showCharging(c));
    this.setupHud();
    this.setScale(Number(localStorage.getItem(SCALE_KEY)) || 1, false);
  }

  get provider() {
    return this.kind === 'camara' ? this.marker : this.deps.viewer;
  }

  /** Prepara el modo; luego hay que arrancar la sesión con `provider`. */
  prepare(kind: CardsKind, cards?: string[], together = false): void {
    this.kind = kind;
    this.initialCards = cards?.length ? cards : DEFAULT_TABLE;
    this.together = together;
  }

  onStart(): void {
    this.active = true;
    $('hud-tarjetas').hidden = false;
    $('t-anadir').hidden = this.kind !== 'mesa';
    $('t-reiniciar').hidden = this.kind !== 'mesa';
    this.game.setModel(this.deps.model());
    if (this.kind === 'mesa') this.setupTable();
    else this.setupPinch();
  }

  onEnd(): void {
    this.active = false;
    for (const extra of this.extras.values()) extra.dispose();
    this.extras.clear();
    this.selected = null;
    this.game.clear();
    this.effects.clear();
    this.teardownTable();
    this.teardownPinch();
    $('hud-tarjetas').hidden = true;
  }

  /** Tamaño de los átomos y moléculas sobre las tarjetas (1× a 3×). */
  setScale(scale: number, save = true): void {
    this.contentScale = Math.round(THREE.MathUtils.clamp(scale, MIN_CONTENT_SCALE, MAX_CONTENT_SCALE) * 100) / 100;
    this.game.setContentScale(this.contentScale);
    if (save) localStorage.setItem(SCALE_KEY, String(this.contentScale));
    if (this.scaleOutput) {
      this.scaleOutput.textContent = t('tarjetas.escala_valor', { n: num(this.contentScale, 2) });
      const group = this.scaleOutput.parentElement!;
      group.querySelector<HTMLButtonElement>('[data-paso="-1"]')!.disabled = this.contentScale <= MIN_CONTENT_SCALE;
      group.querySelector<HTMLButtonElement>('[data-paso="1"]')!.disabled = this.contentScale >= MAX_CONTENT_SCALE;
    }
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
    const visuals = new Map(this.game.visuals().map((v) => [v.spec.id, v]));
    for (const [id, extra] of this.extras) {
      const visual = visuals.get(id);
      // Si la tarjeta cambió de contenido (descomponer), su objeto ya no va.
      if (!visual?.hasExtra) {
        extra.dispose();
        this.extras.delete(id);
      } else if (visual.isVisible) extra.update(dt);
      // Las que no se ven no se animan: antes, cada molécula formada dejaba su objeto
      // animándose para siempre aunque su tarjeta ya no estuviera, y todo iba más lento.
    }

    const visible = this.game.visibleCount;
    $('t-estado').hidden = this.kind === 'mesa' ? visible > 0 : visible > 1;
    const selected = this.game.visuals().find((v) => v.spec.id === this.selected);
    if (selected) $('t-estado').hidden = false;
    $('t-estado').textContent = selected
      ? t('juego.seleccionada', { nombre: contentName(selected.content) })
      : visible === 0
        ? this.kind === 'camara'
          ? t('juego.apunta')
          : t('mesa.vacia')
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

    // Control de tamaño (lo crea el código para no tocar el HTML de la pantalla).
    const group = document.createElement('div');
    group.className = 't-escala flotante';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', t('tarjetas.escala'));
    group.title = t('tarjetas.escala_ayuda');
    const step = (dir: 1 | -1, glyph: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn redondo claro';
      b.dataset.paso = String(dir);
      b.textContent = glyph;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => this.setScale(this.contentScale + dir * SCALE_STEP));
      return b;
    };
    this.scaleOutput = document.createElement('output');
    this.scaleOutput.setAttribute('aria-live', 'polite');
    group.append(step(1, '+', t('tarjetas.escala_mas')), this.scaleOutput, step(-1, '−', t('tarjetas.escala_menos')));
    $('hud-tarjetas').append(group);

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
    banner.className = `banner flotante ${kind}`;
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
      this.table = new TableScene(ar.scene);
      this.table.attach();
      viewer.setControls(TABLE_CONTROLS);
      viewer.setDragHandler({ down: this.onDragStart, move: this.onDragMove, up: this.onDragEnd });
    }
    const cards = this.tableCards();
    // En vertical, menos columnas: así caben todas sin alejar tanto la cámara.
    const portrait = ar.camera.aspect < 0.9;
    // Mesa vacía: la vista de una fila de 5 tarjetas sueltas (3 en vertical), donde irán cayendo.
    const count = Math.max(cards.length, this.together ? 1 : portrait ? 3 : 5);
    const columns = this.together ? count : Math.min(portrait ? 3 : 6, count);
    const rows = Math.ceil(count / columns);
    // Sueltas, más separadas que la distancia de unión: si no, reaccionan solas al empezar.
    const spacing = this.together ? CARD.width + 0.004 : LOOSE_GAP;
    const rowStep = CARD.height + 0.02;
    cards.forEach((symbol, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      // La última fila, centrada si está incompleta.
      const inRow = row === rows - 1 ? count - row * columns : columns;
      const x = (col - (inRow - 1) / 2) * spacing;
      const z = (row - (rows - 1) / 2) * rowStep;
      this.addVirtualCard(symbol, new THREE.Vector3(x, 0, z));
    });
    // Cámara desde arriba (≈ 60°) y a la distancia justa para verlas todas.
    const half = { x: ((columns - 1) * spacing + CARD.width) / 2 + 0.02, z: ((rows - 1) * rowStep + CARD.height) / 2 + 0.03 };
    const vertical = THREE.MathUtils.degToRad(ar.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * ar.camera.aspect);
    const elevation = THREE.MathUtils.degToRad(60);
    const distance = THREE.MathUtils.clamp(
      Math.max(half.x / Math.tan(horizontal), (half.z * Math.sin(elevation)) / Math.tan(vertical) + half.z * Math.cos(elevation)),
      0.25,
      TABLE_CONTROLS.maxDistance,
    );
    const target = new THREE.Vector3(0, 0, 0.01);
    viewer.setView(target.clone().add(new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(distance)), target);
  }

  /** Las tarjetas de la mesa al empezar: las pedidas (acertijos, laboratorio) o ninguna. */
  private tableCards(): string[] {
    // La mesa libre empieza vacía: se añaden con «Añadir elemento».
    return [...this.initialCards];
  }

  private addVirtualCard(symbol: string, position?: THREE.Vector3): void {
    // Se dibuja como su tarjeta impresa (la copia siguiente de ese elemento).
    const copy = this.game.visuals().filter((v) => v.spec.symbol === symbol).length + 1;
    const printed = DECK.find((c) => c.symbol === symbol && c.copy === copy) ?? DECK.find((c) => c.symbol === symbol);
    const spec: CardSpec = { id: this.virtualId++, symbol, copy: 0, marker: printed?.id };
    const at = position ?? this.freeSpot();
    this.game.addCard(spec, this.deps.viewer.createAnchor(at)).setCardShadow(true);
  }

  /**
   * Un hueco donde la tarjeta nueva no toque a ninguna (no reacciona hasta que
   * se junte a mano): primero en la fila de delante, del centro hacia fuera.
   */
  private freeSpot(): THREE.Vector3 {
    // La pose recién puesta (matrix), no la del último fotograma (matrixWorld): así varias seguidas no caen en el mismo sitio.
    const taken = this.game.visuals().map((v) => new THREE.Vector3().setFromMatrixPosition(v.anchor.object.matrix));
    const rowStep = CARD.height + 0.03;
    for (const row of [0, -1, 1, -2, 2, -3])
      for (const col of [0, 1, -1, 2, -2, 3, -3]) {
        const p = new THREE.Vector3(col * LOOSE_GAP, 0, row * rowStep);
        if (taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > LOOSE_GAP - 0.002)) return p;
      }
    return new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0.3);
  }

  private teardownTable(): void {
    if (!this.table) return;
    this.deps.viewer.setDragHandler(null);
    this.table.dispose();
    this.table = undefined;
    this.drag = undefined;
  }

  // --- Pellizco en la cámara: tamaño de los átomos ----------------------------------

  private setupPinch(): void {
    const canvas = this.deps.ar.renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPinchDown);
    canvas.addEventListener('pointermove', this.onPinchMove);
    canvas.addEventListener('pointerup', this.onPinchUp);
    canvas.addEventListener('pointercancel', this.onPinchUp);
  }

  private teardownPinch(): void {
    const canvas = this.deps.ar.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPinchDown);
    canvas.removeEventListener('pointermove', this.onPinchMove);
    canvas.removeEventListener('pointerup', this.onPinchUp);
    canvas.removeEventListener('pointercancel', this.onPinchUp);
    this.pinch.clear();
    this.pinchStart = undefined;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pinch.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private readonly onPinchDown = (e: PointerEvent) => {
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch.size === 2) this.pinchStart = { distance: Math.max(this.pinchDistance(), 1), scale: this.contentScale };
  };

  private readonly onPinchMove = (e: PointerEvent) => {
    if (!this.pinch.has(e.pointerId)) return;
    this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinchStart && this.pinch.size === 2) this.setScale((this.pinchStart.scale * this.pinchDistance()) / this.pinchStart.distance, false);
  };

  private readonly onPinchUp = (e: PointerEvent) => {
    this.pinch.delete(e.pointerId);
    if (this.pinchStart && this.pinch.size < 2) {
      this.pinchStart = undefined;
      this.setScale(this.contentScale); // guarda el tamaño final
    }
  };

  private readonly raycaster = new THREE.Raycaster();
  private ray(e: PointerEvent): THREE.Raycaster {
    const rect = this.deps.ar.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.deps.ar.camera);
    return this.raycaster;
  }

  // Un dedo sobre una tarjeta la arrastra; en vacío, gira la cámara. Dos dedos
  // siempre mueven la cámara (ViewerProvider suelta la tarjeta si hacía falta).
  private readonly onDragStart = (e: PointerEvent): boolean => {
    const faces = this.game.visuals().map((v) => v.face);
    const hit = this.ray(e).intersectObjects(faces, false)[0];
    if (!hit) {
      this.select(null);
      return false;
    }
    const id = hit.object.userData.cardId as number;
    this.drag = { anchorId: id, moved: false, start: { x: e.clientX, y: e.clientY } };
    const visual = this.game.visuals().find((v) => v.spec.id === id);
    if (visual) visual.lifted = true;
    return true;
  };

  private readonly onDragMove = (e: PointerEvent) => {
    if (!this.drag) return;
    if (Math.hypot(e.clientX - this.drag.start.x, e.clientY - this.drag.start.y) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    const point = this.ray(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    const visual = this.game.visuals().find((v) => v.spec.id === this.drag!.anchorId);
    if (!point || !visual) return;
    // Que no se salga de la mesa.
    point.x = THREE.MathUtils.clamp(point.x, -0.6, 0.6);
    point.z = THREE.MathUtils.clamp(point.z, -0.4, 0.4);
    visual.anchor.setPose(new THREE.Matrix4().makeTranslation(point.x, 0, point.z));
  };

  private readonly onDragEnd = (_e: PointerEvent, cancelled: boolean) => {
    if (!this.drag) return;
    const id = this.drag.anchorId;
    const visual = this.game.visuals().find((v) => v.spec.id === id);
    if (visual) visual.lifted = false;
    if (!cancelled && !this.drag.moved) {
      // Un toque: la elige como objetivo de «Descomponer» y, si ya había otra
      // elegida, la pone a su lado (juntar sin arrastrar).
      this.game.preferred = id;
      if (this.selected !== null && this.selected !== id) this.joinNextTo(id, this.selected);
      else this.select(this.selected === id ? null : id);
    } else if (!cancelled) this.select(null);
    // Si ha caído un segundo dedo (cancelled), la tarjeta se queda donde está y manda la cámara.
    this.drag = undefined;
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
