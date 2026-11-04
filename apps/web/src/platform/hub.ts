import { SPECIES, composition, getElement, getSpecies, type ElementData, type Outcome } from '@webar/chem';
import { avatarSVG } from '../characters/avatar';
import { CHARACTERS } from '../characters/data';
import { has, t, translate } from '../i18n';
import { elementName, num, speciesName, speciesUse } from '../i18n/content';
import { lessonExercises } from '../learn/exercises';
import { playLesson } from '../learn/lesson';
import { NODES, PATH, type PathNode } from '../learn/path';
import { renderPeriodicTable, updateLocks } from '../periodic-table';
import { nodeTitle, renderPath, scrollToCurrent } from '../screens/aprender';
import { renderLeague, renderQuests } from '../screens/liga';
import { renderProfile, renderShop } from '../screens/perfil';
import { sfx } from '../sfx';
import { settings } from '../settings';
import { Leagues } from './league';
import { BADGES, COURSES, COURSE_SPECIES, SHOP, XP, chestQuarks, computeProgress, courseOf, progressDiff, type EventType, type Progress, type ShopItem } from './progress';
import { addEvent, allEvents, isPersisted, persistStorage } from './store';
import { ClassSync } from './sync';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const AVATAR = 'webar:avatar';

/** Un reto en juego: formar todas sus sustancias. */
export interface ActiveChallenge {
  id: string;
  title: string;
  targets: string[];
}

/** Lo que el hub necesita de la app para abrir los nodos que no son lecciones. */
export interface HubActions {
  /** Abre la mesa con las tarjetas para formar la sustancia del nodo. */
  lab(node: PathNode): void;
  /** Abre el juego de adivinar con esos elementos. */
  guess(node: PathNode): void;
}

export type Screen = 'aprender' | 'lab' | 'materia' | 'coleccion' | 'liga' | 'perfil';

/**
 * La parte de «aprender jugando»: progreso, camino, misiones, ligas,
 * colección y perfil. Todo sale del registro de eventos local; la clase y las
 * ligas se sincronizan cuando hay red.
 */
export class Hub {
  progress: Progress = computeProgress([]);
  readonly sync = new ClassSync();
  readonly leagues = new Leagues(() => this.sync.studentToken);
  active: ActiveChallenge | null = null;
  actions: HubActions = { lab: () => {}, guess: () => {} };
  /** Avisa de lo nuevo (la mascota lo comenta). */
  onCelebrate: (kind: 'leccion' | 'molecula' | 'racha' | 'nivel' | 'fallo', detail?: string) => void = () => {};
  private screen: Screen = 'aprender';

  get avatar(): string {
    return localStorage.getItem(AVATAR) ?? 'gato';
  }

  async init(): Promise<void> {
    translate();
    this.progress = computeProgress(await allEvents());
    this.setupTabs();
    renderPeriodicTable($('tabla-progresiva'), (el) => this.showElement(el), (el) => !this.isUnlocked(el.symbol));
    $('offline-boton').addEventListener('click', async () => {
      await persistStorage();
      void this.renderOffline();
    });
    for (const [id, screen] of [['chip-racha', 'perfil'], ['chip-quarks', 'perfil'], ['chip-xp', 'liga'], ['abrir-perfil', 'perfil']] as const) {
      $(id).addEventListener('click', () => this.selectTab(screen));
    }
    this.sync.on('change', () => {
      this.renderHeader();
      this.renderClass();
      this.renderChallenges();
    });
    await this.leagues.init();
    await this.sync.init();
    // Enlace de invitación: /?unirse=CODIGO abre el perfil con el código puesto.
    const invite = new URLSearchParams(location.search).get('unirse');
    if (invite && !this.sync.joined) this.selectTab('perfil');
    this.renderAll();
    requestAnimationFrame(() => scrollToCurrent($('camino')));
    void this.refreshLeagues();
  }

  isUnlocked(symbol: string): boolean {
    return this.progress.unlocked.has(symbol);
  }

  /** Guarda un evento, recalcula y celebra lo nuevo. */
  async add(tipo: EventType, datos: Record<string, unknown>): Promise<void> {
    const before = this.progress;
    await addEvent(tipo, datos);
    this.progress = computeProgress(await allEvents());
    this.celebrate(before, this.progress);
    this.renderAll();
    void this.sync.queued();
    void this.refreshLeagues();
  }

