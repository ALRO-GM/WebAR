import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARSession, ViewerProvider, WebXRWorldProvider, detectARSupport, type ARAnchor } from '@webar/ar-core';
import { AtomView, FAMILY_NAMES, atomComposition, ELEMENTS, formatConfiguration, getElement, type AtomModel, type ElementData } from '@webar/chem';
import { setupInstall } from './install';
import { markSelected, renderPeriodicTable } from './periodic-table';
import { createShadow } from './shadow';

// La app une las dos bases: @webar/ar-core (dónde está cada cosa en el mundo)
// y @webar/chem (cómo es cada átomo). Aquí solo va la interfaz.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const xr = new WebXRWorldProvider();
const viewer = new ViewerProvider();
const ar = new ARSession({ provider: xr, overlay: $('overlay') });

const pmrem = new THREE.PMREMGenerator(ar.renderer);
ar.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.5, 2, 1);
ar.scene.add(sun);

// --- Estado --------------------------------------------------------------

// Enlaces directos: ?el=Fe&modelo=orbitales&vista=3d (útil para compartir un átomo).
const params = new URLSearchParams(location.search);
let element: ElementData = initialElement();
let model: AtomModel = (params.get('modelo') ?? localStorage.getItem('webar:modelo')) === 'orbitales' ? 'cloud' : 'bohr';

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
  return getElement(saved >= 1 && saved <= 118 ? saved : 8);
}

interface Placed {
  anchor: ARAnchor;
  atom: AtomView;
}
let placed: Placed[] = [];

/** Cuelga un átomo de un ancla: flotando sobre la superficie y con su sombra. */
function attachAtom(anchor: ARAnchor, el: ElementData, onSurface: boolean): Placed {
  const atom = new AtomView(el, { model });
  if (onSurface) {
    atom.object.position.y = atom.radius * 1.15 + 0.01;
    anchor.object.add(createShadow(atom.radius * 0.9));
  }
  anchor.object.add(atom.object);
  return { anchor, atom };
}

function clearAtoms(): void {
  for (const { anchor, atom } of placed) {
    atom.dispose();
    anchor.dispose();
  }
  placed = [];
}

/** En el visor hay un único átomo en el centro: se cambia al elegir otro. */
function showInViewer(): void {
  clearAtoms();
  const item = attachAtom(viewer.createAnchor(), element, false);
  placed.push(item);
  viewer.frame(item.atom.radius * (model === 'cloud' ? 1.5 : 1.05));
}

// --- Elegir elemento y modelo --------------------------------------------

const table = $('tabla-celdas');
renderPeriodicTable(table, (el) => {
  selectElement(el);
  $('tabla').hidden = true;
});

function selectElement(el: ElementData): void {
  element = el;
  localStorage.setItem('webar:z', String(el.z));
  markSelected(table, el.z);
  renderCard();
  if (ar.running && ar.provider === viewer) showInViewer();
}

function selectModel(m: AtomModel): void {
  model = m;
  localStorage.setItem('webar:modelo', m === 'cloud' ? 'orbitales' : 'bohr');
  $('modelo-bohr').setAttribute('aria-checked', String(m === 'bohr'));
  $('modelo-nube').setAttribute('aria-checked', String(m === 'cloud'));
  for (const { atom } of placed) atom.setModel(m);
  if (ar.running && ar.provider === viewer) viewer.frame(placed[0].atom.radius * (m === 'cloud' ? 1.5 : 1.05));
  $('leyenda').innerHTML =
    m === 'bohr'
      ? '<b>Modelo de Bohr</b>: los electrones giran en órbitas, una por capa. <i class="p">●</i> protón <i class="n">●</i> neutrón <i class="e">●</i> electrón'
      : '<b>Orbitales</b>: donde es probable encontrar cada electrón; la chispa salta porque su posición es incierta. <i class="s">●</i> s <i class="pp">●</i> p <i class="d">●</i> d <i class="f">●</i> f · tono oscuro: fase opuesta';
}

