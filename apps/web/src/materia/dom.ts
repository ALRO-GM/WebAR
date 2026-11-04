/** Mini constructor de HTML para la sección (sin textos: todos vienen de `t()`). */

type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') el.addEventListener(name.replace(/^on/, ''), value);
    else if (name === 'class') el.className = String(value);
    else if (name === 'text') el.textContent = String(value);
    else if (name === 'html') el.innerHTML = String(value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Botón interruptor (aria-pressed) que llama a `onChange` con el nuevo estado. */
export function toggle(label: string, pressed: boolean, onChange: (on: boolean) => void, cls = 'mat-toggle'): HTMLButtonElement {
  const button = h('button', { type: 'button', class: cls, 'aria-pressed': String(pressed), text: label });
  button.addEventListener('click', () => {
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return button;
}

/** Grupo de opciones excluyentes (role=radiogroup con botones aria-checked). */
export function segmented<T extends string | number>(label: string, options: Array<{ value: T; text: string }>, value: T, onChange: (v: T) => void): HTMLElement {
  const group = h('div', { class: 'mat-seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), text: o.text });
    b.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-checked', String(other === b));
      onChange(o.value);
    });
    return b;
  });
  // Flechas para moverse dentro del grupo (patrón de radiogroup).
  group.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0 || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const next = buttons[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });
  group.append(...buttons);
  return group;
}

/** Formatea un número con la coma o el punto del idioma. */
export const fmt = (n: number, digits = 0) => n.toLocaleString(document.documentElement.lang || 'es', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
