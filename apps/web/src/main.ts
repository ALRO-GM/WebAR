import './theme.css';
import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARSession, MarkerTrackingProvider, ViewerProvider, WebXRWorldProvider, detectARSupport, type ARAnchor, type ARProvider } from '@webar/ar-core';
import { AtomView, ELEMENTS, atomComposition, composition, formatConfiguration, getElement, getSpecies, type AtomModel, type ElementData } from '@webar/chem';
import { CardsMode, type CardsKind } from './cards/mode';
import { Mascot, mascotSVG } from './characters';
import type { AppContext, Experience } from './experience';
import { playGuess } from './learn/guess';
import { PATH } from './learn/path';
import { renderMateriaScreen } from './materia';
import './cast/cast.css';
import { getCastSender, renderCastPanel, type CastDeps } from './cast';
import { FEATURES } from './features';
import { disableDemo, enableDemo, isDemo } from './platform/demo';
import { PhotoMode } from './photo/photo';
import { sfx } from './sfx';
import { RIDDLES, RiddleRun, bestScores, resultHTML, stars, type Riddle, type RiddleResult } from './cards/riddle';
import { t } from './i18n';
import { elementName, familyName } from './i18n/content';
import { registerSW } from 'virtual:pwa-register';
import { setupInstall } from './install';
import { setupIntro } from './intro';
import { markSelected, renderPeriodicTable, updateLocks } from './periodic-table';
import { Hub } from './platform/hub';
import { applySettings, isDark, onSettingsChange, settings, setTheme, setupSettingsForm, vibrate } from './settings';
import { createShadow } from './shadow';

// La app une las dos bases: @webar/ar-core (dónde está cada cosa en el mundo)
// y @webar/chem (cómo es cada átomo y cómo reacciona). Aquí va la interfaz y
// el reparto entre modos: explorar átomos o jugar con tarjetas.

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

applySettings();

const xr = new WebXRWorldProvider();
const viewer = new ViewerProvider();

// Tema claro u oscuro: la interfaz (clase en <html>) y el fondo del visor 3D.
// También en el tema claro, un fondo oscuro de «escenario»: las nubes y los destellos de los electrones brillan y sobre blanco apenas se veían.
const VIEWER_BACKGROUND = { claro: 0x22264a, oscuro: 0x15181d };
function applyTheme(): void {
  viewer.setBackground(isDark() ? VIEWER_BACKGROUND.oscuro : VIEWER_BACKGROUND.claro);
  const button = document.getElementById('cambiar-tema')!;
  button.textContent = isDark() ? '☀️' : '🌙';
  const label = t(isDark() ? 'tema.a_claro' : 'tema.a_oscuro');
  button.setAttribute('aria-label', label);
  button.title = label;
}
applyTheme();
onSettingsChange.push(applyTheme);
$('cambiar-tema').addEventListener('click', () => {
  setTheme(isDark() ? 'claro' : 'oscuro');
  // El formulario de ajustes refleja el cambio.
  const radio = document.querySelector<HTMLInputElement>(`#ajustes-form input[name=tema][value="${settings.tema}"]`);
  if (radio) radio.checked = true;
});
const ar = new ARSession({ provider: viewer, overlay: $('overlay') });

if (ar.has3D) {
  const pmrem = new THREE.PMREMGenerator(ar.renderer);
  ar.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.5, 2, 1);
ar.scene.add(sun);

// --- Estado común ------------------------------------------------------------

// Enlaces directos: ?el=Fe&modelo=orbitales&vista=3d · ?vista=mesa&cartas=H,H,O&juntas=1
const params = new URLSearchParams(location.search);
let model: AtomModel = (params.get('modelo') ?? localStorage.getItem('webar:modelo')) === 'orbitales' ? 'cloud' : 'bohr';
let mode: 'explorar' | 'tarjetas' | 'otra' = 'explorar';
/** La experiencia en marcha cuando no es explorar ni tarjetas (materia, foto…). */
let custom: Experience | null = null;

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

