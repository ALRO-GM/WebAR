import { SPECIES, composition, getElement, getSpecies, type ElementData, type Outcome } from '@webar/chem';
import { has, t, translate } from '../i18n';
import { elementName, num, speciesName, speciesUse } from '../i18n/content';
import { renderPeriodicTable, updateLocks } from '../periodic-table';
import { BADGES, COURSES, COURSE_SPECIES, computeProgress, courseOf, progressDiff, type Progress } from './progress';
import { addEvent, allEvents, isPersisted, persistStorage } from './store';
import { ClassSync } from './sync';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Un reto en juego: formar todas sus sustancias. */
export interface ActiveChallenge {
  id: string;
  title: string;
  targets: string[];
}

/**
 * La parte de «aprender jugando»: progreso, colección, tabla por desbloquear,
 * retos, clase y logros. Todo sale del registro de eventos local; la clase se
 * sincroniza cuando hay red.
 */
export class Hub {
  progress: Progress = computeProgress([]);
  readonly sync = new ClassSync();
  active: ActiveChallenge | null = null;

  async init(): Promise<void> {
    translate();
    this.progress = computeProgress(await allEvents());
    this.setupTabs();
    renderPeriodicTable($('tabla-progresiva'), (el) => this.showElement(el), (el) => !this.isUnlocked(el.symbol));
    $('offline-boton').addEventListener('click', async () => {
      await persistStorage();
      void this.renderOffline();
    });
    this.sync.on('change', () => {
      this.renderHeader();
      this.renderClass();
      this.renderChallenges();
    });
    await this.sync.init();
    // Enlace de invitación: /?unirse=CODIGO abre la pestaña de clase con el código puesto.
    const invite = new URLSearchParams(location.search).get('unirse');
    if (invite && !this.sync.joined) {
      this.selectTab('clase');
      ($('clase-codigo') as HTMLInputElement | null)?.setAttribute('value', invite.toUpperCase());
    }
    this.renderAll();
  }

  isUnlocked(symbol: string): boolean {
    return this.progress.unlocked.has(symbol);
  }

  /** Apunta lo que ha pasado en el juego y celebra lo nuevo. */
  async record(outcome: Outcome, products: string[]): Promise<void> {
    const before = this.progress;
    await addEvent('reaccion', { reaccion: outcome.reaction.id, ecuacion: outcome.equation, deltaH: outcome.deltaH });
    for (const species of new Set(products)) if (!before.species.has(species)) await addEvent('descubrir', { sustancia: species });
    let after = computeProgress(await allEvents());
    // ¿Completa el reto en juego?
    if (this.active && this.active.targets.every((s) => after.species.has(s) || products.includes(s)) && !after.challenges.has(this.active.id)) {
      await addEvent('reto', { reto: this.active.id });
      after = computeProgress(await allEvents());
      this.toast('🏆', t('celebrar.reto'), this.active.title);
      this.active = null;
    }
    this.progress = after;
    this.celebrate(before, after);
    this.renderAll();
    void this.sync.queued();
  }

  /** Un reto superado fuera del camino normal (p. ej. un acertijo). */
  async recordChallenge(id: string): Promise<void> {
    const before = this.progress;
    if (before.challenges.has(id)) return;
    await addEvent('reto', { reto: id });
    this.progress = computeProgress(await allEvents());
    this.celebrate(before, this.progress);
    this.renderAll();
    void this.sync.queued();
  }

  /** Texto del reto en juego para el HUD («Reto: forma Ca(OH)₂ · 2/5»). */
  challengeLabel(): string | null {
    if (!this.active) return null;
    const missing = this.active.targets.filter((s) => !this.progress.species.has(s));
    const next = missing[0] ? getSpecies(missing[0])?.formula ?? missing[0] : '✓';
    const done = this.active.targets.length - missing.length;
    return `${t('retos.activo', { formula: next })}${this.active.targets.length > 1 ? ` · ${done}/${this.active.targets.length}` : ''}`;
  }

