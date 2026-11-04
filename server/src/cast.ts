import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Emisión al proyector: el móvil del profesor (emisor) manda lo que ve en RA a
 * un ordenador con la misma cuenta (pantalla). Este módulo es solo la
 * señalización de WebRTC (ofertas, respuestas y candidatos ICE) y el relevo
 * de imágenes JPEG para cuando la red no deja pasar WebRTC.
 *
 * Todo vive en memoria y caduca solo: nada va a la base de datos ni a disco.
 * Del relevo se guarda únicamente la última imagen de cada emisor, unos
 * segundos, para dársela a quien esté mirando.
 */

export const CAST_LIMITS = {
  /** Móviles emitiendo a la vez por profesor. */
  emittersPerTeacher: 3,
  /** Pantallas (ordenadores) esperando a la vez por profesor. */
  screensPerTeacher: 4,
  /** Emisores en todo el servidor (memoria del relevo: 30 × 300 KB ≈ 9 MB). */
  maxEmitters: 30,
  /** Un mensaje de señalización (una oferta SDP ronda 3-8 KB). */
  maxMessage: 32 * 1024,
  /** Una imagen del relevo. */
  maxFrame: 300 * 1024,
  /** Espera larga del buzón. */
  pollMs: 25_000,
  /** Espera larga de la siguiente imagen del relevo. */
  framePollMs: 5_000,
  /** Sin preguntar en este tiempo, el participante se da por ido. */
  idleMs: 45_000,
  /** La imagen del relevo se borra pasado este tiempo sin otra nueva. */
  frameTtlMs: 4_000,
  /** Mensajes pendientes por buzón (los más viejos se tiran). */
  inbox: 100,
  /** Como mucho una imagen cada tanto (≈ 12 por segundo). */
  minFrameGapMs: 80,
} as const;

export type CastRole = 'emisor' | 'pantalla';
export type CastMode = 'camara' | 'mundo' | 'app';
const MESSAGE_TYPES = new Set(['ver', 'oferta', 'respuesta', 'ice', 'colgar', 'relevo']);
const MODES = new Set<CastMode>(['camara', 'mundo', 'app']);

export interface CastMessage {
  de: string;
  tipo: string;
  datos?: unknown;
}

interface Frame {
  seq: number;
  data: Buffer;
  at: number;
}

interface Peer {
  id: string;
  teacher: number;
  role: CastRole;
  name: string;
  /** Id que guarda el navegador: si vuelve a entrar (recarga, cuelgue), sustituye al de antes. */
  device: string;
  since: number;
  lastSeen: number;
  mode: CastMode;
  inbox: CastMessage[];
  /** Quien espera en el buzón (como mucho una espera a la vez). */
  wake?: () => void;
  polling: boolean;
  frame?: Frame;
  seq: number;
  frameWaiters: Set<() => void>;
  /** Última vez que una pantalla pidió una imagen del relevo. */
  watchedAt: number;
}

export class CastError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const fail = (status: number, message: string): never => {
  throw new CastError(status, message);
};

export interface CastStatus {
  emisores: Array<{ id: string; nombre: string; desde: string; modo: CastMode }>;
  pantallas: Array<{ id: string; nombre: string }>;
}

