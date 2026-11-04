/**
 * Galería de desarrollo (personajes.html): todos los avatares con sus
 * animaciones, la mascota con sus efectos y las figuras 3D en un visor.
 * No forma parte de la app publicada.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import '../theme.css';
import './characters.css';
import { animateAvatar, avatarSVG, setExpression, type Expression } from './avatar';
import { CHARACTERS } from './data';
import { CharacterFigure } from './figure';
import { MASCOT_MOODS, Mascot, mascotSVG, type MascotMood, type MascotReaction } from './mascot';
import { MascotFigure } from './mascot-figure';
import { randomKey, tx } from './text';

const EXPRESSIONS: Expression[] = ['neutral', 'feliz', 'habla', 'sorpresa', 'piensa'];
const REACTIONS: MascotReaction[] = ['feliz', 'triste', 'sorpresa', 'celebra', 'piensa'];
const MOODS: readonly MascotMood[] = MASCOT_MOODS;

const css = document.createElement('style');
css.textContent = `
  body { background: var(--bg-2); }
  #galeria { max-width: 1100px; margin: 0 auto; padding: 1rem; display: grid; gap: 1.5rem; }
  .gal-cab h1 { margin: 0 0 .25rem; font-size: 1.6rem; }
  .gal-cab p { margin: 0; color: var(--muted); }
  .gal-sec { display: grid; gap: .8rem; }
  .gal-sec > h2 { margin: 0; font-size: 1.25rem; display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .gal-rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .8rem; }
  .gal-ficha { display: grid; justify-items: center; text-align: center; gap: .35rem; padding: .8rem .6rem; }
  .gal-ficha h3 { margin: .2rem 0 0; font-size: 1rem; }
  .gal-ficha .pequeno { margin: 0; line-height: 1.25; }
  .gal-ficha .gal-frase { min-height: 2.6em; font-size: .85rem; color: var(--fg); margin: 0; }
  .gal-botones { display: flex; gap: .35rem; flex-wrap: wrap; justify-content: center; }
  .gal-botones .btn { padding: .35rem .6rem; min-height: 2.2rem; font-size: .72rem; }
  .gal-elems { display: flex; gap: .25rem; flex-wrap: wrap; justify-content: center; }
  .gal-elems .chip { font-size: .72rem; padding: .1rem .45rem; border-color: var(--pj, var(--line)); }
  .gal-gato { display: grid; justify-items: center; gap: 1rem; padding: 4.5rem 1rem 1rem; }
  .gal-humores { display: flex; gap: .4rem; flex-wrap: wrap; justify-content: center; }
  .gal-humores svg { width: 76px; height: 76px; }
  #visor { width: 100%; height: min(70vh, 520px); display: block; border-radius: var(--radius-lg); background: linear-gradient(#f3f0ff, #ffffff); touch-action: none; }
  select { min-height: 2.2rem; font-size: .9rem; }
`;
document.head.appendChild(css);

const root = document.getElementById('galeria')!;
root.innerHTML = `
  <header class="gal-cab"><h1>${tx('galeria.titulo')}</h1><p>${tx('galeria.intro')}</p></header>
  <section class="gal-sec" id="sec-gato"><h2>${tx('galeria.gato')} · ${tx('gato.nombre')}</h2>
    <div class="card gal-gato"><div id="gato"></div>
      <div class="gal-botones" id="gato-botones"></div>
      <div class="gal-humores" id="humores"></div></div></section>
  <section class="gal-sec" id="sec-personajes"><h2>${tx('galeria.personajes')}
    <label class="pequeno">${tx('galeria.expresion')} <select id="expresion">${EXPRESSIONS.map((e) => `<option value="${e}">${tx(`galeria.expresion.${e}`)}</option>`).join('')}</select></label></h2>
    <div class="gal-rejilla" id="fichas"></div></section>
  <section class="gal-sec" id="sec-3d"><h2>${tx('galeria.figuras')}</h2>
    <div class="gal-botones" id="botones-3d"></div>
    <canvas id="visor"></canvas></section>`;

// --- Avatares ------------------------------------------------------------------
const cards = document.getElementById('fichas')!;
const ids = ['gato', ...CHARACTERS.map((c) => c.id)];
for (const id of ids) {
  const ch = CHARACTERS.find((c) => c.id === id);
  const card = document.createElement('article');
  card.className = 'card gal-ficha';
  card.dataset.id = id;
  if (ch) card.style.setProperty('--pj', ch.color);
  card.innerHTML = ch
    ? `${avatarSVG(id, { size: 130 })}<h3>${tx(`personaje.${id}.nombre`)}</h3><p class="pequeno">${tx(`personaje.${id}.vida`)} · ${tx(`personaje.${id}.pais`)}</p><p class="pequeno">${tx(`personaje.${id}.campo`)}</p><div class="gal-elems">${ch.elements.map((e) => `<span class="chip">${e}</span>`).join('')}</div><p class="gal-frase" aria-live="polite"></p><div class="gal-botones"><button class="btn menta" data-a="saluda">${tx('galeria.saluda')}</button><button class="btn racha" data-a="celebra">${tx('galeria.celebra')}</button><button class="btn" data-a="habla">${tx('galeria.habla')}</button></div>`
    : `${avatarSVG(id, { size: 130 })}<h3>${tx('gato.nombre')}</h3><p class="pequeno">${tx('gato.presentacion')}</p>`;
  cards.appendChild(card);
}
let lastPhrase: string | undefined;
cards.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
  if (!btn) return;
  const card = btn.closest<HTMLElement>('.gal-ficha')!;
  const action = btn.dataset.a as 'saluda' | 'celebra' | 'habla';
  animateAvatar(card, action);
  if (action === 'habla') {
    lastPhrase = randomKey(`personaje.${card.dataset.id}.frase.`, lastPhrase);
    card.querySelector('.gal-frase')!.textContent = tx(lastPhrase!);
  } else if (action === 'saluda') card.querySelector('.gal-frase')!.textContent = tx(`personaje.${card.dataset.id}.saludo`);
});
document.getElementById('expresion')!.addEventListener('change', (e) => {
  const ex = (e.target as HTMLSelectElement).value as Expression;
  cards.querySelectorAll<HTMLElement>('.gal-ficha').forEach((c) => setExpression(c, c.dataset.id!, ex, { size: 130 }));
});

// --- Mascota -------------------------------------------------------------------
const gato = new Mascot(document.getElementById('gato')!, { size: 170, idleMs: 25_000 });
(window as unknown as { gato: Mascot }).gato = gato;
const gb = document.getElementById('gato-botones')!;
const gatoBtns: [string, string, () => void][] = [
  ['galeria.superponer', 'btn', () => (gato.superpose(), gato.sayRandom('superposicion'))],
  ['galeria.tunel', 'btn info', () => (gato.tunnel(), gato.sayRandom('tunel'))],
  ['galeria.asomar', 'btn menta', () => gato.peek()],
  ['galeria.nube', 'btn claro', () => gato.vanish()],
  ['galeria.frase', 'btn racha', () => gato.sayRandom('reaccion')],
  ...REACTIONS.map((r) => [`galeria.reaccion.${r}`, 'btn claro', () => gato.react(r)] as [string, string, () => void]),
];
for (const [key, cls, fn] of gatoBtns) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = tx(key);
  b.addEventListener('click', fn);
  gb.appendChild(b);
}
document.getElementById('humores')!.innerHTML = MOODS.map((m) => mascotSVG({ mood: m, size: 76 })).join('');
setTimeout(() => gato.greet(), 600);

// --- Visor 3D ------------------------------------------------------------------
const canvas = document.getElementById('visor') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
camera.position.set(0, 0.55, 1.75);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.13, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0xc9bfff, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(0.6, 1.4, 1.2);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshToonMaterial({ color: 0xe9e4ff }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const figures = CHARACTERS.map((c) => new CharacterFigure(c.id));
// Filas de 8 (o de 4 en pantallas estrechas), cada una algo desplazada.
const narrow = canvas.clientWidth < 600;
const perRow = narrow ? 4 : 8;
const rows = Math.ceil(figures.length / perRow);
figures.forEach((f, i) => {
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  f.object.position.set((col - (perRow - 1) / 2) * 0.21 + (row % 2 ? 0.07 : -0.03), 0, (row - (rows - 1) / 2) * 0.3 - 0.12);
  scene.add(f.object);
});
const cat = new MascotFigure();
cat.object.position.set(0, 0, narrow ? 0.62 : 0.4);
scene.add(cat.object);
(window as unknown as { figuras: CharacterFigure[]; gato3d: MascotFigure }).figuras = figures;
(window as unknown as { gato3d: MascotFigure }).gato3d = cat;
// Para revisar desde la consola: mirar(x, y, z, distancia)
(window as unknown as { mirar: (x: number, y: number, z: number, d: number) => void }).mirar = (x, y, z, d) => {
  controls.target.set(x, y, z);
  camera.position.set(x, y + d * 0.25, z + d);
  fixedDistance = true;
};

const b3 = document.getElementById('botones-3d')!;
const btns3d: [string, string, () => void][] = [
  ['galeria.todos_saludan', 'btn menta', () => figures.forEach((f, i) => setTimeout(() => f.wave(), i * 80))],
  ['galeria.todos_celebran', 'btn racha', () => (figures.forEach((f, i) => setTimeout(() => f.celebrate(), i * 60)), cat.celebrate())],
  ['galeria.superponer3d', 'btn', () => cat.superpose(6)],
  ['galeria.asomar3d', 'btn claro', () => cat.peek()],
];
for (const [key, cls, fn] of btns3d) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = tx(key);
  b.addEventListener('click', fn);
  b3.appendChild(b);
}

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En pantallas estrechas, más lejos para que quepa la fila.
    if (!fixedDistance) camera.position.setLength(w < 600 ? 2.2 : 1.9);
    camera.updateProjectionMatrix();
  }
}
let fixedDistance = false;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  resize();
  controls.update();
  for (const f of figures) {
    f.lookAt(camera.position);
    f.update(dt);
  }
  cat.lookAt(camera.position);
  cat.update(dt);
  renderer.render(scene, camera);
});
