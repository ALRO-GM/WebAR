import '../theme.css';
import './cast.css';
import { t, translate } from '../i18n';
import { applySettings } from '../settings';
import { CastHttpError, castFetch, deviceKey, loginForm, teacherToken, type CastMessage, type CastStatus, type Joined } from './api';

// Vista de proyector (el ordenador): espera a que un móvil con la misma
// cuenta de profesor emita y lo muestra a pantalla completa. Por WebRTC si la
// red lo deja; si no, con las imágenes del relevo. Se reconecta sola.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
/** Pedir ver de nuevo si en este tiempo no llega imagen. */
const STALL_MS = 12_000;

type Emitter = CastStatus['emisores'][number];

const video = $<HTMLVideoElement>('pr-video');
const canvas = $<HTMLCanvasElement>('pr-lienzo');
const g = canvas.getContext('2d')!;

let id: string | undefined;
let ice: RTCIceServer[] = FALLBACK_ICE;
let emitters: Emitter[] = [];
/** El móvil que se está mirando (y su nombre, para volver a él si se reconecta). */
let chosen: string | null = null;
let chosenName: string | null = null;
let pc: RTCPeerConnection | undefined;
let transport: 'webrtc' | 'relevo' | null = null;
let asked = 0;
let lastImage = 0;
let relayAbort: AbortController | undefined;
let running = false;

// --- Pantallas ------------------------------------------------------------------

function show(state: 'entrar' | 'esperando' | 'elegir' | 'directo'): void {
  document.body.dataset.estado = state;
  $('pr-entrar').hidden = state !== 'entrar';
  $('pr-espera').hidden = state !== 'esperando' && state !== 'elegir';
  $('pr-lista').hidden = state !== 'elegir';
  $('pr-escena').hidden = state !== 'directo';
  $('pr-insignia').hidden = state !== 'directo';
  $('pr-cambiar').hidden = emitters.length < 2 || state !== 'directo';
  $('pr-espera-titulo').textContent = state === 'elegir' ? t('emision.elige_movil') : t('emision.esperando_movil');
  $('pr-pasos').hidden = state === 'elegir';
}

function renderBadge(): void {
  const live = transport !== null && Date.now() - lastImage < 4000;
  const em = emitters.find((e) => e.id === chosen);
  $('pr-insignia').classList.toggle('en-vivo', live);
  $('pr-calidad').textContent = !live ? t('emision.reconectando') : transport === 'webrtc' ? t('emision.calidad_directo') : t('emision.calidad_relevo');
  $('pr-movil').textContent = em?.nombre ?? '';
  $('pr-aviso-mundo').hidden = em?.modo !== 'mundo';
}

function renderList(): void {
  const list = $('pr-lista');
  list.innerHTML = '';
  for (const e of emitters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn claro';
    b.textContent = `📱 ${e.nombre || t('emision.dispositivo_generico')} · ${new Date(e.desde).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' })}`;
    b.addEventListener('click', () => choose(e));
    list.append(b);
  }
}

// --- Elegir móvil y conectar ----------------------------------------------------

function choose(e: Emitter): void {
  hangUp(true);
  chosen = e.id;
  chosenName = e.nombre;
  show('directo');
  void ask();
}

/** Pide al móvil que mande imagen (él hace la oferta WebRTC o pasa al relevo). */
async function ask(): Promise<void> {
  if (!chosen || !id) return;
  asked = Date.now();
  lastImage = 0;
  renderBadge();
  await castFetch('POST', `/api/emision/${id}/mensajes`, { a: chosen, tipo: 'ver' }).catch(() => {});
}

function hangUp(tell = false): void {
  if (tell && chosen && id) void castFetch('POST', `/api/emision/${id}/mensajes`, { a: chosen, tipo: 'colgar' }).catch(() => {});
  pc?.close();
  pc = undefined;
  relayAbort?.abort();
  relayAbort = undefined;
  transport = null;
  video.srcObject = null;
}

function onStatus(status: CastStatus): void {
  emitters = status.emisores;
  if (chosen && !emitters.some((e) => e.id === chosen)) {
    // Se fue (o se cortó): a esperar; si vuelve con el mismo nombre, se retoma solo.
    hangUp();
    chosen = null;
  }
  if (!chosen) {
    const again = emitters.find((e) => e.nombre === chosenName);
    if (again && emitters.length > 1) return choose(again);
    if (emitters.length === 1) return choose(emitters[0]);
    renderList();
    show(emitters.length ? 'elegir' : 'esperando');
    return;
  }
  renderList();
  show('directo');
  renderBadge();
}

async function onMessage(m: CastMessage): Promise<void> {
  if (m.de !== chosen) return;
  if (m.tipo === 'oferta') {
    hangUp();
    const conn = (pc = new RTCPeerConnection({ iceServers: ice }));
    conn.ontrack = (e) => {
      video.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void video.play().catch(() => {});
    };
    conn.onicecandidate = (e) => {
      if (e.candidate && chosen) void castFetch('POST', `/api/emision/${id}/mensajes`, { a: chosen, tipo: 'ice', datos: e.candidate.toJSON() }).catch(() => {});
    };
    conn.onconnectionstatechange = () => {
      if (pc !== conn) return;
      if (conn.connectionState === 'connected') {
        transport = 'webrtc';
        canvas.hidden = true;
        video.hidden = false;
      }
      renderBadge();
    };
    await conn.setRemoteDescription(m.datos as RTCSessionDescriptionInit);
    await conn.setLocalDescription(await conn.createAnswer());
    await castFetch('POST', `/api/emision/${id}/mensajes`, { a: chosen, tipo: 'respuesta', datos: conn.localDescription!.toJSON() });
  } else if (m.tipo === 'ice') {
    if (pc && m.datos) await pc.addIceCandidate(m.datos as RTCIceCandidateInit).catch(() => {});
  } else if (m.tipo === 'relevo') {
    hangUp();
    transport = 'relevo';
    video.hidden = true;
    canvas.hidden = false;
    void relayLoop(chosen);
  }
}