// Ajustes, ayuda e introducción.
setupSettingsForm($<HTMLFormElement>('ajustes-form'));
const intro = setupIntro($<HTMLDialogElement>('intro'));
$('intro-gato').innerHTML = mascotSVG({ mood: 'feliz', decorative: true });
$('abrir-ayuda').addEventListener('click', intro.open);
$('ver-intro').addEventListener('click', () => {
  $<HTMLDialogElement>('ajustes').close();
  intro.open();
});

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
  // En RA se puede agrandar el átomo para verlo mejor (1× a 4×).
  let scale = Number(localStorage.getItem('webar:escala-ra') ?? 1);
  const scaleInput = $<HTMLInputElement>('escala-explorar-valor');
  scaleInput.value = String(scale);
  scaleInput.addEventListener('input', () => {
    scale = Number(scaleInput.value);
    localStorage.setItem('webar:escala-ra', String(scale));
    scaleInput.setAttribute('aria-valuetext', `${scale}×`);
    for (const { atom } of placed) {
      atom.object.scale.setScalar(scale);
      atom.object.position.y = atom.radius * 1.15 * scale + 0.01;
    }
  });

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
    if (onSurface) atom.object.scale.setScalar(scale);
    if (onSurface) {
      atom.object.position.y = atom.radius * 1.15 * scale + 0.01;
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
    $('ficha-nombre').textContent = `${elementName(element.symbol)} · Z = ${element.z}`;
    $('ficha-familia').textContent = familyName(element.family);
    const isotope = `${element.symbol}-${element.massNumber}${element.radioactive ? `, ${t('explorar.radiactivo')}` : ''}`;
    $('ficha-particulas').innerHTML =
      `<span class="p">${element.z} p⁺</span> · <span class="n">${n} n⁰</span> · <span class="e">${element.z} e⁻</span> <span class="pequeno">(${isotope})</span>`;
    $('ficha-detalle').textContent = [
      t('explorar.capas', { capas: atomComposition(element).shells.join('·') }),
      formatConfiguration(element) + (element.configurationPredicted ? ` (${t('explorar.teorica')})` : ''),
      t('explorar.radio', { pm: element.radius }) + (element.radiusEstimated ? ` (${t('explorar.estimado')})` : ''),
    ].join(' · ');
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
    setModel(m: AtomModel) {
      for (const { atom } of placed) atom.setModel(m);
      if (ar.running && mode === 'explorar' && ar.provider === viewer && placed[0]) fit(placed[0].atom);
      $('leyenda').innerHTML =
        m === 'bohr'
          ? `<b>${t('modelo.bohr.titulo')}</b>: ${t('modelo.bohr.texto')} <i class="p">●</i> ${t('particula.proton')} <i class="n">●</i> ${t('particula.neutron')} <i class="e">●</i> ${t('particula.electron')}`
          : `<b>${t('modelo.orbitales.titulo')}</b>: ${t('modelo.orbitales.texto')} <i class="s">●</i> s <i class="pp">●</i> p <i class="d">●</i> d <i class="f">●</i> f · ${t('modelo.orbitales.fase')}`;
    },
    onStart() {
      $('hud').hidden = false;
      $('donde-3d').setAttribute('aria-checked', String(ar.provider !== xr));
      $('donde-ra').setAttribute('aria-checked', String(ar.provider === xr));
      $('borrar').hidden = ar.provider !== xr;
      $('escala-explorar').hidden = ar.provider !== xr;
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
      if (anchor) {
        attach(anchor, true);
        vibrate(20);
      }
    },
    frame(dt: number) {
      for (const { atom } of placed) atom.update(dt);
      if (ar.provider !== xr) return;
      $('pista').hidden = placed.length > 0 && xr.hasHit;
      $('pista').textContent = !xr.hasHit ? t('explorar.pista_suelo') : t('explorar.pista_toca', { elemento: elementName(element.symbol).toLowerCase() });
    },
  };
})();

// --- Tarjetas --------------------------------------------------------------------

