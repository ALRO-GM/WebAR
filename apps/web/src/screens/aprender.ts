import { getSpecies } from '@webar/chem';
import { avatarSVG } from '../characters/avatar';
import { t } from '../i18n';
import { elementName } from '../i18n/content';
import { PATH, type PathNode } from '../learn/path';
import type { Progress } from '../platform/progress';
import { settings } from '../settings';

const ICONS: Record<PathNode['kind'], string> = { leccion: '★', laboratorio: '🧪', adivina: '🔮', repaso: '🔁', cofre: '🎁' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function nodeTitle(node: PathNode): string {
  switch (node.kind) {
    case 'leccion':
      return elementName(node.elements[0]);
    case 'laboratorio':
      return t('camino.lab', { formula: getSpecies(node.species!)!.formula });
    default:
      return t(`camino.${node.kind}`);
  }
}

/** Colores de cada unidad (se repiten): la cabecera y sus nodos. */
const UNIT_COLORS = ['#7c5cff', '#2ec4a6', '#ff9600', '#1cb0f6', '#ff4b8b', '#58c322', '#ce82ff', '#ffb100'];

/**
 * El camino: unidades con su guía y nodos en zigzag. El nodo actual rebota y
 * dice «¡Empieza!»; los hechos brillan; los de más adelante esperan con candado.
 */
export function renderPath(container: HTMLElement, p: Progress, onOpen: (node: PathNode) => void): void {
  const currentUnit = p.current?.unit ?? PATH.length - 1;
  const goal = settings.meta;
  const today = Math.min(p.xpToday / goal, 1);
  const html: string[] = [];
  html.push(`
    <section class="meta-diaria card" aria-label="${t('camino.meta_aria', { xp: p.xpToday, meta: goal })}">
      <div class="anillo" style="--p:${today}"><span>${p.xpToday >= goal ? '✓' : `${p.xpToday}`}</span></div>
      <div><b>${p.xpToday >= goal ? t('camino.meta_hecha') : t('camino.meta', { meta: goal })}</b>
        <div class="barra-progreso" style="--p:${today}; --c: var(--xp)"><span></span></div>
        <small class="texto-suave">${p.streakToday ? t('camino.racha_hoy', { n: p.streak }) : p.streak ? t('camino.racha_peligro', { n: p.streak }) : t('camino.racha_empieza')}</small></div>
    </section>`);
  for (const unit of PATH) {
    if (unit.index > currentUnit + 3) {
      html.push(`<p class="camino-mas texto-suave">${t('camino.mas', { n: PATH.length - unit.index })}</p>`);
      break;
    }
    const color = UNIT_COLORS[unit.index % UNIT_COLORS.length];
    const locked = unit.index > currentUnit;
    const done = unit.nodes.every((n) => p.done.has(n.id));
    html.push(`
      <section class="unidad ${locked ? 'bloqueada' : ''}" style="--u:${color}" id="unidad-${unit.index + 1}">
        <header class="unidad-cabecera">
          <div><small>${t('camino.unidad', { n: unit.index + 1 })}${done ? ' · ✓' : ''}</small>
          <h2>${esc(unit.elements.map(elementName).join(' · '))}</h2>
          <p>${t('camino.guia', { nombre: t(`personaje.${unit.guide}.nombre`) })}</p></div>
          <div class="unidad-guia">${avatarSVG(unit.guide, { expression: locked ? 'neutral' : 'feliz', size: 64 })}</div>
        </header>
        <ol class="nodos">
          ${unit.nodes
            .map((node, i) => {
              const state = p.done.has(node.id) ? 'hecho' : p.current?.id === node.id ? 'actual' : 'bloqueado';
              // Zigzag suave: 0, 1, 2, 1, 0, −1, −2, −1…
              const wave = [0, 1, 2, 1, 0, -1, -2, -1][i % 8];
              return `<li style="--x:${wave}">
                ${state === 'actual' ? `<span class="burbuja-empieza">${t('camino.empieza')}</span>` : ''}
                <button type="button" class="nodo n-${node.kind} ${state}" data-nodo="${node.id}" ${state === 'bloqueado' ? 'aria-disabled="true"' : ''}
                  aria-label="${esc(nodeTitle(node))} · ${t(`camino.estado.${state}`)}">
                  <span aria-hidden="true">${node.kind === 'leccion' ? esc(node.elements[0]) : ICONS[node.kind]}</span>
                </button></li>`;
            })
            .join('')}
        </ol>
      </section>`);
  }
  container.innerHTML = html.join('');
  container.querySelectorAll<HTMLButtonElement>('[data-nodo]').forEach((b) =>
    b.addEventListener('click', () => {
      const node = PATH.flatMap((u) => u.nodes).find((n) => n.id === b.dataset.nodo)!;
      if (b.classList.contains('bloqueado')) {
        b.classList.remove('sacude');
        void b.offsetWidth;
        b.classList.add('sacude');
        return;
      }
      onOpen(node);
    }),
  );
}

/** Desplaza el camino hasta el nodo actual (al abrir la app o volver de una lección). */
export function scrollToCurrent(container: HTMLElement): void {
  container.querySelector('.nodo.actual')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
