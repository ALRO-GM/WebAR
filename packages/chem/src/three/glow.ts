import * as THREE from 'three';

let cached: THREE.Texture | undefined;

/** Textura de destello: núcleo blanco que se apaga en un halo suave (se tiñe con el color del material). */
export function glowTexture(): THREE.Texture {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  // Cuatro rayos finos: el «destello» de una estrella.
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 3], [3, 128]]) {
    const ray = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    ray.addColorStop(0, 'rgba(255,255,255,0.8)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = ray;
    g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  cached = new THREE.CanvasTexture(canvas);
  cached.colorSpace = THREE.SRGBColorSpace;
  return cached;
}

/** Material de destello (aditivo: brilla sobre fondos oscuros y sobre la cámara). */
export function glowMaterial(color: THREE.ColorRepresentation, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
