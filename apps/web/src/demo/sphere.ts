import * as THREE from 'three';

const RADIUS = 0.08; // metros

/** Una esfera brillante que flota sobre su sombra. Es solo la demo: no es parte de ar-core. */
export function createFloatingSphere(color: THREE.ColorRepresentation): THREE.Object3D {
  const root = new THREE.Group();

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1 }),
  );
  sphere.name = 'esfera';
  root.add(sphere);

  // Una sombra falsa en el suelo ayuda mucho a «creerse» que está ahí.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS * 1.3, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.position.y = 0.001;
  root.add(shadow);

  root.userData.phase = Math.random() * Math.PI * 2;
  return root;
}

/** Hace flotar la esfera arriba y abajo. */
export function animateFloatingSphere(root: THREE.Object3D, time: number): void {
  const sphere = root.getObjectByName('esfera');
  if (sphere) sphere.position.y = RADIUS * 1.6 + Math.sin(time / 600 + root.userData.phase) * RADIUS * 0.25;
}

let cachedShadow: THREE.Texture | undefined;
function shadowTexture(): THREE.Texture {
  if (cachedShadow) return cachedShadow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return (cachedShadow = new THREE.CanvasTexture(canvas));
}
