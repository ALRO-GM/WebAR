import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARSession, ViewerProvider, WebXRWorldProvider, detectARSupport, type ARAnchor, type ARProvider } from '@webar/ar-core';
import { AtomView, ELEMENTS, FAMILY_NAMES, atomComposition, formatConfiguration, getElement, type AtomModel, type ElementData } from '@webar/chem';
import { CardsMode, type CardsKind } from './cards/mode';
import { setupInstall } from './install';
import { markSelected, renderPeriodicTable, updateLocks } from './periodic-table';
import { Hub } from './platform/hub';
import { composition, getSpecies } from '@webar/chem';
import { createShadow } from './shadow';

// La app une las dos bases: @webar/ar-core (dónde está cada cosa en el mundo)
// y @webar/chem (cómo es cada átomo y cómo reacciona). Aquí va la interfaz y
// el reparto entre modos: explorar átomos o jugar con tarjetas.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const xr = new WebXRWorldProvider();
const viewer = new ViewerProvider();
const ar = new ARSession({ provider: viewer, overlay: $('overlay') });

const pmrem = new THREE.PMREMGenerator(ar.renderer);
ar.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.5, 2, 1);
ar.scene.add(sun);

// --- Estado común ------------------------------------------------------------

// Enlaces directos: ?el=Fe&modelo=orbitales&vista=3d · ?vista=mesa&cartas=H,H,O&juntas=1
const params = new URLSearchParams(location.search);
let model: AtomModel = (params.get('modelo') ?? localStorage.getItem('webar:modelo')) === 'orbitales' ? 'cloud' : 'bohr';
let mode: 'explorar' | 'tarjetas' = 'explorar';

function selectModel(m: AtomModel): void {
  model = m;
  localStorage.setItem('webar:modelo', m === 'cloud' ? 'orbitales' : 'bohr');
  for (const [bohr, cloud] of [['modelo-bohr', 'modelo-nube'], ['t-bohr', 't-nube']]) {
    $(bohr).setAttribute('aria-checked', String(m === 'bohr'));
    $(cloud).setAttribute('aria-checked', String(m === 'cloud'));
  }
  explore.setModel(m);
  cards.setModel(m);
}

// El progreso del alumno (colección, desbloqueos, retos, clase).
const hub = new Hub();
await hub.init();

