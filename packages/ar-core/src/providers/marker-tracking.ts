import * as THREE from 'three';
import { ARAnchor } from '../anchor';
import { Emitter } from '../emitter';
import { IdentityGate, type DetectionStatus, type IdentityGateOptions } from '../gate';
import { OneEuroQuaternion, OneEuroVector, type OneEuroOptions } from '../one-euro';
import { alignCoplanar, markerPose, type PinholeCamera } from '../pose';
import type { ARContext, ARProvider, ARProviderHooks } from '../types';
import { THRESHOLD_PROFILES, createDetector, detectMarkers, profileFor, type DetectedMarker, type Threshold } from '../detection';
import type { ArucoDetector } from '../vendor/js-aruco2/index.js';

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
  /**
   * Bits erróneos (de 36) que se toleran al leer un código. El detector, de
   * serie, aceptaba hasta 11 y se inventaba tarjetas. 3 deja margen a las
   * tarjetas dibujadas a mano; la confirmación en varios fotogramas evita los
   * fantasmas.
   */
  maxBitErrors?: number;
  /** Confirmación de tarjetas nuevas y bloqueo de identidad (ver `gate.ts`). */
  identity?: IdentityGateOptions;
  /** Qué ids aceptar (los demás se ignoran). */
  accept?: (id: number) => boolean;
  /** Cámara trasera (por defecto) o frontal; la frontal se ve en espejo, como un selfi. */
  facing?: 'environment' | 'user';
}

/**
 * Todo lo que decide cómo se lee y se sigue una tarjeta, para ajustarlo en
 * el propio móvil (Ajustes → «Ajuste fino de la RA») viendo el resultado.
 */
export interface MarkerTuning {
  /** Qué umbral usar: los dos alternos (lo normal), o siempre uno. */
  umbral: 'alternar' | 'papel' | 'movimiento';
  /** Umbral «papel»: cuánto más oscuro que su entorno ha de ser un píxel (0–0,4) y ventana (1–10). */
  papelRelativo: number;
  papelVentana: number;
  /** Umbral «movimiento». */
  movimientoRelativo: number;
  movimientoVentana: number;
  /** Bits erróneos tolerados al leer el código (0–6). Más = más alcance, más riesgo de confundir. */
  bitsErroneos: number;
  /** Ancho de la imagen que se analiza (320–1280). Más = más lejos, más lento. */
  anchoDeteccion: number;
  /** Campo de visión del lado largo de la cámara (grados): cuadra el tamaño de lo virtual con lo real. */
  campoVision: number;
  /** Fotogramas para dar por buena una tarjeta nueva (1–5). */
  confirmar: number;
  /** Ms que una tarjeta conocida guarda su sitio y su identidad. */
  reservar: number;
  /** Ms sin verla hasta darla por perdida (700: margen para un par de fotogramas borrosos). */
  perder: number;
  /** Filtro 1 € de la posición: corte en reposo (Hz) y cuánto se relaja al moverse. */
  posicionCorte: number;
  posicionBeta: number;
  /** Filtro 1 € del giro. */
  giroCorte: number;
  giroBeta: number;
  /** Las tarjetas comparten la inclinación de la mesa. */
  mismaMesa: boolean;
}

export const DEFAULT_TUNING: MarkerTuning = {
  umbral: 'alternar',
  papelRelativo: THRESHOLD_PROFILES.papel.relativeThreshold,
  papelVentana: THRESHOLD_PROFILES.papel.thresholdKernel,
  movimientoRelativo: THRESHOLD_PROFILES.movimiento.relativeThreshold,
  movimientoVentana: THRESHOLD_PROFILES.movimiento.thresholdKernel,
  bitsErroneos: 3,
  anchoDeteccion: 640,
  campoVision: 65,
  confirmar: 3,
  reservar: 1000,
  perder: 700,
  posicionCorte: 1.2,
  posicionBeta: 60,
  giroCorte: 1,
  giroBeta: 4,
  mismaMesa: false,
};

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

// Menos suavizado que al principio: la tarjeta virtual seguía a la real con retraso al moverla.
const POSITION_FILTER: OneEuroOptions = { minCutoff: 1.2, beta: 60, dCutoff: 1 };
const ROTATION_FILTER: OneEuroOptions = { minCutoff: 1, beta: 4, dCutoff: 0.5 };