function renderCard(): void {
  const n = element.massNumber - element.z;
  const symbol = $('ficha-simbolo');
  symbol.textContent = element.symbol;
  symbol.style.setProperty('--color', element.color);
  $('ficha-nombre').textContent = `${element.name} · Z = ${element.z}`;
  $('ficha-familia').textContent = FAMILY_NAMES[element.family];
  $('ficha-particulas').innerHTML =
    `<span class="p">${element.z} p⁺</span> · <span class="n">${n} n⁰</span> · <span class="e">${element.z} e⁻</span>` +
    ` <span class="pequeno">(${element.symbol}-${element.massNumber}${element.radioactive ? ', radiactivo' : ''})</span>`;
  const shells = atomComposition(element).shells.join('·');
  $('ficha-detalle').textContent =
    `Capas ${shells} · ${formatConfiguration(element)}${element.configurationPredicted ? ' (teórica)' : ''}` +
    ` · radio ${element.radius} pm${element.radiusEstimated ? ' (estimado)' : ''}`;
}

$('abrir-tabla').addEventListener('click', () => {
  $('tabla').hidden = false;
  table.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
});
$('cerrar-tabla').addEventListener('click', () => ($('tabla').hidden = true));
$('anterior').addEventListener('click', () => selectElement(ELEMENTS[(element.z + 116) % 118]));
$('siguiente').addEventListener('click', () => selectElement(ELEMENTS[element.z % 118]));
$('modelo-bohr').addEventListener('click', () => selectModel('bohr'));
$('modelo-nube').addEventListener('click', () => selectModel('cloud'));
$('borrar').addEventListener('click', clearAtoms);
$('salir').addEventListener('click', () => ar.end());

// --- Sesión ---------------------------------------------------------------

ar.on('select', async () => {
  if (ar.provider !== xr || !$('tabla').hidden) return;
  const anchor = await xr.placeAnchor();
  if (anchor) placed.push(attachAtom(anchor, element, true));
});

ar.on('frame', ({ dt }) => {
  for (const { atom } of placed) atom.update(dt);
  if (ar.provider !== xr) return;
  $('pista').hidden = placed.length > 0 && xr.hasHit;
  $('pista').textContent = !xr.hasHit
    ? 'Mueve el móvil despacio apuntando al suelo o a una mesa…'
    : `Toca la pantalla para poner un átomo de ${element.name.toLowerCase()} en el anillo.`;
});

ar.on('start', () => {
  document.body.classList.add('ar-activo');
  $('inicio').hidden = true;
  $('hud').hidden = false;
  $('borrar').hidden = ar.provider !== xr;
  $('pista').hidden = ar.provider !== xr;
  if (ar.provider === viewer) showInViewer();
});

ar.on('end', () => {
  clearAtoms();
  document.body.classList.remove('ar-activo');
  $('inicio').hidden = false;
  $('hud').hidden = true;
  $('tabla').hidden = true;
});

async function enter(provider: WebXRWorldProvider | ViewerProvider): Promise<void> {
  $('aviso').textContent = '';
  try {
    await ar.start(provider);
  } catch (error) {
    $('aviso').textContent = `No se pudo abrir: ${(error as Error).message}`;
  }
}
$('entrar-ra').addEventListener('click', () => enter(xr));
$('entrar-3d').addEventListener('click', () => enter(viewer));

selectModel(model);
selectElement(element);
if (params.get('vista') === '3d') void enter(viewer);

const support = await detectARSupport();
setupInstall($('instalar'), $('instalar-ios'), support.ios);
const enterAR = $<HTMLButtonElement>('entrar-ra');
if (support.webxrAR) {
  enterAR.disabled = false;
  enterAR.textContent = 'Ver en realidad aumentada';
} else {
  enterAR.textContent = 'Realidad aumentada no disponible';
  $('aviso').textContent = !support.secureContext
    ? 'Hace falta HTTPS: abre https://webar.peer4u.app.'
    : support.ios
      ? 'Safari de iPhone aún no tiene WebXR: de momento, usa «Ver en 3D». Las cartas de átomos (siguiente paso) irán también en iPhone.'
      : 'Este navegador no tiene WebXR. Usa «Ver en 3D», o prueba la RA en un Android con Chrome.';
}
