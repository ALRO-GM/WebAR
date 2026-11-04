import * as THREE from 'three';

/** Cámara de pinhole: focal y centro óptico en píxeles de la imagen analizada. */
export interface PinholeCamera {
  focal: number;
  cx: number;
  cy: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Pose de un cuadrado plano de lado `size` (metros) a partir de sus 4 esquinas
 * en la imagen (superior izquierda, superior derecha, inferior derecha,
 * inferior izquierda), con la homografía plano → imagen.
 *
 * Devuelve la matriz del marcador en el espacio de la cámara de three.js
 * (x derecha, y arriba, mirando hacia -z). En el marcador: x a la derecha,
 * y hacia su borde superior, z saliendo de él hacia la cámara.
 * `null` si las esquinas no dan una pose válida.
 */
export function markerPose(corners: readonly Point2[], size: number, camera: PinholeCamera, out = new THREE.Matrix4()): THREE.Matrix4 | null {
  const h = size / 2;
  const model: Point2[] = [
    { x: -h, y: h },
    { x: h, y: h },
    { x: h, y: -h },
    { x: -h, y: -h },
  ];
  // Coordenadas normalizadas de la cámara (OpenCV: x derecha, y abajo, z delante).
  const image = corners.map((c) => ({ x: (c.x - camera.cx) / camera.focal, y: (c.y - camera.cy) / camera.focal }));
  const H = homography(model, image);
  if (!H) return null;

  // H = λ [r1 r2 t]
  const h1 = new THREE.Vector3(H[0], H[3], H[6]);
  const h2 = new THREE.Vector3(H[1], H[4], H[7]);
  const h3 = new THREE.Vector3(H[2], H[5], H[8]);
  let lambda = 2 / (h1.length() + h2.length());
  if (h3.z * lambda < 0) lambda = -lambda; // el marcador está delante de la cámara
  const r1 = h1.multiplyScalar(lambda);
  const r2 = h2.multiplyScalar(lambda);
  const t = h3.multiplyScalar(lambda);

  // Ortonormaliza repartiendo el error entre r1 y r2 (más estable que Gram-Schmidt).
  const a = r1.clone().add(r2).normalize();
  const b = new THREE.Vector3().crossVectors(r1, r2).normalize();
  const c = new THREE.Vector3().crossVectors(a, b).normalize();
  const x = a.clone().add(c).multiplyScalar(Math.SQRT1_2);
  const y = a.clone().sub(c).multiplyScalar(Math.SQRT1_2);
  const z = new THREE.Vector3().crossVectors(x, y);
  if (!Number.isFinite(t.z) || t.z <= 0) return null;

  // De OpenCV (y abajo, z delante) a three.js (y arriba, z detrás): cambia el signo de y y z.
  out.set(
    x.x, y.x, z.x, t.x,
    -x.y, -y.y, -z.y, -t.y,
    -x.z, -y.z, -z.z, -t.z,
    0, 0, 0, 1,
  );
  return out;
}

/** Homografía 3×3 (fila a fila, h33 = 1) que lleva `from` a `to` (4 puntos). */
export function homography(from: readonly Point2[], to: readonly Point2[]): number[] | null {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Eliminación gaussiana con pivote parcial sobre el sistema 8×8 aumentado.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}
