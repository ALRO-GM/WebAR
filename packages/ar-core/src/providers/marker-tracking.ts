import * as THREE from 'three';
import { ARAnchor } from '../anchor';
import { Emitter } from '../emitter';
import { MARKER_DICTIONARY } from '../markers';
import { markerPose, type PinholeCamera } from '../pose';
import type { ARContext, ARProvider, ARProviderHooks } from '../types';
import { AR, type ArucoDetector } from '../vendor/js-aruco2/index.js';

export interface MarkerTrackingOptions {
  /** Lado del cuadrado negro del marcador impreso, en metros. */
  markerSize: number;
  /**
   * Del marcador al ancla. Sin él, el ancla es el centro del marcador con la
   * y hacia fuera del papel (lo cómodo para poner cosas «encima»), la x a la
   * derecha y la z hacia el borde inferior.
   */
  anchorOffset?: THREE.Matrix4;
  /** Campo de visión del lado largo de la cámara, en grados (los móviles rondan 60-70). */
  fovLongSide?: number;
  /** Ancho de la imagen en la que se buscan marcadores (más = más lejos, pero más lento). */
  detectWidth?: number;
  /** Milisegundos sin ver un marcador hasta darlo por perdido. */
  lostAfter?: number;
  /** Cuánto se suaviza el temblor: 0 = nada, 0,9 = mucho (más retraso). */
  smoothing?: number;
  /** Qué ids aceptar (los demás se ignoran). */
  accept?: (id: number) => boolean;
  /** Cámara trasera (por defecto) o frontal; la frontal se ve en espejo, como un selfi. */
  facing?: 'environment' | 'user';
}

export interface MarkerTrackingEvents {
  /** Primera vez que se ve un marcador: ya tiene su ancla. */
  marker: { id: number; anchor: ARAnchor };
}

interface Tracked {
  anchor: ARAnchor;
  lastSeen: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
}

/** De la base del marcador (y hacia su borde superior, z fuera del papel) a «y hacia arriba». */
const UPRIGHT = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));

/**
 * Seguimiento de marcadores impresos (ArUco) con la cámara: funciona en
 * cualquier móvil con cámara, también en iPhone, y sigue muchos a la vez.
 *
 * Cada marcador es un ancla; la escena va en el espacio de la cámara (la
 * cámara virtual está quieta en el origen y se mueven las anclas).
 */
export class MarkerTrackingProvider extends Emitter<MarkerTrackingEvents> implements ARProvider {
  readonly id = 'marker-tracking';
  readonly capabilities = ['image'] as const;

  private ctx?: ARContext;
  private hooks?: ARProviderHooks;
  private video?: HTMLVideoElement | HTMLImageElement;
  private imageUrl?: string;
  private stream?: MediaStream;
  private detector?: ArucoDetector;
  private readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private pinhole: PinholeCamera = { focal: 1, cx: 0, cy: 0 };
  private readonly tracked = new Map<number, Tracked>();
  private readonly matrix = new THREE.Matrix4();
  private readonly offset: THREE.Matrix4;
  private readonly tmp = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  private screen = { width: 1, height: 1 };

  constructor(private readonly options: MarkerTrackingOptions) {
    super();
    this.offset = UPRIGHT.clone().multiply(options.anchorOffset ?? new THREE.Matrix4());
  }

