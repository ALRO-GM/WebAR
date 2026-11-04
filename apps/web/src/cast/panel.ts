import { t } from '../i18n';
import { castFetch, forgetTeacher, loginForm, teacherToken, type CastStatus } from './api';
import type { CastDeps } from './compositor';
import { getCastSender } from './sender';

const POLL_MS = 4000;

/**
 * Panel para el perfil: entrar como profesor/a (correo y contraseña, como en
 * profesor.html), ver si hay un ordenador esperando y Emitir / Dejar de emitir.
 * Se puede volver a llamar sobre el mismo contenedor; deja de consultar al
 * servidor cuando el contenedor sale del documento.
 */
export function renderCastPanel(container: HTMLElement, deps: CastDeps): void {
  const sender = getCastSender(deps);
  container.classList.add('emision-panel');
  const generation = String(Number(container.dataset.emisionGen ?? 0) + 1);
  container.dataset.emisionGen = generation;
  // Vale montarlo antes de meter el contenedor en la página (30 s de margen).
  const born = Date.now();
  let seen = false;
  const alive = () => {
    if (container.dataset.emisionGen !== generation) return false;
    if (container.isConnected) return (seen = true);
    return !seen && Date.now() - born < 30_000;
  };

  if (!teacherToken()) {
    container.innerHTML = `<h3>${t('emision.titulo')}</h3><p>${t('emision.explicacion')}</p>`;
    container.append(loginForm(() => renderCastPanel(container, deps)));
    return;
  }

  container.innerHTML = `<h3>${t('emision.titulo')}</h3>
    <p class="pequeno">${t('emision.explicacion')}</p>
    <p class="emision-pantallas" role="status" aria-live="polite"></p>
    <ol class="emision-pasos pequeno"><li>${t('emision.paso_ordenador', { url: `<b>${location.host}/proyector.html</b>` })}</li><li>${t('emision.paso_movil')}</li></ol>
    <button type="button" class="btn ancho emision-boton"></button>
    <p class="error" role="alert"></p>
    <p class="pequeno"><button type="button" class="btn fantasma emision-salir">${t('emision.salir')}</button></p>`;
  const screens = container.querySelector<HTMLElement>('.emision-pantallas')!;
  const button = container.querySelector<HTMLButtonElement>('.emision-boton')!;
  const error = container.querySelector<HTMLElement>('.error')!;
  let lastStatus: CastStatus | null = null;

  const paint = () => {
    if (!alive()) return;
    const n = sender.active ? sender.screensOpen : (lastStatus?.pantallas.length ?? 0);
    screens.textContent = lastStatus || sender.active ? (n ? t(n === 1 ? 'emision.pantallas_1' : 'emision.pantallas_n', { n }) : t('emision.sin_pantallas')) : t('emision.comprobando');
    screens.classList.toggle('hay', n > 0);
    button.textContent = sender.active ? t('emision.dejar') : t('emision.emitir');
    button.classList.toggle('mal', sender.active);
    button.setAttribute('aria-pressed', String(sender.active));
    error.textContent = sender.state === 'error' ? sender.error : '';
  };
  const off = sender.onChange(() => (alive() ? paint() : off()));

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (sender.active) await sender.stop();
      else await sender.start();
    } finally {
      button.disabled = false;
      if (!teacherToken()) renderCastPanel(container, deps);
      else paint();
    }
  });
  container.querySelector('.emision-salir')!.addEventListener('click', async () => {
    await sender.stop();
    forgetTeacher();
    renderCastPanel(container, deps);
  });

  // ¿Hay algún ordenador esperando? (mientras no se emite; emitiendo lo sabe el emisor).
  const check = async () => {
    if (!alive()) return off();
    if (!sender.active) {
      try {
        lastStatus = await castFetch<CastStatus>('GET', '/api/emision');
      } catch (e) {
        if (!teacherToken()) return renderCastPanel(container, deps);
        error.textContent = (e as Error).message;
      }
    }
    paint();
    setTimeout(check, POLL_MS);
  };
  paint();
  void check();
}
