import { t } from '../i18n';

/**
 * Gráficas del panel en HTML y SVG, sin librerías. Siguen la guía de
 * visualización del proyecto: una serie, un tono (azul validado en claro y en
 * oscuro, en teacher.css), marcas finas con el extremo redondeado, valores
 * escritos donde ayudan, tooltip al pasar (`data-tip`) y, en cada gráfica, la
 * misma información en tabla.
 */

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Tarjeta con título, explicación y botón para alternar gráfica ⇄ tabla. */
export function chartCard(id: string, title: string, help: string, chart: string, table: string): string {
  return `<section class="tarjeta-panel" id="${id}">
    <div class="cabecera-grafica"><h3>${esc(title)}</h3>
      <button type="button" class="secundario" data-alternar="${id}" aria-pressed="false">${t('profe.ver_tabla')}</button></div>
    ${help ? `<p class="pequeno">${esc(help)}</p>` : ''}
    <div data-vista="grafica">${chart}</div>
    <div data-vista="tabla" hidden>${table}</div>
  </section>`;
}

export function table(head: string[], rows: Array<Array<string | number>>): string {
  if (!rows.length) return `<p class="pequeno">${t('estadisticas.sin_datos')}</p>`;
  return `<div class="tabla-datos"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Columnas verticales (una por día), con eje de 0 a un máximo redondo. */
export function columns(items: Array<{ label: string; value: number; tip: string; showLabel: boolean }>, aria: string): string {
  const W = 640, H = 190, padL = 30, padB = 24, padT = 10;
  const max = Math.max(4, ...items.map((d) => d.value));
  const nice = Math.ceil(max / 4) * 4;
  const bw = (W - padL) / Math.max(items.length, 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const grid = [0, nice / 2, nice]
    .map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="rejilla-g"/><text x="${padL - 6}" y="${y(v) + 4}" class="eje" text-anchor="end">${v}</text>`)
    .join('');
  const bars = items
    .map((d, i) => {
      const w = Math.min(bw * 0.6, 16);
      const x = padL + i * bw + (bw - w) / 2;
      const h = Math.max(0, y(0) - y(d.value));
      const r = Math.min(4, h, w / 2);
      const path = h ? `M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z` : '';
      return `<g class="barra" data-tip="${esc(d.tip)}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>${path ? `<path d="${path}"/>` : ''}
        ${d.showLabel ? `<text x="${x + w / 2}" y="${H - 6}" class="eje" text-anchor="${i === items.length - 1 ? 'end' : 'middle'}">${esc(d.label)}</text>` : ''}</g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafica" role="img" aria-label="${esc(aria)}">${grid}${bars}</svg>`;
}

/** Barras horizontales de 0 a 1 (porcentajes), con la etiqueta a la izquierda y el valor escrito al final. */
export function bars(items: Array<{ label: string; value: number; note?: string; tip: string }>): string {
  if (!items.length) return `<p class="pequeno">${t('estadisticas.sin_datos')}</p>`;
  return `<ul class="barras">${items
    .map(
      (d) => `<li data-tip="${esc(d.tip)}"><span class="barras-etiqueta">${d.label}</span>
      <span class="barras-pista"><span class="barras-valor" style="--v:${Math.max(0, Math.min(1, d.value))}"></span></span>
      <b>${pct(d.value)}</b>${d.note ? `<small>${esc(d.note)}</small>` : ''}</li>`,
    )
    .join('')}</ul>`;
}

/**
 * Mapa de calor día × hora: una escala secuencial de un solo tono en 5
 * escalones (vacío = sin color). La leyenda dice qué es cada escalón.
 */
export function heatmap(heat: number[][], days: string[], aria: string): string {
  const max = Math.max(1, ...heat.flat());
  const level = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 4.999)));
  const step = (k: number) => Math.ceil((max * k) / 5);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return `<div class="calor" role="img" aria-label="${esc(aria)}">
    <span></span>${hours.map((h) => `<span class="calor-hora">${h % 3 === 0 ? h : ''}</span>`).join('')}
    ${heat
      .map(
        (row, d) =>
          `<span class="calor-dia">${esc(days[d])}</span>${row
            .map((v, h) => `<span class="celda n${level(v)}" data-tip="${esc(t('estadisticas.calor_tip', { dia: days[d], hora: h, n: v }))}"></span>`)
            .join('')}`,
      )
      .join('')}
  </div>
  <p class="calor-leyenda pequeno"><span>${t('estadisticas.menos')}</span>${[0, 1, 2, 3, 4, 5]
    .map((k) => `<span class="celda n${k}" title="${k ? `${step(k - 1) || 1}–${step(k)}` : '0'}"></span>`)
    .join('')}<span>${t('estadisticas.mas')}</span></p>`;
}

/** Una barra apilada por fila (terminada · en curso · sin llegar), con leyenda arriba. */
export function stacked(items: Array<{ label: string; parts: number[]; tip: string }>, legend: string[]): string {
  const total = (p: number[]) => Math.max(1, p.reduce((a, b) => a + b, 0));
  return `<p class="est-leyenda">${legend.map((l, i) => `<span><i class="muestra parte-${i}"></i>${esc(l)}</span>`).join('')}</p>
  <ul class="apiladas">${items
    .map(
      (d) => `<li data-tip="${esc(d.tip)}"><span class="barras-etiqueta">${d.label}</span><span class="apilada">${d.parts
        .map((v, i) => (v ? `<span class="parte-${i}" style="flex:${v / total(d.parts)}"></span>` : ''))
        .join('')}</span><b>${d.parts[0]}/${total(d.parts)}</b></li>`,
    )
    .join('')}</ul>`;
}

/** Tooltip común: cualquier elemento con `data-tip` (texto plano). */
export function wireTooltips(root: HTMLElement, tip: HTMLElement): void {
  let current: HTMLElement | null = null;
  root.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-tip]');
    if (el === current) return;
    current?.classList.remove('activa');
    current = el;
    if (!el) return void (tip.hidden = true);
    el.classList.add('activa');
    tip.textContent = el.dataset.tip!;
    tip.hidden = false;
  });
  root.addEventListener('pointermove', (e) => Object.assign(tip.style, { left: `${Math.min(e.clientX + 12, innerWidth - 240)}px`, top: `${e.clientY - 44}px` }));
  root.addEventListener('pointerleave', () => {
    current?.classList.remove('activa');
    current = null;
    tip.hidden = true;
  });
}

/** Los botones «Ver tabla / Ver gráfica» de las tarjetas. */
export function wireToggles(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-alternar]').forEach((b) =>
    b.addEventListener('click', () => {
      const card = root.querySelector<HTMLElement>(`#${b.dataset.alternar}`)!;
      const asTable = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(asTable));
      b.textContent = asTable ? t('profe.ver_grafica') : t('profe.ver_tabla');
      card.querySelector<HTMLElement>('[data-vista="grafica"]')!.hidden = asTable;
      card.querySelector<HTMLElement>('[data-vista="tabla"]')!.hidden = !asTable;
    }),
  );
}
