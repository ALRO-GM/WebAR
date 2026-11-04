import { avatarSVG } from '../characters/avatar';
import { t } from '../i18n';
import { LEAGUE_COUNT, type Leagues, type LeagueRow } from '../platform/league';
import { QUARKS, type Progress } from '../platform/progress';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LEAGUE_ICONS = ['✏️', '🔹', '🟤', '⚪', '🟡', '💠', '💚', '❤️', '💙', '💎'];

export function renderQuests(container: HTMLElement, p: Progress): void {
  const left = (() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const h = Math.floor((end.getTime() - now.getTime()) / 3600000);
    return t('misiones.quedan', { h });
  })();
  container.innerHTML = `
    <div class="seccion-cabecera"><h2>${t('misiones.titulo')}</h2><span class="chip">⏳ ${left}</span></div>
    <div class="misiones card">
      ${p.quests
        .map(
          (q) => `<div class="mision ${q.done ? 'hecha' : ''}">
            <span class="mision-icono" aria-hidden="true">${t(`mision.${q.metric}.icono`)}</span>
            <div><b>${t(`mision.${q.metric}`, { n: q.goal })}</b>
              <div class="barra-progreso" style="--p:${Math.min(q.value / q.goal, 1)}; --c: var(--xp)" role="progressbar" aria-valuenow="${Math.min(q.value, q.goal)}" aria-valuemin="0" aria-valuemax="${q.goal}"><span></span></div>
              <small>${Math.min(q.value, q.goal)} / ${q.goal}</small></div>
            <span class="mision-premio" aria-label="${t('misiones.premio', { n: QUARKS.quest })}">${q.done ? '✅' : `⚛ ${QUARKS.quest}`}</span>
          </div>`,
        )
        .join('')}
      <p class="pequeno">${t('misiones.todas', { n: QUARKS.allQuests })}</p>
    </div>`;
}

function rows(list: LeagueRow[], up: number, down: number, name: (r: LeagueRow) => string): string {
  return `<ol class="ranking">${list
    .map((r, i) => {
      const zone = i < up && r.xp > 0 ? 'sube' : i >= list.length - down ? 'baja' : '';
      return `<li class="${r.yo ? 'yo' : ''} ${zone}">
        <span class="puesto">${r.puesto <= 3 ? ['🥇', '🥈', '🥉'][r.puesto - 1] : r.puesto}</span>
        <span class="ranking-avatar">${avatarSVG(r.avatar || 'gato', { size: 40 })}</span>
        <span class="ranking-nombre">${esc(name(r))}${r.yo ? ` <small>(${t('liga.tu')})</small>` : ''}</span>
        <b>${r.xp} XP</b></li>`;
    })
    .join('')}</ol>`;
}

export interface LeagueHandlers {
  join(): void;
  leave(): void;
  newNickname(): void;
}

export function renderLeague(container: HTMLElement, leagues: Leagues, p: Progress, classJoined: boolean, h: LeagueHandlers): void {
  const g = leagues.global;
  const tab = container.dataset.vista ?? (classJoined ? 'clase' : 'mundial');
  const ends = g?.termina ?? leagues.classLeague?.termina;
  const days = ends ? Math.max(0, Math.ceil((Date.parse(ends) - Date.now()) / 86400000)) : null;
  const tiers = Array.from({ length: LEAGUE_COUNT }, (_, i) => {
    const state = !g ? 'futura' : i < g.liga ? 'pasada' : i === g.liga ? 'actual' : 'futura';
    return `<span class="liga-escudo ${state}" title="${t(`liga.nombre.${i}`)}" aria-hidden="true">${LEAGUE_ICONS[i]}</span>`;
  }).join('');
  let body = '';
  if (tab === 'clase') {
    body = !classJoined
      ? `<p class="texto-suave">${t('liga.clase_sin')}</p>`
      : leagues.classLeague
        ? rows(leagues.classLeague.ranking, 3, 0, (r) => r.alias ?? '')
        : `<p class="texto-suave">${leagues.error ? t('liga.sin_red') : t('liga.cargando')}</p>`;
  } else if (!leagues.joined) {
    body = `<div class="liga-unirse">
      <p>${t('liga.mundial_texto')}</p>
      <p class="pequeno">${t('liga.privacidad')}</p>
      <button type="button" class="btn" data-unirse>${t('liga.unirse')}</button></div>`;
  } else if (g) {
    const prev = g.resultadoAnterior ? `<p class="liga-anterior ${g.resultadoAnterior.cambio}">${t(`liga.anterior.${g.resultadoAnterior.cambio}`, { puesto: g.resultadoAnterior.puesto, liga: t(`liga.nombre.${g.liga}`) })}</p>` : '';
    body = `${prev}
      ${g.enGrupo ? '' : `<p class="texto-suave">${t('liga.sin_grupo')}</p>`}
      ${rows(g.grupo, g.sube, g.baja, (r) => r.apodo ?? '')}
      <p class="pequeno">${t('liga.reglas', { sube: g.sube, baja: g.baja })}</p>
      <p class="pequeno">${t('liga.apodo', { apodo: esc(leagues.player!.apodo) })}
        <button type="button" class="btn fantasma pequeno" data-apodo>${t('liga.otro_apodo')}</button>
        <button type="button" class="btn fantasma pequeno" data-salir>${t('liga.salir')}</button></p>`;
  } else body = `<p class="texto-suave">${leagues.error ? t('liga.sin_red') : t('liga.cargando')}</p>`;

  container.innerHTML = `
    <div class="seccion-cabecera"><h2>${g && tab === 'mundial' ? t(`liga.nombre.${g.liga}`) : t('liga.titulo')}</h2>${days !== null ? `<span class="chip">⏳ ${(days === 0 ? t('liga.dias_0') : t('liga.dias', { n: days }))}</span>` : ''}</div>
    <div class="liga card">
      <div class="liga-escudos">${tiers}</div>
      <p class="pequeno">${t('liga.semana', { xp: p.xpWeek })}</p>
      <div class="subtabs" role="tablist">
        <button role="tab" aria-selected="${tab === 'clase'}" data-vista="clase">${t('liga.clase')}</button>
        <button role="tab" aria-selected="${tab === 'mundial'}" data-vista="mundial">${t('liga.mundial')}</button>
      </div>
      ${body}
    </div>`;
  container.querySelectorAll<HTMLButtonElement>('[data-vista]').forEach((b) =>
    b.addEventListener('click', () => {
      container.dataset.vista = b.dataset.vista;
      renderLeague(container, leagues, p, classJoined, h);
    }),
  );
  container.querySelector('[data-unirse]')?.addEventListener('click', h.join);
  container.querySelector('[data-salir]')?.addEventListener('click', h.leave);
  container.querySelector('[data-apodo]')?.addEventListener('click', h.newNickname);
}
