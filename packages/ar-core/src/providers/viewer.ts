import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARAnchor } from '../anchor';
import type { ARContext, ARProvider, ARProviderHooks } from '../types';

/** Cómo se mueve la cámara con el dedo o el ratón. Todo opcional. */
export interface ViewerControlsOptions {
  /** Inercia al soltar: 0-1, más bajo = más suave y largo. Por defecto 0,05. */
  dampingFactor?: number;
  /** Velocidad de giro (1 = la de OrbitControls). */
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  /** Permitir desplazar la vista (dos dedos o botón derecho). Por defecto, sí. */
  enablePan?: boolean;
  /** true: desplaza en el plano de la pantalla; false: en el plano horizontal (una mesa). */
  screenSpacePanning?: boolean;
  /** El pellizco y la rueda acercan hacia donde están los dedos o el puntero. */
  zoomToCursor?: boolean;
  /**
   * Ángulos polares (radianes, desde la vertical): 0 = cenital, π/2 = a ras
   * del suelo. Con `maxPolarAngle` < π/2 la cámara nunca baja a la altura de
   * la mesa.
   */
  minPolarAngle?: number;
  maxPolarAngle?: number;
  /** Distancias de zoom fijas (si no, `setView` y `frame` las calculan). */
  minDistance?: number;
  maxDistance?: number;
  /** Caja que no puede abandonar el punto al que mira la cámara al desplazar. */
  panBounds?: THREE.Box3 | null;
}

export interface ViewerOptions {
  /** Color de fondo. Por defecto, gris muy oscuro. */
  background?: THREE.ColorRepresentation;
  /** Ajustes de la cámara por defecto (cada sesión vuelve a ellos). */
  controls?: ViewerControlsOptions;
}

/**
 * Quien quiera arrastrar objetos con un dedo sin pelearse con la cámara.
 * Un dedo que `down` acepta no llega a la cámara; si cae un segundo dedo, el
 * arrastre se cancela (`up(…, true)`) y los dos dedos pasan a mover la cámara
 * (desplazar y pellizcar), se toquen objetos o no.
 */
export interface ViewerDragHandler {
  /** Un dedo (o el botón principal del ratón) baja: true si lo coge. */
  down(e: PointerEvent): boolean;
  move(e: PointerEvent): void;
  /** Se suelta; `cancelled` si ha pasado a ser un gesto de cámara. */
  up(e: PointerEvent, cancelled: boolean): void;
}

const DEFAULT_CONTROLS: Required<Omit<ViewerControlsOptions, 'minDistance' | 'maxDistance' | 'panBounds'>> = {
  dampingFactor: 0.05,
  rotateSpeed: 1,
  zoomSpeed: 1,
  panSpeed: 1,
  enablePan: true,
  screenSpacePanning: true,
  zoomToCursor: false,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI,
};

/**
 * Visor 3D sin realidad aumentada: fondo liso y la cámara se gira con el dedo
 * o el ratón (OrbitControls). Funciona en cualquier navegador con WebGL, así
 * que sirve de alternativa en iPhone y ordenadores, y para desarrollar.
 *
 * Usa la misma API de anclas que los proveedores de RA: la app cuelga sus
 * objetos de un ancla y no necesita saber si hay cámara o no.
 */
export class ViewerProvider implements ARProvider {
  readonly id = 'viewer';
  readonly capabilities = [] as const;

  private ctx?: ARContext;
  private hooks?: ARProviderHooks;
  private controls?: OrbitControls;
  private limits: ViewerControlsOptions = {};
  private previousBackground: THREE.Scene['background'] = null;
  private readonly anchors = new Set<ARAnchor>();
  private pointerStart?: { x: number; y: number };
  private nextId = 0;
  private dragHandler: ViewerDragHandler | null = null;
  /** El dedo que tiene cogido el `dragHandler` y dónde está. */
  private dragging?: { id: number; x: number; y: number; type: string };
  /** Dedos sobre el lienzo (para saber cuándo hay dos). */
  private readonly down = new Set<number>();
  /** Eventos sintéticos que sí deben llegar a la cámara. */
  private readonly forwarded = new WeakSet<Event>();

