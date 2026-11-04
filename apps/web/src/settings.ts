import { setLanguage, translate } from './i18n';

/** Ajustes de accesibilidad y de idioma, guardados en el móvil. */
export interface Settings {
  idioma: string;
  /** Escala del texto: 1, 1,15 o 1,3. */
  letra: number;
  contraste: boolean;
  /** Menos movimiento (animaciones mínimas, sin temblores). */
  calma: boolean;
  vibrar: boolean;
}

const KEY = 'webar:ajustes';
const LANGUAGES = ['es', 'en'];

function defaults(): Settings {
  const lang = navigator.language.slice(0, 2);
  return {
    idioma: LANGUAGES.includes(lang) ? lang : 'es',
    letra: 1,
    contraste: matchMedia('(prefers-contrast: more)').matches,
    calma: matchMedia('(prefers-reduced-motion: reduce)').matches,
    vibrar: true,
  };
}

export const settings: Settings = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };

export function applySettings(): void {
  const root = document.documentElement;
  root.style.setProperty('--scale', String(settings.letra));
  root.classList.toggle('alto-contraste', settings.contraste);
  root.classList.toggle('calma', settings.calma);
  setLanguage(settings.idioma);
  translate();
}

/** ¿Menos movimiento? (ajuste de la app o del sistema). */
export const calm = () => settings.calma || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vibración corta para confirmar algo (Android; iPhone no tiene la API). */
export function vibrate(pattern: number | number[]): void {
  if (settings.vibrar) navigator.vibrate?.(pattern);
}

/** Conecta el formulario de ajustes; cambiar de idioma recarga la página para traducirlo todo. */
export function setupSettingsForm(form: HTMLFormElement): void {
  const field = <T extends HTMLElement>(name: string) => form.elements.namedItem(name) as T;
  field<HTMLSelectElement>('idioma').value = settings.idioma;
  (form.querySelector(`input[name=letra][value="${settings.letra}"]`) as HTMLInputElement | null)?.setAttribute('checked', '');
  field<HTMLInputElement>('contraste').checked = settings.contraste;
  field<HTMLInputElement>('calma').checked = settings.calma;
  field<HTMLInputElement>('vibrar').checked = settings.vibrar;
  form.addEventListener('change', () => {
    const data = new FormData(form);
    const language = String(data.get('idioma'));
    const changedLanguage = language !== settings.idioma;
    Object.assign(settings, {
      idioma: language,
      letra: Number(data.get('letra') ?? 1),
      contraste: data.has('contraste'),
      calma: data.has('calma'),
      vibrar: data.has('vibrar'),
    });
    localStorage.setItem(KEY, JSON.stringify(settings));
    if (changedLanguage) location.reload();
    else applySettings();
  });
}
