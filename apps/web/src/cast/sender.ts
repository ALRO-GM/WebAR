import { t } from '../i18n';
import { CastHttpError, castFetch, deviceKey, deviceName, teacherToken, type CastMessage, type CastStatus, type Joined } from './api';
import { Compositor, JpegShrinker, type CastDeps, type CastMode } from './compositor';

/** Si WebRTC no conecta en este tiempo, se pasa al relevo de imágenes. */
export const DIRECT_TIMEOUT_MS = 8000;
const FPS = 24;
/** Imágenes por segundo del relevo. */
const RELAY_FPS = 7;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type CastState = 'parado' | 'conectando' | 'esperando' | 'emitiendo' | 'error';
export type CastTransport = 'webrtc' | 'relevo';

interface Link {
  screen: string;
  pc?: RTCPeerConnection;
  timer?: ReturnType<typeof setTimeout>;
  transport?: CastTransport;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * El emisor: une el móvil a la emisión del profesor, atiende a cada pantalla
 * que pide ver (WebRTC, o relevo de JPEG si no conecta) y pinta el indicador
 * flotante «📡 Emitiendo». Hay uno por página (`getCastSender`) y sigue
 * emitiendo aunque se cambie de experiencia: basta con que `deps` devuelva lo
 * que se ve en cada momento.
 */
export class CastSender {
  private deps: CastDeps;
  private readonly compositor = new Compositor();
  private readonly shrinker = new JpegShrinker();
  private stream?: MediaStream;
  private id?: string;
  private ice: RTCIceServer[] = FALLBACK_ICE;
  private readonly links = new Map<string, Link>();
  private poller?: AbortController;
  private ticker?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private lastFrame = 0;
  private reportedMode?: CastMode;
  private relayRunning = false;
  private wakeLock?: { release(): Promise<void> } | null;
  private readonly listeners = new Set<() => void>();
  private element?: HTMLElement;
  private _state: CastState = 'parado';
  private _error = '';
  /** Pantallas que hay abiertas (esperando o mirando). */
  screensOpen = 0;
  /** Para probar el relevo: no intenta WebRTC. */
  forceRelay = false;
  /** Poner el indicador en `body` al emitir (si no, colócalo tú con `indicator()`). */
  autoMountIndicator = true;

  constructor(deps: CastDeps) {
    this.deps = deps;
    window.addEventListener('pagehide', () => {
      if (this.id) void castFetch('DELETE', `/api/emision/${this.id}`, undefined, { keepalive: true }).catch(() => {});
    });
  }

  /** Cambia de dónde sale la imagen (p. ej. al cambiar de experiencia). */
  setDeps(deps: CastDeps): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.deps = deps;
    if (this.active) this.subscribe();
  }

  get state(): CastState {
    return this._state;
  }
  get error(): string {
    return this._error;
  }
  get active(): boolean {
    return this._state !== 'parado' && this._state !== 'error';
  }
  /** Pantallas que ven ahora la emisión y cómo. */
  get watching(): Array<{ screen: string; transport: CastTransport | undefined }> {
    return [...this.links.values()].map((l) => ({ screen: l.screen, transport: l.transport }));
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private setState(state: CastState, error = ''): void {
    this._state = state;
    this._error = error;
    this.renderIndicator();
    for (const l of this.listeners) l();
  }

  // --- Empezar y parar -------------------------------------------------------

  /** Empieza a emitir (o sigue, si ya lo hacía). Necesita sesión de profesor. */
  async start(): Promise<void> {
    if (this.active) return;
    if (!teacherToken()) return this.setState('error', t('emision.sin_sesion'));
    this.setState('conectando');
    this.stream = this.compositor.canvas.captureStream(FPS);
    this.subscribe();
    this.ticker = setInterval(this.tick, 1000 / FPS);
    void this.requestWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);
    try {
      await this.join();
    } catch (error) {
      this.teardown();
      return this.setState('error', (error as Error).message);
    }
    if (this.autoMountIndicator && !this.element?.isConnected) document.body.append(this.indicator());
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    if (!this.active) return this.setState('parado');
    const id = this.id;
    this.teardown();
    this.setState('parado');
    if (id) await castFetch('DELETE', `/api/emision/${id}`).catch(() => {});
  }