const cards = new CardsMode({
  ar,
  viewer,
  model: () => model,
  pickElement: (handler) => pickElement((el) => handler(el.symbol)),
  onReaction: (outcome, products) => {
    vibrate(outcome.deltaH < 0 ? [30, 40, 80] : [60, 60, 60]);
    void hub.record(outcome, products);
  },
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

// Modo diagnóstico (Ajustes): recuadra lo que lee el detector sobre la cámara.
cards.marker.debug = settings.diagnostico;
onSettingsChange.push(() => (cards.marker.debug = settings.diagnostico));

// --- Acertijos: pistas → formar la sustancia con las tarjetas --------------------

const riddles = (() => {
  let pending: { riddle: Riddle; kind: CardsKind; activity?: number } | null = null;
  let run: RiddleRun | null = null;
  let last: RiddleResult | null = null;
  const list = $('acertijos-lista');

  function renderList(): void {
    const best = bestScores();
    list.innerHTML = RIDDLES.map((r, i) => {
      const score = best[r.id];
      const s = getSpecies(r.target)!;
      return `<article class="acertijo-item card">
        <div><b>${i + 1}. ${t('acertijo.quien')}</b>
          <small>${t(`acertijo.dificultad.${r.difficulty}`)} · ${score ? `<span aria-label="${t('acertijo.estrellas', { n: stars(score) })}">${'★'.repeat(stars(score))}</span> ${t('acertijo.mejor', { n: score })}` : t('acertijo.nuevo')}</small>
          ${score ? `<small>${s.formula}</small>` : ''}</div>
        <div class="fila izquierda"><button type="button" class="btn pequeno" data-acertijo="${r.id}" data-tipo="mesa">${t('modo.mesa.titulo')}</button>
          ${cameraOk ? `<button type="button" class="btn claro pequeno" data-acertijo="${r.id}" data-tipo="camara">${t('modo.tarjetas.titulo')}</button>` : ''}</div>
      </article>`;
    }).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-acertijo]').forEach((b) =>
      b.addEventListener('click', () => {
        $<HTMLDialogElement>('acertijos').close();
        start(RIDDLES.find((r) => r.id === b.dataset.acertijo)!, b.dataset.tipo as CardsKind);
      }),
    );
  }

  function start(riddle: Riddle, kind: CardsKind, cardList = riddle.cards, together = false, activity?: number): void {
    pending = { riddle, kind, activity };
    if (ar.running) void ar.end().then(() => start(riddle, kind, cardList, together, activity));
    else enterCards(kind, kind === 'mesa' ? cardList : undefined, together);
  }

  function finish(result: RiddleResult): void {
    last = result;
    if (result.solved) void hub.recordChallenge(`acertijo-${result.riddle.id}`);
    // Lanzado por el profesorado: el resultado le llega (aunque no se resuelva).
    if (pending?.activity)
      void hub.add('actividad', { actividad: pending.activity, tipo: 'acertijo', puntos: result.solved ? result.points : 0, resuelto: result.solved, pistas: result.clues, fallos: result.mistakes });
    $('acertijo-fin-contenido').innerHTML = resultHTML(result);
    const i = RIDDLES.indexOf(result.riddle);
    $('acertijo-siguiente').hidden = i === RIDDLES.length - 1;
    $<HTMLDialogElement>('acertijo-fin').showModal();
  }

  $('acertijo-salir').addEventListener('click', () => {
    $<HTMLDialogElement>('acertijo-fin').close();
    void ar.end();
  });
  $('acertijo-repetir').addEventListener('click', () => {
    $<HTMLDialogElement>('acertijo-fin').close();
    if (last) start(last.riddle, pending?.kind ?? 'mesa', last.riddle.cards, false, pending?.activity);
  });
  $('acertijo-siguiente').addEventListener('click', () => {
    $<HTMLDialogElement>('acertijo-fin').close();
    if (last) start(RIDDLES[RIDDLES.indexOf(last.riddle) + 1] ?? RIDDLES[0], pending?.kind ?? 'mesa');
  });
  // Los acertijos los lanza el profesorado (pestaña Clase); la lista sigue para `?acertijos`.
  if (params.has('acertijos'))
    queueMicrotask(() => {
      renderList();
      $<HTMLDialogElement>('acertijos').showModal();
    });

  return {
    onStart() {
      if (!pending) return;
      run = new RiddleRun(pending.riddle, cards.game, $('hud-tarjetas'), finish);
      $('hud-tarjetas').classList.add('con-acertijo');
    },
    onEnd() {
      run?.destroy();
      run = null;
      $('hud-tarjetas').classList.remove('con-acertijo');
    },
    /** Al salir del juego sin acertijo (p. ej. modo libre), olvidar el pendiente. */
    clear() {
      pending = null;
    },
    start,
  };
})();
let cameraOk = true;

