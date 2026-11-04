import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from '../i18n';
import { EVERYDAY_CONTENTS, createEveryday, everydayKeys, type EverydayObject } from './index';

// Galería de desarrollo (objetos.html): todos los objetos en rejilla con su
// símbolo debajo. ?solo=He para ver uno grande con sus textos; ?desde=0&hasta=20
// para ver un trozo; ?calma=1 para el modo calma; ?cols=4 para las columnas.

const params = new URLSearchParams(location.search);
const solo = params.get('solo');
const calm = params.get('calma') === '1';
const from = Number(params.get('desde') ?? 0);
const to = Number(params.get('hasta') ?? EVERYDAY_CONTENTS.length);
const list = solo ? [solo] : EVERYDAY_CONTENTS.slice(from, to);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor('#eef1f5');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#c9d2dc', 0.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.2);
sun.position.set(0.5, 2, 1);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d2230';
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.6, 0.225, 1);
  return s;
}

const objects: EverydayObject[] = [];
let controls: OrbitControls | undefined;

if (solo) {
  const obj = createEveryday(solo, { size: 1, calm });
  scene.add(obj.object);
  objects.push(obj);
  camera.position.set(0, 0.5, 4.6);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  const { name, why } = everydayKeys(solo);
  const ficha = document.getElementById('ficha')!;
  const h = document.createElement('h1');
  h.textContent = `${solo} · ${t(name)}`;
  const p = document.createElement('p');
  p.textContent = t(why);
  ficha.append(h, p);
} else {
  const cols = Number(params.get('cols') ?? Math.ceil(Math.sqrt(list.length * 0.6)));
  const rows = Math.ceil(list.length / cols);
  const step = 1.1;
  list.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * step;
    const y = ((rows - 1) / 2 - row) * step * 1.25;
    const obj = createEveryday(c, { size: 0.4, calm });
    obj.object.position.set(x, y + 0.12, 0);
    scene.add(obj.object);
    objects.push(obj);
    const lbl = labelSprite(c);
    lbl.position.set(x, y - 0.4, 0);
    scene.add(lbl);
  });
  // Encuadre: que quepa toda la rejilla.
  const w = cols * step;
  const h = rows * step * 1.25;
  const fit = () => {
    const aspect = innerWidth / innerHeight;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const d = Math.max(h / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / aspect) * 1.05;
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
  };
  addEventListener('resize', fit);
  fit();
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = timer.getDelta();
  for (const o of objects) o.update(dt);
  controls?.update();
  renderer.render(scene, camera);
});

// Para los guiones de capturas: cuántos objetos hay y avanzar el tiempo a mano.
Object.assign(window, { galeria: { objects, avanzar: (s: number) => objects.forEach((o) => o.update(s)) } });
