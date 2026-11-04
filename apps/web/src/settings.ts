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
  sonido: boolean;
  /** Tema: claro (por defecto), oscuro o el que tenga el sistema. */
  tema: 'claro' | 'oscuro' | 'sistema';
  /** Meta diaria de XP. */
  meta: number;
  /** Mostrar la mascota (el gato cuántico). */
  gato: boolean;
  /** Tarjetas con cámara: dibujar lo que lee el detector (para ver por qué una tarjeta no sale). */
  diagnostico: boolean;
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
    sonido: true,
    tema: 'claro',
    meta: 20,
    gato: true,
    diagnostico: false,
  };
}

// El antiguo «oscuro» (que copiaba el del sistema) se olvida: ahora se elige el tema.
const { oscuro: _old, ...saved } = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings> & { oscuro?: boolean };
export const settings: Settings = { ...defaults(), ...saved };

const systemDark = matchMedia('(prefers-color-scheme: dark)');
/** ¿Se ve en oscuro ahora? (el tema elegido o, con «sistema», el del móvil). */
export const isDark = () => settings.tema === 'oscuro' || (settings.tema === 'sistema' && systemDark.matches);
systemDark.addEventListener('change', () => {
  if (settings.tema !== 'sistema') return;
  applySettings();
  onSettingsChange.forEach((fn) => fn());
});

/** Cambia el tema y lo guarda (botón rápido de la barra de arriba). */
export function setTheme(tema: Settings['tema']): void {
  settings.tema = tema;
  localStorage.setItem(KEY, JSON.stringify(settings));
  applySettings();
  onSettingsChange.forEach((fn) => fn());
}

export function applySettings(): void {
  const root = document.documentElement;
  root.style.setProperty('--scale', String(settings.letra));
  root.classList.toggle('alto-contraste', settings.contraste);
  root.classList.toggle('calma', settings.calma);
  root.classList.toggle('oscuro', isDark());
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', isDark() ? '#131a20' : '#ffffff');
  setLanguage(settings.idioma);
  translate();
}

/** ¿Menos movimiento? (ajuste de la app o del sistema). */
export const calm = () => settings.calma || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vibración corta para confirmar algo (Android; iPhone no tiene la API). */
export function vibrate(pattern: number | number[]): void {
  if (settings.vibrar) navigator.vibrate?.(pattern);
}

/** Quién quiere enterarse de que han cambiado los ajustes (p. ej. la mascota, la meta). */
export const onSettingsChange: Array<() => void> = [];

/** Conecta el formulario de ajustes; cambiar de idioma recarga la página para traducirlo todo. */
export function setupSettingsForm(form: HTMLFormElement): void {
  const field = <T extends HTMLElement>(name: string) => form.elements.namedItem(name) as T;
  field<HTMLSelectElement>('idioma').value = settings.idioma;
  (form.querySelector(`input[name=letra][value="${settings.letra}"]`) as HTMLInputElement | null)?.setAttribute('checked', '');
  field<HTMLInputElement>('contraste').checked = settings.contraste;
  field<HTMLInputElement>('calma').checked = settings.calma;
  field<HTMLInputElement>('vibrar').checked = settings.vibrar;
  (form.querySelector(`input[name=tema][value="${settings.tema}"]`) as HTMLInputElement | null)?.setAttribute('checked', '');
  for (const name of ['sonido', 'gato', 'diagnostico'] as const) if (form.elements.namedItem(name)) field<HTMLInputElement>(name).checked = settings[name];
  (form.querySelector(`input[name=meta][value="${settings.meta}"]`) as HTMLInputElement | null)?.setAttribute('checked', '');
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
      sonido: data.has('sonido'),
      tema: (data.get('tema') ?? settings.tema) as Settings['tema'],
      gato: data.has('gato'),
      diagnostico: data.has('diagnostico'),
      meta: Number(data.get('meta') ?? settings.meta),
    });
    onSettingsChange.forEach((fn) => fn());
    localStorage.setItem(KEY, JSON.stringify(settings));
    if (changedLanguage) location.reload();
    else applySettings();
  });
}
