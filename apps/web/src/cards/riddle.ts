import { composition, contentFormula, getSpecies, type Content } from '@webar/chem';
import { t } from '../i18n';
import { contentName, speciesName } from '../i18n/content';
import { vibrate } from '../settings';
import type { CardGame } from './game';

/**
 * Acertijos con tarjetas: la sustancia habla en primera persona («soy el gas
 * más abundante del aire…») y hay que formarla juntando tarjetas. Pedir pistas
 * o equivocarse resta puntos, para que piensen antes de probar a lo loco; al
 * acertar se explica cada pista. Los textos: i18n/es/acertijos.json.
 */
export interface Riddle {
  id: string;
  /** Sustancia que hay que formar. */
  target: string;
  /** Tarjetas de la mesa virtual: las necesarias y alguna que despiste. */
  cards: string[];
  difficulty: 1 | 2;
}

export const RIDDLES: Riddle[] = [
  { id: 'H2', target: 'H2', cards: ['H', 'H', 'O', 'C'], difficulty: 1 },
  { id: 'O2', target: 'O2', cards: ['O', 'O', 'H', 'N'], difficulty: 1 },
  { id: 'N2', target: 'N2', cards: ['N', 'N', 'O', 'H', 'H'], difficulty: 1 },
  { id: 'H2O', target: 'H2O', cards: ['H', 'H', 'O', 'O', 'N', 'C'], difficulty: 2 },
];

export const CLUES = 4;
export const START_POINTS = 100;
export const CLUE_COST = 15;
export const MISTAKE_COST = 10;
const BEST = 'webar:acertijos';

export const bestScores = (): Record<string, number> => JSON.parse(localStorage.getItem(BEST) ?? '{}');
export const stars = (points: number) => (points >= 80 ? 3 : points >= 50 ? 2 : 1);

/** ¿`content` es un paso hacia `target`? (sus átomos caben en la sustancia buscada). */
function isStep(content: Content, target: string): boolean {
  const s = getSpecies(content);
  const goal = composition(getSpecies(target)!);
  const parts = s ? composition(s) : { [content]: 1 };
  return Object.entries(parts).every(([el, n]) => (goal[el] ?? 0) >= n);
}

export interface RiddleResult {
  riddle: Riddle;
  solved: boolean;
  points: number;
  clues: number;
  mistakes: number;
}

/** Un acertijo en juego: panel con las pistas encima de las tarjetas. */
export class RiddleRun {
  private points = START_POINTS;
  private shown = 1;
  private mistakes = 0;
  private finished = false;
  private note: { text: string; kind: string } | null = null;
  private folded = false;
  private readonly panel: HTMLElement;
  private readonly offs: Array<() => void> = [];

  constructor(
    readonly riddle: Riddle,
    game: CardGame,
    host: HTMLElement,
    private readonly onFinish: (r: RiddleResult) => void,
  ) {
    this.panel = document.createElement('section');
    this.panel.className = 'acertijo flotante';
    this.panel.setAttribute('aria-live', 'polite');
    host.append(this.panel);
    this.offs.push(
      game.on('reaction', ({ products }) => this.onProducts(products)),
      game.on('invalid', () => this.mistake(t('acertijo.nada', { n: MISTAKE_COST }))),
    );
    this.render();
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.panel.remove();
  }

  private onProducts(products: Content[]): void {
    if (this.finished) return;
    if (products.includes(this.riddle.target)) return this.finish(true);
    const wrong = products.find((p) => !isStep(p, this.riddle.target));
    if (wrong) this.mistake(t('acertijo.mal_producto', { nombre: contentName(wrong), n: MISTAKE_COST }));
    else if (products[0]) this.say(t('acertijo.buen_paso', { formula: contentFormula(products[0]) }), 'bien');
  }

  private mistake(text: string): void {
    if (this.finished) return;
    this.mistakes++;
    this.points = Math.max(0, this.points - MISTAKE_COST);
    vibrate([40, 40, 40]);
    this.say(text, 'mal');
    this.render(false);
  }

  private clue(): void {
    if (this.shown >= CLUES) return;
    this.shown++;
    this.points = Math.max(0, this.points - CLUE_COST);
    this.render();
  }