// --- Sesión ------------------------------------------------------------------------

ar.on('select', () => (custom ? custom.onSelect?.() : mode === 'explorar' ? void explore.onSelect() : undefined));
ar.on('frame', ({ dt }) => (custom ? custom.frame(dt) : mode === 'explorar' ? explore.frame(dt) : cards.frame(dt)));
ar.on('start', () => {
  document.body.classList.add('ar-activo');
  $('app').hidden = true;
  if (custom) custom.onStart(ar.provider);
  else if (mode === 'explorar') explore.onStart();
  else {
    cards.onStart();
    riddles.onStart();
  }
});
ar.on('end', () => {
  custom?.onEnd();
  custom = null;
  riddles.onEnd();
  explore.onEnd();
  cards.onEnd();
  document.body.classList.remove('ar-activo');
  $('app').hidden = false;
  for (const id of ['tabla', 'recetas']) $(id).hidden = true;
  hub.renderAll();
});

async function enter(next: typeof mode, provider: ARProvider): Promise<void> {
  $('aviso').textContent = '';
  mode = next;
  if (next !== 'otra') custom = null;
  try {
    await ar.start(provider);
  } catch (error) {
    const e = error as Error;
    $('aviso').textContent =
      e.name === 'NotAllowedError' ? t('aviso.permiso') : e.name === 'WebGLUnavailableError' ? t('aviso.sin_3d') : t('aviso.error', { error: e.message });
    // El aviso está en el Laboratorio: si se entró desde otra pantalla, que se vea.
    if (!ar.has3D) hub.toast('🖥️', t('aviso.sin_3d_titulo'), t('aviso.sin_3d'));
  }
}

function enterCards(kind: CardsKind, list?: string[], together = false, tuning = false): void {
  cards.prepare(kind, list, together, tuning);
  void enter('tarjetas', cards.provider);
}

let worldAR = false;
const ctx: AppContext = {
  ar,
  viewer,
  xr,
  overlay: $('overlay'),
  supportsWorldAR: () => worldAR,
  async launch(experience, provider) {
    if (ar.running) await ar.end();
    custom = experience;
    await enter('otra', provider);
  },
  exit: () => ar.end(),
};

// --- Camino: laboratorio y «Adivina» -------------------------------------------------

function guessPool(): string[] {
  return [...hub.progress.unlocked, ...hub.progress.species];
}

function startGuess(nodeId?: string): void {
  playGuess($<HTMLDialogElement>('leccion'), guessPool(), (r) => {
    if (r) void hub.add('adivina', { aciertos: r.right, total: r.total, xp: r.xp, preguntas: r.answers, ...(nodeId ? { nodo: nodeId } : {}) });
  });
}

