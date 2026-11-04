import { Emitter } from '@webar/ar-core';
import { deleteSetting, getSetting, markSent, pendingEvents, setSetting } from './store';

export interface ClassChallenge {
  id: number;
  title: string;
  description: string;
  targets: string[];
  ends: string | null;
}

/** Lo que el servidor cuenta de la clase en cada sincronización. */
export interface ClassState {
  alumno: { id: number; alias: string };
  clase: { id: number; name: string; course: string; alumnos?: number };
  retos: ClassChallenge[];
  discovered: Array<{ species: string; students: number }>;
  feed: Array<{ alias: string; type: string; data: Record<string, unknown>; time: string }>;
  /** Cuándo se recibió (ISO). */
  recibido?: string;
}

export interface SyncEvents {
  /** Cambió el estado de la clase o lo pendiente. */
  change: undefined;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

/**
 * La clase del alumno: unirse con código + alias + PIN y enviar sus eventos.
 * Sin Background Sync en iOS, la cola se vacía al abrir la app, al recuperar
 * la conexión, al volver a la pestaña y tras cada evento nuevo.
 */
export class ClassSync extends Emitter<SyncEvents> {
  state: ClassState | null = null;
  pending = 0;
  online = navigator.onLine;
  private token: string | null = null;
  private running = false;
  private again = false;

  async init(): Promise<void> {
    this.token = (await getSetting<string>('token')) ?? null;
    this.state = (await getSetting<ClassState>('clase')) ?? null;
    this.pending = (await pendingEvents()).length;
    window.addEventListener('online', () => {
      this.online = true;
      void this.sync();
    });
    window.addEventListener('offline', () => {
      this.online = false;
      this.emit('change', undefined);
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void this.sync());
    this.emit('change', undefined);
    void this.sync();
  }

  /** El token de alumno (para la liga de la clase). */
  get studentToken(): string | null {
    return this.token;
  }

  get joined(): boolean {
    return !!this.token;
  }

  async join(code: string, alias: string, pin: string): Promise<void> {
    const res = await api<{ token: string }>('/api/unirse', { codigo: code.trim(), alias: alias.trim(), pin: pin.trim() });
    this.token = res.token;
    await setSetting('token', res.token);
    await this.sync();
  }

  async leave(): Promise<void> {
    this.token = null;
    this.state = null;
    await deleteSetting('token');
    await deleteSetting('clase');
    this.emit('change', undefined);
  }

  /** Envía lo pendiente y trae la clase. Nunca lanza: sin red, lo deja para luego. */
  async sync(): Promise<void> {
    if (!this.token) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        const events = await pendingEvents();
        const res = await api<ClassState & { aceptados: string[] }>('/api/sync', { eventos: events.slice(0, 500) }, this.token);
        await markSent(res.aceptados);
        // Los eventos que el servidor rechaza (mal formados) tampoco se reintentan.
        await markSent(events.slice(0, 500).map((e) => e.id).filter((id) => !res.aceptados.includes(id)));
        const { aceptados: _, ...state } = res;
        this.state = { ...state, recibido: new Date().toISOString() };
        await setSetting('clase', this.state);
        this.pending = (await pendingEvents()).length;
        this.online = true;
      } while (this.again || this.pending > 0);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await this.leave();
      else this.online = navigator.onLine && !(error instanceof TypeError) ? this.online : false;
      this.pending = (await pendingEvents()).length;
    } finally {
      this.running = false;
      this.emit('change', undefined);
    }
  }

  /** Tras guardar un evento: que salga en cuanto se pueda. */
  async queued(): Promise<void> {
    this.pending = (await pendingEvents()).length;
    this.emit('change', undefined);
    void this.sync();
  }
}

export { ApiError };