  constructor(private readonly options: ViewerOptions = {}) {}

  async isSupported(): Promise<boolean> {
    return !!document.createElement('canvas').getContext('webgl2');
  }

  async start(ctx: ARContext, hooks: ARProviderHooks): Promise<void> {
    this.ctx = ctx;
    this.hooks = hooks;
    this.previousBackground = ctx.scene.background;
    ctx.scene.background = new THREE.Color(this.options.background ?? 0x15181d);
    ctx.camera.clearViewOffset();
    ctx.camera.fov = 50;
    ctx.camera.near = 0.001;
    ctx.camera.position.set(0, 0.05, 0.3);
    ctx.camera.updateProjectionMatrix();
    const canvas = ctx.renderer.domElement;
    // Antes que las OrbitControls: así se decide quién se queda cada dedo.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(ctx.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.limits = {};
    this.setControls({ ...DEFAULT_CONTROLS, ...this.options.controls });
  }

  update(): void {
    if (!this.controls) return;
    this.controls.update();
    // El desplazamiento no saca el punto de mira de su caja (ni la cámara con él).
    const bounds = this.limits.panBounds;
    if (bounds) {
      const target = this.controls.target;
      const clamped = target.clone().clamp(bounds.min, bounds.max);
      if (!clamped.equals(target)) {
        this.ctx!.camera.position.add(clamped.clone().sub(target));
        target.copy(clamped);
      }
    }
  }

  /**
   * Cambia cómo se mueve la cámara en la sesión en marcha (se mezcla con lo
   * anterior). Al parar se vuelve a los del constructor.
   */
  setControls(options: ViewerControlsOptions): void {
    this.limits = { ...this.limits, ...options };
    const c = this.controls;
    if (!c) return;
    const o = this.limits;
    if (o.dampingFactor !== undefined) c.dampingFactor = o.dampingFactor;
    if (o.rotateSpeed !== undefined) c.rotateSpeed = o.rotateSpeed;
    if (o.zoomSpeed !== undefined) c.zoomSpeed = o.zoomSpeed;
    if (o.panSpeed !== undefined) c.panSpeed = o.panSpeed;
    if (o.enablePan !== undefined) c.enablePan = o.enablePan;
    if (o.screenSpacePanning !== undefined) c.screenSpacePanning = o.screenSpacePanning;
    if (o.zoomToCursor !== undefined) c.zoomToCursor = o.zoomToCursor;
    if (o.minPolarAngle !== undefined) c.minPolarAngle = o.minPolarAngle;
    if (o.maxPolarAngle !== undefined) c.maxPolarAngle = o.maxPolarAngle;
    if (o.minDistance !== undefined) c.minDistance = o.minDistance;
    if (o.maxDistance !== undefined) c.maxDistance = o.maxDistance;
  }

  /**
   * Arrastrar objetos con un dedo: ver `ViewerDragHandler`. `null` para
   * quitarlo. Dos dedos siempre mueven la cámara.
   */
  setDragHandler(handler: ViewerDragHandler | null): void {
    if (!handler && this.dragging) this.dragging = undefined;
    this.dragHandler = handler;
  }

  /** Un ancla fija en `position` (por defecto, el centro de la escena). */
  createAnchor(position = new THREE.Vector3()): ARAnchor {
    const anchor = new ARAnchor(`viewer-${this.nextId++}`, () => this.anchors.delete(anchor));
    anchor.setPose(new THREE.Matrix4().makeTranslation(position));
    anchor.setTracking(true);
    this.ctx?.scene.add(anchor.object);
    this.anchors.add(anchor);
    return anchor;
  }