  async isSupported(): Promise<boolean> {
    return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Usa una imagen fija en vez de la cámara en la próxima sesión: para pruebas
   * automáticas y demos sin cámara.
   */
  useImage(url: string): void {
    this.imageUrl = url;
  }

  /** La cámara de la próxima sesión (o de la actual, al reiniciarla). */
  set facing(value: 'environment' | 'user') {
    this.options.facing = value;
  }
  get facing(): 'environment' | 'user' {
    return this.options.facing ?? 'environment';
  }

  /** El vídeo (o la imagen) que se ve de fondo: para hacer fotos con lo de encima. */
  get source(): HTMLVideoElement | HTMLImageElement | undefined {
    return this.video;
  }

  /** El ancla de un marcador, si ya se ha visto alguna vez. */
  getAnchor(id: number): ARAnchor | undefined {
    return this.tracked.get(id)?.anchor;
  }

  async start(ctx: ARContext, hooks: ARProviderHooks): Promise<void> {
    const video = this.imageUrl ? await this.openImage(this.imageUrl) : await this.openCamera();
    video.classList.add('ar-video');
    Object.assign(video.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', objectFit: 'cover', transform: this.facing === 'user' ? 'scaleX(-1)' : '' });
    ctx.renderer.domElement.before(video);
    this.video = video;
    this.ctx = ctx;
    this.hooks = hooks;
    this.detector = new AR.Detector({ dictionaryName: MARKER_DICTIONARY });

    ctx.camera.position.set(0, 0, 0);
    ctx.camera.quaternion.identity();
    ctx.camera.near = 0.01;
    ctx.camera.far = 20;
    ctx.renderer.domElement.addEventListener('click', this.onClick);
    this.stream?.getVideoTracks()[0]?.addEventListener('ended', () => void this.stop());
  }

  private async openCamera(): Promise<HTMLVideoElement> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    await video.play();
    if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
    return video;
  }

  private async openImage(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }

  /** Tamaño de la fuente (vídeo o imagen) y si ya tiene imagen. */
  private sourceSize(): { width: number; height: number; ready: boolean } {
    const v = this.video;
    if (!v) return { width: 0, height: 0, ready: false };
    if (v instanceof HTMLVideoElement) return { width: v.videoWidth, height: v.videoHeight, ready: v.readyState >= 2 };
    return { width: v.naturalWidth, height: v.naturalHeight, ready: v.complete && v.naturalWidth > 0 };
  }

  resize(width: number, height: number): boolean {
    this.screen = { width, height };
    this.configureCamera();
    return true;
  }

  update(time: number): void {
    const source = this.sourceSize();
    if (!this.video || !this.detector || !source.ready) return;
    if (this.canvas.dataset.size !== `${source.width}x${source.height}`) this.configureCamera();

    const { width, height } = this.canvas;
    this.g.drawImage(this.video, 0, 0, width, height);
    const markers = this.detector.detect(this.g.getImageData(0, 0, width, height));

    for (const marker of markers) {
      if (this.options.accept && !this.options.accept(marker.id)) continue;
      const pose = markerPose(marker.corners, this.options.markerSize, this.pinhole, this.matrix);
      if (!pose) continue;
      pose.multiply(this.offset);
      this.updateTracked(marker.id, pose, time);
    }
    const lostAfter = this.options.lostAfter ?? 400;
    for (const t of this.tracked.values()) if (time - t.lastSeen > lostAfter) t.anchor.setTracking(false);
  }

  async stop(): Promise<void> {
    if (!this.ctx) return;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video?.remove();
    this.ctx.renderer.domElement.removeEventListener('click', this.onClick);
    this.ctx.camera.clearViewOffset();
    for (const t of this.tracked.values()) t.anchor.dispose();
    this.tracked.clear();
    this.ctx = this.video = this.stream = this.detector = undefined;
    const hooks = this.hooks;
    this.hooks = undefined;
    hooks?.ended();
  }

  private updateTracked(id: number, pose: THREE.Matrix4, time: number): void {
    const { p, q, s } = this.tmp;
    pose.decompose(p, q, s);
    let t = this.tracked.get(id);
    if (!t) {
      const anchor = new ARAnchor(`marker-${id}`, () => this.tracked.delete(id));
      this.ctx!.scene.add(anchor.object);
      t = { anchor, lastSeen: time, position: p.clone(), rotation: q.clone() };
      this.tracked.set(id, t);
      this.emit('marker', { id, anchor });
    } else {
      // Filtro adaptativo: quieto → suaviza el temblor; rápido → sigue sin retraso.
      const smoothing = this.options.smoothing ?? 0.6;
      const reacquired = !t.anchor.tracking;
      const move = t.position.distanceTo(p) / 0.01 + t.rotation.angleTo(q) / 0.15;
      const alpha = reacquired ? 1 : Math.min(1, 1 - smoothing + move * 0.5);
      t.position.lerp(p, alpha);
      t.rotation.slerp(q, alpha);
    }
    t.lastSeen = time;
    t.anchor.setPose(this.matrix.compose(t.position, t.rotation, s.set(1, 1, 1)));
    t.anchor.setTracking(true);
  }

  /** Cuadra la cámara virtual con el vídeo tal y como se ve (recortado para cubrir la pantalla). */
  private configureCamera(): void {
    const camera = this.ctx?.camera;
    const { width: vw, height: vh } = this.sourceSize();
    if (!camera || !vw) return;
    const fov = THREE.MathUtils.degToRad(this.options.fovLongSide ?? 65);
    const focal = Math.max(vw, vh) / 2 / Math.tan(fov / 2);

    const detectWidth = Math.min(this.options.detectWidth ?? 640, vw);
    const scale = detectWidth / vw;
    this.canvas.width = Math.round(vw * scale);
    this.canvas.height = Math.round(vh * scale);
    this.canvas.dataset.size = `${vw}x${vh}`;
    this.pinhole = { focal: focal * scale, cx: this.canvas.width / 2, cy: this.canvas.height / 2 };

    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(vh / 2 / focal));
    camera.aspect = vw / vh;
    const cover = Math.max(this.screen.width / vw, this.screen.height / vh);
    const viewW = this.screen.width / cover;
    const viewH = this.screen.height / cover;
    camera.setViewOffset(vw, vh, (vw - viewW) / 2, (vh - viewH) / 2, viewW, viewH);
    camera.updateProjectionMatrix();
  }

  private readonly onClick = (): void => this.hooks?.select();
}
