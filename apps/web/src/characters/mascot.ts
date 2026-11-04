import { hasText, randomKey, tx } from './text';

/**
 * La mascota: Schrödingato, un gato cuántico que vive en una caja de cartón
 * con una ψ. Mientras le miras está ahí; si nadie le hace caso se convierte en
 * una nube de probabilidad, y al tocarlo «colapsa» de nuevo.
 *
 * ```ts
 * const gato = new Mascot(document.querySelector('#gato')!)
 * gato.greet()                       // saludo (o frase de noche)
 * gato.react('feliz'); gato.sayRandom('acierto')
 * gato.say('gato.frase.animo.1')     // clave de la tabla de textos
 * ```
 * Los textos son claves de i18n/es/personajes.json (`gato.*`).
 */

export type MascotMood = 'neutral' | 'feliz' | 'triste' | 'sorpresa' | 'piensa';
export type MascotReaction = 'feliz' | 'triste' | 'sorpresa' | 'celebra' | 'piensa';
export type MascotTheme =
  | 'saludo'
  | 'inactivo'
  | 'acierto'
  | 'fallo'
  | 'racha'
  | 'reaccion'
  | 'descubre'
  | 'desaparece'
  | 'colapso'
  | 'animo'
  | 'noche'
  | 'tunel'
  | 'superposicion';

export interface MascotSVGOptions {
  mood?: MascotMood;
  /** Ancho y alto en px; si falta, ocupa su contenedor. */
  size?: number;
  /** Sin la caja (solo el gato). */
  noBox?: boolean;
  /** Disco de color detrás (como los avatares de personajes). */
  background?: boolean;
  decorative?: boolean;
}

const C = {
  fur: '#b9a8ff',
  furDark: '#8f78f2',
  furLight: '#ece6ff',
  line: '#4b3f8f',
  inner: '#ff9fbf',
  iris: '#2ec4a6',
  ink: '#262236',
  box: '#e2ab6e',
  boxSide: '#c88a4c',
  boxIn: '#8d5c2e',
  boxFlap: '#eebd85',
  psi: '#7c5cff',
};
let uid = 0;

export function mascotSVG(opts: MascotSVGOptions = {}): string {
  const n = ++uid;
  const mood = opts.mood ?? 'neutral';
  const size = opts.size ? `width="${opts.size}" height="${opts.size}"` : '';
  const a11y = opts.decorative ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${tx('gato.nombre')}"`;
  const box = !opts.noBox;
  const clipCat = `gato-c-${n}`;
  const clipPaws = `gato-p-${n}`;
  const defs = box
    ? `<defs><clipPath id="${clipCat}"><rect x="-20" y="-40" width="240" height="226"/></clipPath><clipPath id="${clipPaws}"><rect x="-20" y="-40" width="240" height="166"/></clipPath></defs>`
    : '';
  const back = box
    ? `<path d="M56 104h120l-10-22H66Z" fill="${C.boxSide}"/><path d="M40 120l16-16h120l-16 16Z" fill="${C.boxIn}"/>`
    : '';
  const front = box
    ? `<path d="M160 120l16-16v66l-16 18Z" fill="${C.boxSide}"/><rect x="40" y="120" width="120" height="68" rx="4" fill="${C.box}"/><path d="M40 120h120v8H40Z" fill="${C.boxFlap}" opacity=".7"/><path d="M40 120l16-16-22-18-16 14Z" fill="${C.boxFlap}"/><path d="M160 120l16-16 20 12-14 18Z" fill="${C.boxFlap}"/>${psi(100, 156)}<path d="M48 180h14M138 132h14" stroke="${C.boxSide}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`
    : '';
  const disc = opts.background ? `<circle cx="100" cy="92" r="98" fill="#efeaff"/><circle cx="100" cy="92" r="98" fill="none" stroke="#d6cbff" stroke-width="4"/>` : '';
  return `<svg class="gato-svg gato-${mood}" viewBox="0 -20 200 210" ${size} ${a11y} xmlns="http://www.w3.org/2000/svg">${defs}${disc}${back}<g class="gato-cuerpo"${box ? ` clip-path="url(#${clipCat})"` : ''}>${tail()}${cat(mood)}</g>${front}<g class="gato-cuerpo"${box ? ` clip-path="url(#${clipPaws})"` : ''}>${paws()}</g>${sparkles()}</svg>`;
}

