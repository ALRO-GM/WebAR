import * as THREE from 'three';
import { ARAnchor } from '../anchor';
import { withTimeout } from '../capabilities';
import type { ARContext, ARProvider, ARProviderHooks } from '../types';

export interface WebXRWorldOptions {
  /**
   * El indicador que marca dónde se colocará el siguiente objeto. `true` (por
   * defecto) usa un anillo; `false` no pinta nada; o pasa tu propio Object3D.
   */
  reticle?: boolean | THREE.Object3D;
}

interface TrackedAnchor {
  anchor: ARAnchor;
  /** El ancla del sistema, si el navegador las soporta (`anchors`). */
  xr?: XRAnchor;
}

/**
 * Seguimiento del mundo con WebXR (`immersive-ar` + `hit-test`): detecta
 * superficies y deja anclas fijas en ellas. Funciona en Android con Chrome
 * (ARCore) y en visores XR; no en Safari de iPhone.
 *
 * Si el navegador soporta `anchors`, cada ancla la sigue el sistema operativo y
 * se corrige sola al entender mejor la habitación. Si no, se queda en la pose
 * del momento en que se colocó.
 */
export class WebXRWorldProvider implements ARProvider {
  readonly id = 'webxr-world';
  readonly capabilities = ['world'] as const;

  /** Pose de la superficie bajo el centro de la pantalla en el último frame. */
  readonly hitMatrix = new THREE.Matrix4();
  private _hasHit = false;

  private ctx?: ARContext;
  private session?: XRSession;
  private hitTestSource?: XRHitTestSource;
  private reticle?: THREE.Object3D;
  private readonly anchors = new Set<TrackedAnchor>();
  private pending: Array<(anchor: ARAnchor | null) => void> = [];
  private nextId = 0;

  constructor(private readonly options: WebXRWorldOptions = {}) {}

  /** Si en el último frame hay una superficie donde colocar. */
  get hasHit(): boolean {
    return this._hasHit;
  }

  async isSupported(): Promise<boolean> {
    if (!window.isSecureContext || !navigator.xr) return false;
    return withTimeout(navigator.xr.isSessionSupported('immersive-ar'));
  }

  async start(ctx: ARContext, hooks: ARProviderHooks): Promise<void> {
    if (!navigator.xr) throw new Error('Este navegador no tiene WebXR.');
    this.ctx = ctx;
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['anchors', 'dom-overlay'],
      domOverlay: { root: ctx.overlay },
    });
    this.session = session;

    ctx.renderer.xr.enabled = true;
    ctx.renderer.xr.setReferenceSpaceType('local');
    await ctx.renderer.xr.setSession(session);

    const viewer = await session.requestReferenceSpace('viewer');
    this.hitTestSource = await session.requestHitTestSource?.({ space: viewer });

    this.reticle = this.makeReticle();
    if (this.reticle) ctx.scene.add(this.reticle);

    // Los toques en botones de la capa HTML no cuentan como «select» en la escena.
    ctx.overlay.addEventListener('beforexrselect', this.onBeforeSelect);
    session.addEventListener('select', () => hooks.select());
    session.addEventListener(
      'end',
      () => {
        this.cleanup();
        hooks.ended();
      },
      { once: true },
    );
  }

  update(_time: number, frame?: XRFrame): void {
    const ref = this.ctx?.renderer.xr.getReferenceSpace();
    if (!frame || !ref) return;

    // 1. La superficie bajo el centro de la pantalla.
    const hit = this.hitTestSource ? frame.getHitTestResults(this.hitTestSource)[0] : undefined;
    const pose = hit?.getPose(ref);
    this._hasHit = !!pose;
    if (pose) this.hitMatrix.fromArray(pose.transform.matrix);
    if (this.reticle) {
      this.reticle.visible = this._hasHit;
      if (pose) this.reticle.matrix.copy(this.hitMatrix);
    }

    // 2. Las anclas pedidas con placeAnchor() se crean aquí, con el frame vivo.
    if (this.pending.length) {
      const waiting = this.pending;
      this.pending = [];
      for (const resolve of waiting) resolve(pose ? this.createAnchor(hit!) : null);
    }

    // 3. Las anclas del sistema pueden moverse al corregir su mapa.
    for (const { anchor, xr } of this.anchors) {
      if (!xr) continue;
      const anchorPose = frame.trackedAnchors?.has(xr) ? frame.getPose(xr.anchorSpace, ref) : undefined;
      if (anchorPose) anchor.setPose(anchorPose.transform.matrix);
      anchor.setTracking(!!anchorPose);
    }
  }

  /**
   * Deja un ancla en la superficie que marca el indicador. Se resuelve en el
   * siguiente frame; `null` si no hay superficie a la vista.
   */
  placeAnchor(): Promise<ARAnchor | null> {
    if (!this.session) return Promise.resolve(null);
    return new Promise((resolve) => this.pending.push(resolve));
  }

  /** Todas las anclas colocadas y aún vivas. */
  getAnchors(): ARAnchor[] {
    return [...this.anchors].map((t) => t.anchor);
  }

  async stop(): Promise<void> {
    await this.session?.end();
  }

  private createAnchor(hit: XRHitTestResult): ARAnchor {
    const tracked: TrackedAnchor = {
      anchor: new ARAnchor(`world-${this.nextId++}`, () => {
        tracked.xr?.delete();
        this.anchors.delete(tracked);
      }),
    };
    tracked.anchor.setPose(this.hitMatrix);
    tracked.anchor.setTracking(true);
    this.ctx!.scene.add(tracked.anchor.object);
    this.anchors.add(tracked);

    // Mientras llega el ancla del sistema se queda en la pose de ahora.
    hit
      .createAnchor?.()
      ?.then((xr) => {
        if (tracked.anchor.disposed) xr.delete();
        else tracked.xr = xr;
      })
      .catch(() => {});
    return tracked.anchor;
  }

  private makeReticle(): THREE.Object3D | undefined {
    const option = this.options.reticle ?? true;
    if (option === false) return undefined;
    const reticle =
      option === true
        ? new THREE.Mesh(
            new THREE.RingGeometry(0.06, 0.075, 40).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
          )
        : option;
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    return reticle;
  }

  private readonly onBeforeSelect = (event: Event): void => {
    const target = event.target as Element | null;
    if (target?.closest('button, a, input, select, textarea, [data-ar-ui]')) event.preventDefault();
  };

  private cleanup(): void {
    for (const { anchor } of [...this.anchors]) anchor.dispose();
    this.pending.forEach((resolve) => resolve(null));
    this.pending = [];
    this.hitTestSource?.cancel();
    this.reticle?.removeFromParent();
    this.ctx?.overlay.removeEventListener('beforexrselect', this.onBeforeSelect);
    this.ctx && (this.ctx.renderer.xr.enabled = false);
    this.session = this.hitTestSource = this.reticle = undefined;
    this._hasHit = false;
  }
}
