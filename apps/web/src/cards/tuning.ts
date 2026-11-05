import { DEFAULT_TUNING, type MarkerTrackingProvider, type MarkerTuning } from '@webar/ar-core';
import { t } from '../i18n';
import { DEFAULT_FOLLOW, setFollow } from './card-visual';

/**
 * Ajuste fino de la RA (Ajustes → «Ajuste fino de la realidad aumentada»):
 * un panel sobre la cámara con deslizadores para cada valor que decide cómo
 * se lee y se sigue una tarjeta. Cada cambio se nota en el fotograma
 * siguiente y se guarda en el móvil (cada cámara y cada luz son distintas).
 */
const KEY = 'webar:ajuste-ra';

export type Tuning = MarkerTuning & { seguirAtomo: number };

interface Slider {
  key: keyof Tuning;
  min: number;
  max: number;
  step: number;
}

/** Los deslizadores, por grupos (textos: ajuste.<grupo>, ajuste.<clave> y ajuste.<clave>_ayuda). */
const GROUPS: Array<{ id: string; sliders: Slider[] }> = [
  {
    id: 'deteccion',
    sliders: [
      { key: 'bitsErroneos', min: 0, max: 6, step: 1 },
      { key: 'anchoDeteccion', min: 320, max: 1280, step: 32 },
      { key: 'papelRelativo', min: 0, max: 0.4, step: 0.01 },
      { key: 'papelVentana', min: 1, max: 10, step: 1 },
      { key: 'movimientoRelativo', min: 0, max: 0.4, step: 0.01 },
      { key: 'movimientoVentana', min: 1, max: 10, step: 1 },
    ],
  },
  {
    id: 'identidad',
    sliders: [
      { key: 'confirmar', min: 1, max: 6, step: 1 },
      { key: 'reservar', min: 0, max: 3000, step: 100 },
      { key: 'perder', min: 100, max: 2000, step: 50 },
    ],
  },
  {
    id: 'temblor',
    sliders: [
      { key: 'posicionCorte', min: 0.05, max: 5, step: 0.05 },
      { key: 'posicionBeta', min: 0, max: 200, step: 5 },
      { key: 'giroCorte', min: 0.05, max: 5, step: 0.05 },
      { key: 'giroBeta', min: 0, max: 20, step: 0.5 },
      { key: 'seguirAtomo', min: 2, max: 40, step: 1 },
    ],
  },
  {
    id: 'encaje',
    sliders: [{ key: 'campoVision', min: 40, max: 90, step: 0.5 }],
  },
];

export function savedTuning(): Partial<Tuning> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Tuning>;
  } catch {
    return {};
  }
}

/** Aplica lo guardado (al arrancar la app). */
export function applySavedTuning(marker: MarkerTrackingProvider): void {
  const { seguirAtomo, ...rest } = savedTuning();
  marker.tune(rest);
  setFollow(seguirAtomo ?? DEFAULT_FOLLOW);
}

const decimals = (step: number) => (step >= 1 ? 0 : String(step).split('.')[1].length);