  /** Pone la cámara en `position` mirando a `target`. */
  setView(position: THREE.Vector3, target: THREE.Vector3): void {
    if (!this.ctx || !this.controls) return;
    this.ctx.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.minDistance = this.limits.minDistance ?? 0.02;
    this.controls.maxDistance = this.limits.maxDistance ?? position.distanceTo(target) * 4;
    this.controls.update();
  }

  /** Activa o desactiva el giro con el dedo (p. ej. mientras se arrastra algo). */
  setControlsEnabled(enabled: boolean): void {
    if (this.controls) this.controls.enabled = enabled;
  }

  /** Coloca la cámara para ver entera una esfera de radio `radius` alrededor de `center`. */
  frame(radius: number, center = new THREE.Vector3()): void {
    if (!this.ctx || !this.controls) return;
    const { camera } = this.ctx;
    // En vertical manda el campo de visión horizontal, que es el más estrecho.
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    // + radius: lo que queda delante del centro está más cerca y se ve más grande.
    const distance = radius / Math.tan(Math.min(vertical, horizontal)) + radius;
    const direction = camera.position.clone().sub(this.controls.target).normalize();
    if (direction.lengthSq() === 0) direction.set(0, 0.2, 1).normalize();
    this.controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, Math.max(distance, radius * 1.5));
    this.controls.minDistance = this.limits.minDistance ?? radius * 0.3;
    this.controls.maxDistance = this.limits.maxDistance ?? distance * 6;
  }

  async stop(): Promise<void> {
    if (!this.ctx) return;
    for (const anchor of [...this.anchors]) anchor.dispose();
    this.controls?.dispose();
    const canvas = this.ctx.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.ctx.scene.background = this.previousBackground;
    this.controls = this.ctx = undefined;
    this.dragging = undefined;
    this.down.clear();
    const hooks = this.hooks;
    this.hooks = undefined;
    hooks?.ended();
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (this.forwarded.has(e)) return; // el dedo devuelto a la cámara: que pase
    this.down.add(e.pointerId);
    this.pointerStart = this.down.size === 1 ? { x: e.clientX, y: e.clientY } : undefined;

    if (this.dragging && e.pointerId !== this.dragging.id) {
      // Segundo dedo: se suelta lo cogido y los dos dedos son de la cámara.
      const first = this.dragging;
      this.dragging = undefined;
      this.dragHandler?.up(e, true);
      this.giveToControls(first);
      return; // este evento sigue su camino hasta las OrbitControls
    }
    const primary = e.pointerType !== 'mouse' || e.button === 0;
    if (this.down.size === 1 && primary && this.dragHandler?.down(e)) {
      this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType };
      e.stopImmediatePropagation(); // la cámara no se entera de este dedo
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging || e.pointerId !== this.dragging.id) return;
    this.dragging.x = e.clientX;
    this.dragging.y = e.clientY;
    this.dragHandler?.move(e);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (this.forwarded.has(e)) return;
    this.down.delete(e.pointerId);
    if (this.dragging?.id === e.pointerId) {
      this.dragging = undefined;
      this.dragHandler?.up(e, false);
    }
    // Un toque sin arrastrar cuenta como «select», igual que en RA.
    if (e.type === 'pointerup' && this.pointerStart && Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 6) this.hooks?.select();
    if (this.down.size === 0) this.pointerStart = undefined;
  };

  /** Presenta a las OrbitControls un dedo que tenían oculto, donde está ahora. */
  private giveToControls(p: { id: number; x: number; y: number; type: string }): void {
    const canvas = this.ctx?.renderer.domElement;
    if (!canvas) return;
    const event = new PointerEvent('pointerdown', { pointerId: p.id, pointerType: p.type, clientX: p.x, clientY: p.y, isPrimary: true, bubbles: true, button: 0, buttons: 1 });
    this.forwarded.add(event);
    canvas.dispatchEvent(event);
  }
}
