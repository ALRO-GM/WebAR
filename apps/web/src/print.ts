import './print.css';
import { markerSVG } from '@webar/ar-core/markers';
import { atomComposition, getElement } from '@webar/chem';
import { t, translate } from './i18n';
import { elementName } from './i18n/content';
import { applySettings } from './settings';
import { FAMILY_COLORS } from './cards/card-face';
import { KITS, cardsFor, type CardSpec } from './cards/deck';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PER_PAGE = 9;

applySettings();
translate();
const kits = $('kits');
kits.innerHTML =
  `<legend>${t('imprimir.que')}</legend>` +
  Object.entries(KITS)
    .map(([key, kit], i) => `<label><input type="radio" name="kit" value="${key}" ${i === 0 ? 'checked' : ''}/> <b>${t(`kit.${key}.nombre`, { n: kit.symbols.length })}</b><br/><small>${t(`kit.${key}.descripcion`)}</small></label>`)
    .join('') +
  `<label><input type="radio" name="kit" value="personal"/> <b>${t('imprimir.personal')}</b></label>`;

function selected(): string[] {
  const kit = (document.querySelector('input[name=kit]:checked') as HTMLInputElement).value;
  if (kit !== 'personal') return KITS[kit].symbols;
  return $<HTMLInputElement>('personal')
    .value.split(/[\s,]+/)
    .filter((s) => {
      try {
        return !!getElement(s);
      } catch {
        return false;
      }
    });
}

function card(spec: CardSpec): string {
  const e = getElement(spec.symbol);
  const c = atomComposition(e);
  return `<article class="carta" style="--fam:${FAMILY_COLORS[e.family]}">
    <div class="marcador">${markerSVG(spec.id)}</div>
    <div class="datos">
      <span class="z">${e.z}</span>
      <span class="simbolo">${e.symbol}</span>
      <span class="nombre">${elementName(e.symbol)}</span>
      <span class="particulas">${c.protons} p⁺ · ${c.neutrons} n⁰ · ${c.electrons} e⁻</span>
    </div>
    <footer>webar.peer4u.app · nº ${spec.id}</footer>
  </article>`;
}

function render(): void {
  const symbols = selected();
  const specs = cardsFor(symbols);
  const pages: string[] = [];
  for (let i = 0; i < specs.length; i += PER_PAGE) pages.push(`<section class="hoja">${specs.slice(i, i + PER_PAGE).map(card).join('')}</section>`);
  $('hojas').innerHTML = pages.join('');
  const missing = symbols.length - specs.length;
  $('resumen').textContent =
    t(pages.length === 1 ? 'imprimir.resumen_1' : 'imprimir.resumen', { tarjetas: specs.length, hojas: pages.length }) +
    (missing > 0 ? ` ${t('imprimir.faltan', { n: missing })}` : '');
}

$('opciones').addEventListener('change', render);
$('personal').addEventListener('input', () => {
  (document.querySelector('input[value=personal]') as HTMLInputElement).checked = true;
  render();
});
$('imprimir').addEventListener('click', () => window.print());
render();