/** El panel, encima de la cámara. Devuelve cómo quitarlo. */
export function openTuningPanel(host: HTMLElement, marker: MarkerTrackingProvider, defaults: MarkerTuning, onClose: () => void): () => void {
  const panel = document.createElement('section');
  panel.className = 'ajuste-ra';
  panel.setAttribute('aria-labelledby', 'ajuste-ra-titulo');
  const current = (): Tuning => ({ ...marker.tuning, seguirAtomo: savedTuning().seguirAtomo ?? DEFAULT_FOLLOW });
  const save = () => {
    const now = current();
    // Solo lo que difiere de lo de serie: así una mejora futura de los valores por defecto llega igual.
    const diff = Object.fromEntries(Object.entries(now).filter(([k, v]) => v !== (k === 'seguirAtomo' ? DEFAULT_FOLLOW : defaults[k as keyof MarkerTuning])));
    localStorage.setItem(KEY, JSON.stringify(diff));
  };
  const slider = (s: Slider, value: number) => `<label class="ajuste-fila">
      <span class="ajuste-nombre">${t(`ajuste.${s.key}`)} <output data-valor="${s.key}">${value.toFixed(decimals(s.step))}</output></span>
      <input type="range" data-clave="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}" />
      <small>${t(`ajuste.${s.key}_ayuda`)}</small>
    </label>`;
  const render = () => {
    const v = current();
    panel.innerHTML = `<header><h2 id="ajuste-ra-titulo">${t('ajuste.titulo')}</h2>
        <button type="button" class="btn claro pequeno" data-plegar aria-expanded="true">${t('ajuste.plegar')}</button></header>
      <p class="ajuste-estado" aria-live="polite"></p>
      <div class="ajuste-cuerpo">
        <p class="pequeno">${t('ajuste.explicacion')}</p>
        <fieldset class="ajuste-grupo"><legend>${t('ajuste.umbral')}</legend>
          <div class="segmentado" role="radiogroup">${(['alternar', 'papel', 'movimiento'] as const)
            .map((u) => `<button type="button" role="radio" aria-checked="${v.umbral === u}" data-umbral="${u}">${t(`ajuste.umbral_${u}`)}</button>`)
            .join('')}</div>
          <label class="interruptor"><input type="checkbox" data-mesa ${v.mismaMesa ? 'checked' : ''}/> <span>${t('ajuste.mismaMesa')}</span></label>
        </fieldset>
        ${GROUPS.map((g) => `<fieldset class="ajuste-grupo"><legend>${t(`ajuste.${g.id}`)}</legend>${g.sliders.map((s) => slider(s, Number(v[s.key]))).join('')}</fieldset>`).join('')}
        <div class="fila"><button type="button" class="btn claro" data-restablecer>${t('ajuste.restablecer')}</button>
          <button type="button" class="btn" data-cerrar>${t('ajuste.listo')}</button></div>
      </div>`;
  };
  render();
  host.append(panel);

  panel.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.clave as keyof Tuning | undefined;
    if (!key) return;
    const value = Number(input.value);
    if (key === 'seguirAtomo') {
      setFollow(value);
      localStorage.setItem(KEY, JSON.stringify({ ...savedTuning(), seguirAtomo: value }));
    } else marker.tune({ [key]: value });
    panel.querySelector(`[data-valor="${key}"]`)!.textContent = value.toFixed(decimals(Number(input.step)));
    save();
  });
  panel.addEventListener('change', (e) => {
    const box = e.target as HTMLInputElement;
    if (box.dataset.mesa === undefined) return;
    marker.tune({ mismaMesa: box.checked });
    save();
  });
  panel.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('button');
    if (!el) return;
    if (el.dataset.umbral) {
      marker.tune({ umbral: el.dataset.umbral as MarkerTuning['umbral'] });
      panel.querySelectorAll('[data-umbral]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
      save();
    } else if (el.hasAttribute('data-restablecer')) {
      marker.tune(defaults);
      setFollow(DEFAULT_FOLLOW);
      localStorage.removeItem(KEY);
      render();
    } else if (el.hasAttribute('data-plegar')) {
      const folded = panel.classList.toggle('plegado');
      el.setAttribute('aria-expanded', String(!folded));
      el.textContent = folded ? t('ajuste.desplegar') : t('ajuste.plegar');
    } else if (el.hasAttribute('data-cerrar')) onClose();
  });

  // Lo que pasa ahora: tarjetas que se siguen y análisis por segundo.
  let last = marker.stats.analyzed;
  const timer = setInterval(() => {
    const rate = marker.stats.analyzed - last;
    last = marker.stats.analyzed;
    panel.querySelector('.ajuste-estado')!.textContent = t('ajuste.estado', { n: marker.trackedCount, fps: rate });
  }, 1000);
  return () => {
    clearInterval(timer);
    panel.remove();
  };
}

export { DEFAULT_TUNING };
