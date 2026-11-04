// Página de pruebas de la sección «Materia» (apps/web/materia.html): monta la
// sección con un AppContext real, como hará la app. Enlaces directos:
//   ?abrir=agua&temp=50 · ?abrir=fcc · ?abrir=hcp&capas=1 · ?calma=1
// y window.materia.advance(s) adelanta el tiempo (capturas sin pantalla).
import '../theme.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARSession, ViewerProvider, WebXRWorldProvider, detectARSupport, type ARProvider } from '@webar/ar-core';
import type { AppContext, Experience } from '../experience';
import { applySettings, settings } from '../settings';
import { createMateriaExperience, renderMateriaScreen, type MateriaTarget } from './screen';
import { STRUCTURE_IDS } from './lattices';

const params = new URLSearchParams(location.search);
if (params.has('idioma')) settings.idioma = params.get('idioma')!;
if (params.has('calma')) settings.calma = params.get('calma') === '1';
applySettings();

const overlay = document.getElementById('overlay')!;
const screen = document.getElementById('pantalla')!;
Object.assign(overlay.style, { position: 'relative', zIndex: '1' });

const xr = new WebXRWorldProvider();
const viewer = new ViewerProvider();
const ar = new ARSession({ provider: viewer, overlay });
const pmrem = new THREE.PMREMGenerator(ar.renderer);
ar.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.5, 2, 1);
ar.scene.add(sun);

let current: Experience | undefined;
const support = await detectARSupport();

const ctx: AppContext = {
  ar,
  viewer,
  xr,
  overlay,
  supportsWorldAR: () => support.webxrAR,
  async launch(experience: Experience, provider: ARProvider) {
    if (ar.running) await ar.end();
    current = experience;
    await ar.start(provider);
  },
  exit: () => ar.end(),
};

ar.on('start', () => {
  screen.hidden = true;
  document.body.style.background = 'transparent';
  current?.onStart(ar.provider);
});
ar.on('frame', ({ dt }) => current?.frame(dt));
ar.on('select', () => current?.onSelect?.());
ar.on('end', () => {
  current?.onEnd();
  current = undefined;
  screen.hidden = false;
  document.body.style.background = '';
});

renderMateriaScreen(screen, ctx);

const target = params.get('abrir') as MateriaTarget | null;
if (target && (target === 'agua' || STRUCTURE_IDS.includes(target))) {
  const temp = params.has('temp') ? Number(params.get('temp')) : undefined;
  await ctx.launch(createMateriaExperience(ctx, target, { temp }), params.get('ra') === '1' ? xr : viewer);
}

// Para las capturas automáticas y la consola.
Object.assign(window, {
  materia: {
    ar,
    ctx,
    get experience() {
      return current;
    },
    advance: (seconds: number) => ar.advance(seconds),
    click: (selector: string) => (document.querySelector(selector) as HTMLElement | null)?.click(),
  },
});