hub.actions = {
  ...hub.actions,
  lab(node) {
    // La mesa trae lo necesario y un par de tarjetas que despistan.
    const species = getSpecies(node.species!)!;
    const atoms = Object.entries(composition(species)).flatMap(([el, n]) => Array<string>(n).fill(el));
    const decoys = [...hub.progress.unlocked].filter((s) => !atoms.includes(s)).slice(0, 2);
    riddles.clear();
    enterCards('mesa', [...atoms, ...decoys]);
  },
  guess: (node) => startGuess(node.id),
};
// Actividades del profesorado (pestaña Clase): un acertijo (en la mesa o con
// las tarjetas impresas) o una Adivina con los elementos que ha elegido.
hub.actions.activity = (activity) => {
  if (activity.tipo === 'adivina') {
    playGuess($<HTMLDialogElement>('leccion'), activity.elementos, (r) => {
      if (!r) return;
      void hub.add('adivina', { aciertos: r.right, total: r.total, xp: r.xp, preguntas: r.answers });
      void hub.add('actividad', { actividad: activity.id, tipo: 'adivina', puntos: r.total ? Math.round((100 * r.right) / r.total) : 0, aciertos: r.right, total: r.total });
    });
    return;
  }
  const riddle = RIDDLES.find((x) => x.id === activity.acertijo);
  if (!riddle) return;
  if (!cameraOk) return riddles.start(riddle, 'mesa', riddle.cards, false, activity.id);
  hub.openDetail(`<h2 id="detalle-titulo">🕵️ ${t('actividad.acertijo')}</h2><p class="texto-suave">${t('actividad.donde')}</p><div class="modos">
    <button type="button" class="modo card pulsable" data-donde="mesa"><span class="modo-icono" aria-hidden="true">🧪</span><span><b>${t('modo.mesa.titulo')}</b><span>${t('modo.mesa.texto')}</span></span></button>
    <button type="button" class="modo card pulsable" data-donde="camara"><span class="modo-icono" aria-hidden="true">🃏</span><span><b>${t('modo.tarjetas.titulo')}</b><span>${t('modo.tarjetas.texto')}</span></span></button></div>`);
  $('detalle-contenido').querySelectorAll<HTMLButtonElement>('[data-donde]').forEach((b) =>
    b.addEventListener('click', () => {
      $<HTMLDialogElement>('detalle').close();
      riddles.start(riddle, b.dataset.donde as CardsKind, riddle.cards, false, activity.id);
    }),
  );
};

// Foto con científicos: los que ya conoces en el camino (y el gato) con tus átomos y moléculas.
const photo = new PhotoMode({
  ctx,
  characters: () => ['gato', ...new Set(PATH.filter((u) => u.index <= (hub.progress.current?.unit ?? PATH.length)).map((u) => u.guide))],
  contents: () => [...hub.progress.unlocked, ...hub.progress.species],
  onPhoto: () => void hub.add('foto', {}),
});
// Ajuste fino de la RA: la cámara con las tarjetas y el panel de valores encima.
$('ajuste-ra-boton').addEventListener('click', () => {
  $<HTMLDialogElement>('ajustes').close();
  riddles.clear();
  enterCards('camara', undefined, false, true);
});

// Modo demostración (Ajustes, o ?demo=alumno): otro almacén, todo desbloqueado y la clase de demostración.
$('demo-boton').textContent = isDemo() ? t('demo.salir') : t('demo.entrar');
$('demo-chip').hidden = !isDemo();
$('demo-chip').addEventListener('click', () => $<HTMLDialogElement>('ajustes').showModal());
$('demo-boton').addEventListener('click', () => {
  if (isDemo()) disableDemo();
  else enableDemo();
  location.href = location.pathname;
});

// En pausa (features.ts): el botón no se ve y no se puede entrar.
$('entrar-foto').hidden = !FEATURES.foto;
$('entrar-foto').addEventListener('click', () => {
  if (!FEATURES.foto) return;
  if (!worldAR) return void ctx.launch(photo, photo.camera);
  // Con WebXR: foto con la cámara o personajes en la habitación (RA del mundo).
  $('detalle-contenido').innerHTML = `<h2 id="detalle-titulo">${t('foto.titulo')}</h2><div class="modos">
    ${cameraOk ? `<button type="button" class="modo card pulsable" data-foto-modo="camara"><span class="modo-icono" aria-hidden="true">📸</span><span><b>${t('foto.modo_camara')}</b><span>${t('foto.modo_camara_texto')}</span></span></button>` : ''}
    <button type="button" class="modo card pulsable" data-foto-modo="ra"><span class="modo-icono" aria-hidden="true">🏠</span><span><b>${t('foto.modo_ra')}</b><span>${t('foto.modo_ra_texto')}</span></span></button></div>`;
  $('detalle-contenido').querySelectorAll<HTMLButtonElement>('[data-foto-modo]').forEach((b) =>
    b.addEventListener('click', () => {
      $<HTMLDialogElement>('detalle').close();
      void ctx.launch(photo, b.dataset.fotoModo === 'ra' ? xr : photo.camera);
    }),
  );
  $<HTMLDialogElement>('detalle').showModal();
});

// --- Proyectar en clase: el móvil del profesor se ve en el ordenador del aula ---------