// La tabla periódica es un selector compartido: cada modo decide qué hacer al
// elegir. Los elementos bloqueados se ven, pero no se pueden usar todavía.
const tableCells = $('tabla-celdas');
let onPick: (el: ElementData) => void = () => {};
renderPeriodicTable(tableCells, (el) => {
  if (!hub.isUnlocked(el.symbol)) return hub.showElement(el);
  $('tabla').hidden = true;
  onPick(el);
});
function pickElement(handler: (el: ElementData) => void, current?: number): void {
  onPick = handler;
  updateLocks(tableCells, (el) => !hub.isUnlocked(el.symbol));
  if (current) markSelected(tableCells, current);
  $('tabla').hidden = false;
  tableCells.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
$('cerrar-tabla').addEventListener('click', () => ($('tabla').hidden = true));

// --- Explorar átomos (uno en el visor, o varios sobre la mesa con WebXR) -------

const explore = (() => {
  let element: ElementData = initialElement();
  let placed: Array<{ anchor: ARAnchor; atom: AtomView }> = [];

  function initialElement(): ElementData {
    const fromUrl = params.get('el');
    if (fromUrl) {
      try {
        return getElement(/^\d+$/.test(fromUrl) ? Number(fromUrl) : fromUrl);
      } catch {
        /* elemento desconocido: el guardado */
      }
    }
    const saved = Number(localStorage.getItem('webar:z'));
    const el = getElement(saved >= 1 && saved <= 118 ? saved : 8);
    return hub.isUnlocked(el.symbol) ? el : getElement('O');
  }

  function attach(anchor: ARAnchor, onSurface: boolean) {
    const atom = new AtomView(element, { model });
    if (onSurface) {
      atom.object.position.y = atom.radius * 1.15 + 0.01;
      anchor.object.add(createShadow(atom.radius * 0.9));
    }
    anchor.object.add(atom.object);
    placed.push({ anchor, atom });
    return atom;
  }

  function clear() {
    for (const { anchor, atom } of placed) {
      atom.dispose();
      anchor.dispose();
    }
    placed = [];
  }

  const fit = (atom: AtomView) => viewer.frame(atom.radius * (model === 'cloud' ? 1.5 : 1.05));

  function showInViewer() {
    clear();
    fit(attach(viewer.createAnchor(), false));
  }

  function select(el: ElementData) {
    element = el;
    localStorage.setItem('webar:z', String(el.z));
    renderCard();
    if (ar.running && mode === 'explorar' && ar.provider === viewer) showInViewer();
  }

  function renderCard() {
    const n = element.massNumber - element.z;
    const symbol = $('ficha-simbolo');
    symbol.textContent = element.symbol;
    symbol.style.setProperty('--color', element.color);
    $('ficha-nombre').textContent = `${element.name} · Z = ${element.z}`;
    $('ficha-familia').textContent = FAMILY_NAMES[element.family];
    $('ficha-particulas').innerHTML =
      `<span class="p">${element.z} p⁺</span> · <span class="n">${n} n⁰</span> · <span class="e">${element.z} e⁻</span>` +
      ` <span class="pequeno">(${element.symbol}-${element.massNumber}${element.radioactive ? ', radiactivo' : ''})</span>`;
    $('ficha-detalle').textContent =
      `Capas ${atomComposition(element).shells.join('·')} · ${formatConfiguration(element)}${element.configurationPredicted ? ' (teórica)' : ''}` +
      ` · radio ${element.radius} pm${element.radiusEstimated ? ' (estimado)' : ''}`;
  }

  $('abrir-tabla').addEventListener('click', () => pickElement(select, element.z));
  // ‹ › recorren solo los elementos desbloqueados.
  const step = (dir: number) => {
    let z = element.z;
    do z = ((z - 1 + dir + 118) % 118) + 1;
    while (!hub.isUnlocked(ELEMENTS[z - 1].symbol) && z !== element.z);
    select(ELEMENTS[z - 1]);
  };
  $('anterior').addEventListener('click', () => step(-1));
  $('siguiente').addEventListener('click', () => step(1));
  $('borrar').addEventListener('click', clear);
  renderCard();

  return {
    get element() {
      return element;
    },
    setModel(m: AtomModel) {
      for (const { atom } of placed) atom.setModel(m);
      if (ar.running && mode === 'explorar' && ar.provider === viewer && placed[0]) fit(placed[0].atom);
      $('leyenda').innerHTML =
        m === 'bohr'
          ? '<b>Modelo de Bohr</b>: los electrones giran en órbitas, una por capa. <i class="p">●</i> protón <i class="n">●</i> neutrón <i class="e">●</i> electrón'
          : '<b>Orbitales</b>: donde es probable encontrar cada electrón; la chispa salta porque su posición es incierta. <i class="s">●</i> s <i class="pp">●</i> p <i class="d">●</i> d <i class="f">●</i> f · tono oscuro: fase opuesta';
    },
    onStart() {
      $('hud').hidden = false;
      $('borrar').hidden = ar.provider !== xr;
      $('pista').hidden = ar.provider !== xr;
      if (ar.provider === viewer) showInViewer();
    },
    onEnd() {
      clear();
      $('hud').hidden = true;
    },
    async onSelect() {
      if (ar.provider !== xr || !$('tabla').hidden) return;
      const anchor = await xr.placeAnchor();
      if (anchor) attach(anchor, true);
    },
    frame(dt: number) {
      for (const { atom } of placed) atom.update(dt);
      if (ar.provider !== xr) return;
      $('pista').hidden = placed.length > 0 && xr.hasHit;
      $('pista').textContent = !xr.hasHit
        ? 'Mueve el móvil despacio apuntando al suelo o a una mesa…'
        : `Toca la pantalla para poner un átomo de ${element.name.toLowerCase()} en el anillo.`;
    },
  };
})();

// --- Tarjetas --------------------------------------------------------------------

const cards = new CardsMode({
  ar,
  viewer,
  model: () => model,
  pickElement: (handler) => pickElement((el) => handler(el.symbol)),
  onReaction: (outcome, products) => void hub.record(outcome, products),
  isUnlocked: (symbol) => hub.isUnlocked(symbol),
  challenge: () => {
    const label = hub.challengeLabel();
    if (!label || !hub.active) return null;
    // Átomos de la primera sustancia que falta: así la mesa trae lo necesario.
    const missing = hub.active.targets.find((s) => !hub.progress.species.has(s));
    const species = missing ? getSpecies(missing) : undefined;
    const atoms = species ? Object.entries(composition(species)).flatMap(([el, n]) => Array<string>(n).fill(el)) : [];
    return { label, atoms };
  },
});

// --- Sesión ------------------------------------------------------------------------

ar.on('select', () => (mode === 'explorar' ? void explore.onSelect() : undefined));
ar.on('frame', ({ dt }) => (mode === 'explorar' ? explore.frame(dt) : cards.frame(dt)));
ar.on('start', () => {
  document.body.classList.add('ar-activo');
  $('inicio').hidden = true;
  if (mode === 'explorar') explore.onStart();
  else cards.onStart();
});
ar.on('end', () => {
  explore.onEnd();
  cards.onEnd();
  document.body.classList.remove('ar-activo');
  $('inicio').hidden = false;
  for (const id of ['tabla', 'recetas']) $(id).hidden = true;
});

async function enter(next: typeof mode, provider: ARProvider): Promise<void> {
  $('aviso').textContent = '';
  mode = next;
  try {
    await ar.start(provider);
  } catch (error) {
    const e = error as Error;
    $('aviso').textContent =
      e.name === 'NotAllowedError' ? 'Sin permiso para la cámara: actívalo en los ajustes del navegador.' : `No se pudo abrir: ${e.message}`;
  }
}

function enterCards(kind: CardsKind, list?: string[], together = false): void {
  cards.prepare(kind, list, together);
  void enter('tarjetas', cards.provider);
}

$('entrar-tarjetas').addEventListener('click', () => enterCards('camara'));
$('entrar-mesa').addEventListener('click', () => enterCards('mesa'));
$('entrar-3d').addEventListener('click', () => void enter('explorar', viewer));
$('entrar-ra').addEventListener('click', () => void enter('explorar', xr));
for (const [bohr, cloud] of [['modelo-bohr', 'modelo-nube'], ['t-bohr', 't-nube']]) {
  $(bohr).addEventListener('click', () => selectModel('bohr'));
  $(cloud).addEventListener('click', () => selectModel('cloud'));
}
for (const id of ['salir', 't-salir']) $(id).addEventListener('click', () => void ar.end());

selectModel(model);

const vista = params.get('vista');
if (vista === '3d') void enter('explorar', viewer);
// ?vista=tarjetas&imagen=/foto.png: las tarjetas sobre una foto en vez de la cámara (pruebas, demos).
if (params.get('imagen')) cards.marker.useImage(params.get('imagen')!);
if (vista === 'tarjetas') enterCards('camara');
if (vista === 'mesa') enterCards('mesa', params.get('cartas')?.split(',').filter(Boolean), params.get('juntas') === '1');
// ?avanzar=3.5: adelanta la animación (capturas automáticas, demos).
const advance = Number(params.get('avanzar'));
if (advance > 0) ar.on('start', () => setTimeout(() => ar.advance(advance), 50));

const support = await detectARSupport();
setupInstall($('instalar'), $('instalar-ios'), support.ios);
const enterAR = $<HTMLButtonElement>('entrar-ra');
if (support.webxrAR) {
  enterAR.disabled = false;
  $('entrar-ra-texto').textContent = 'Deja átomos sobre el suelo o una mesa (Android con Chrome).';
} else {
  $('entrar-ra-texto').textContent = support.ios
    ? 'Necesita WebXR, que Safari de iPhone aún no tiene. Las tarjetas sí funcionan.'
    : 'Este navegador no tiene WebXR. Las tarjetas y la mesa virtual sí funcionan.';
}
if (!support.camera) {
  $<HTMLButtonElement>('entrar-tarjetas').disabled = true;
  $('aviso').textContent = !support.secureContext ? 'Hace falta HTTPS: abre https://webar.peer4u.app.' : 'Este navegador no da acceso a la cámara.';
}
