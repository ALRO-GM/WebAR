import { t } from '../i18n';

/** Lo que se ve en el móvil en este momento. */
export interface FrameSources {
  /** El lienzo WebGL (three.js). Sin él se emite la imagen de espera. */
  gl?: HTMLCanvasElement | null;
  /** La cámara (MarkerTrackingProvider.source), si se ve detrás del lienzo. */
  video?: HTMLVideoElement | HTMLImageElement | null;
  /** La cámara va en espejo (la frontal). */
  mirror?: boolean;
  /** RA del mundo (WebXR): la imagen de la cámara no es accesible; solo la capa 3D. */
  world?: boolean;
}

export interface CastDeps {
  /** Devuelve lo que se ve: el lienzo WebGL y el vídeo de la cámara si lo hay (y si va en espejo). */
  frameSources(): FrameSources | null;
  /** Pinta la escena ya: se llama justo antes de copiar el lienzo WebGL (que no conserva la imagen). */
  renderNow(): void;
  /**
   * Opcional y mejor: avisar justo DESPUÉS de cada pintado (p. ej. tras
   * `renderer.render` en el bucle de la sesión). Así no se pinta dos veces.
   * Devuelve la función para dejar de avisar.
   */
  onFrame?(callback: () => void): () => void;
}

export type CastMode = 'camara' | 'mundo' | 'app';

const MAX_SIDE = 1280;
const DARK = '#131a20';

/**
 * Compone cada frame en un lienzo 2D: la cámara recortada como
 * `object-fit: cover` (en espejo si toca) y encima el lienzo WebGL, con el
 * mismo encuadre que se ve en el móvil. De este lienzo sale el vídeo
 * (captureStream) y las imágenes del relevo.
 */
export class Compositor {
  readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private logo = new Image();
  mode: CastMode = 'app';

  constructor() {
    this.canvas.width = MAX_SIDE;
    this.canvas.height = 720;
    this.g = this.canvas.getContext('2d', { alpha: false })!;
    this.logo.src = '/icons/icon.svg';
  }

  /** Pone el tamaño de salida con el encuadre de la pantalla del móvil (lado largo ≤ 1280). */
  private fit(width: number, height: number): void {
    if (!width || !height) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    // Pares: los codificadores de vídeo los prefieren.
    const w = Math.max(2, Math.round((width * scale) / 2) * 2);
    const h = Math.max(2, Math.round((height * scale) / 2) * 2);
    if (this.canvas.width !== w || this.canvas.height !== h) Object.assign(this.canvas, { width: w, height: h });
  }

  /** Compone un frame con lo que hay. `gl` ya debe estar recién pintado. */
  draw(sources: FrameSources | null): CastMode {
    const g = this.g;
    const gl = sources?.gl && sources.gl.width > 0 ? sources.gl : null;
    const video = sources?.video ?? null;
    if (!gl && !video) {
      this.placeholder();
      return (this.mode = 'app');
    }
    // El encuadre es el de lo que se ve en pantalla (el lienzo ocupa la ventana).
    const box = gl?.getBoundingClientRect();
    const width = box?.width || gl?.width || window.innerWidth;
    const height = box?.height || gl?.height || window.innerHeight;
    this.fit(width, height);
    const { width: W, height: H } = this.canvas;

    g.fillStyle = sources?.world || !video ? this.background() : '#000';
    g.fillRect(0, 0, W, H);
    if (video && !sources?.world) {
      const vw = video instanceof HTMLVideoElement ? video.videoWidth : video.naturalWidth;
      const vh = video instanceof HTMLVideoElement ? video.videoHeight : video.naturalHeight;
      if (vw && vh) {
        const scale = Math.max(W / vw, H / vh);
        const sw = W / scale;
        const sh = H / scale;
        g.save();
        if (sources?.mirror) {
          g.translate(W, 0);
          g.scale(-1, 1);
        }
        g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
        g.restore();
      }
    }
    if (gl) g.drawImage(gl, 0, 0, W, H);
    return (this.mode = sources?.world ? 'mundo' : video ? 'camara' : 'app');
  }

  private background(): string {
    const color = getComputedStyle(document.body).backgroundColor;
    return color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' ? color : DARK;
  }

  /** Sin nada que emitir: el logo y «Esperando…». */
  private placeholder(): void {
    this.fit(1280, 720);
    const g = this.g;
    const { width: W, height: H } = this.canvas;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#7c5cff');
    grad.addColorStop(1, '#2ec4a6');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const size = Math.round(H * 0.3);
    if (this.logo.complete && this.logo.naturalWidth) g.drawImage(this.logo, (W - size) / 2, H * 0.22, size, size);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.font = `800 ${Math.round(H * 0.07)}px 'Nunito Variable', Nunito, system-ui, sans-serif`;
    g.fillText(t('emision.esperando_imagen'), W / 2, H * 0.72);
  }
}

/** Una copia pequeña en JPEG para el relevo (≈ 640 px, calidad 0,6). */
export class JpegShrinker {
  private readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d', { alpha: false })!;
  quality = 0.6;

  async encode(source: HTMLCanvasElement, maxSide = 640, maxBytes = 290 * 1024): Promise<Blob | null> {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const w = Math.round(source.width * scale);
    const h = Math.round(source.height * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) Object.assign(this.canvas, { width: w, height: h });
    this.g.drawImage(source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => this.canvas.toBlob(r, 'image/jpeg', this.quality));
    // Si se pasa del tope, la próxima va con menos calidad (y esta no se manda).
    if (blob && blob.size > maxBytes) {
      this.quality = Math.max(0.3, this.quality - 0.1);
      return null;
    }
    if (blob && blob.size < maxBytes / 3 && this.quality < 0.6) this.quality = Math.min(0.6, this.quality + 0.05);
    return blob;
  }
}
