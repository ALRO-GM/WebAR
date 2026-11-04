import { t } from '../i18n';

/**
 * Llamadas a `/api/emision*` y la sesión de profesor. El token es el mismo
 * que usa el panel del profesorado (`webar:profe`): quien ya entró en
 * profesor.html desde este dispositivo no tiene que volver a entrar.
 */
const TOKEN_KEY = 'webar:profe';

export const teacherToken = () => localStorage.getItem(TOKEN_KEY);

export function forgetTeacher(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface CastStatus {
  emisores: Array<{ id: string; nombre: string; desde: string; modo: 'camara' | 'mundo' | 'app' }>;
  pantallas: Array<{ id: string; nombre: string }>;
}
export interface CastMessage {
  de: string;
  tipo: 'ver' | 'oferta' | 'respuesta' | 'ice' | 'colgar' | 'relevo';
  datos?: unknown;
}
export interface Joined extends CastStatus {
  id: string;
  ice: RTCIceServer[];
}

export class CastHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function castFetch<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const token = teacherToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      ...init,
      headers: {
        ...(body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
        ...(body instanceof Blob ? { 'Content-Type': body.type } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new CastHttpError(0, t('emision.error_red'));
  }
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) forgetTeacher();
  if (!res.ok) throw new CastHttpError(res.status, data.error ?? res.statusText);
  return data as T;
}

/** Entra como profesor/a (igual que en profesor.html) y guarda el token. */
export async function loginTeacher(email: string, password: string): Promise<void> {
  const res = await castFetch<{ token: string }>('POST', '/api/sesion', { email, password });
  localStorage.setItem(TOKEN_KEY, res.token);
}

/**
 * Id al azar de esta pestaña (no identifica a nadie; sobrevive a recargar):
 * al volver a entrar, el servidor quita el fantasma de antes. Por pestaña y no
 * por navegador, para que dos pestañas no se echen la una a la otra.
 */
export function deviceKey(): string {
  let key = sessionStorage.getItem('webar:emision-dispositivo');
  if (!key) sessionStorage.setItem('webar:emision-dispositivo', (key = crypto.randomUUID()));
  return key;
}

/** Nombre corto del dispositivo para la lista del proyector (sin datos personales). */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? t('emision.dispositivo', { sistema: os }) : t('emision.dispositivo_generico');
}

/** Formulario de entrada de profesor/a (para el panel del móvil y el proyector). */
export function loginForm(onDone: () => void): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'emision-entrar';
  form.innerHTML = `<p class="pequeno">${t('emision.solo_profes')}</p>
    <label>${t('profe.email')}<input name="email" type="email" required autocomplete="email" /></label>
    <label>${t('profe.password')}<input name="password" type="password" required minlength="8" autocomplete="current-password" /></label>
    <button class="btn ancho">${t('profe.entrar')}</button>
    <p class="error" role="alert"></p>
    <p class="pequeno">${t('emision.sin_cuenta')} <a href="/profesor.html">${t('emision.crear_cuenta')}</a></p>`;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = form.querySelector('.error')!;
    out.textContent = '';
    const data = new FormData(form);
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      await loginTeacher(String(data.get('email')), String(data.get('password')));
      onDone();
    } catch (error) {
      out.textContent = (error as Error).message;
    } finally {
      button.disabled = false;
    }
  });
  return form;
}
