import { t } from './i18n';
import { calm } from './settings';

const SEEN = 'webar:intro-vista';
const SECONDS = 4.5;

/**
 * La introducción: cinco escenas animadas, casi sin texto. Avanza sola (salvo
 * con menos movimiento), se puede pasar deslizando, con las flechas o con los
 * puntos, y saltar. Sale la primera vez y desde el botón «?».
 */
export function setupIntro(dialog: HTMLDialogElement): { open: () => void; openIfFirstTime: () => void } {
  const scenes = [...dialog.querySelectorAll<HTMLElement>('.escena')];
  const dots = dialog.querySelector<HTMLElement>('#intro-puntos')!;
  const next = dialog.querySelector<HTMLButtonElement>('#intro-siguiente')!;
  let index = 0;
  let timer = 0;

  dots.replaceChildren(
    ...scenes.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', t('intro.paso', { n: i + 1, total: scenes.length }));
      b.addEventListener('click', () => show(i));
      return b;
    }),
  );

  function show(i: number): void {
    index = Math.max(0, Math.min(i, scenes.length - 1));
    scenes.forEach((s, k) => {
      s.classList.toggle('activa', k === index);
      s.setAttribute('aria-hidden', String(k !== index));
      // Reinicia las animaciones de la escena que entra.
      if (k === index) s.querySelectorAll<HTMLElement>('.visual *').forEach((el) => {
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      });
    });
    [...dots.children].forEach((d, k) => (k === index ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
    next.textContent = index === scenes.length - 1 ? t('intro.empezar') : t('intro.siguiente');
    clearTimeout(timer);
    if (!calm() && index < scenes.length - 1) timer = window.setTimeout(() => show(index + 1), SECONDS * 1000);
  }

  function close(): void {
    clearTimeout(timer);
    localStorage.setItem(SEEN, '1');
    dialog.close();
  }

  next.addEventListener('click', () => (index === scenes.length - 1 ? close() : show(index + 1)));
  dialog.querySelector('#intro-saltar')!.addEventListener('click', close);
  dialog.addEventListener('cancel', () => localStorage.setItem(SEEN, '1'));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });
  // Deslizar con el dedo.
  let startX = 0;
  dialog.addEventListener('pointerdown', (e) => (startX = e.clientX));
  dialog.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });

  const open = () => {
    dialog.showModal();
    show(0);
    next.focus();
  };
  return { open, openIfFirstTime: () => !localStorage.getItem(SEEN) && open() };
}
