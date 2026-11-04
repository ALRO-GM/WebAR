import { hasText, randomKey, tx } from './text';

/**
 * La mascota: Schrödingato, un gato cuántico que vive en una caja de cartón
 * (la del experimento mental). Mientras le miras está ahí; si nadie le hace caso se convierte en
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

/** Caras del gato: siempre amables (ojos redondos con brillo, sonrisa de gato). */
export type MascotMood = 'neutral' | 'feliz' | 'risa' | 'guino' | 'enamorado' | 'orgulloso' | 'sorpresa' | 'piensa' | 'triste' | 'dormido';
export const MASCOT_MOODS: readonly MascotMood[] = ['neutral', 'feliz', 'risa', 'guino', 'enamorado', 'orgulloso', 'sorpresa', 'piensa', 'triste', 'dormido'];
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
  tape: '#f3d3a4',
  blush: '#ff8fb0',
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
    ? `<path d="M160 120l16-16v66l-16 18Z" fill="${C.boxSide}"/><rect x="40" y="120" width="120" height="68" rx="4" fill="${C.box}"/><path d="M40 120h120v8H40Z" fill="${C.boxFlap}" opacity=".7"/><path d="M40 120l16-16-22-18-16 14Z" fill="${C.boxFlap}"/><path d="M160 120l16-16 20 12-14 18Z" fill="${C.boxFlap}"/>${tape()}<path d="M48 180h14M138 132h14" stroke="${C.boxSide}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`
    : '';
  const disc = opts.background ? `<circle cx="100" cy="92" r="98" fill="#efeaff"/><circle cx="100" cy="92" r="98" fill="none" stroke="#d6cbff" stroke-width="4"/>` : '';
  return `<svg class="gato-svg gato-${mood}" viewBox="0 -20 200 210" ${size} ${a11y} xmlns="http://www.w3.org/2000/svg">${defs}${disc}${back}<g class="gato-cuerpo"${box ? ` clip-path="url(#${clipCat})"` : ''}>${tail()}${cat(mood)}</g>${front}<g class="gato-cuerpo"${box ? ` clip-path="url(#${clipPaws})"` : ''}>${paws()}</g>${sparkles()}</svg>`;
}

/** Cinta de embalar en la caja (sin símbolos: es una caja de cartón normal). */
function tape(): string {
  return `<path d="M88 120h24v68H88Z" fill="${C.tape}" opacity=".85"/><path d="M88 120h24" stroke="#fff" stroke-width="2" opacity=".5"/>`;
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
    catEyes(mood),
    catBrows(mood),
    `<path d="M95 88h10l-5 6Z" fill="#ff7da6" stroke="${C.line}" stroke-width="1.5" stroke-linejoin="round"/>`,
    catMouth(mood),
    `<path d="M36 90l24 2M38 100l22-3M164 90l-24 2M162 100l-22-3" stroke="${C.line}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
  ].join('');
}

function catEyes(mood: MascotMood): string {
  const ink = C.ink;
  // Ojo abierto: redondo y oscuro con dos brillos (mirada dulce, nada de pupilas de rendija).
  const open = (x: number, r = 9, dx = 0, dy = 0) =>
    `<ellipse cx="${x + dx}" cy="${78 + dy}" rx="${r}" ry="${r * 1.12}" fill="${ink}"/><circle cx="${x + dx + r * 0.35}" cy="${78 + dy - r * 0.42}" r="${r * 0.38}" fill="#fff"/><circle cx="${x + dx - r * 0.3}" cy="${78 + dy + r * 0.4}" r="${r * 0.17}" fill="#fff"/>`;
  // Ojo sonriente: un arco hacia arriba (^).
  const smile = (x: number) => `<path d="M${x - 10} 81q10-13 20 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
  // Ojo cerrado y tranquilo (dormido).
  const closed = (x: number) => `<path d="M${x - 9} 78q9 7 18 0" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>`;
  const heart = (x: number) => `<path d="M${x} 88c-9-6-13-10-13-15a6.5 6.5 0 0 1 13-2a6.5 6.5 0 0 1 13 2c0 5-4 9-13 15Z" fill="#ff5c8a" stroke="${ink}" stroke-width="1.5"/><circle cx="${x - 5}" cy="${73}" r="2" fill="#fff" opacity=".8"/>`;
  let eyes: string;
  switch (mood) {
    case 'feliz':
    case 'risa':
    case 'orgulloso':
      eyes = smile(78) + smile(122);
      break;
    case 'guino':
      eyes = open(78) + smile(122);
      break;
    case 'enamorado':
      eyes = heart(78) + heart(122);
      break;
    case 'sorpresa':
      eyes = open(78, 10.5) + open(122, 10.5);
      break;
    case 'piensa':
      eyes = open(78, 8.5, 2, -3) + open(122, 8.5, 2, -3);
      break;
    case 'triste':
      eyes = open(78, 8.5, 0, 2) + open(122, 8.5, 0, 2) + `<path d="M64 92q-3 6 0 9q3-3 0-9Z" fill="#7fd3ff"/>`;
      break;
    case 'dormido':
      eyes = closed(78) + closed(122);
      break;
    default:
      eyes = open(78) + open(122);
  }
  return `<g class="gato-ojos">${eyes}</g>`;
}

