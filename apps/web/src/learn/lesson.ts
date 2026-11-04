import { getSpecies, composition } from '@webar/chem';
import { avatarSVG } from '../characters/avatar';
import { t } from '../i18n';
import { elementName, speciesName } from '../i18n/content';
import { createEveryday, hasEveryday } from '../objects';
import { calm, vibrate } from '../settings';
import { sfx } from '../sfx';
import { bohrSVG } from './bohr-svg';
import type { Exercise } from './exercises';
import { MiniScene } from './mini-scene';

export interface LessonResult {
  total: number;
  /** Acertadas a la primera. */
  right: number;
  xp: number;
  seconds: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Una lección a pantalla completa: barra de progreso arriba, un ejercicio en
 * medio y el botón «Comprobar» abajo, con la franja verde o roja al responder.
 * Lo que se falla vuelve al final hasta acertarlo.
 */
export function playLesson(
  dialog: HTMLDialogElement,
  opts: { title: string; guide: string; exercises: Exercise[]; onClose: (result: LessonResult | null) => void },
): void {
  const queue = [...opts.exercises];
  const questions = queue.filter((e) => e.kind !== 'ensena').length;
  const failed = new Set<Exercise>();
  const started = performance.now();
  let doneCount = 0;
  let current: Exercise | null = null;
  let selected: number | null = null;
  let built: string[] = [];
  let checked = false;
  let mini: MiniScene | null = null;
  let streakInRow = 0;

  dialog.innerHTML = `
    <header class="leccion-top">
      <button type="button" class="btn fantasma redondo" data-cerrar aria-label="${t('comun.cerrar')}">✕</button>
      <div class="barra-progreso" role="progressbar" aria-label="${t('leccion.progreso')}" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <span class="leccion-combo" aria-live="polite"></span>
    </header>
    <main class="leccion-cuerpo" id="leccion-cuerpo"></main>
    <footer class="leccion-pie">
      <div class="leccion-feedback" role="status" aria-live="assertive"></div>
      <button type="button" class="btn ancho" data-accion disabled></button>
    </footer>`;
  const body = dialog.querySelector<HTMLElement>('.leccion-cuerpo')!;
  const foot = dialog.querySelector<HTMLElement>('.leccion-pie')!;
  const feedback = dialog.querySelector<HTMLElement>('.leccion-feedback')!;
  const action = dialog.querySelector<HTMLButtonElement>('[data-accion]')!;
  const bar = dialog.querySelector<HTMLElement>('.barra-progreso')!;
  const combo = dialog.querySelector<HTMLElement>('.leccion-combo')!;

  dialog.querySelector('[data-cerrar]')!.addEventListener('click', () => close(null));
  dialog.addEventListener('cancel', onCancel);
  action.addEventListener('click', onAction);
  dialog.showModal();
  next();

  function onCancel(e: Event): void {
    e.preventDefault();
    close(null);
  }

  function close(result: LessonResult | null): void {
    mini?.dispose();
    mini = null;
    dialog.removeEventListener('cancel', onCancel);
    dialog.close();
    opts.onClose(result);
  }

  function progress(): void {
    const total = opts.exercises.length;
    const p = Math.min(doneCount / total, 1);
    bar.style.setProperty('--p', String(p));
    bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  function next(): void {
    mini?.dispose();
    mini = null;
    progress();
    current = queue.shift() ?? null;
    selected = null;
    built = [];
    checked = false;
    foot.className = 'leccion-pie';
    feedback.innerHTML = '';
    if (!current) return finish();
    body.classList.remove('entra');
    void body.offsetWidth;
    body.classList.add('entra');
    if (current.kind === 'ensena') renderTeach(current);
    else if (current.kind === 'opcion') renderChoice(current);
    else renderFormula(current);
    body.scrollTop = 0;
  }

  function renderTeach(ex: Extract<Exercise, { kind: 'ensena' }>): void {
    const visual =
      ex.visual === 'guia'
        ? `<div class="guia-habla"><div class="guia-avatar">${avatarSVG(opts.guide, { expression: 'habla', size: 120 })}</div><div class="bocadillo"><p>${esc(ex.text)}</p></div></div>`
        : ex.visual === 'objeto' && hasEveryday(ex.symbol)
          ? `<div class="mini-3d" data-mini></div><p class="pie-objeto">${esc(t(`objeto.${ex.symbol}`))}</p>`
          : `<div class="bohr-grande">${bohrSVG(ex.symbol, 170)}</div>`;
    body.innerHTML = `
      <h2 id="leccion-titulo">${esc(ex.title)}</h2>
      ${visual}
      ${ex.visual === 'guia' ? '' : `<p class="leccion-texto">${esc(ex.text)}</p>`}
      ${ex.extra ? `<p class="leccion-extra">💡 ${esc(ex.extra)}</p>` : ''}`;
    const host = body.querySelector<HTMLElement>('[data-mini]');
    if (host) {
      mini = new MiniScene(host);
      mini.show(createEveryday(ex.symbol, { size: 0.5, calm: calm() }));
    }
    action.disabled = false;
    action.textContent = t('leccion.continuar');
    action.className = 'btn ancho';
  }

  function renderChoice(ex: Extract<Exercise, { kind: 'opcion' }>): void {
    body.innerHTML = `
      <h2 id="leccion-titulo">${esc(ex.prompt)}</h2>
      ${ex.quote ? `<div class="guia-habla pequena"><div class="guia-avatar">${avatarSVG(opts.guide, { expression: 'piensa', size: 80 })}</div><div class="bocadillo"><p>«${esc(ex.quote)}»</p></div></div>` : ''}
      ${!ex.quote && ex.symbol ? `<div class="simbolo-leccion">${bohrSVG(ex.symbol, 96)}</div>` : ''}
      <div class="opciones" role="radiogroup" aria-labelledby="leccion-titulo">
        ${ex.options.map((o, i) => `<button type="button" role="radio" aria-checked="false" class="opcion-btn" data-i="${i}"><span class="tecla" aria-hidden="true">${i + 1}</span>${esc(o)}</button>`).join('')}
      </div>`;
    body.querySelectorAll<HTMLButtonElement>('.opcion-btn').forEach((b) =>
      b.addEventListener('click', () => {
        if (checked) return;
        sfx.toque();
        selected = Number(b.dataset.i);
        body.querySelectorAll('.opcion-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        action.disabled = false;
      }),
    );
    action.disabled = true;
    action.textContent = t('leccion.comprobar');
    action.className = 'btn ok ancho';
  }

  function renderFormula(ex: Extract<Exercise, { kind: 'formula' }>): void {
    const s = getSpecies(ex.species)!;
    body.innerHTML = `
      <h2 id="leccion-titulo">${t('leccion.forma', { nombre: speciesName(s.id).toLowerCase() })}</h2>
      <p class="texto-suave">${t('leccion.forma_texto')}</p>
      <div class="formula-hueco" aria-live="polite"></div>
      <div class="fichas">${ex.tiles.map((el, i) => `<button type="button" class="ficha-atomo" data-i="${i}" data-el="${el}" aria-label="${esc(elementName(el))}">${el}</button>`).join('')}</div>`;
    const slot = body.querySelector<HTMLElement>('.formula-hueco')!;
    const draw = () => {
      slot.innerHTML = built.length
        ? built.map((el, k) => `<button type="button" class="ficha-atomo puesta" data-k="${k}" aria-label="${t('leccion.quitar', { nombre: elementName(el) })}">${el}</button>`).join('')
        : `<span class="pequeno">${t('leccion.toca_fichas')}</span>`;
      slot.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) =>
        b.addEventListener('click', () => {
          if (checked) return;
          const k = Number(b.dataset.k);
          const el = built.splice(k, 1)[0];
          const back = [...body.querySelectorAll<HTMLButtonElement>(`.fichas [data-el="${el}"].usada`)][0];
          back?.classList.remove('usada');
          back && (back.disabled = false);
          draw();
        }),
      );
      action.disabled = built.length === 0;
    };
    body.querySelectorAll<HTMLButtonElement>('.fichas .ficha-atomo').forEach((b) =>
      b.addEventListener('click', () => {
        if (checked) return;
        sfx.toque();
        built.push(b.dataset.el!);
        b.classList.add('usada');
        b.disabled = true;
        draw();
      }),
    );
    draw();
    action.textContent = t('leccion.comprobar');
    action.className = 'btn ok ancho';
  }

  function onAction(): void {
    if (!current) return;
    if (current.kind === 'ensena' || checked) {
      doneCount++;
      return next();
    }
    checked = true;
    let ok = false;
    let solution = '';
    let explain = '';
    if (current.kind === 'opcion') {
      ok = selected === current.answer;
      solution = current.options[current.answer];
      explain = current.explain ?? '';
      body.querySelectorAll<HTMLButtonElement>('.opcion-btn').forEach((b, i) => {
        if (current!.kind === 'opcion' && i === current!.answer) b.classList.add('correcta');
        if (i === selected && !ok) b.classList.add('incorrecta');
      });
    } else {
      const s = getSpecies(current.species)!;
      const want = composition(s);
      const got: Record<string, number> = {};
      for (const el of built) got[el] = (got[el] ?? 0) + 1;
      ok = Object.keys(want).length === Object.keys(got).length && Object.entries(want).every(([el, n]) => got[el] === n);
      solution = `${Object.entries(want).map(([el, n]) => (n > 1 ? `${n} ${el}` : el)).join(' + ')} → ${s.formula}`;
      body.querySelector('.formula-hueco')!.classList.add(ok ? 'correcta' : 'incorrecta');
    }
    if (ok) {
      sfx.ok();
      vibrate(15);
      streakInRow++;
      if (streakInRow >= 3) {
        combo.textContent = t('leccion.combo', { n: streakInRow });
        combo.classList.remove('salta');
        void combo.offsetWidth;
        combo.classList.add('salta');
      }
    } else {
      sfx.mal();
      vibrate([40, 30, 40]);
      streakInRow = 0;
      combo.textContent = '';
      failed.add(current);
      // Vuelve al final de la cola: hasta acertarlo.
      queue.push(current);
      doneCount--;
    }
    foot.className = `leccion-pie ${ok ? 'ok' : 'mal'}`;
    const praise = t(`leccion.bien.${1 + Math.floor(Math.random() * 4)}`);
    feedback.innerHTML = ok
      ? `<b>✓ ${praise}</b>${explain ? `<p>${esc(explain)}</p>` : ''}`
      : `<b>✗ ${t('leccion.solucion')}</b><p>${esc(solution)}</p>${explain ? `<p>${esc(explain)}</p>` : ''}`;
    action.textContent = t('leccion.continuar');
    action.className = `btn ${ok ? 'ok' : 'mal'} ancho`;
    action.disabled = false;
    action.focus();
  }

  function finish(): void {
    const right = questions - failed.size;
    const perfect = failed.size === 0;
    const xp = Math.min(10 + right + (perfect ? 5 : 0), 30);
    const seconds = Math.round((performance.now() - started) / 1000);
    sfx.fanfarria();
    bar.style.setProperty('--p', '1');
    body.innerHTML = `
      <div class="leccion-fin">
        <div class="fin-avatar">${avatarSVG(opts.guide, { expression: 'feliz', size: 150 })}</div>
        <h2 id="leccion-titulo">${perfect ? t('leccion.perfecta') : t('leccion.completada')}</h2>
        <div class="fin-stats">
          <div class="fin-stat xp"><small>${t('leccion.stat_xp')}</small><b>⚡ ${xp}</b></div>
          <div class="fin-stat precision"><small>${t('leccion.stat_precision')}</small><b>🎯 ${questions ? Math.round((right / questions) * 100) : 100}%</b></div>
          <div class="fin-stat tiempo"><small>${t('leccion.stat_tiempo')}</small><b>⏱ ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</b></div>
        </div>
      </div>`;
    foot.className = 'leccion-pie';
    feedback.innerHTML = '';
    action.textContent = t('leccion.continuar');
    action.className = 'btn ancho';
    action.disabled = false;
    action.onclick = () => close({ total: questions, right, xp, seconds });
    action.removeEventListener('click', onAction);
  }
}

// Teclado: 1-4 eligen opción y Enter comprueba (como en las apps de idiomas).
document.addEventListener('keydown', (e) => {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.leccion[open]');
  if (!dialog || (e.target as HTMLElement).tagName === 'INPUT') return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) dialog.querySelectorAll<HTMLButtonElement>('.opcion-btn')[n - 1]?.click();
  if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') dialog.querySelector<HTMLButtonElement>('[data-accion]')?.click();
});
