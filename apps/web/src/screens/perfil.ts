import { SPECIES } from '@webar/chem';
import { avatarSVG } from '../characters/avatar';
import { t } from '../i18n';
import { dayKey, SHOP, type Progress, type ShopItem } from '../platform/progress';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface ProfileHandlers {
  settings(): void;
  shop(): void;
  avatar(): void;
}

/** Las últimas 5 semanas como un calendario de rachas (🔥 jugado, 🧊 protegido). */
function calendar(p: Progress): string {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - 28);
  const cells: string[] = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = dayKey(d);
    const state = p.activeDays.has(k) ? 'jugado' : p.frozenDays.has(k) ? 'protegido' : d > today ? 'futuro' : '';
    cells.push(`<span class="dia ${state} ${k === dayKey(today) ? 'hoy' : ''}" title="${d.toLocaleDateString(document.documentElement.lang)}">${d.getDate()}</span>`);
  }
  const names = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 2 + i).toLocaleDateString(document.documentElement.lang, { weekday: 'narrow' }));
  return `<div class="calendario" role="img" aria-label="${t('perfil.calendario_aria', { n: p.streak })}">${names.map((n) => `<b>${n}</b>`).join('')}${cells.join('')}</div>`;
}

export function renderProfile(container: HTMLElement, p: Progress, avatarId: string, nickname: string | null, h: ProfileHandlers): void {
  const stat = (icon: string, value: string | number, label: string) => `<div class="stat-card card"><span aria-hidden="true">${icon}</span><b>${value}</b><small>${label}</small></div>`;
  container.innerHTML = `
    <section class="perfil-cabecera">
      <button type="button" class="perfil-avatar-grande" data-avatar aria-label="${t('perfil.cambiar_avatar')}">${avatarSVG(avatarId, { expression: 'feliz', size: 110 })}<span class="lapiz" aria-hidden="true">✏️</span></button>
      <div><h1>${t('perfil.nivel', { nivel: p.level + 1 })}</h1><p class="texto-suave">${t(`nivel.${Math.min(p.level, 14)}`)}</p>
        ${nickname ? `<p class="pequeno">${t('perfil.apodo', { apodo: esc(nickname) })}</p>` : ''}
        <div class="barra-progreso" style="--p:${p.levelNext ? (p.xp - p.levelFloor) / (p.levelNext - p.levelFloor) : 1}; --c: var(--primary)"><span></span></div>
        <small class="texto-suave">${p.levelNext ? t('perfil.xp_siguiente', { faltan: p.levelNext - p.xp }) : t('perfil.xp', { xp: p.xp })}</small></div>
    </section>
    <div class="stats-rejilla">
      ${stat('🔥', p.streak, t('perfil.stat_racha'))}
      ${stat('🏅', p.longestStreak, t('perfil.stat_mejor'))}
      ${stat('⚡', p.xp, t('perfil.stat_xp'))}
      ${stat('⚛', p.quarks, t('perfil.stat_quarks'))}
      ${stat('🧪', `${p.species.size}/${SPECIES.length}`, t('perfil.stat_moleculas'))}
      ${stat('📘', `${p.unlocked.size}/118`, t('perfil.stat_elementos'))}
    </div>
    <h2>${t('perfil.racha_titulo')}</h2>
    ${calendar(p)}
    <p class="pequeno">${t('perfil.protectores', { n: p.protectors })}</p>
    <div class="fila izquierda">
      <button type="button" class="btn racha" data-tienda>⚛ ${t('tienda.abrir')}</button>
      <button type="button" class="btn claro" data-ajustes>⚙️ ${t('ajustes.titulo')}</button>
    </div>`;
  container.querySelector('[data-ajustes]')!.addEventListener('click', h.settings);
  container.querySelector('[data-tienda]')!.addEventListener('click', h.shop);
  container.querySelector('[data-avatar]')!.addEventListener('click', h.avatar);
}

export function renderShop(container: HTMLElement, p: Progress, buy: (item: ShopItem) => void): void {
  const items = (Object.keys(SHOP) as ShopItem[]).map((item) => {
    const spec = SHOP[item];
    const full = item === 'protector' && p.protectors >= SHOP.protector.max;
    const active = item === 'impulso' && p.boostUntil > Date.now();
    const can = p.quarks >= spec.cost && !full && !active;
    return `<article class="articulo card">
      <span class="articulo-icono" aria-hidden="true">${item === 'protector' ? '🧊' : '⚡'}</span>
      <div><b>${t(`tienda.${item}`)}</b><small>${t(`tienda.${item}.texto`)}</small>
        ${full ? `<small class="aviso-mini">${t('tienda.lleno')}</small>` : ''}${active ? `<small class="aviso-mini">${t('tienda.activo')}</small>` : ''}</div>
      <button type="button" class="btn ${can ? 'racha' : ''} pequeno" data-comprar="${item}" ${can ? '' : 'disabled'}>⚛ ${spec.cost}</button>
    </article>`;
  });
  container.innerHTML = `
    <h2 id="tienda-titulo">${t('tienda.titulo')}</h2>
    <p class="texto-suave">${t('tienda.texto', { n: p.quarks })}</p>
    <div class="articulos">${items.join('')}</div>
    <p class="pequeno">${t('tienda.gratis')}</p>`;
  container.querySelectorAll<HTMLButtonElement>('[data-comprar]').forEach((b) => b.addEventListener('click', () => buy(b.dataset.comprar as ShopItem)));
}