function catBrows(mood: MascotMood): string {
  const s = `fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"`;
  if (mood === 'triste') return `<path d="M68 60q8 0 15-5M132 60q-8 0-15-5" ${s}/>`;
  if (mood === 'sorpresa') return `<path d="M68 56q10-7 20 0M112 56q10-7 20 0" ${s}/>`;
  if (mood === 'piensa') return `<path d="M112 58q10-7 20 0" ${s}/>`;
  if (mood === 'dormido') return `<g class="gato-zzz" fill="${C.furDark}" font-family="Nunito Variable, Nunito, sans-serif" font-weight="900"><text x="150" y="40" font-size="16">z</text><text x="162" y="26" font-size="12">z</text></g>`;
  return '';
}

function catMouth(mood: MascotMood): string {
  const line = `fill="none" stroke="${C.line}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"`;
  // Boca abierta sonriente (forma de D) con lengua.
  const open = (w: number, h: number) =>
    `<path d="M${100 - w} 97q${w} ${h * 2} ${w * 2} 0Z" fill="#7a2f4a" stroke="${C.line}" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="100" cy="${97 + h * 0.75}" rx="${w * 0.5}" ry="${h * 0.32}" fill="#ff8fb0"/>`;
  const blush = (o: number) => `<ellipse cx="68" cy="94" rx="9" ry="5.5" fill="${C.blush}" opacity="${o}"/><ellipse cx="132" cy="94" rx="9" ry="5.5" fill="${C.blush}" opacity="${o}"/>`;
  switch (mood) {
    case 'feliz':
    case 'enamorado':
      return blush(0.6) + open(9, 8);
    case 'risa':
      return blush(0.7) + open(12, 11);
    case 'guino':
      return blush(0.5) + `<path d="M100 94v3M89 97q5.5 7 11 0q5.5 7 11 0" ${line}/><path d="M103 101q4 6 8 1" fill="#ff8fb0" stroke="${C.line}" stroke-width="2"/>`;
    case 'orgulloso':
      return blush(0.5) + `<path d="M86 96q14 12 28 0" ${line}/>`;
    case 'sorpresa':
      return `<ellipse cx="100" cy="102" rx="5" ry="6" fill="#7a2f4a" stroke="${C.line}" stroke-width="2"/>`;
    case 'triste':
      return `<path d="M93 104q7-6 14 0" ${line}/>`;
    case 'piensa':
      return `<path d="M95 101q5 2 10-1" ${line}/>`;
    case 'dormido':
      return blush(0.35) + `<path d="M100 94v2M93 97q3.5 4 7 0q3.5 4 7 0" ${line}/>`;
    default:
      // Sonrisa de gato (ω) con las comisuras hacia arriba.
      return blush(0.45) + `<path d="M100 94v3M87 95q2 3 4 3M89 97q5.5 7 11 0q5.5 7 11 0M113 95q-2 3-4 3" ${line}/>`;
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
    // Cada reacción tiene varias caras, para que no se repita siempre la misma.
    const faces: Record<MascotReaction, MascotMood[]> = {
      feliz: ['feliz', 'guino', 'orgulloso'],
      celebra: ['risa', 'enamorado', 'feliz'],
      sorpresa: ['sorpresa'],
      triste: ['triste'],
      piensa: ['piensa'],
    };
    const options = faces[kind];
    this.setMood(options[Math.floor(Math.random() * options.length)]);
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
        // Le entra sueño: cierra los ojos antes de desvanecerse.
        this.setMood('dormido');
        this.sayRandom('inactivo');
      } else if (this.ambient && now > this.nextAmbient && !this.bubble.classList.contains('visible')) {
        this.nextAmbient = now + 14_000 + Math.random() * 12_000;
        if (!calm()) {
          const r = Math.random();
          if (r < 0.25) this.react('feliz');
          else if (r < 0.5) this.peek();
          else if (r < 0.75) this.superpose(3500);
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