  private teardown(): void {
    this.poller?.abort();
    this.poller = undefined;
    for (const link of this.links.values()) this.closeLink(link);
    this.links.clear();
    clearInterval(this.ticker);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.id = undefined;
    this.reportedMode = undefined;
    this.screensOpen = 0;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private async join(): Promise<void> {
    const joined = await castFetch<Joined>('POST', '/api/emision', { rol: 'emisor', nombre: deviceName(), dispositivo: deviceKey() });
    this.id = joined.id;
    if (joined.ice?.length) this.ice = joined.ice;
    this.reportedMode = undefined;
    this.onStatus(joined);
  }

  /** Que la pantalla del móvil no se apague mientras emite. */
  private async requestWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && this.active) void this.requestWakeLock();
  };

  // --- Imagen -----------------------------------------------------------------

  private subscribe(): void {
    this.unsubscribe = this.deps.onFrame?.(() => this.compose(false));
  }

  /** Cada 1/24 s: si la app no ha avisado de un frame hace poco, se pinta aquí. */
  private readonly tick = () => {
    if (performance.now() - this.lastFrame > 1000 / FPS + 40) this.compose(true);
  };

  private compose(renderFirst: boolean): void {
    const now = performance.now();
    if (now - this.lastFrame < 1000 / FPS - 4) return;
    this.lastFrame = now;
    let sources = null;
    try {
      sources = this.deps.frameSources();
      if (renderFirst && sources?.gl) this.deps.renderNow();
    } catch (error) {
      console.warn('emisión: no se pudo pintar', error);
    }
    const mode = this.compositor.draw(sources);
    if (mode !== this.reportedMode && this.id) {
      this.reportedMode = mode;
      void castFetch('PATCH', `/api/emision/${this.id}`, { modo: mode }).catch(() => (this.reportedMode = undefined));
    }
  }

  // --- Señalización -------------------------------------------------------------

  private async pollLoop(): Promise<void> {
    let failures = 0;
    while (this.active) {
      const abort = (this.poller = new AbortController());
      try {
        const out = await castFetch<CastStatus & { mensajes: CastMessage[] }>('GET', `/api/emision/${this.id}/buzon`, undefined, { signal: abort.signal });
        if (!this.active || abort.signal.aborted) return;
        failures = 0;
        this.onStatus(out);
        for (const message of out.mensajes) await this.onMessage(message);
      } catch (error) {
        if (!this.active || abort.signal.aborted) return;
        const status = error instanceof CastHttpError ? error.status : 0;
        if (status === 401) {
          this.teardown();
          return this.setState('error', t('emision.sin_sesion'));
        }
        if (status === 404) {
          // El servidor nos olvidó (reinicio, o mucho rato sin red): volver a entrar.
          for (const link of this.links.values()) this.closeLink(link);
          this.links.clear();
          try {
            await this.join();
            continue;
          } catch {
            /* reintenta abajo */
          }
        }
        failures++;
        this.setState(this._state === 'emitiendo' ? 'emitiendo' : 'esperando');
        await sleep(Math.min(10_000, 1000 * failures));
      }
    }
  }

  private onStatus(status: CastStatus): void {
    this.screensOpen = status.pantallas.length;
    const present = new Set(status.pantallas.map((s) => s.id));
    for (const [id, link] of this.links) {
      if (!present.has(id)) {
        this.closeLink(link);
        this.links.delete(id);
      }
    }
    this.updateState();
  }

  private updateState(): void {
    if (!this.active) return;
    this.setState(this.links.size ? 'emitiendo' : 'esperando');
  }

  private send(to: string, tipo: CastMessage['tipo'], datos?: unknown): Promise<unknown> {
    return castFetch('POST', `/api/emision/${this.id}/mensajes`, { a: to, tipo, datos }).catch((e) => console.warn('emisión:', e));
  }

  private async onMessage(message: CastMessage): Promise<void> {
    const link = this.links.get(message.de);
    switch (message.tipo) {
      case 'ver':
        return this.offer(message.de);
      case 'respuesta':
        if (link?.pc && link.pc.signalingState === 'have-local-offer') await link.pc.setRemoteDescription(message.datos as RTCSessionDescriptionInit).catch((e) => console.warn(e));
        return;
      case 'ice':
        if (link?.pc && message.datos) await link.pc.addIceCandidate(message.datos as RTCIceCandidateInit).catch(() => {});
        return;
      case 'colgar':
        if (link) {
          this.closeLink(link);
          this.links.delete(message.de);
          this.updateState();
        }
        return;
    }
  }

  /** Una pantalla quiere ver: oferta WebRTC con el vídeo compuesto. */
  private async offer(screen: string): Promise<void> {
    const old = this.links.get(screen);
    if (old) this.closeLink(old);
    const link: Link = { screen };
    this.links.set(screen, link);
    this.updateState();
    if (this.forceRelay || typeof RTCPeerConnection === 'undefined' || !this.stream) return this.toRelay(link);

    const pc = (link.pc = new RTCPeerConnection({ iceServers: this.ice }));
    for (const track of this.stream.getVideoTracks()) {
      (track as MediaStreamTrack & { contentHint?: string }).contentHint = 'motion';
      pc.addTrack(track, this.stream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) void this.send(screen, 'ice', e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (link.pc !== pc) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(link.timer);
        link.transport = 'webrtc';
        void this.limitBitrate(pc);
        this.renderIndicator();
      } else if (pc.connectionState === 'failed') {
        this.toRelay(link);
      }
    };
    link.timer = setTimeout(() => {
      if (link.pc === pc && pc.connectionState !== 'connected') this.toRelay(link);
    }, DIRECT_TIMEOUT_MS);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await this.send(screen, 'oferta', pc.localDescription!.toJSON());
    } catch (error) {
      console.warn('emisión: oferta', error);
      this.toRelay(link);
    }
  }

  /** ~2,5 Mb/s: buena imagen en un proyector sin ahogar el wifi del centro. */
  private async limitBitrate(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      params.encodings[0].maxBitrate = 2_500_000;
      params.encodings[0].maxFramerate = FPS;
      await sender.setParameters(params).catch(() => {});
    }
  }

  /** Plan B: la red no deja pasar WebRTC; imágenes JPEG por el servidor. */
  private toRelay(link: Link): void {
    if (this.links.get(link.screen) !== link) return;
    clearTimeout(link.timer);
    link.pc?.close();
    link.pc = undefined;
    link.transport = 'relevo';
    void this.send(link.screen, 'relevo');
    this.renderIndicator();
    void this.relayLoop();
  }

  private closeLink(link: Link): void {
    clearTimeout(link.timer);
    link.pc?.close();
    link.pc = undefined;
    link.transport = undefined;
  }

  private async relayLoop(): Promise<void> {
    if (this.relayRunning) return;
    this.relayRunning = true;
    try {
      while (this.active && [...this.links.values()].some((l) => l.transport === 'relevo')) {
        const started = performance.now();
        const blob = await this.shrinker.encode(this.compositor.canvas);
        if (blob && this.id) {
          try {
            await castFetch('PUT', `/api/emision/${this.id}/imagen`, blob);
          } catch (error) {
            // 429: íbamos demasiado rápido; otra cosa: la red. Se sigue.
            if (!(error instanceof CastHttpError) || error.status !== 429) await sleep(500);
          }
        }
        await sleep(Math.max(0, 1000 / RELAY_FPS - (performance.now() - started)));
      }
    } finally {
      this.relayRunning = false;
    }
  }

  // --- Indicador -------------------------------------------------------------------

  /** El indicador flotante «📡 Emitiendo» con el botón para parar. */
  indicator(): HTMLElement {
    if (!this.element) {
      const el = (this.element = document.createElement('div'));
      el.className = 'emision-indicador flotante';
      el.innerHTML = `<span class="emision-punto" aria-hidden="true"></span><span class="emision-texto" role="status"></span>
        <button type="button" class="btn mal emision-parar">${t('emision.parar')}</button>`;
      el.querySelector('button')!.addEventListener('click', () => void this.stop());
      this.renderIndicator();
    }
    return this.element;
  }

  private renderIndicator(): void {
    const el = this.element;
    if (!el) return;
    el.hidden = !this.active;
    el.dataset.estado = this._state;
    const watching = this.watching;
    const relay = watching.some((w) => w.transport === 'relevo');
    const text =
      this._state === 'conectando' ? t('emision.conectando')
      : this._state === 'esperando' ? t('emision.indicador_esperando')
      : t(relay ? 'emision.indicador_relevo' : watching.length === 1 ? 'emision.indicador_1' : 'emision.indicador', { n: watching.length });
    const out = el.querySelector('.emision-texto')!;
    if (out.textContent !== text) out.textContent = text;
  }
}

let shared: CastSender | undefined;

/**
 * El emisor de la página (uno solo, para que la emisión siga al cambiar de
 * experiencia). La primera vez hay que pasarle `deps`; luego, si se pasan,
 * sustituyen a las anteriores.
 */
export function getCastSender(deps?: CastDeps): CastSender {
  if (!shared) {
    if (!deps) throw new Error('getCastSender: falta deps la primera vez');
    shared = new CastSender(deps);
  } else if (deps) {
    shared.setDeps(deps);
  }
  return shared;
}