/** El estado de la emisión, sin HTTP (los tests lo usan directamente). */
export class CastHub {
  private readonly peers = new Map<string, Peer>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.peers.size;
  }

  /** Bytes que ocupan ahora las imágenes del relevo. */
  get frameBytes(): number {
    let total = 0;
    for (const p of this.peers.values()) total += p.frame?.data.length ?? 0;
    return total;
  }

  private ofTeacher(teacher: number, role?: CastRole): Peer[] {
    return [...this.peers.values()].filter((p) => p.teacher === teacher && (!role || p.role === role));
  }

  /** Un participante de este profesor; el de otro es como si no existiera. */
  private own(teacher: number, id: string, role?: CastRole): Peer {
    const peer = this.peers.get(id);
    if (!peer || peer.teacher !== teacher || (role && peer.role !== role)) fail(404, 'No existe esa emisión');
    peer!.lastSeen = this.now();
    return peer!;
  }

  status(teacher: number): CastStatus {
    const all = this.ofTeacher(teacher);
    return {
      emisores: all.filter((p) => p.role === 'emisor').map((p) => ({ id: p.id, nombre: p.name, desde: new Date(p.since).toISOString(), modo: p.mode })),
      pantallas: all.filter((p) => p.role === 'pantalla').map((p) => ({ id: p.id, nombre: p.name })),
    };
  }

  /** Despierta a todo el que espera en los buzones del profesor (cambió quién está). */
  private changed(teacher: number): void {
    for (const p of this.ofTeacher(teacher)) p.wake?.();
  }

  join(teacher: number, role: unknown, name: unknown, device?: unknown): Peer {
    if (role !== 'emisor' && role !== 'pantalla') fail(400, 'Campo «rol» no válido');
    const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) : '';
    const key = typeof device === 'string' && /^[\w-]{8,40}$/.test(device) ? device : '';
    this.sweep();
    // El mismo navegador vuelve a entrar: su fantasma (que aún no ha caducado) sobra.
    if (key) for (const p of this.ofTeacher(teacher, role as CastRole)) if (p.device === key) this.drop(p);
    if (role === 'emisor') {
      if (this.ofTeacher(teacher, 'emisor').length >= CAST_LIMITS.emittersPerTeacher) fail(429, 'Ya hay demasiados móviles emitiendo');
      if ([...this.peers.values()].filter((p) => p.role === 'emisor').length >= CAST_LIMITS.maxEmitters) fail(503, 'El servidor está ocupado; prueba en un rato');
    } else if (this.ofTeacher(teacher, 'pantalla').length >= CAST_LIMITS.screensPerTeacher) {
      fail(429, 'Ya hay demasiadas pantallas abiertas');
    }
    const at = this.now();
    const peer: Peer = {
      id: randomBytes(12).toString('base64url'),
      teacher,
      role: role as CastRole,
      name: clean,
      device: key,
      since: at,
      lastSeen: at,
      mode: 'app',
      inbox: [],
      polling: false,
      seq: 0,
      frameWaiters: new Set(),
      watchedAt: 0,
    };
    this.peers.set(peer.id, peer);
    this.changed(teacher);
    return peer;
  }

  leave(teacher: number, id: string): void {
    const peer = this.own(teacher, id);
    this.drop(peer);
  }

  private drop(peer: Peer): void {
    this.peers.delete(peer.id);
    peer.frame = undefined;
    for (const wake of peer.frameWaiters) wake();
    peer.wake?.();
    // Quien hablaba con él se entera por el estado (ya no está en la lista).
    this.changed(peer.teacher);
  }

  update(teacher: number, id: string, changes: { modo?: unknown }): void {
    const peer = this.own(teacher, id, 'emisor');
    if (changes.modo !== undefined) {
      if (!MODES.has(changes.modo as CastMode)) fail(400, 'Campo «modo» no válido');
      if (peer.mode !== changes.modo) {
        peer.mode = changes.modo as CastMode;
        this.changed(teacher);
      }
    }
  }

  /** Mensaje de señalización de `from` a `to` (los dos del mismo profesor). */
  send(teacher: number, from: string, to: unknown, tipo: unknown, datos: unknown): void {
    const sender = this.own(teacher, from);
    if (typeof to !== 'string') fail(400, 'Campo «a» no válido');
    if (typeof tipo !== 'string' || !MESSAGE_TYPES.has(tipo)) fail(400, 'Campo «tipo» no válido');
    if (datos !== undefined && JSON.stringify(datos).length > CAST_LIMITS.maxMessage) fail(413, 'Mensaje demasiado grande');
    const target = this.peers.get(to as string);
    if (!target || target.teacher !== teacher || target.role === sender.role) fail(404, 'No existe esa emisión');
    target!.inbox.push({ de: sender.id, tipo: tipo as string, ...(datos === undefined ? {} : { datos }) });
    if (target!.inbox.length > CAST_LIMITS.inbox) target!.inbox.splice(0, target!.inbox.length - CAST_LIMITS.inbox);
    target!.wake?.();
  }

  /**
   * Espera larga: devuelve los mensajes pendientes y el estado. Si no hay
   * mensajes, espera a que llegue alguno, a que cambie quién está, a `signal`
   * (la petición se cerró) o a `timeoutMs`.
   */
  async poll(teacher: number, id: string, timeoutMs: number = CAST_LIMITS.pollMs, signal?: AbortSignal): Promise<{ mensajes: CastMessage[] } & CastStatus> {
    const peer = this.own(teacher, id);
    if (!peer.inbox.length && timeoutMs > 0) {
      peer.wake?.(); // Una espera nueva sustituye a la anterior.
      peer.polling = true;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          if (peer.wake === done) peer.wake = undefined;
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        signal?.addEventListener('abort', done);
        peer.wake = done;
      });
      peer.polling = false;
      peer.lastSeen = this.now();
    }
    const mensajes = peer.inbox.splice(0);
    return { mensajes, ...this.status(teacher) };
  }

  /** Imagen del relevo (JPEG). Devuelve cuántas pantallas la miraron hace poco. */
  putFrame(teacher: number, id: string, data: Buffer): { secuencia: number; mirando: boolean } {
    const peer = this.own(teacher, id, 'emisor');
    if (data.length > CAST_LIMITS.maxFrame) fail(413, 'Imagen demasiado grande');
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) fail(415, 'Solo imágenes JPEG');
    const at = this.now();
    if (peer.frame && at - peer.frame.at < CAST_LIMITS.minFrameGapMs) fail(429, 'Demasiadas imágenes');
    // La anterior se sustituye: nunca se guarda más de una.
    peer.frame = { seq: ++peer.seq, data, at };
    for (const wake of peer.frameWaiters) wake();
    return { secuencia: peer.seq, mirando: at - peer.watchedAt < 10_000 };
  }

  /** La imagen más nueva que `after`, esperando un poco si aún no la hay. */
  async getFrame(teacher: number, emitterId: string, after: number, timeoutMs: number = CAST_LIMITS.framePollMs, signal?: AbortSignal): Promise<Frame | null> {
    const peer = this.own(teacher, emitterId, 'emisor');
    peer.watchedAt = this.now();
    const fresh = () => (peer.frame && peer.frame.seq > after && this.now() - peer.frame.at <= CAST_LIMITS.frameTtlMs ? peer.frame : null);
    if (fresh() || timeoutMs <= 0) return fresh();
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        peer.frameWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      signal?.addEventListener('abort', done);
      peer.frameWaiters.add(done);
    });
    return fresh();
  }

  /** Quita a quien lleva tiempo sin preguntar y las imágenes viejas. */
  sweep(): void {
    const at = this.now();
    for (const peer of [...this.peers.values()]) {
      if (!peer.polling && at - peer.lastSeen > CAST_LIMITS.idleMs) this.drop(peer);
      else if (peer.frame && at - peer.frame.at > CAST_LIMITS.frameTtlMs) peer.frame = undefined;
    }
  }
}

