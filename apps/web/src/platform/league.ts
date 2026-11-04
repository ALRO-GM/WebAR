import { getSetting, setSetting, deleteSetting } from './store';

/**
 * Las ligas semanales (servidor: docs/servidor.md). La mundial es opcional y
 * anónima: el servidor pone un apodo («Neutrón Veloz 427») para que nadie use
 * su nombre real. La de clase usa el alias de la clase. El XP de la semana lo
 * calcula el móvil a partir de sus eventos y se envía como «lo que llevo».
 */
export const LEAGUE_COUNT = 10;

export interface LeagueRow {
  puesto: number;
  apodo?: string;
  alias?: string;
  avatar?: string;
  xp: number;
  yo: boolean;
}
export interface GlobalLeague {
  semana: string;
  termina: string;
  liga: number;
  enGrupo: boolean;
  grupo: LeagueRow[];
  sube: number;
  baja: number;
  resultadoAnterior?: { liga: number; puesto: number; cambio: 'sube' | 'baja' | 'igual' };
}
export interface ClassLeague {
  semana: string;
  termina: string;
  ranking: LeagueRow[];
}

interface Player {
  token: string;
  apodo: string;
  avatar: string;
}

async function call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? res.statusText), { status: res.status });
  return data as T;
}

export class Leagues {
  player: Player | null = null;
  global: GlobalLeague | null = null;
  classLeague: ClassLeague | null = null;
  error = false;

  constructor(private readonly studentToken: () => string | null) {}

  async init(): Promise<void> {
    this.player = (await getSetting<Player>('jugador')) ?? null;
    this.global = (await getSetting<GlobalLeague>('liga')) ?? null;
  }

  get joined(): boolean {
    return !!this.player;
  }

  /** Entrar en la liga mundial (con el alias de clase enlazado, si lo hay). */
  async join(avatar: string): Promise<void> {
    const res = await call<Player>('POST', '/api/jugadores', this.studentToken(), { avatar });
    this.player = { token: res.token, apodo: res.apodo, avatar: res.avatar };
    await setSetting('jugador', this.player);
  }

  async leave(): Promise<void> {
    if (this.player) await call('DELETE', '/api/jugadores/yo', this.player.token).catch(() => undefined);
    this.player = null;
    this.global = null;
    await deleteSetting('jugador');
    await deleteSetting('liga');
  }

  async update(patch: { avatar?: string; nuevoApodo?: true }): Promise<void> {
    if (!this.player) return;
    const res = await call<{ apodo: string; avatar: string }>('PATCH', '/api/jugadores/yo', this.player.token, patch);
    this.player = { ...this.player, apodo: res.apodo, avatar: res.avatar };
    await setSetting('jugador', this.player);
  }

  /** Envía el XP de la semana y trae las clasificaciones. Sin red, se queda con lo último. */
  async refresh(xpWeek: number): Promise<void> {
    this.error = false;
    const student = this.studentToken();
    try {
      if (this.player) {
        await call('PUT', '/api/liga/xp', this.player.token, { xp: xpWeek });
        this.global = await call<GlobalLeague>('GET', '/api/liga', this.player.token);
        await setSetting('liga', this.global);
      } else if (student) await call('PUT', '/api/liga/xp', student, { xp: xpWeek });
      this.classLeague = student ? await call<ClassLeague>('GET', '/api/liga/clase', student) : null;
    } catch (e) {
      if ((e as { status?: number }).status === 401 && this.player) {
        this.player = null;
        await deleteSetting('jugador');
      }
      this.error = true;
    }
  }
}