/** Colores del modo diagnóstico. */
const DEBUG_COLORS: Record<DetectionStatus | 'desconocida', string> = {
  aceptada: '#2ee66b', // se sigue
  pendiente: '#ffd166', // confirmándose (vista menos de 3 fotogramas)
  ocupado: '#ff4d5a', // otro número donde ya hay una tarjeta
  repetida: '#ff4d5a', // el mismo número en dos sitios
  solapada: '#ff9f43', // dos lecturas del mismo marcador
  desconocida: '#9aa3b2', // un código que no es de ninguna tarjeta
};

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
  /** Hay un fotograma de cámara sin analizar (se pinta a 60 fps, pero la cámara da 30). */
  private freshFrame = true;
  private frameCallback?: number;
  private gate: IdentityGate;
  /** Para el ajuste fino: fotogramas analizados y tarjetas que se siguen ahora. */
  readonly stats = { analyzed: 0 };
  get trackedCount(): number {
    let n = 0;
    for (const t of this.tracked.values()) if (t.anchor.tracking) n++;
    return n;
  }
  /** Los valores en uso (ver `tune`). Los filtros leen estos objetos en cada fotograma. */
  readonly tuning: MarkerTuning;
  private readonly positionFilter: OneEuroOptions;
  private readonly rotationFilter: OneEuroOptions;
  /** Lienzo del modo diagnóstico (lo que lee el detector, dibujado sobre la cámara). */
  private debugCanvas?: HTMLCanvasElement;
  private debugEnabled = false;
  /**
   * La detección en otro hilo (detect-worker.ts): si no hay Worker,
   * OffscreenCanvas o createImageBitmap, se detecta aquí como antes.
   */
  private worker?: Worker;
  private workerBusy = false;
  private workerFrame = 0;
  private workerResult?: { markers: DetectedMarker[]; time: number };
  private workerSent = new Map<number, number>();

  constructor(private readonly options: MarkerTrackingOptions) {
    super();
    this.offset = UPRIGHT.clone().multiply(options.anchorOffset ?? new THREE.Matrix4());
    this.gate = new IdentityGate(options.identity);
    const position = options.filter?.position ?? POSITION_FILTER;
    const rotation = options.filter?.rotation ?? ROTATION_FILTER;
    this.positionFilter = { ...position };
    this.rotationFilter = { ...rotation };
    this.tuning = {
      ...DEFAULT_TUNING,
      bitsErroneos: options.maxBitErrors ?? DEFAULT_TUNING.bitsErroneos,
      anchoDeteccion: options.detectWidth ?? DEFAULT_TUNING.anchoDeteccion,
      campoVision: options.fovLongSide ?? DEFAULT_TUNING.campoVision,
      confirmar: options.identity?.confirmFrames ?? DEFAULT_TUNING.confirmar,
      reservar: options.identity?.hold ?? DEFAULT_TUNING.reservar,
      perder: options.lostAfter ?? DEFAULT_TUNING.perder,
      posicionCorte: position.minCutoff,
      posicionBeta: position.beta,
      giroCorte: rotation.minCutoff,
      giroBeta: rotation.beta,
      mismaMesa: options.coplanar ?? false,
    };
  }

  /**
   * Cambia valores en marcha: se notan en el siguiente fotograma (los filtros,
   * el umbral, la confirmación…); el ancho y el campo de visión recolocan la
   * cámara virtual.
   */
  tune(patch: Partial<MarkerTuning>): void {
    const camera = patch.anchoDeteccion !== undefined || patch.campoVision !== undefined;
    Object.assign(this.tuning, patch);
    const t = this.tuning;
    Object.assign(this.positionFilter, { minCutoff: t.posicionCorte, beta: t.posicionBeta });
    Object.assign(this.rotationFilter, { minCutoff: t.giroCorte, beta: t.giroBeta });
    this.gate.configure({ confirmFrames: t.confirmar, hold: t.reservar });
    if (camera) delete this.canvas.dataset.size; // se recalcula en el siguiente update
  }

  /** El umbral del fotograma `frame` según el ajuste. */
  private thresholdFor(frame: number): Threshold {
    const t = this.tuning;
    const profile = t.umbral === 'alternar' ? profileFor(frame) : t.umbral;
    return profile === 'papel'
      ? { relativeThreshold: t.papelRelativo, thresholdKernel: Math.round(t.papelVentana) }
      : { relativeThreshold: t.movimientoRelativo, thresholdKernel: Math.round(t.movimientoVentana) };
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
    this.detector = createDetector(this.tuning.bitsErroneos);
    this.startWorker();
    this.gate.reset();
    this.watchFrames();

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
    const lostAfter = this.tuning.perder;
    // Lo que haya terminado el worker se aplica en cuanto llega, haya fotograma nuevo o no.
    if (this.workerResult) {
      const { markers, time: at } = this.workerResult;
      this.workerResult = undefined;
      this.process(markers, at);
    }
    // Mismo fotograma que la vez anterior: analizarlo otra vez solo gasta batería.
    if (!this.freshFrame) return this.markLost(time, lostAfter);
    if (this.frameCallback !== undefined) this.freshFrame = false;

    if (this.worker) return this.updateWithWorker(time, lostAfter);
    const { width, height } = this.canvas;
    this.g.drawImage(this.video, 0, 0, width, height);
    const frame = ++this.workerFrame;
    this.process(detectMarkers(this.detector, this.g.getImageData(0, 0, width, height), this.thresholdFor(frame), Math.round(this.tuning.bitsErroneos)), time);
    this.markLost(time, lostAfter);
  }

  private startWorker(): void {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./detect-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return;
    }
    this.worker.onmessage = (e: MessageEvent<{ frame: number; markers: DetectedMarker[] }>) => {
      this.workerBusy = false;
      const time = this.workerSent.get(e.data.frame);
      this.workerSent.delete(e.data.frame);
      if (time !== undefined) this.workerResult = { markers: e.data.markers, time };
    };
    // Si el worker falla (navegador raro), se vuelve a detectar en el hilo principal.
    this.worker.onerror = () => {
      this.worker?.terminate();
      this.worker = undefined;
      this.workerBusy = false;
    };
  }

  /**
   * Con worker: se le manda el fotograma nuevo si está libre (si no, se salta:
   * mejor ir un fotograma por detrás que acumular cola) y se aplica el último
   * resultado que haya llegado, con la hora del fotograma que analizó.
   */
  private updateWithWorker(time: number, lostAfter: number): void {
    if (!this.workerBusy && this.video) {
      this.workerBusy = true;
      const frame = ++this.workerFrame;
      this.workerSent.set(frame, time);
      const worker = this.worker!;
      createImageBitmap(this.video, { resizeWidth: this.canvas.width, resizeHeight: this.canvas.height, resizeQuality: 'medium' })
        .then((bitmap) => worker.postMessage({ frame, bitmap, threshold: this.thresholdFor(frame), maxBitErrors: Math.round(this.tuning.bitsErroneos) }, [bitmap]))
        .catch(() => {
          this.workerBusy = false;
          this.workerSent.delete(frame);
        });
    } else if (this.frameCallback !== undefined) this.freshFrame = true; // ocupado: este fotograma no se ha analizado
    this.markLost(time, lostAfter);
  }

  /** Identidades, poses y anclas a partir de lo detectado en un fotograma. */
  private process(raw: DetectedMarker[], time: number): void {
    this.stats.analyzed++;
    const lostAfter = this.tuning.perder;
    const known = raw.filter((m) => !this.options.accept || this.options.accept(m.id));
    const markers = this.gate.filter(known, time);
    if (this.debugEnabled) this.drawDebug([...this.gate.last, ...raw.filter((m) => !known.includes(m)).map((detection) => ({ detection, status: 'desconocida' as const }))]);

    const seen: { id: number; pose: THREE.Matrix4; weight: number }[] = [];
    for (const marker of markers) {
      const corners = marker.refined;
      const previous = this.tracked.get(marker.id);
      const hint = previous && time - previous.lastSeen < lostAfter ? previous.raw : undefined;
      const pose = markerPose(corners, this.options.markerSize, this.pinhole, new THREE.Matrix4(), hint);
      if (!pose) continue;
      seen.push({ id: marker.id, pose, weight: area(corners) });
    }
    if (this.tuning.mismaMesa) alignCoplanar(seen.map((s) => s.pose), seen.map((s) => s.weight));
    for (const { id, pose } of seen) this.updateTracked(id, pose, time);
  }

  private markLost(time: number, lostAfter: number): void {
    for (const t of this.tracked.values()) if (time - t.lastSeen > lostAfter) t.anchor.setTracking(false);
  }

  /**
   * Modo diagnóstico: dibuja sobre la cámara cada marcador leído, con su
   * número y un color según lo que se hizo con él (ver `DEBUG_COLORS`).
   */
  set debug(on: boolean) {
    this.debugEnabled = on;
    if (!on) {
      this.debugCanvas?.remove();
      this.debugCanvas = undefined;
    }
  }
  get debug(): boolean {
    return this.debugEnabled;
  }

  private drawDebug(items: Array<{ detection: { id: number; corners: { x: number; y: number }[] }; status: DetectionStatus | 'desconocida' }>): void {
    if (!this.ctx) return;
    if (!this.debugCanvas) {
      this.debugCanvas = document.createElement('canvas');
      this.debugCanvas.className = 'ar-diagnostico';
      Object.assign(this.debugCanvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
      this.ctx.renderer.domElement.after(this.debugCanvas);
    }
    const canvas = this.debugCanvas;
    const { width: sw, height: sh } = this.screen;
    if (canvas.width !== sw || canvas.height !== sh) [canvas.width, canvas.height] = [sw, sh];
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, sw, sh);
    // Del lienzo de detección a la pantalla: el vídeo se ve recortado para cubrirla (y en espejo con la frontal).
    const { width: vw, height: vh } = this.sourceSize();
    const toVideo = vw / this.canvas.width;
    const cover = Math.max(sw / vw, sh / vh);
    const ox = (sw - vw * cover) / 2;
    const oy = (sh - vh * cover) / 2;
    const mirror = this.facing === 'user';
    const map = (p: { x: number; y: number }) => {
      const x = ox + p.x * toVideo * cover;
      return { x: mirror ? sw - x : x, y: oy + p.y * toVideo * cover };
    };
    g.lineWidth = 3;
    g.font = 'bold 16px system-ui, sans-serif';
    for (const { detection, status } of items) {
      const pts = detection.corners.map(map);
      g.strokeStyle = g.fillStyle = DEBUG_COLORS[status];
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.stroke();
      g.fillText(`#${detection.id}`, pts[0].x, pts[0].y - 6);
    }
  }

  /** Avisa de cada fotograma nuevo de la cámara (si el navegador sabe; si no, se analiza siempre). */
  private watchFrames(): void {
    const video = this.video;
    if (!(video instanceof HTMLVideoElement) || !('requestVideoFrameCallback' in video)) return;
    const next = () => {
      this.freshFrame = true;
      if (this.video === video) this.frameCallback = video.requestVideoFrameCallback(next);
    };
    this.frameCallback = video.requestVideoFrameCallback(next);
  }

  async stop(): Promise<void> {
    if (!this.ctx) return;
    const video = this.video;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video?.remove();
    this.ctx.renderer.domElement.removeEventListener('click', this.onClick);
    this.ctx.camera.clearViewOffset();
    for (const t of this.tracked.values()) t.anchor.dispose();
    this.tracked.clear();
    this.debugCanvas?.remove();
    this.debugCanvas = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.workerBusy = false;
    this.workerResult = undefined;
    this.workerSent.clear();
    this.ctx = this.video = this.stream = this.detector = undefined;
    if (this.frameCallback !== undefined && video instanceof HTMLVideoElement) video.cancelVideoFrameCallback(this.frameCallback);
    this.frameCallback = undefined;
    this.freshFrame = true;
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
        position: new OneEuroVector(this.positionFilter),
        rotation: new OneEuroQuaternion(this.rotationFilter),
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
    const fov = THREE.MathUtils.degToRad(this.tuning.campoVision);
    const focal = Math.max(vw, vh) / 2 / Math.tan(fov / 2);

    const detectWidth = Math.min(Math.round(this.tuning.anchoDeteccion), vw);
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
