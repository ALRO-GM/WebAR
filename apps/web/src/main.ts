import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ARSession, WebXRWorldProvider, detectARSupport, type ARAnchor } from '@webar/ar-core';
import { animateFloatingSphere, createFloatingSphere } from './demo/sphere';
import { setupInstall } from './install';

// Demo: tocar la pantalla deja una esfera fija sobre la superficie detectada.
// Todo lo de realidad aumentada viene de @webar/ar-core; aquí solo va la app.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const enterButton = $<HTMLButtonElement>('entrar');
const notice = $('aviso');
const hint = $('pista');

const provider = new WebXRWorldProvider();
const ar = new ARSession({ provider, overlay: $('overlay') });

// Luz: un entorno neutro para los materiales y una luz desde arriba.
const pmrem = new THREE.PMREMGenerator(ar.renderer);
ar.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(0.5, 2, 1);
ar.scene.add(sun);

const COLORS = [0x7aa5ff, 0xff6b6b, 0xffd166, 0x06d6a0, 0xc77dff];
const placed: ARAnchor[] = [];

ar.on('select', async () => {
  const anchor = await provider.placeAnchor();
  if (!anchor) return;
  anchor.object.add(createFloatingSphere(COLORS[placed.length % COLORS.length]));
  placed.push(anchor);
});

ar.on('frame', ({ time }) => {
  for (const anchor of placed) animateFloatingSphere(anchor.object.children[0], time);
  hint.textContent = !provider.hasHit
    ? 'Mueve el móvil despacio apuntando al suelo o a una mesa…'
    : placed.length === 0
      ? 'Toca la pantalla para dejar una esfera en el anillo.'
      : 'Muévete a su alrededor: se queda en su sitio. Toca para poner otra.';
});

ar.on('start', () => {
  document.body.classList.add('ar-activo');
  $('inicio').hidden = true;
  $('hud').hidden = false;
});

ar.on('end', () => {
  placed.length = 0;
  document.body.classList.remove('ar-activo');
  $('inicio').hidden = false;
  $('hud').hidden = true;
});

$('borrar').addEventListener('click', () => {
  placed.forEach((anchor) => anchor.dispose());
  placed.length = 0;
});
$('salir').addEventListener('click', () => ar.end());

enterButton.addEventListener('click', async () => {
  notice.textContent = '';
  try {
    await ar.start();
  } catch (error) {
    notice.textContent = `No se pudo abrir la realidad aumentada: ${(error as Error).message}`;
  }
});

const support = await detectARSupport();
setupInstall($('instalar'), $('instalar-ios'), support.ios);
if (support.webxrAR) {
  enterButton.disabled = false;
  enterButton.textContent = 'Entrar en realidad aumentada';
} else {
  enterButton.textContent = 'Realidad aumentada no disponible';
  notice.textContent = !support.secureContext
    ? 'Hace falta HTTPS: abre https://webar.peer4u.app.'
    : support.ios
      ? 'Safari de iPhone aún no tiene WebXR. Esta demo funciona en Android con Chrome; las cartas de átomos (siguiente paso) irán también en iPhone.'
      : 'Este navegador no tiene WebXR para realidad aumentada. Prueba en un Android con Chrome y Servicios de Google Play para RA.';
}
