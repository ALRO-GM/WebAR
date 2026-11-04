import * as THREE from 'three';
import { ARAnchor } from '../anchor';
import { Emitter } from '../emitter';
import { MARKER_DICTIONARY } from '../markers';
import { OneEuroQuaternion, OneEuroVector, type OneEuroOptions } from '../one-euro';
import { alignCoplanar, markerPose, type PinholeCamera } from '../pose';
import { refineCorners } from '../refine';
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
  /**
   * Filtro «1 €» del temblor (ver `one-euro.ts`): posición en metros y giro
   * en radianes. Por defecto, quieto apenas tiembla y al moverlo no se queda atrás.
   */
  filter?: { position?: OneEuroOptions; rotation?: OneEuroOptions };
  /**
   * Los marcadores están sobre la misma superficie (tarjetas en una mesa):
   * comparten la inclinación, que así tiembla mucho menos.
   */
  coplanar?: boolean;
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
  /** La última pose medida, sin filtrar: pista para la siguiente. */
  raw: THREE.Matrix4;
  position: OneEuroVector;
  rotation: OneEuroQuaternion;
}

const POSITION_FILTER: OneEuroOptions = { minCutoff: 0.5, beta: 30, dCutoff: 0.5 };
const ROTATION_FILTER: OneEuroOptions = { minCutoff: 0.5, beta: 2, dCutoff: 0.3 };

/** Área en píxeles del cuadrilátero (fórmula del zapatero): cuánto pesa su medida. */
function area(c: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
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
  /** Último fotograma de vídeo analizado: se pinta a 60 fps, pero la cámara da 30. */
  private lastFrame = -1;

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
    const lostAfter = this.options.lostAfter ?? 400;
    if (this.video instanceof HTMLVideoElement) {
      // Mismo fotograma que la vez anterior: analizarlo otra vez solo gasta batería.
      if (this.video.currentTime === this.lastFrame) return this.markLost(time, lostAfter);
      this.lastFrame = this.video.currentTime;
    }

    const { width, height } = this.canvas;
    this.g.drawImage(this.video, 0, 0, width, height);
    const markers = this.detector.detect(this.g.getImageData(0, 0, width, height));

    const seen: { id: number; pose: THREE.Matrix4; weight: number }[] = [];
    for (const marker of markers) {
      if (this.options.accept && !this.options.accept(marker.id)) continue;
      // El detector da esquinas en píxeles enteros: afinarlas quita la mayor parte del temblor.
      const corners = this.detector.grey ? refineCorners(this.detector.grey, marker.corners) : marker.corners;
      const previous = this.tracked.get(marker.id);
      const hint = previous && time - previous.lastSeen < lostAfter ? previous.raw : undefined;
      const pose = markerPose(corners, this.options.markerSize, this.pinhole, new THREE.Matrix4(), hint);
      if (!pose) continue;
      seen.push({ id: marker.id, pose, weight: area(corners) });
    }
    if (this.options.coplanar) alignCoplanar(seen.map((s) => s.pose), seen.map((s) => s.weight));
    for (const { id, pose } of seen) this.updateTracked(id, pose, time);
    this.markLost(time, lostAfter);
  }

  private markLost(time: number, lostAfter: number): void {
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
    this.lastFrame = -1;
    const hooks = this.hooks;
    this.hooks = undefined;
    hooks?.ended();
  }

  /** `pose` es la del marcador (sin `offset`), recién medida. */
  private updateTracked(id: number, pose: THREE.Matrix4, time: number): void {
    const { p, q, s } = this.tmp;
    // Se filtra la pose del ancla (no la del marcador): lo que se ve encima es lo que no debe temblar.
    this.matrix.copy(pose).multiply(this.offset).decompose(p, q, s);
    let t = this.tracked.get(id);
    if (!t) {
      const anchor = new ARAnchor(`marker-${id}`, () => this.tracked.delete(id));
      this.ctx!.scene.add(anchor.object);
      t = {
        anchor,
        lastSeen: time,
        raw: new THREE.Matrix4(),
        position: new OneEuroVector(this.options.filter?.position ?? POSITION_FILTER),
        rotation: new OneEuroQuaternion(this.options.filter?.rotation ?? ROTATION_FILTER),
      };
      this.tracked.set(id, t);
      this.emit('marker', { id, anchor });
    }
    if (!t.anchor.tracking) {
      // Vuelve a verse: salta a donde está, sin arrastrarse desde la pose vieja.
      t.position.reset(p);
      t.rotation.reset(q);
    }
    const dt = (time - t.lastSeen) / 1000;
    const position = t.position.filter(p, dt);
    const rotation = t.rotation.filter(q, dt);
    t.raw.copy(pose);
    t.lastSeen = time;
    t.anchor.setPose(this.matrix.compose(position, rotation, s.set(1, 1, 1)));
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