const castDeps: CastDeps = {
  frameSources() {
    const gl = ar.renderer.domElement;
    if (!ar.running) return null;
    const provider = ar.provider;
    if (provider === xr) return { gl, world: true };
    if (provider instanceof MarkerTrackingProvider) return { gl, video: provider.source, mirror: provider.facing === 'user' };
    return { gl };
  },
  renderNow: () => ar.renderer.render(ar.scene, ar.camera),
  onFrame: (cb) => ar.on('rendered', cb),
};
getCastSender(castDeps);
renderCastPanel($('proyectar'), castDeps);

// --- La mascota ------------------------------------------------------------------------

const mascot = settings.gato ? new Mascot($('mascota'), { size: 76 }) : null;
mascot?.greet();
onSettingsChange.push(() => $('mascota').toggleAttribute('hidden', !settings.gato));
hub.onCelebrate = (kind) => {
  if (!mascot) return;
  if (kind === 'fallo') mascot.react('triste');
  else mascot.react(kind === 'molecula' ? 'sorpresa' : 'celebra');
  if (kind === 'racha') sfx.miau();
};

$('entrar-tarjetas').addEventListener('click', () => (riddles.clear(), enterCards('camara')));
$('entrar-mesa').addEventListener('click', () => (riddles.clear(), enterCards('mesa')));
$('entrar-3d').addEventListener('click', () => void enter('explorar', viewer));
// Explorar átomos: un solo modo; dentro se elige verlos en 3D o colocarlos en
// la habitación (RA con WebXR), sin volver al laboratorio.
let noWorldAR = '';
async function exploreWhere(where: '3d' | 'ra'): Promise<void> {
  const provider = where === 'ra' ? xr : viewer;
  if (ar.running && ar.provider === provider) return;
  if (where === 'ra' && !worldAR) return hub.toast('📱', t('explorar.donde_ra'), noWorldAR);
  if (ar.running) await ar.end();
  await enter('explorar', provider);
}
$('donde-3d').addEventListener('click', () => void exploreWhere('3d'));
$('donde-ra').addEventListener('click', () => void exploreWhere('ra'));
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
// ?acertijo=N2: abre un acertijo en la mesa (demos, capturas).
const riddleParam = RIDDLES.find((r) => r.id === params.get('acertijo'));
if (riddleParam) riddles.start(riddleParam, 'mesa', params.get('cartas')?.split(',') ?? riddleParam.cards, params.get('juntas') === '1');
else if (vista === 'mesa') enterCards('mesa', params.get('cartas')?.split(',').filter(Boolean), params.get('juntas') === '1');
// ?avanzar=3.5: adelanta la animación (capturas automáticas, demos).
const advance = Number(params.get('avanzar'));
if (advance > 0) ar.on('start', () => setTimeout(() => ar.advance(advance), 50));
// La introducción sale la primera vez (no en los enlaces directos a un modo).
if (!vista && !params.has('sin-intro')) intro.openIfFirstTime();

// Versión nueva: el service worker nuevo toma el control y la página se recarga
// sola (si no, se veía la copia vieja hasta cerrar la app dos veces). Además se
// comprueba cada hora, para quien la deja abierta.
registerSW({
  immediate: true,
  onRegisteredSW: (_url, registration) => registration && setInterval(() => void registration.update(), 3600_000),
});

const support = await detectARSupport();
setupInstall([$('instalar-top'), $('instalar')], $('instalar-ios'), support.ios, () => hub.toast('📲', t('instalar.boton'), t('instalar.ios')));
worldAR = support.webxrAR;
// Sin WebXR, «En tu mesa» explica por qué no se puede (en vez de fallar).
$('donde-ra').classList.toggle('no-disponible', !support.webxrAR);
// Materia ofrece «Ver en RA» solo si hay WebXR: se pinta ya sabiéndolo.
renderMateriaScreen($('p-materia'), ctx);
noWorldAR = support.ios ? t('modo.ra.ios') : t('modo.ra.no');
if (!ar.has3D) $('aviso').textContent = t('aviso.sin_3d');
else if (!support.camera) {
  $<HTMLButtonElement>('entrar-tarjetas').disabled = true;
  cameraOk = false;
  $('aviso').textContent = !support.secureContext ? t('aviso.https') : t('aviso.camara');
}