/** Relevo: pide la imagen siguiente (espera larga) y la pinta. */
async function relayLoop(emitter: string): Promise<void> {
  const abort = (relayAbort = new AbortController());
  let seq = 0;
  while (!abort.signal.aborted && chosen === emitter) {
    try {
      const res = await fetch(`/api/emision/${emitter}/imagen?tras=${seq}`, { headers: { Authorization: `Bearer ${teacherToken()}` }, signal: abort.signal });
      if (res.status === 200) {
        seq = Number(res.headers.get('X-Secuencia')) || seq + 1;
        const bitmap = await createImageBitmap(await res.blob());
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) Object.assign(canvas, { width: bitmap.width, height: bitmap.height });
        g.drawImage(bitmap, 0, 0);
        bitmap.close();
        lastImage = Date.now();
        renderBadge();
      } else if (res.status !== 204) {
        await sleep(1000);
      }
    } catch {
      if (abort.signal.aborted) return;
      await sleep(1000);
    }
  }
}

// --- Bucle --------------------------------------------------------------------------

async function join(): Promise<void> {
  const joined = await castFetch<Joined>('POST', '/api/emision', { rol: 'pantalla', nombre: t('emision.pantalla_nombre'), dispositivo: deviceKey() });
  id = joined.id;
  if (joined.ice?.length) ice = joined.ice;
  onStatus(joined);
}

async function loop(): Promise<void> {
  if (running) return;
  running = true;
  let failures = 0;
  while (teacherToken()) {
    try {
      if (!id) await join();
      const out = await castFetch<CastStatus & { mensajes: CastMessage[] }>('GET', `/api/emision/${id}/buzon`);
      failures = 0;
      onStatus(out);
      for (const m of out.mensajes) await onMessage(m).catch((e) => console.warn('proyector:', e));
    } catch (error) {
      const status = error instanceof CastHttpError ? error.status : 0;
      if (status === 401) break;
      if (status === 404) id = undefined; // el servidor nos olvidó: volver a entrar
      failures++;
      $('pr-error').textContent = (error as Error).message;
      await sleep(Math.min(10_000, 1000 * failures));
      continue;
    }
    $('pr-error').textContent = '';
  }
  running = false;
  start();
}

/** Vigila que llegue imagen: si se corta, vuelve a pedirla. */
setInterval(() => {
  if (video.srcObject && !video.paused) {
    // WebRTC: si el vídeo avanza, hay imagen.
    const q = video.getVideoPlaybackQuality?.();
    const frames = q?.totalVideoFrames ?? 0;
    if (frames !== Number(video.dataset.frames ?? -1)) lastImage = Date.now();
    video.dataset.frames = String(frames);
  }
  renderBadge();
  if (!chosen) return;
  const since = Date.now() - Math.max(lastImage, asked);
  const dead = pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed');
  if (!dead && since <= STALL_MS) return;
  // Si no contesta y el mismo móvil ha vuelto a entrar (otra pestaña, otro arranque), se pasa al nuevo.
  const current = emitters.find((e) => e.id === chosen);
  const newer = emitters.filter((e) => e.id !== chosen && e.nombre === current?.nombre && e.desde > current.desde).at(-1);
  if (newer && Date.now() - lastImage > STALL_MS) choose(newer);
  else void ask();
}, 1000);

// --- Controles ------------------------------------------------------------------------

$('pr-pantalla-completa').addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  $('pr-pantalla-completa').setAttribute('aria-pressed', String(!!document.fullscreenElement));
});
$('pr-cambiar').addEventListener('click', () => {
  hangUp(true);
  chosen = null;
  chosenName = null;
  renderList();
  show('elegir');
});

// Los controles se esconden si el ratón no se mueve (se ven otra vez al moverlo o con el teclado).
let idle: ReturnType<typeof setTimeout>;
const wake = () => {
  document.body.classList.remove('quieto');
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!document.querySelector('#pr-controles :focus-visible')) document.body.classList.add('quieto');
  }, 3000);
};
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'focusin']) document.addEventListener(ev, wake);
wake();

window.addEventListener('pagehide', () => {
  if (id) void castFetch('DELETE', `/api/emision/${id}`, undefined, { keepalive: true }).catch(() => {});
});

function start(): void {
  if (!teacherToken()) {
    const box = $('pr-entrar');
    box.innerHTML = `<h1>${t('emision.proyector_titulo')}</h1>`;
    box.append(loginForm(start));
    show('entrar');
    return;
  }
  show('esperando');
  void loop();
}

applySettings();
document.documentElement.classList.add('oscuro');
translate();
start();
