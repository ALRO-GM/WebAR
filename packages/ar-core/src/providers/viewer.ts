import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARAnchor } from '../anchor';
import type { ARContext, ARProvider, ARProviderHooks } from '../types';

export interface ViewerOptions {
  /** Color de fondo. Por defecto, gris muy oscuro. */
  background?: THREE.ColorRepresentation;
}

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
  private previousBackground: THREE.Scene['background'] = null;
  private readonly anchors = new Set<ARAnchor>();
  private pointerStart?: { x: number; y: number };
  private nextId = 0;

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
    this.controls = new OrbitControls(ctx.camera, ctx.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    // Un toque sin arrastrar cuenta como «select», igual que en RA.
    ctx.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    ctx.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
  }

  update(): void {
    this.controls?.update();
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
    this.controls.minDistance = 0.02;
    this.controls.maxDistance = position.distanceTo(target) * 4;
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
    this.controls.minDistance = radius * 0.3;
    this.controls.maxDistance = distance * 6;
  }

  async stop(): Promise<void> {
    if (!this.ctx) return;
    for (const anchor of [...this.anchors]) anchor.dispose();
    this.controls?.dispose();
    this.ctx.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.ctx.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.ctx.scene.background = this.previousBackground;
    this.controls = this.ctx = undefined;
    const hooks = this.hooks;
    this.hooks = undefined;
    hooks?.ended();
  }

  private readonly onPointerDown = (e: PointerEvent) => (this.pointerStart = { x: e.clientX, y: e.clientY });
  private readonly onPointerUp = (e: PointerEvent) => {
    if (this.pointerStart && Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) < 6) this.hooks?.select();
    this.pointerStart = undefined;
  };
}