// --- HTTP ----------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readRaw(req: IncomingMessage, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > max) fail(413, 'Demasiado grande');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) fail(413, 'Demasiado grande');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const text = (await readRaw(req, CAST_LIMITS.maxMessage + 1024)).toString('utf8');
  try {
    const value = text ? JSON.parse(text) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return fail(400, 'Petición no válida');
  }
}

/** Servidores STUN que se dan al navegador (públicos de Google: solo ven IP y puerto). */
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

/**
 * Rutas `/api/emision*` sobre node:http. `teacherOf` resuelve el token de
 * profesor (null si no lo es): solo el profesorado emite y mira.
 */
export function createCastHandler(hub: CastHub, teacherOf: (token: string | undefined) => number | null) {
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      const auth = req.headers.authorization;
      const teacher = teacherOf(auth?.startsWith('Bearer ') ? auth.slice(7) : undefined);
      if (teacher == null) fail(401, 'Inicia sesión como profesor');
      const t = teacher!;
      const path = url.pathname.replace(/\/$/, '');
      const method = req.method ?? 'GET';
      const m = path.match(/^\/api\/emision(?:\/([\w-]{8,40})(?:\/(buzon|mensajes|imagen))?)?$/);
      if (!m) fail(404, 'No existe');
      const [, id, sub] = m!;

      if (!id) {
        if (method === 'GET') return sendJson(res, 200, hub.status(t));
        if (method === 'POST') {
          const body = await readJson(req);
          const peer = hub.join(t, body.rol, body.nombre, body.dispositivo);
          return sendJson(res, 200, { id: peer.id, ice: ICE_SERVERS, limites: { imagen: CAST_LIMITS.maxFrame }, ...hub.status(t) });
        }
      } else if (!sub) {
        if (method === 'DELETE') {
          hub.leave(t, id);
          return sendJson(res, 200, { ok: true });
        }
        if (method === 'PATCH') {
          hub.update(t, id, await readJson(req));
          return sendJson(res, 200, { ok: true });
        }
      } else if (sub === 'buzon' && method === 'GET') {
        const out = await hub.poll(t, id, CAST_LIMITS.pollMs, abort.signal);
        if (!res.writableEnded && !abort.signal.aborted) sendJson(res, 200, out);
        return;
      } else if (sub === 'mensajes' && method === 'POST') {
        const body = await readJson(req);
        hub.send(t, id, body.a, body.tipo, body.datos);
        return sendJson(res, 200, { ok: true });
      } else if (sub === 'imagen' && method === 'PUT') {
        const data = await readRaw(req, CAST_LIMITS.maxFrame);
        return sendJson(res, 200, hub.putFrame(t, id, data));
      } else if (sub === 'imagen' && method === 'GET') {
        const after = Number(url.searchParams.get('tras') ?? 0) || 0;
        const frame = await hub.getFrame(t, id, after, CAST_LIMITS.framePollMs, abort.signal);
        if (res.writableEnded || abort.signal.aborted) return;
        if (!frame) {
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          return void res.end();
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Secuencia': String(frame.seq) });
        return void res.end(frame.data);
      }
      fail(405, 'Método no permitido');
    } catch (error) {
      if (res.headersSent) return void res.end();
      if (error instanceof CastError) return sendJson(res, error.status, { error: error.message });
      console.error(error);
      sendJson(res, 500, { error: 'Error del servidor' });
    }
  };
}