function psi(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${C.psi}" stroke-width="6" stroke-linecap="round"><path d="M-15-16q0 20 15 20t15-20"/><path d="M0-22v40M-8 18h16"/></g>`;
}

function tail(): string {
  // Cola en forma de onda (función de onda, claro).
  return `<path class="gato-cola" d="M146 116c18-8 10-26 22-34s16-22 6-30" fill="none" stroke="${C.line}" stroke-width="15" stroke-linecap="round"/><path class="gato-cola" d="M146 116c18-8 10-26 22-34s16-22 6-30" fill="none" stroke="${C.fur}" stroke-width="10" stroke-linecap="round"/>`;
}

function cat(mood: MascotMood): string {
  const droop = mood === 'triste';
  const ear = (s: 1 | -1) => {
    const x = 100 + s * 30;
    const tilt = droop ? s * 28 : s * 4;
    return `<g transform="rotate(${tilt} ${x} 54)"><path d="M${x - s * 16} 56L${x + s * 4} 12 ${x + s * 18} 54Z" fill="${C.fur}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/><path d="M${x - s * 7} 50L${x + s * 4} 24 ${x + s * 11} 50Z" fill="${C.inner}"/></g>`;
  };
  return [
    // Cuerpo
    `<ellipse cx="100" cy="124" rx="40" ry="30" fill="${C.fur}" stroke="${C.line}" stroke-width="3"/>`,
    `<ellipse cx="100" cy="130" rx="22" ry="18" fill="${C.furLight}"/>`,
    `<g class="gato-orejas">${ear(-1)}${ear(1)}</g>`,
    // Cabeza
    `<ellipse cx="100" cy="76" rx="50" ry="42" fill="${C.fur}" stroke="${C.line}" stroke-width="3"/>`,
    `<path d="M92 38q8 10 0 16M100 36v16M108 38q-8 10 0 16" fill="none" stroke="${C.furDark}" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="M50 80q8 2 12 0M52 90q8 0 12-3M150 80q-8 2-12 0M148 90q-8 0-12-3" fill="none" stroke="${C.furDark}" stroke-width="3.5" stroke-linecap="round"/>`,
    `<ellipse cx="100" cy="96" rx="20" ry="13" fill="${C.furLight}"/>`,
    `<ellipse cx="70" cy="96" rx="8" ry="5" fill="#ff7da6" opacity=".35"/><ellipse cx="130" cy="96" rx="8" ry="5" fill="#ff7da6" opacity=".35"/>`,
    catEyes(mood),
    catBrows(mood),
    `<path d="M95 88h10l-5 6Z" fill="#ff7da6" stroke="${C.line}" stroke-width="1.5" stroke-linejoin="round"/>`,
    catMouth(mood),
    `<path d="M36 90l24 2M38 100l22-3M164 90l-24 2M162 100l-22-3" stroke="${C.line}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
  ].join('');
}

function catEyes(mood: MascotMood): string {
  if (mood === 'feliz') {
    const arc = (x: number) => `<path d="M${x - 10} 78q10-13 20 0" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>`;
    return `<g class="gato-ojos">${arc(78)}${arc(122)}</g>`;
  }
  const big = mood === 'sorpresa';
  const [gx, gy] = mood === 'piensa' ? [3, -4] : mood === 'triste' ? [0, 2] : [0, 0];
  const eye = (x: number) =>
    `<ellipse cx="${x}" cy="76" rx="${big ? 14 : 12.5}" ry="${big ? 15.5 : 14}" fill="#fff" stroke="${C.line}" stroke-width="2"/><circle cx="${x + gx}" cy="${77 + gy}" r="${big ? 7 : 9}" fill="${C.iris}"/><ellipse cx="${x + gx}" cy="${77 + gy}" rx="${big ? 2.4 : 3.4}" ry="${big ? 5 : 7}" fill="${C.ink}"/><circle cx="${x + gx + 3.5}" cy="${72 + gy}" r="3" fill="#fff"/><circle cx="${x + gx - 3}" cy="${82 + gy}" r="1.4" fill="#fff"/>`;
  return `<g class="gato-ojos">${eye(78)}${eye(122)}</g>`;
}

function catBrows(mood: MascotMood): string {
  if (mood === 'triste') return `<path d="M66 58q8 0 16-6M134 58q-8 0-16-6" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;
  if (mood === 'sorpresa') return `<path d="M68 52q10-6 20 0M112 52q10-6 20 0" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;
  if (mood === 'piensa') return `<path d="M112 54q10-6 20 0" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;
  return '';
}

function catMouth(mood: MascotMood): string {
  const s = `fill="none" stroke="${C.line}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;
  switch (mood) {
    case 'feliz':
      return `<path d="M90 97q10 16 20 0Z" fill="#7a2f4a" stroke="${C.line}" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="100" cy="104" rx="5" ry="3" fill="#ff8fb0"/>`;
    case 'triste':
      return `<path d="M92 104q8-7 16 0" ${s}/>`;
    case 'sorpresa':
      return `<ellipse cx="100" cy="102" rx="5" ry="6.5" fill="#7a2f4a" stroke="${C.line}" stroke-width="2"/>`;
    case 'piensa':
      return `<path d="M93 101q7-3 14 0" ${s}/>`;
    default:
      return `<path d="M100 94v3M90 97q5 6 10 0q5 6 10 0" ${s}/>`;
  }
}

function paws(): string {
  const paw = (x: number) =>
    `<ellipse cx="${x}" cy="121" rx="13" ry="9" fill="${C.fur}" stroke="${C.line}" stroke-width="3"/><path d="M${x - 4} 117v6M${x + 4} 117v6" stroke="${C.line}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
  return `${paw(76)}${paw(124)}`;
}

function sparkles(): string {
  const star = (x: number, y: number, c: string, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0-10L3-3 10 0 3 3 0 10-3 3-10 0-3-3Z" fill="${c}" opacity="0"/></g>`;
  return `<g class="gato-chispas" aria-hidden="true">${star(30, 20, '#ffc800', 1.3)}${star(172, 12, '#ce82ff', 1.1)}${star(14, 80, '#2ec4a6', 0.9)}${star(188, 70, '#ff9600', 1.2)}</g>`;
}

// --- La mascota viva ---------------------------------------------------------------

export interface MascotOptions {
  /** Tamaño en px (ancho = alto). Por defecto 140. */
  size?: number;
  /** Milisegundos sin interacción para volverse nube. Por defecto 25 000. */
  idleMs?: number;
  /** Efectos espontáneos de vez en cuando (asomarse, superposición, túnel). Por defecto, sí. */
  ambient?: boolean;
  /** Bocadillo debajo en vez de encima. */
  bubbleBelow?: boolean;
}

type State = 'visto' | 'nube';

/** La mascota montada en un elemento del DOM, con bocadillo y efectos cuánticos. */
export class Mascot {
  readonly element: HTMLElement;
  private readonly real: HTMLElement;
  private readonly ghosts: HTMLElement[];
  private readonly bubble: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly idleMs: number;
  private readonly ambient: boolean;
  private mood: MascotMood = 'neutral';
  private state: State = 'visto';
  private fog = 0;
  private lastSeen = Date.now();
  private saidIdle = false;
  private lastKey?: string;
  private nextAmbient: number;
  private timers = new Map<string, number>();
  private interval: number;
  private superposed = false;
  private collapsedAt = 0;
  private readonly off: (() => void)[] = [];

  constructor(
    readonly container: HTMLElement,
    opts: MascotOptions = {},
  ) {
    this.idleMs = opts.idleMs ?? 25_000;
    this.ambient = opts.ambient ?? true;
    this.nextAmbient = Date.now() + 9000 + Math.random() * 8000;

    const el = document.createElement('div');
    el.className = 'gato';
    if (opts.bubbleBelow) el.classList.add('bocadillo-abajo');
    el.style.setProperty('--gato-size', `${opts.size ?? 140}px`);
    el.innerHTML = `<div class="gato-capa gato-fantasma f1" aria-hidden="true"></div><div class="gato-capa gato-fantasma f2" aria-hidden="true"></div><div class="gato-capa gato-real"></div><div class="gato-capa gato-nube" aria-hidden="true"></div><div class="gato-barrera" aria-hidden="true"></div><button type="button" class="gato-boton"></button><div class="gato-bocadillo" role="status" aria-live="polite"></div>`;
    this.element = el;
    this.real = el.querySelector('.gato-real')!;
    this.ghosts = [...el.querySelectorAll<HTMLElement>('.gato-fantasma')];
    this.bubble = el.querySelector('.gato-bocadillo')!;
    this.button = el.querySelector('.gato-boton')!;
    this.button.setAttribute('aria-label', tx('gato.aria'));
    this.button.title = tx('gato.nombre');
    this.render();
    container.appendChild(el);

    this.button.addEventListener('click', () => this.tap());
    // Cualquier interacción con la página cuenta como «mirarle».
    const seen = () => this.observe();
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
      document.addEventListener(type, seen, { passive: true });
      this.off.push(() => document.removeEventListener(type, seen));
    }
    let lastMove = 0;
    const move = () => {
      const now = Date.now();
      if (now - lastMove > 1000) {
        lastMove = now;
        seen();
      }
    };
    document.addEventListener('pointermove', move, { passive: true });
    this.off.push(() => document.removeEventListener('pointermove', move));
    const vis = () => {
      if (document.hidden) this.setFog(1, 'nube');
      else this.observe(true);
    };
    document.addEventListener('visibilitychange', vis);
    this.off.push(() => document.removeEventListener('visibilitychange', vis));
    this.interval = window.setInterval(() => this.tick(), 1000);
  }

  /** Muestra un bocadillo con el texto de una clave (o un texto ya traducido). */
  say(textOrKey: string, ms = 4500): void {
    const text = hasText(textOrKey) ? tx(textOrKey) : textOrKey;
    this.bubble.textContent = text;
    this.bubble.classList.add('visible');
    this.later('say', ms, () => this.bubble.classList.remove('visible'));
  }

  /** Dice una frase al azar del tema (sin repetir la última). Devuelve la clave. */
  sayRandom(theme: MascotTheme, ms?: number): string | undefined {
    const key = randomKey(`gato.frase.${theme}.`, this.lastKey);
    if (!key) return undefined;
    this.lastKey = key;
    this.say(key, ms ?? Math.max(3500, tx(key).length * 70));
    return key;
  }

  /** Saludo al entrar (de noche, frase de noche). */
  greet(): void {
    const h = new Date().getHours();
    this.react('feliz');
    this.sayRandom(h >= 22 || h < 7 ? 'noche' : 'saludo');
  }

  react(kind: MascotReaction): void {
    this.setMood(kind === 'celebra' ? 'feliz' : kind);
    this.element.dataset.reaccion = kind;
    this.later('react', kind === 'triste' ? 2200 : 1600, () => {
      delete this.element.dataset.reaccion;
      this.setMood('neutral');
    });
  }

  /**
   * Alguien le mira (cualquier interacción con la página). Si era una nube,
   * colapsa y lo dice (`announce`, por defecto sí).
   */
  observe(announce = true): void {
    this.lastSeen = Date.now();
    this.saidIdle = false;
    if (this.state === 'nube') {
      this.setFog(0, 'visto');
      this.collapsedAt = Date.now();
      this.flash('colapsa', 700);
      this.react('sorpresa');
      if (announce) this.sayRandom('colapso');
    }
  }

  /** Superposición: dos copias translúcidas que parpadean hasta que lo tocas (o pasa `ms`). */
  superpose(ms = 7000): void {
    if (this.superposed) return;
    this.superposed = true;
    this.element.classList.add('superpuesto');
    this.later('superpose', ms, () => this.collapse(false));
  }

  /** Colapsa la superposición en un solo gato. */
  collapse(announce = true): void {
    if (!this.superposed) return;
    this.superposed = false;
    this.element.classList.remove('superpuesto');
    this.flash('colapsa', 700);
    if (announce) this.sayRandom('colapso');
  }

  /** Pasa a nube de probabilidad como si nadie le mirase (se desvanece poco a poco). */
  vanish(): void {
    if (this.state === 'nube') return;
    this.lastSeen = 0;
    this.state = 'nube';
    this.sayRandom('desaparece', 6000);
  }

  /** Efecto túnel: atraviesa una barrera y sale por el otro lado. */
  tunnel(): void {
    this.flash('tunel', 1800);
  }

  /** Se esconde en la caja y vuelve a asomar. */
  peek(): void {
    this.flash('asoma', 2600);
  }

  destroy(): void {
    clearInterval(this.interval);
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.off.forEach((f) => f());
    this.element.remove();
  }

  // --- Por dentro -----------------------------------------------------------

  private tap(): void {
    // El mismo toque que lo ha hecho colapsar desde la nube no cuenta otra vez.
    if (Date.now() - this.collapsedAt < 600) return;
    if (this.superposed) return this.collapse(true);
    if (this.state === 'nube') return this.observe(true);
    const r = Math.random();
    if (r < 0.45) {
      this.react(Math.random() < 0.5 ? 'feliz' : 'sorpresa');
      this.sayRandom('reaccion');
    } else if (r < 0.65) {
      this.superpose();
      this.sayRandom('superposicion');
    } else if (r < 0.85) {
      this.tunnel();
      this.sayRandom('tunel');
    } else {
      this.peek();
      this.sayRandom('reaccion');
    }
  }

  private tick(): void {
    const now = Date.now();
    const idle = now - this.lastSeen;
    if (this.state === 'visto') {
      if (idle > this.idleMs) {
        this.state = 'nube';
        this.sayRandom('desaparece', 6000);
      } else if (idle > this.idleMs * 0.55 && !this.saidIdle) {
        this.saidIdle = true;
        this.sayRandom('inactivo');
      } else if (this.ambient && now > this.nextAmbient && !this.bubble.classList.contains('visible')) {
        this.nextAmbient = now + 14_000 + Math.random() * 12_000;
        if (!calm()) {
          const r = Math.random();
          if (r < 0.4) this.peek();
          else if (r < 0.7) this.superpose(3500);
          else this.tunnel();
        }
      }
    } else if (this.fog < 1 && !document.hidden) {
      // Se va desvaneciendo poco a poco (unos 8 s).
      this.setFog(Math.min(1, this.fog + 0.125), 'nube');
    }
  }

  private setFog(v: number, state: State): void {
    this.fog = v;
    this.state = state;
    this.element.style.setProperty('--gato-niebla', String(v));
    this.element.classList.toggle('es-nube', state === 'nube');
  }

  private setMood(mood: MascotMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.render();
  }

  private render(): void {
    this.real.innerHTML = mascotSVG({ mood: this.mood, decorative: true });
    for (const g of this.ghosts) g.innerHTML = mascotSVG({ mood: this.mood, decorative: true, noBox: true });
  }

  private flash(cls: string, ms: number): void {
    this.element.classList.remove(cls);
    void this.element.offsetWidth;
    this.element.classList.add(cls);
    this.later(cls, ms, () => this.element.classList.remove(cls));
  }

  private later(name: string, ms: number, fn: () => void): void {
    clearTimeout(this.timers.get(name));
    this.timers.set(name, window.setTimeout(fn, ms));
  }
}

function calm(): boolean {
  return document.documentElement.classList.contains('calma') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