  // --- Pestañas ------------------------------------------------------------------

  private setupTabs(): void {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.nav-inferior [role=tab]')];
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => this.selectTab(tab.id.slice(4)));
      // Flechas para moverse entre pestañas (patrón ARIA de pestañas).
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        this.selectTab(next.id.slice(4));
      });
    });
  }

  /** Muestra una sección (las de la barra de abajo, o «logros», que se abre desde el perfil). */
  selectTab(name: string): void {
    document.querySelectorAll<HTMLElement>('#inicio > [role=tabpanel]').forEach((panel) => (panel.hidden = panel.id !== `p-${name}`));
    document.querySelectorAll<HTMLButtonElement>('.nav-inferior [role=tab]').forEach((tab) => {
      const on = tab.id === `tab-${name}`;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on || (name === 'logros' && tab.id === 'tab-jugar') ? 0 : -1;
    });
    $('inicio').scrollTop = 0;
  }

  // --- Pintar ----------------------------------------------------------------------

  renderAll(): void {
    this.renderHeader();
    this.renderCollection();
    this.renderTable();
    this.renderChallenges();
    this.renderClass();
    this.renderBadges();
    void this.renderOffline();
    $('reto-activo').hidden = !this.active;
    $('reto-activo').textContent = this.challengeLabel() ?? '';
  }

  private renderHeader(): void {
    const p = this.progress;
    $('perfil-nivel').textContent = t('perfil.nivel', { nivel: p.level + 1 });
    $('perfil-nombre-nivel').textContent = t(`nivel.${p.level}`);
    $('perfil-xp').textContent = p.levelNext ? t('perfil.xp_siguiente', { faltan: p.levelNext - p.xp }) : t('perfil.xp', { xp: p.xp });
    $('perfil-racha').textContent = p.weekStreak === 1 ? t('perfil.racha_1') : p.weekStreak ? t('perfil.racha', { semanas: p.weekStreak }) : t('perfil.racha_cero');
    const fraction = p.levelNext ? (p.xp - p.levelFloor) / (p.levelNext - p.levelFloor) : 1;
    const bar = $('perfil-barra');
    bar.style.setProperty('--p', String(fraction));
    bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const s = this.sync;
    // Sin clase, el progreso solo vive en el móvil: no hay nada «pendiente de enviar».
    $('estado-red').textContent = !s.joined ? '' : !s.online ? '📴' : s.pending ? `⏳ ${s.pending}` : '☁️';
    $('estado-red').title = !s.joined ? '' : !s.online ? t('clase.sin_conexion') : s.pending ? t('clase.pendientes', { n: s.pending }) : t('clase.sincronizado');
  }

  private renderCollection(): void {
    const p = this.progress;
    $('moleculario-progreso').textContent = t('moleculario.progreso', { tienes: p.species.size, total: SPECIES.length });
    $('moleculario').innerHTML = COURSES.map(
      (course) =>
        `<h3>${t(`curso.${course}`)}</h3><div class="rejilla">${COURSE_SPECIES[course]
          .map((id) => {
            const s = getSpecies(id)!;
            const got = p.species.has(id);
            return `<button type="button" class="ficha-mini ${got ? '' : 'bloqueada'}" data-especie="${id}" aria-label="${got ? esc(speciesName(id)) : `${t('moleculario.bloqueada_lector')} ${t('moleculario.pista_atomos', { n: s.atoms.length })}`}">
              <b>${got ? s.formula : t('moleculario.bloqueada')}</b><small>${got ? esc(speciesName(id)) : t('moleculario.pista_atomos', { n: s.atoms.length })}</small></button>`;
          })
          .join('')}</div>`,
    ).join('');
    $('moleculario').querySelectorAll<HTMLButtonElement>('[data-especie]').forEach((b) => b.addEventListener('click', () => this.showSpecies(b.dataset.especie!)));
  }

  private renderTable(): void {
    updateLocks($('tabla-progresiva'), (el) => !this.isUnlocked(el.symbol));
    $('tabla-progreso').textContent = t('tabla.progreso', { tienes: this.progress.unlocked.size });
  }

  private renderChallenges(): void {
    const p = this.progress;
    const card = (id: string, title: string, targets: string[], extra = '') => {
      const done = targets.filter((s) => p.species.has(s)).length;
      const complete = p.challenges.has(id) || done === targets.length;
      return `<article class="reto ${complete ? 'hecho' : ''}">
        <div><b>${esc(title)}</b><small>${extra}${targets.map((s) => getSpecies(s)?.formula ?? s).join(' · ')}</small></div>
        <div class="reto-lado"><span class="contador">${complete ? t('retos.completado') : t('retos.progreso', { tienes: done, total: targets.length })}</span>
        ${complete ? '' : `<button type="button" class="secundario" data-reto="${esc(id)}">${t('retos.jugar')}</button>`}</div>
      </article>`;
    };
    const classChallenges = this.sync.state?.retos ?? [];
    const challenges: ActiveChallenge[] = [
      ...classChallenges.map((c) => ({ id: `clase-${c.id}`, title: c.title, targets: c.targets })),
      ...COURSES.map((c) => ({ id: `curso-${c}`, title: t('reto.curso.titulo', { curso: t(`curso.${c}`) }), targets: COURSE_SPECIES[c] })),
    ];
    $('retos').innerHTML = `
      <article class="reto destacado"><div><b>⚡ ${t('retos.formula')}</b><small>${t('retos.formula_texto')}</small></div>
        <div class="reto-lado"><button type="button" data-reto="formula">${t('retos.jugar')}</button></div></article>
      ${this.sync.joined ? `<h3>${t('retos.clase')}</h3>${classChallenges.length ? classChallenges.map((c) => card(`clase-${c.id}`, c.title, c.targets, c.ends ? `${t('retos.hasta', { fecha: new Date(c.ends).toLocaleDateString(document.documentElement.lang) })} · ` : '')).join('') : `<p class="pequeno">${t('retos.ninguno')}</p>`}` : ''}
      <h3>${t('retos.curso')}</h3>${COURSES.map((c) => card(`curso-${c}`, t('reto.curso.titulo', { curso: t(`curso.${c}`) }), COURSE_SPECIES[c])).join('')}`;
    $('retos').querySelectorAll<HTMLButtonElement>('[data-reto]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.reto!;
        this.active = id === 'formula' ? this.formulaChallenge() : challenges.find((c) => c.id === id) ?? null;
        this.selectTab('jugar');
        this.renderAll();
      }),
    );
  }

  /** Una sustancia sin descubrir que se pueda formar con los elementos desbloqueados. */
  private formulaChallenge(): ActiveChallenge {
    const p = this.progress;
    const possible = SPECIES.filter((s) => !p.species.has(s.id) && Object.keys(composition(s)).every((el) => p.unlocked.has(el)));
    const pool = possible.length ? possible : SPECIES;
    const s = pool[Math.floor(Math.random() * pool.length)];
    return { id: `formula-${s.id}`, title: `${t('retos.formula')}: ${s.formula}`, targets: [s.id] };
  }

  private renderClass(): void {
    const s = this.sync;
    const state = s.state;
    if (!s.joined) {
      $('clase').innerHTML = `<form id="clase-form" class="tarjeta-panel">
        <h3>${t('clase.unirse')}</h3><p class="pequeno">${t('clase.unirse_texto')}</p>
        <label>${t('clase.codigo')}<input id="clase-codigo" required minlength="6" maxlength="6" autocapitalize="characters" autocomplete="off" /></label>
        <label>${t('clase.alias')}<input id="clase-alias" required maxlength="30" autocomplete="nickname" /></label>
        <label>${t('clase.pin')}<input id="clase-pin" required inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" /></label>
        <button type="submit">${t('clase.entrar')}</button>
        <p id="clase-error" class="error" role="alert"></p>
      </form><p class="pequeno">${t('clase.solo')}</p>`;
      const invite = new URLSearchParams(location.search).get('unirse');
      if (invite) ($('clase-codigo') as HTMLInputElement).value = invite.toUpperCase();
      $('clase-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await s.join(($('clase-codigo') as HTMLInputElement).value, ($('clase-alias') as HTMLInputElement).value, ($('clase-pin') as HTMLInputElement).value);
        } catch (error) {
          $('clase-error').textContent = error instanceof TypeError ? t('clase.error_red') : (error as Error).message;
        }
      });
      return;
    }
    const discovered = new Set(state?.discovered.map((d) => d.species) ?? []);
    const feed = (state?.feed ?? [])
      .map((f) => {
        const text = f.type === 'descubrir'
          ? t('clase.descubrio', { alias: f.alias, formula: getSpecies(String(f.data.sustancia))?.formula ?? '' })
          : t('clase.completo_reto', { alias: f.alias });
        return `<li>${esc(text)}</li>`;
      })
      .join('');
    $('clase').innerHTML = `<div class="tarjeta-panel">
      <h3>${esc(state?.clase.name ?? '…')} <small>${state ? t(`curso.${state.clase.course}`) : ''}</small></h3>
      <p class="pequeno">${state?.alumno.alias ? `${esc(state.alumno.alias)} · ` : ''}${t('clase.companeros', { n: state?.clase.alumnos ?? 1 })}</p>
      <p>${t('clase.meta', { tienen: discovered.size, total: SPECIES.length })}</p>
      <div class="xp" style="--p:${discovered.size / SPECIES.length}"><div></div></div>
      <p class="pequeno">${!s.online ? t('clase.sin_conexion') : s.pending ? t('clase.pendientes', { n: s.pending }) : t('clase.sincronizado')}</p>
      ${feed ? `<h4>${t('clase.actividad')}</h4><ul class="feed">${feed}</ul>` : ''}
      <button id="clase-salir" type="button" class="secundario">${t('clase.salir')}</button></div>`;
    $('clase-salir').addEventListener('click', () => void s.leave());
  }

  private renderBadges(): void {
    $('logros').innerHTML = `<div class="rejilla">${BADGES.map((b) => {
      const got = this.progress.badges.has(b.id);
      return `<div class="insignia ${got ? '' : 'bloqueada'}" role="img" aria-label="${esc(t(`insignia.${b.id}.nombre`))}${got ? '' : ` (${t('logros.pendiente')})`}: ${esc(t(`insignia.${b.id}.descripcion`))}">
        <span aria-hidden="true">${got ? '🏅' : '🔒'}</span><b>${t(`insignia.${b.id}.nombre`)}</b><small>${t(`insignia.${b.id}.descripcion`)}</small></div>`;
    }).join('')}</div>`;
  }

  private async renderOffline(): Promise<void> {
    const ok = await isPersisted();
    $('offline-estado').textContent = ok ? t('offline.ok') : t('offline.no');
    $('offline-boton').hidden = ok;
  }

  // --- Fichas e historias -------------------------------------------------------------

  showSpecies(id: string): void {
    const s = getSpecies(id)!;
    const got = this.progress.species.has(id);
    const course = courseOf(id);
    const atoms = Object.entries(composition(s)).map(([el, n]) => (n > 1 ? `${n} ${el}` : el)).join(' + ');
    const hint = Object.keys(composition(s))[0];
    this.openDetail(
      got
        ? `<h2 id="detalle-titulo">${s.formula} <small>${esc(speciesName(id))}</small></h2>
           <p class="pequeno">${course ? t('moleculario.curso', { curso: t(`curso.${course}`) }) : ''} · ΔHf° = ${num(s.deltaHf, 2)} kJ/mol</p>
           <h3>${t('moleculario.como')}</h3><p>${atoms} → ${s.formula}</p>
           <h3>${t('moleculario.historia')}</h3><p>${t(`especie.${id}.historia`)}</p>
           <h3>${t('moleculario.hoy')}</h3><p>${esc(speciesUse(id))}</p>`
        : `<h2 id="detalle-titulo">${t('moleculario.bloqueada')}</h2>
           <p>${t('moleculario.pista_atomos', { n: s.atoms.length })} · ${t('moleculario.pista_elemento', { elemento: elementName(getElement(hint).symbol) })}</p>
           <p class="pequeno">${course ? t('moleculario.curso', { curso: t(`curso.${course}`) }) : ''}</p>`,
    );
  }

  showElement(el: ElementData): void {
    if (!this.isUnlocked(el.symbol)) {
      this.openDetail(`<h2 id="detalle-titulo">🔒 ${el.z}</h2><p>${t('tabla.bloqueado')}</p>`);
      return;
    }
    this.openDetail(`<h2 id="detalle-titulo">${el.symbol} <small>${esc(elementName(el.symbol))} · Z = ${el.z}</small></h2>
      <p>${el.z} p⁺ · ${el.massNumber - el.z} n⁰ · ${el.z} e⁻</p>
      <h3>${t('moleculario.historia')}</h3><p>${elementStory(el)}</p>`);
  }

  private openDetail(html: string): void {
    $('detalle-contenido').innerHTML = html;
    $<HTMLDialogElement>('detalle').showModal();
  }

  // --- Celebraciones ---------------------------------------------------------------------

  private celebrate(before: Progress, after: Progress): void {
    const diff = progressDiff(before, after);
    for (const id of diff.species) {
      const s = getSpecies(id)!;
      this.toast('✨', `${t('celebrar.molecula')} ${s.formula}`, speciesName(id), () => this.showSpecies(id));
    }
    if (diff.elements.length) this.toast('🔓', t('celebrar.elementos', { lista: diff.elements.join(', ') }), '', () => this.selectTab('tabla'));
    for (const b of diff.badges) this.toast('🏅', t('celebrar.insignia', { nombre: t(`insignia.${b}.nombre`) }), t(`insignia.${b}.descripcion`));
    if (diff.levelUp) this.toast('⭐', t('celebrar.nivel', { nivel: after.level + 1, nombre: t(`nivel.${after.level}`) }), '');
  }

  /**
   * Aviso breve encima de todo (también dentro del juego). Van en cola, dos
   * como mucho a la vez, para no tapar las tarjetas justo cuando reaccionan.
   */
  toast(icon: string, title: string, text: string, onClick?: () => void): void {
    this.toasts.push({ icon, title, text, onClick });
    this.pumpToasts();
  }

  private readonly toasts: Array<{ icon: string; title: string; text: string; onClick?: () => void }> = [];
  private showing = 0;

  private pumpToasts(): void {
    while (this.showing < 2 && this.toasts.length) {
      const { icon, title, text, onClick } = this.toasts.shift()!;
      const el = document.createElement(onClick ? 'button' : 'div');
      el.className = 'aviso-logro';
      el.innerHTML = `<span aria-hidden="true">${icon}</span><div><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</div>`;
      if (onClick) el.addEventListener('click', () => (el.remove(), onClick()));
      $('avisos').append(el);
      this.showing++;
      setTimeout(() => el.classList.add('saliendo'), 3000);
      setTimeout(() => {
        el.remove();
        this.showing--;
        this.pumpToasts();
      }, 3400);
    }
  }
}

export function elementStory(el: ElementData): string {
  const key = `elemento.${el.symbol}.historia`;
  if (has(key)) return t(key);
  return el.discovered ? t('elemento.descubierto', { anio: el.discovered }) : t('elemento.antiguedad');
}

