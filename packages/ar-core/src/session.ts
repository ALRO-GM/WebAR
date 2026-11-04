import * as THREE from 'three';
import { Emitter } from './emitter';
import type { ARProvider, ARSessionEvents } from './types';

export interface ARSessionOptions {
  /** El proveedor por defecto; `start(otro)` puede cambiarlo en cada sesión. */
  provider: ARProvider;
  /** Capa HTML (botones, avisos) que se verá encima de la cámara. */
  overlay: HTMLElement;
  /** Dónde poner el lienzo cuando el proveedor no es WebXR. Por defecto, `body`. */
  container?: HTMLElement;
}

/**
 * Una sesión de realidad aumentada: renderizador three.js, escena, cámara y
 * bucle, con el proveedor de seguimiento que se le pase.
 *
 * ```ts
 * const ar = new ARSession({ provider: new WebXRWorldProvider(), overlay })
 * ar.on('select', async () => (await provider.placeAnchor())?.object.add(malla))
 * boton.onclick = () => ar.start()
 * ```
 */
export class ARSession extends Emitter<ARSessionEvents> {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
  readonly renderer: THREE.WebGLRenderer;
  private _provider: ARProvider;

  private readonly overlay: HTMLElement;
  private readonly container: HTMLElement;
  private readonly timer = new THREE.Timer();
  private _running = false;

  constructor(options: ARSessionOptions) {
    super();
    this._provider = options.provider;
    this.overlay = options.overlay;
    this.container = options.container ?? document.body;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.classList.add('ar-canvas');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'none' });
    this.container.append(canvas);
    window.addEventListener('resize', this.resize);
  }

  /** El proveedor de la sesión en marcha (o de la próxima). */
  get provider(): ARProvider {
    return this._provider;
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Arranca la sesión con `provider` (o el de siempre). Llamar desde un gesto
   * del usuario: WebXR y la cámara lo exigen.
   */
  async start(provider: ARProvider = this._provider): Promise<void> {
    if (this._running) return;
    this._provider = provider;
    await provider.start(
      { renderer: this.renderer, scene: this.scene, camera: this.camera, overlay: this.overlay },
      { select: () => this.emit('select', undefined), ended: this.handleEnded },
    );
    this._running = true;
    if (!this.renderer.xr.isPresenting) this.renderer.domElement.style.display = 'block';
    this.resize();
    this.timer.reset();
    this.renderer.setAnimationLoop((time, xrFrame) => {
      this.timer.update(time);
      this._provider.update(time, xrFrame);
      this.emit('frame', { time, dt: Math.min(this.timer.getDelta(), 0.1) });
      this.renderer.render(this.scene, this.camera);
    });
    this.emit('start', undefined);
  }

  /** Termina la sesión. Se avisa con el evento `end`. */
  async end(): Promise<void> {
    if (this._running) await this._provider.stop();
  }

  private readonly handleEnded = (): void => {
    if (!this._running) return;
    this._running = false;
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.style.display = 'none';
    this.emit('end', undefined);
  };

  private readonly resize = (): void => {
    if (this.renderer.xr.isPresenting) return; // WebXR fija el tamaño solo.
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
