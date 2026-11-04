import * as THREE from 'three';

/** Una sombra falsa en el suelo: ayuda mucho a «creerse» que el objeto está ahí. */
export function createShadow(radius: number): THREE.Mesh {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.position.y = 0.001;
  return shadow;
}

let cached: THREE.Texture | undefined;
function shadowTexture(): THREE.Texture {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return (cached = new THREE.CanvasTexture(canvas));
}