  private finish(solved: boolean): void {
    this.finished = true;
    const points = solved ? Math.max(this.points, 10) : 0;
    if (solved) {
      const best = bestScores();
      best[this.riddle.id] = Math.max(best[this.riddle.id] ?? 0, points);
      localStorage.setItem(BEST, JSON.stringify(best));
    }
    // Un momento para ver el destello de la reacción antes de la explicación.
    setTimeout(() => this.onFinish({ riddle: this.riddle, solved, points, clues: this.shown, mistakes: this.mistakes }), solved ? 1600 : 0);
  }

  private say(text: string, kind: 'bien' | 'mal'): void {
    this.note = { text, kind };
    this.applyNote();
    if (kind === 'mal') {
      this.panel.classList.remove('sacude');
      void this.panel.offsetWidth;
      this.panel.classList.add('sacude');
    }
  }

  private applyNote(): void {
    const el = this.panel.querySelector<HTMLElement>('.acertijo-nota');
    if (!el || !this.note) return;
    el.textContent = this.note.text;
    el.className = `acertijo-nota ${this.note.kind}`;
  }

  private render(full = true): void {
    const { id } = this.riddle;
    const index = RIDDLES.indexOf(this.riddle);
    if (full) {
      this.panel.innerHTML = `
        <header><span class="pequeno">${t('acertijo.numero', { n: index + 1, total: RIDDLES.length })}</span>
          <span class="chip puntos" data-puntos></span>
          <button type="button" class="plegar" data-plegar aria-expanded="${!this.folded}" aria-label="${t(this.folded ? 'acertijo.desplegar' : 'acertijo.plegar')}">${this.folded ? '▾' : '▴'}</button></header>
        <h2>${t('acertijo.quien')}</h2>
        <ol class="pistas">${Array.from({ length: this.shown }, (_, i) => `<li class="entra">${t(`acertijo.${id}.pista.${i + 1}`)}</li>`).join('')}</ol>
        <p class="acertijo-nota" role="status"></p>
        ${this.shown === 1 && !this.mistakes ? `<p class="pequeno">${t('acertijo.como')}</p>` : ''}
        <div class="fila">
          <button type="button" class="btn info pequeno" data-pista ${this.shown >= CLUES ? 'disabled' : ''}>${this.shown >= CLUES ? t('acertijo.sin_pistas') : t('acertijo.pista_boton', { n: CLUE_COST })}</button>
          <button type="button" class="btn claro pequeno" data-rendirse>${t('acertijo.rendirse')}</button>
        </div>`;
      this.panel.querySelector('[data-pista]')!.addEventListener('click', () => this.clue());
      this.panel.querySelector('[data-rendirse]')!.addEventListener('click', () => this.finish(false));
      this.panel.querySelector('[data-plegar]')!.addEventListener('click', () => {
        this.folded = !this.folded;
        this.render();
      });
      this.panel.classList.toggle('plegado', this.folded);
      this.applyNote();
    }
    const chip = this.panel.querySelector<HTMLElement>('[data-puntos]')!;
    chip.textContent = `⭐ ${t('acertijo.puntos', { n: this.points })}`;
  }
}

/** La pantalla final: si se ha acertado, las pistas explicadas una a una. */
export function resultHTML(r: RiddleResult): string {
  const s = getSpecies(r.riddle.target)!;
  const n = stars(r.points);
  const explained = Array.from(
    { length: CLUES },
    (_, i) => `<li><b>${t(`acertijo.${r.riddle.id}.pista.${i + 1}`)}</b><p>${t(`acertijo.${r.riddle.id}.explica.${i + 1}`)}</p></li>`,
  ).join('');
  return `
    <div class="acertijo-final ${r.solved ? 'ok' : ''}">
      ${r.solved ? `<p class="estrellas" role="img" aria-label="${t('acertijo.estrellas', { n })}">${'★'.repeat(n)}<span>${'★'.repeat(3 - n)}</span></p>` : ''}
      <h2 id="detalle-titulo">${r.solved ? t('acertijo.conseguido') : t('acertijo.solucion_titulo')}</h2>
      <p class="formula-grande">${s.formula}</p>
      <p>${t('acertijo.era', { nombre: speciesName(s.id).toLowerCase(), formula: s.formula })}</p>
      ${r.solved ? `<p class="chip">${t('acertijo.resultado', { puntos: r.points, pistas: r.clues, fallos: r.mistakes })}</p>` : ''}
      <h3>${t('acertijo.pistas_titulo')}</h3>
      <ol class="pistas-explicadas">${explained}</ol>
    </div>`;
}
