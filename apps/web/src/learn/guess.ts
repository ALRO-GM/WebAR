import { ELEMENTS, getSpecies } from '@webar/chem';
import { has, t } from '../i18n';
import { contentName } from '../i18n/content';
import { createEveryday, everydayArchetype, hasEveryday } from '../objects';
import { calm, vibrate } from '../settings';
import { sfx } from '../sfx';
import type { Answer } from './exercises';
import { watchLeave } from './leave-guard';
import { MiniScene } from './mini-scene';

export interface GuessResult {
  right: number;
  total: number;
  xp: number;
  answers: Answer[];
}

const ROUNDS = 5;
const shuffle = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clueKey = (c: string) => (getSpecies(c) ? `especie.${c}.pista` : `elemento.${c}.pista`);

/**
 * «Adivina»: se ve en 3D el objeto cotidiano de un elemento o sustancia (el
 * Sol para el helio, un doblón para el oro, la esfera de agua…) y hay que
 * decir cuál es. La pista cuesta la mitad del punto. Al responder se explica
 * qué tiene que ver el objeto con el elemento.
 */
export function playGuess(dialog: HTMLDialogElement, pool: string[], onClose: (r: GuessResult | null) => void): void {
  const candidates = pool.filter(hasEveryday);
  // Con pocos conocidos, se completa con los primeros elementos (como opciones, no como preguntas).
  const fillers = ELEMENTS.slice(0, 20).map((e) => e.symbol).filter((s) => !candidates.includes(s));
  const rounds = shuffle(candidates).slice(0, ROUNDS);
  let round = 0;
  let score = 0;
  let right = 0;
  const answers: Answer[] = [];
  let mini: MiniScene | null = null;
  let answered = false;
  let usedClue = false;

  dialog.innerHTML = `
    <header class="leccion-top">
      <button type="button" class="btn fantasma redondo" data-cerrar aria-label="${t('comun.cerrar')}">✕</button>
      <div class="barra-progreso" role="progressbar" aria-label="${t('leccion.progreso')}"><span></span></div>
      <span class="chip" data-puntos>⭐ 0</span>
    </header>
    <main class="leccion-cuerpo"></main>
    <footer class="leccion-pie"><div class="leccion-feedback" role="status" aria-live="assertive"></div>
      <button type="button" class="btn ancho" data-accion></button></footer>`;
  const body = dialog.querySelector<HTMLElement>('.leccion-cuerpo')!;
  const foot = dialog.querySelector<HTMLElement>('.leccion-pie')!;
  const feedback = dialog.querySelector<HTMLElement>('.leccion-feedback')!;
  const action = dialog.querySelector<HTMLButtonElement>('[data-accion]')!;
  const bar = dialog.querySelector<HTMLElement>('.barra-progreso')!;
  const points = dialog.querySelector<HTMLElement>('[data-puntos]')!;
  const cancel = (e: Event) => (e.preventDefault(), close(null));
  dialog.addEventListener('cancel', cancel);
  dialog.querySelector('[data-cerrar]')!.addEventListener('click', () => close(null));
  action.addEventListener('click', () => {
    if (restarting) {
      restarting = false;
      return show();
    }
    if (answered) next();
  });
  dialog.showModal();
  // Salir a mitad (otra app, pestaña o ventana): se empieza de nuevo.
  let restarting = false;
  const stopWatching = watchLeave(() => {
    if (round >= rounds.length) return;
    round = 0;
    score = 0;
    right = 0;
    answers.length = 0;
    points.textContent = '⭐ 0';
    mini?.dispose();
    mini = null;
    bar.style.setProperty('--p', '0');
    foot.className = 'leccion-pie';
    feedback.innerHTML = '';
    body.innerHTML = `<div class="leccion-reinicio"><h2 id="leccion-titulo">${t('leccion.reinicio_titulo')}</h2><p class="leccion-texto">${t('leccion.reinicio_texto')}</p></div>`;
    action.textContent = t('leccion.reinicio_boton');
    action.className = 'btn ancho';
    action.disabled = false;
    restarting = true;
  });
  if (!rounds.length) {
    body.innerHTML = `<p>${t('adivina.vacio')}</p>`;
    action.textContent = t('comun.cerrar');
    action.onclick = () => close(null);
    return;
  }
  show();

  function close(r: GuessResult | null): void {
    stopWatching();
    mini?.dispose();
    mini = null;
    dialog.removeEventListener('cancel', cancel);
    dialog.close();
    onClose(r);
  }

  function show(): void {
    const target = rounds[round];
    answered = false;
    usedClue = false;
    bar.style.setProperty('--p', String(round / rounds.length));
    foot.className = 'leccion-pie';
    feedback.innerHTML = '';
    // Fuera de las opciones los que se ven con el mismo objeto (p. ej. reloj atómico: Rb, Cs, Yb).
    const look = (c: string) => JSON.stringify(everydayArchetype(c) ?? c);
    const same = (c: string) => t(`objeto.${c}`) === t(`objeto.${target}`) || look(c) === look(target);
    const others = shuffle([...candidates, ...fillers].filter((c) => c !== target && !same(c) && !!getSpecies(c) === !!getSpecies(target))).slice(0, 3);
    const fallback = shuffle(fillers.filter((f) => f !== target && !same(f) && !others.includes(f))).slice(0, 3 - others.length);
    const options = shuffle([target, ...others, ...fallback]);
    body.innerHTML = `
      <h2 id="leccion-titulo">${t(getSpecies(target) ? 'adivina.pregunta_sustancia' : 'adivina.pregunta')}</h2>
      <div class="mini-3d grande" data-mini aria-label="${t('adivina.objeto_aria')}" role="img"></div>
      ${has(clueKey(target)) ? `<button type="button" class="btn info pequeno" data-pista>💡 ${t('adivina.pista')}</button><p class="cita" data-texto-pista hidden></p>` : ''}
      <div class="opciones dos">${options.map((o) => `<button type="button" class="opcion-btn" data-o="${o}">${esc(contentName(o))}</button>`).join('')}</div>`;
    mini?.dispose();
    mini = new MiniScene(body.querySelector<HTMLElement>('[data-mini]')!);
    mini.show(createEveryday(target, { size: 0.5, calm: calm() }));
    body.querySelector('[data-pista]')?.addEventListener('click', (e) => {
      usedClue = true;
      (e.currentTarget as HTMLElement).remove();
      const p = body.querySelector<HTMLElement>('[data-texto-pista]')!;
      p.textContent = `«${t(clueKey(target))}»`;
      p.hidden = false;
    });
    body.querySelectorAll<HTMLButtonElement>('[data-o]').forEach((b) => b.addEventListener('click', () => answer(b, target)));
    action.textContent = t('adivina.elige');
    action.disabled = true;
    action.className = 'btn ancho';
  }

  function answer(button: HTMLButtonElement, target: string): void {
    if (answered) return;
    answered = true;
    const ok = button.dataset.o === target;
    body.querySelectorAll<HTMLButtonElement>('[data-o]').forEach((b) => b.classList.toggle('correcta', b.dataset.o === target));
    if (!ok) button.classList.add('incorrecta');
    answers.push({ tipo: 'objeto', tema: target, ok });
    if (ok) {
      right++;
      score += usedClue ? 1 : 2;
      sfx.ok();
      vibrate(15);
    } else {
      sfx.mal();
      vibrate([40, 30, 40]);
    }
    points.textContent = `⭐ ${score}`;
    foot.className = `leccion-pie ${ok ? 'ok' : 'mal'}`;
    feedback.innerHTML = `<b>${ok ? `✓ ${t('adivina.bien', { objeto: t(`objeto.${target}`) })}` : `✗ ${t('adivina.era', { nombre: contentName(target) })}`}</b>
      ${has(`objeto.${target}.porque`) ? `<p>${esc(t(`objeto.${target}.porque`))}</p>` : ''}`;
    action.textContent = t('leccion.continuar');
    action.className = `btn ${ok ? 'ok' : 'mal'} ancho`;
    action.disabled = false;
  }

  function next(): void {
    round++;
    if (round < rounds.length) return show();
    answered = false;
    mini?.dispose();
    mini = null;
    bar.style.setProperty('--p', '1');
    const xp = Math.min(score * 2, 20);
    sfx.fanfarria();
    foot.className = 'leccion-pie';
    feedback.innerHTML = '';
    body.innerHTML = `<div class="leccion-fin"><p class="fin-emoji" aria-hidden="true">🔮</p>
      <h2 id="leccion-titulo">${t('adivina.fin', { n: right, total: rounds.length })}</h2>
      <div class="fin-stats"><div class="fin-stat xp"><small>${t('leccion.stat_xp')}</small><b>⚡ ${xp}</b></div>
      <div class="fin-stat precision"><small>${t('leccion.stat_precision')}</small><b>🎯 ${Math.round((right / rounds.length) * 100)}%</b></div></div></div>`;
    action.textContent = t('leccion.continuar');
    action.className = 'btn ancho';
    action.onclick = () => close({ right, total: rounds.length, xp, answers });
  }
}