  /** Apunta lo que ha pasado en el juego de tarjetas y celebra lo nuevo. */
  async record(outcome: Outcome, products: string[]): Promise<void> {
    const before = this.progress;
    await addEvent('reaccion', { reaccion: outcome.reaction.id, ecuacion: outcome.equation, deltaH: outcome.deltaH });
    for (const species of new Set(products)) if (!before.species.has(species)) await addEvent('descubrir', { sustancia: species });
    let after = computeProgress(await allEvents());
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
    void this.refreshLeagues();
  }

  /** Un reto superado fuera del camino normal (p. ej. un acertijo). */
  async recordChallenge(id: string): Promise<void> {
    if (this.progress.challenges.has(id)) return;
    await this.add('reto', { reto: id });
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
      tab.addEventListener('click', () => this.selectTab(tab.id.slice(4) as Screen));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        this.selectTab(next.id.slice(4) as Screen);
      });
    });
    const subs = [...document.querySelectorAll<HTMLButtonElement>('#p-coleccion .subtabs [role=tab]')];
    subs.forEach((tab) =>
      tab.addEventListener('click', () => {
        subs.forEach((s) => {
          s.setAttribute('aria-selected', String(s === tab));
          $(s.getAttribute('aria-controls')!).hidden = s !== tab;
        });
      }),
    );
  }

  /** Muestra una pantalla, con transición suave donde el navegador la tenga. */
  selectTab(name: Screen): void {
    if (name === this.screen && !$(`p-${name}`).hidden) return;
    const apply = () => {
      this.screen = name;
      document.querySelectorAll<HTMLElement>('#pantallas > [role=tabpanel]').forEach((panel) => (panel.hidden = panel.id !== `p-${name}`));
      document.querySelectorAll<HTMLButtonElement>('.nav-inferior [role=tab]').forEach((tab) => {
        const on = tab.id === `tab-${name}`;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on || (name === 'perfil' && tab.id === 'tab-aprender') ? 0 : -1;
      });
      $('pantallas').scrollTop = 0;
      if (name === 'aprender') scrollToCurrent($('camino'));
      if (name === 'liga') void this.refreshLeagues();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !document.documentElement.classList.contains('calma')) doc.startViewTransition(apply);
    else apply();
  }

  // --- Pintar ----------------------------------------------------------------------

  renderAll(): void {
    this.renderHeader();
    renderPath($('camino'), this.progress, (node) => this.openNode(node));
    renderQuests($('misiones'), this.progress);
    this.renderLeague();
    this.renderCollection();
    this.renderTable();
    this.renderCharacters();
    this.renderChallenges();
    this.renderClass();
    this.renderBadges();
    this.renderProfile();
    void this.renderOffline();
    $('reto-activo').hidden = !this.active;
    $('reto-activo').textContent = this.challengeLabel() ?? '';
  }

  private renderHeader(): void {
    const p = this.progress;
    $('racha-n').textContent = String(p.streak);
    $('chip-racha').classList.toggle('apagada', !p.streakToday);
    $('quarks-n').textContent = String(p.quarks);
    $('xp-n').textContent = String(p.xpToday);
    $('chip-racha').setAttribute('aria-label', t('stats.racha_aria', { n: p.streak }));
    $('chip-quarks').setAttribute('aria-label', t('stats.quarks_aria', { n: p.quarks }));
    $('chip-xp').setAttribute('aria-label', t('stats.xp_aria', { n: p.xpToday, meta: settings.meta }));
    $('perfil-avatar').innerHTML = avatarSVG(this.avatar, { size: 40 });
    const s = this.sync;
    $('estado-red').textContent = !s.joined ? '' : !s.online ? '📴' : s.pending ? `⏳ ${s.pending}` : '';
    $('estado-red').title = !s.joined ? '' : !s.online ? t('clase.sin_conexion') : s.pending ? t('clase.pendientes', { n: s.pending }) : t('clase.sincronizado');
  }

  private renderLeague(): void {
    renderLeague($('liga'), this.leagues, this.progress, this.sync.joined, {
      join: async () => {
        try {
          await this.leagues.join(this.avatar);
          await this.refreshLeagues();
        } catch {
          this.toast('📴', t('liga.sin_red'), '');
        }
      },
      leave: async () => {
        await this.leagues.leave();
        this.renderLeague();
      },
      newNickname: async () => {
        await this.leagues.update({ nuevoApodo: true }).catch(() => this.toast('📴', t('liga.sin_red'), ''));
        await this.refreshLeagues();
      },
    });
  }

  async refreshLeagues(): Promise<void> {
    if (!navigator.onLine || (!this.leagues.joined && !this.sync.joined)) return this.renderLeague();
    await this.leagues.refresh(this.progress.xpWeek);
    this.renderLeague();
  }

  private renderProfile(): void {
    renderProfile($('perfil'), this.progress, this.avatar, this.leagues.player?.apodo ?? null, {
      settings: () => $<HTMLDialogElement>('ajustes').showModal(),
      shop: () => this.openShop(),
      avatar: () => this.chooseAvatar(),
    });
  }

  private openShop(): void {
    renderShop($('tienda-contenido'), this.progress, async (item: ShopItem) => {
      if (this.progress.quarks < SHOP[item].cost) return;
      await this.add('compra', { articulo: item });
      sfx.fanfarria();
      this.toast(item === 'protector' ? '🧊' : '⚡', t(`tienda.comprado.${item}`), '');
      this.openShop();
    });
    const d = $<HTMLDialogElement>('tienda');
    if (!d.open) d.showModal();
  }

  /** Avatar: la mascota o los personajes que ya has conocido en el camino. */
  private chooseAvatar(): void {
    const met = new Set(PATH.filter((u) => u.index <= (this.progress.current?.unit ?? PATH.length)).map((u) => u.guide));
    const options = ['gato', ...CHARACTERS.map((c) => c.id).filter((id) => met.has(id))];
    this.openDetail(`<h2 id="detalle-titulo">${t('perfil.elige_avatar')}</h2>
      <div class="avatares-rejilla">${options
        .map((id) => `<button type="button" class="avatar-opcion" data-id="${id}" aria-pressed="${id === this.avatar}" aria-label="${esc(id === 'gato' ? t('gato.nombre') : t(`personaje.${id}.nombre`))}">${avatarSVG(id, { size: 72 })}</button>`)
        .join('')}</div><p class="pequeno">${t('perfil.avatar_mas')}</p>`);
    $('detalle-contenido').querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        localStorage.setItem(AVATAR, b.dataset.id!);
        void this.leagues.update({ avatar: b.dataset.id! }).catch(() => undefined);
        $<HTMLDialogElement>('detalle').close();
        this.renderAll();
      }),
    );
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

  /** Galería de personajes: los ya conocidos (su unidad empezada) con su ficha; el resto, en silueta. */
  private renderCharacters(): void {
    const reached = this.progress.current?.unit ?? PATH.length;
    const met = new Set(PATH.filter((u) => u.index <= reached).map((u) => u.guide));
    $('personajes').innerHTML = CHARACTERS.map((c) => {
      const known = met.has(c.id);
      return `<button type="button" class="personaje-ficha card pulsable ${known ? '' : 'bloqueado'}" data-personaje="${c.id}">
        <span class="personaje-avatar">${avatarSVG(c.id, { size: 84 })}</span>
        <b>${known ? t(`personaje.${c.id}.nombre`) : '???'}</b>
        <small>${known ? t(`personaje.${c.id}.campo`) : t('personajes.bloqueado')}</small></button>`;
    }).join('');
    $('personajes').querySelectorAll<HTMLButtonElement>('[data-personaje]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.personaje!;
        if (b.classList.contains('bloqueado')) return this.openDetail(`<h2 id="detalle-titulo">???</h2><p>${t('personajes.bloqueado_texto')}</p>`);
        this.openDetail(`<div class="personaje-detalle">${avatarSVG(id, { expression: 'feliz', size: 130 })}
          <h2 id="detalle-titulo">${t(`personaje.${id}.nombre`)}</h2>
          <p class="pequeno">${t(`personaje.${id}.vida`)} · ${t(`personaje.${id}.pais`)} · ${t(`personaje.${id}.campo`)}</p></div>
          <p>${t(`personaje.${id}.bio`)}</p>
          <h3>${t('personajes.logro')}</h3><p>${t(`personaje.${id}.logro`)}</p>
          <h3>${t('personajes.sabias')}</h3><ul>${[1, 2, 3].filter((n) => has(`personaje.${id}.dato.${n}`)).map((n) => `<li>${t(`personaje.${id}.dato.${n}`)}</li>`).join('')}</ul>`);
      }),
    );
  }

  private renderChallenges(): void {
    const p = this.progress;
    const card = (id: string, title: string, targets: string[], extra = '') => {
      const done = targets.filter((s) => p.species.has(s)).length;
      const complete = p.challenges.has(id) || done === targets.length;
      return `<article class="reto card ${complete ? 'hecho' : ''}">
        <div><b>${esc(title)}</b><small>${extra}${targets.map((s) => getSpecies(s)?.formula ?? s).join(' · ')}</small></div>
        <div class="reto-lado"><span class="contador">${complete ? t('retos.completado') : t('retos.progreso', { tienes: done, total: targets.length })}</span>
        ${complete ? '' : `<button type="button" class="btn pequeno" data-reto="${esc(id)}">${t('retos.jugar')}</button>`}</div>
      </article>`;
    };
    const classChallenges = this.sync.state?.retos ?? [];
    const challenges: ActiveChallenge[] = [
      ...classChallenges.map((c) => ({ id: `clase-${c.id}`, title: c.title, targets: c.targets })),
      ...COURSES.map((c) => ({ id: `curso-${c}`, title: t('reto.curso.titulo', { curso: t(`curso.${c}`) }), targets: COURSE_SPECIES[c] })),
    ];
    $('retos').innerHTML = `
      <article class="reto card destacado"><div><b>⚡ ${t('retos.formula')}</b><small>${t('retos.formula_texto')}</small></div>
        <div class="reto-lado"><button type="button" class="btn racha pequeno" data-reto="formula">${t('retos.jugar')}</button></div></article>
      ${this.sync.joined ? `<h3>${t('retos.clase')}</h3>${classChallenges.length ? classChallenges.map((c) => card(`clase-${c.id}`, c.title, c.targets, c.ends ? `${t('retos.hasta', { fecha: new Date(c.ends).toLocaleDateString(document.documentElement.lang) })} · ` : '')).join('') : `<p class="pequeno">${t('retos.ninguno')}</p>`}` : ''}
      <h3>${t('retos.curso')}</h3>${COURSES.map((c) => card(`curso-${c}`, t('reto.curso.titulo', { curso: t(`curso.${c}`) }), COURSE_SPECIES[c])).join('')}`;
    $('retos').querySelectorAll<HTMLButtonElement>('[data-reto]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.reto!;
        this.active = id === 'formula' ? this.formulaChallenge() : challenges.find((c) => c.id === id) ?? null;
        this.selectTab('lab');
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
      $('clase').innerHTML = `<form id="clase-form" class="card formulario">
        <h3>${t('clase.unirse')}</h3><p class="pequeno">${t('clase.unirse_texto')}</p>
        <label>${t('clase.codigo')}<input id="clase-codigo" required minlength="6" maxlength="6" autocapitalize="characters" autocomplete="off" /></label>
        <label>${t('clase.alias')}<input id="clase-alias" required maxlength="30" autocomplete="nickname" /></label>
        <label>${t('clase.pin')}<input id="clase-pin" required inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" /></label>
        <button type="submit" class="btn">${t('clase.entrar')}</button>
        <p id="clase-error" class="error" role="alert"></p>
      </form><p class="pequeno">${t('clase.solo')}</p>`;
      const invite = new URLSearchParams(location.search).get('unirse');
      if (invite) ($('clase-codigo') as HTMLInputElement).value = invite.toUpperCase();
      $('clase-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await s.join(($('clase-codigo') as HTMLInputElement).value, ($('clase-alias') as HTMLInputElement).value, ($('clase-pin') as HTMLInputElement).value);
          void this.refreshLeagues();
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
    $('clase').innerHTML = `<div class="card formulario">
      <h3>${esc(state?.clase.name ?? '…')} <small>${state ? t(`curso.${state.clase.course}`) : ''}</small></h3>
      <p class="pequeno">${state?.alumno.alias ? `${esc(state.alumno.alias)} · ` : ''}${t('clase.companeros', { n: state?.clase.alumnos ?? 1 })}</p>
      <p>${t('clase.meta', { tienen: discovered.size, total: SPECIES.length })}</p>
      <div class="barra-progreso" style="--p:${discovered.size / SPECIES.length}; --c: var(--mint)"><span></span></div>
      <p class="pequeno">${!s.online ? t('clase.sin_conexion') : s.pending ? t('clase.pendientes', { n: s.pending }) : t('clase.sincronizado')}</p>
      ${feed ? `<h4>${t('clase.actividad')}</h4><ul class="feed">${feed}</ul>` : ''}
      <button id="clase-salir" type="button" class="btn claro pequeno">${t('clase.salir')}</button></div>`;
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

  // --- Camino -------------------------------------------------------------------------

  /** Hoja con el nodo elegido: qué es y el botón para empezar (o repasar). */
  openNode(node: PathNode): void {
    const done = this.progress.done.has(node.id);
    const unit = PATH[node.unit];
    const reward = node.kind === 'cofre' ? `⚛ ${chestQuarks(node.id)}` : node.kind === 'laboratorio' ? `⚡ ${XP.species}+` : '⚡ 10-30';
    this.openDetail(`
      <div class="nodo-hoja" style="--u: var(--primary)">
        <div class="nodo-hoja-guia">${avatarSVG(unit.guide, { expression: 'habla', size: 72 })}
          <div class="bocadillo"><p>${t(`camino.dice.${node.kind}`, { nombre: nodeTitle(node) })}</p></div></div>
        <h2 id="detalle-titulo">${esc(nodeTitle(node))}</h2>
        <p class="texto-suave">${t(`camino.que.${node.kind}`)}</p>
        <button type="button" class="btn ancho ${done ? 'claro' : ''}" data-empezar>${done ? t('camino.repasar') : t('camino.empezar')} <span class="chip">${reward}</span></button>
      </div>`);
    $('detalle-contenido').querySelector('[data-empezar]')!.addEventListener('click', () => {
      $<HTMLDialogElement>('detalle').close();
      this.startNode(node);
    });
  }

  startNode(node: PathNode): void {
    const known = [...this.progress.unlocked];
    switch (node.kind) {
      case 'leccion':
      case 'repaso': {
        const unit = PATH[node.unit];
        playLesson($<HTMLDialogElement>('leccion'), {
          title: nodeTitle(node),
          guide: unit.guide,
          exercises: lessonExercises(node, known),
          onClose: async (result) => {
            if (!result) return;
            const wasToday = this.progress.streakToday;
            await this.add('leccion', { nodo: node.id, aciertos: result.right, total: result.total, xp: result.xp, segundos: result.seconds });
            if (node.kind === 'leccion') void this.add('lectura', { elemento: node.elements[0] });
            this.onCelebrate('leccion');
            if (!wasToday && this.progress.streakToday) this.showStreak();
            requestAnimationFrame(() => scrollToCurrent($('camino')));
          },
        });
        break;
      }
      case 'laboratorio':
        this.active = { id: `camino-${node.id}`, title: nodeTitle(node), targets: [node.species!] };
        this.actions.lab(node);
        break;
      case 'adivina':
        this.actions.guess(node);
        break;
      case 'cofre':
        void this.openChest(node);
        break;
    }
  }

  private async openChest(node: PathNode): Promise<void> {
    const amount = chestQuarks(node.id);
    const fresh = !this.progress.done.has(node.id);
    this.openDetail(`<div class="cofre-abrir"><div class="cofre ${fresh ? 'abriendo' : 'abierto'}" aria-hidden="true">🎁</div>
      <h2 id="detalle-titulo">${fresh ? t('cofre.titulo') : t('cofre.vacio')}</h2>
      ${fresh ? `<p class="premio">⚛ +${amount}</p><p class="texto-suave">${t('cofre.texto')}</p>` : ''}</div>`);
    if (fresh) {
      sfx.fanfarria();
      await this.add('cofre', { nodo: node.id });
    }
  }

  /** La pantalla de racha: la llama crece y cuenta el día nuevo. */
  showStreak(): void {
    const n = this.progress.streak;
    sfx.racha();
    this.onCelebrate('racha', String(n));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      return `<span class="${i === 6 ? 'hoy' : this.progress.activeDays.has(d.toLocaleDateString('sv')) ? 'si' : ''}">${d.toLocaleDateString(document.documentElement.lang, { weekday: 'narrow' })}</span>`;
    }).join('');
    this.openDetail(`<div class="racha-pantalla"><div class="llama-grande" aria-hidden="true">🔥</div>
      <p class="racha-numero">${n}</p><h2 id="detalle-titulo">${n === 1 ? t('racha.dia_1') : t('racha.dias', { n })}</h2>
      <div class="semana">${days}</div><p class="texto-suave">${t('racha.texto')}</p></div>`);
  }

  // --- Fichas -------------------------------------------------------------------------

  showSpecies(id: string): void {
    const s = getSpecies(id)!;
    const got = this.progress.species.has(id);
    const course = courseOf(id);
    const atoms = Object.entries(composition(s)).map(([el, n]) => (n > 1 ? `${n} ${el}` : el)).join(' + ');
    const hint = Object.keys(composition(s))[0];
    const extra = (field: string, title: string) => (has(`especie.${id}.${field}`) ? `<h3>${t(title)}</h3><p>${t(`especie.${id}.${field}`)}</p>` : '');
    this.openDetail(
      got
        ? `<h2 id="detalle-titulo">${s.formula} <small>${esc(speciesName(id))}</small></h2>
           <p class="pequeno">${course ? t('moleculario.curso', { curso: t(`curso.${course}`) }) : ''} · ΔHf° = ${num(s.deltaHf, 2)} kJ/mol</p>
           <h3>${t('moleculario.como')}</h3><p>${atoms} → ${s.formula}</p>
           <h3>${t('moleculario.historia')}</h3><p>${t(`especie.${id}.historia`)}</p>
           <h3>${t('moleculario.hoy')}</h3><p>${esc(speciesUse(id))}</p>
           ${extra('porque', 'ficha.porque_especie')}${extra('curiosidad', 'ficha.curiosidad')}`
        : `<h2 id="detalle-titulo">${t('moleculario.bloqueada')}</h2>
           <p>${t('moleculario.pista_atomos', { n: s.atoms.length })} · ${t('moleculario.pista_elemento', { elemento: elementName(getElement(hint).symbol) })}</p>
           ${has(`especie.${id}.pista`) ? `<p class="cita">«${t(`especie.${id}.pista`)}»</p>` : ''}
           <p class="pequeno">${course ? t('moleculario.curso', { curso: t(`curso.${course}`) }) : ''}</p>`,
    );
  }

  showElement(el: ElementData): void {
    if (!this.isUnlocked(el.symbol)) {
      const lesson = NODES.find((n) => n.kind === 'leccion' && n.elements[0] === el.symbol);
      this.openDetail(`<h2 id="detalle-titulo">🔒 ${el.z}</h2><p>${t('tabla.bloqueado_camino', { unidad: (lesson?.unit ?? 0) + 1 })}</p>
        ${has(`elemento.${el.symbol}.pista`) ? `<p class="cita">«${t(`elemento.${el.symbol}.pista`)}»</p>` : ''}`);
      return;
    }
    const k = (f: string) => `elemento.${el.symbol}.${f}`;
    const section = (f: string, title: string) => (has(k(f)) ? `<h3>${t(title)}</h3><p>${t(k(f))}</p>` : '');
    this.openDetail(`<div class="ficha-elemento"><div class="ficha-elemento-cabecera" style="--c:${el.color}">
        <span class="ficha-z">${el.z}</span><span class="ficha-simbolo">${el.symbol}</span></div>
      <h2 id="detalle-titulo">${esc(elementName(el.symbol))}</h2>
      <p class="pequeno">${el.z} p⁺ · ${el.massNumber - el.z} n⁰ · ${el.z} e⁻ · ${num(el.atomicMass, 3)} u</p></div>
      ${has(k('descubrimiento')) ? section('descubrimiento', 'ficha.descubrimiento') : `<h3>${t('moleculario.historia')}</h3><p>${elementStory(el)}</p>`}
      ${section('usos', 'ficha.usos')}${section('porque', 'ficha.porque')}${section('unico', 'ficha.unico')}${section('curiosidad', 'ficha.curiosidad')}`);
    if (!this.progress.read.has(el.symbol)) void this.add('lectura', { elemento: el.symbol });
  }

  private openDetail(html: string): void {
    $('detalle-contenido').innerHTML = html;
    const d = $<HTMLDialogElement>('detalle');
    if (!d.open) d.showModal();
  }

  // --- Celebraciones ---------------------------------------------------------------------

  private celebrate(before: Progress, after: Progress): void {
    const diff = progressDiff(before, after);
    for (const id of diff.species) {
      const s = getSpecies(id)!;
      this.toast('✨', `${t('celebrar.molecula')} ${s.formula}`, speciesName(id), () => this.showSpecies(id));
      this.onCelebrate('molecula', id);
    }
    if (diff.elements.length) this.toast('🔓', t('celebrar.elementos', { lista: diff.elements.map(elementName).join(', ') }), '', () => this.selectTab('coleccion'));
    for (const b of diff.badges) this.toast('🏅', t('celebrar.insignia', { nombre: t(`insignia.${b}.nombre`) }), t(`insignia.${b}.descripcion`));
    for (const q of diff.quests) this.toast('🎯', t('celebrar.mision'), t(`mision.${q.metric}`, { n: q.goal }), () => this.selectTab('liga'));
    if (diff.levelUp) {
      this.toast('⭐', t('celebrar.nivel', { nivel: after.level + 1, nombre: t(`nivel.${Math.min(after.level, 14)}`) }), '');
      this.onCelebrate('nivel');
    }
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
