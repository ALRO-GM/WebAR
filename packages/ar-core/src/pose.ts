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

/** Pose en el sistema de OpenCV (x derecha, y abajo, z delante): rotación y traslación. */
interface CvPose {
  r: THREE.Matrix3;
  t: THREE.Vector3;
}

/**
 * Pose de un cuadrado plano de lado `size` (metros) a partir de sus 4 esquinas
 * en la imagen (superior izquierda, superior derecha, inferior derecha,
 * inferior izquierda).
 *
 * Devuelve la matriz del marcador en el espacio de la cámara de three.js
 * (x derecha, y arriba, mirando hacia -z). En el marcador: x a la derecha,
 * y hacia su borde superior, z saliendo de él hacia la cámara.
 * `null` si las esquinas no dan una pose válida.
 *
 * Con `hint` (la pose de este marcador en el frame anterior) resuelve la
 * ambigüedad de los marcadores planos: visto casi de frente, un cuadrado
 * pequeño encaja casi igual de bien con dos inclinaciones distintas y la
 * pose salta de una a otra. Se afinan las dos (minimizando el error de
 * reproyección, como `solvePnP` de OpenCV) y, si las dos explican la imagen,
 * se queda con la más parecida a la anterior.
 */
export function markerPose(
  corners: readonly Point2[],
  size: number,
  camera: PinholeCamera,
  out = new THREE.Matrix4(),
  hint?: THREE.Matrix4,
): THREE.Matrix4 | null {
  const h = size / 2;
  const model: Point2[] = [
    { x: -h, y: h },
    { x: h, y: h },
    { x: h, y: -h },
    { x: -h, y: -h },
  ];
  // Coordenadas normalizadas de la cámara (OpenCV: x derecha, y abajo, z delante).
  const image = corners.map((c) => ({ x: (c.x - camera.cx) / camera.focal, y: (c.y - camera.cy) / camera.focal }));
  const first = fromHomography(model, image);
  if (!first) return null;

  const candidates = [first, mirrored(first)].map((p) => refinePose(p, model, image));
  const errors = candidates.map((p) => reprojectionError(p, model, image));
  const best = Math.min(...errors);
  let pick = errors.indexOf(best);
  if (hint) {
    const previous = toCv(hint);
    const tolerable = 2 * best + 0.6 / camera.focal; // ~0,6 px de margen
    let closest = Infinity;
    candidates.forEach((p, i) => {
      if (errors[i] > tolerable) return;
      const angle = rotationAngle(p.r, previous.r);
      if (angle < closest) [closest, pick] = [angle, i];
    });
  }
  const { r, t } = candidates[pick];
  if (!Number.isFinite(t.z) || t.z <= 0) return null;

  // De OpenCV (y abajo, z delante) a three.js (y arriba, z detrás): cambia el signo de y y z.
  const e = r.elements; // por columnas
  out.set(
    e[0], e[3], e[6], t.x,
    -e[1], -e[4], -e[7], -t.y,
    -e[2], -e[5], -e[8], -t.z,
    0, 0, 0, 1,
  );
  return out;
}

/**
 * Varios marcadores sobre la misma mesa comparten la normal: la de cada uno
 * por separado tiembla (es lo peor medido de un marcador pequeño), pero su
 * media ponderada (por tamaño en la imagen) es mucho más estable. Cada pose
 * se gira sobre su centro hasta esa normal común; las que se apartan más de
 * `maxAngle` (una tarjeta levantada e inclinada) se dejan como están.
 * Es lo que hacen los «tableros» de marcadores de OpenCV y los mapas de AR.js.
 */
export function alignCoplanar(poses: THREE.Matrix4[], weights: readonly number[], maxAngle = THREE.MathUtils.degToRad(25)): void {
  if (poses.length < 2) return;
  const normals = poses.map((m) => new THREE.Vector3().setFromMatrixColumn(m, 2).normalize());
  const common = new THREE.Vector3();
  const cos = Math.cos(maxAngle);
  let inliers = normals.map(() => true);
  for (let pass = 0; pass < 2; pass++) {
    common.set(0, 0, 0);
    normals.forEach((n, i) => inliers[i] && common.addScaledVector(n, weights[i]));
    if (common.lengthSq() === 0) return;
    common.normalize();
    inliers = normals.map((n) => n.dot(common) > cos);
  }
  if (inliers.filter(Boolean).length < 2) return;
  const turn = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  poses.forEach((m, i) => {
    if (!inliers[i]) return;
    m.decompose(position, rotation, scale);
    turn.setFromUnitVectors(normals[i], common);
    m.compose(position, rotation.premultiply(turn), scale);
  });
}

/** Primera estimación: la homografía plano → imagen, H = λ [r1 r2 t]. */
function fromHomography(model: Point2[], image: Point2[]): CvPose | null {
  const H = homography(model, image);
  if (!H) return null;
  const h1 = new THREE.Vector3(H[0], H[3], H[6]);
  const h2 = new THREE.Vector3(H[1], H[4], H[7]);
  const h3 = new THREE.Vector3(H[2], H[5], H[8]);
  let lambda = 2 / (h1.length() + h2.length());
  if (h3.z * lambda < 0) lambda = -lambda; // el marcador está delante de la cámara
  const r1 = h1.multiplyScalar(lambda);
  const r2 = h2.multiplyScalar(lambda);
  const t = h3.multiplyScalar(lambda);
  if (!Number.isFinite(t.z) || t.z <= 0) return null;

  // Ortonormaliza repartiendo el error entre r1 y r2 (más estable que Gram-Schmidt).
  const a = r1.clone().add(r2).normalize();
  const b = new THREE.Vector3().crossVectors(r1, r2).normalize();
  const c = new THREE.Vector3().crossVectors(a, b).normalize();
  const x = a.clone().add(c).multiplyScalar(Math.SQRT1_2);
  const y = a.clone().sub(c).multiplyScalar(Math.SQRT1_2);
  const z = new THREE.Vector3().crossVectors(x, y);
  return { r: new THREE.Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z), t };
}

/** La otra inclinación posible: la normal reflejada respecto a la línea de visión. */
function mirrored({ r, t }: CvPose): CvPose {
  const view = t.clone().normalize();
  const normal = new THREE.Vector3().setFromMatrix3Column(r, 2);
  const other = view.clone().multiplyScalar(2 * normal.dot(view)).sub(normal).normalize();
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(normal, other));
  return { r: new THREE.Matrix3().setFromMatrix4(turn).multiply(r), t: t.clone() };
}

function residuals({ r, t }: CvPose, model: Point2[], image: Point2[], out: number[]): number[] {
  const e = r.elements;
  for (let i = 0; i < 4; i++) {
    const { x, y } = model[i];
    const X = e[0] * x + e[3] * y + t.x;
    const Y = e[1] * x + e[4] * y + t.y;
    const Z = e[2] * x + e[5] * y + t.z;
    out[2 * i] = X / Z - image[i].x;
    out[2 * i + 1] = Y / Z - image[i].y;
  }
  return out;
}

function reprojectionError(pose: CvPose, model: Point2[], image: Point2[]): number {
  const r = residuals(pose, model, image, new Array(8));
  return Math.sqrt(r.reduce((s, v) => s + v * v, 0) / 4);
}

/** Gira `pose` con el vector de rotación (w) y la desplaza (dt). */
function perturb(pose: CvPose, d: readonly number[]): CvPose {
  const w = new THREE.Vector3(d[0], d[1], d[2]);
  const angle = w.length();
  const turn = angle > 0 ? new THREE.Matrix4().makeRotationAxis(w.divideScalar(angle), angle) : new THREE.Matrix4();
  return {
    r: new THREE.Matrix3().setFromMatrix4(turn).multiply(pose.r),
    t: pose.t.clone().add(new THREE.Vector3(d[3], d[4], d[5])),
  };
}

/** Levenberg-Marquardt sobre los 6 grados de libertad: menor error de reproyección. */
function refinePose(start: CvPose, model: Point2[], image: Point2[]): CvPose {
  let pose = start;
  let r0 = residuals(pose, model, image, new Array(8));
  let cost = r0.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3;
  const r1 = new Array<number>(8);
  for (let iter = 0; iter < 12; iter++) {
    // Jacobiano numérico 8×6.
    const J: number[][] = [];
    for (let k = 0; k < 6; k++) {
      const d = [0, 0, 0, 0, 0, 0];
      d[k] = k < 3 ? 1e-6 : 1e-6 * pose.t.z;
      residuals(perturb(pose, d), model, image, r1);
      J.push(r1.map((v, i) => (v - r0[i]) / d[k]));
    }
    const A = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)));
    const g = J.map((col) => -col.reduce((s, v, i) => s + v * r0[i], 0));
    let improved = false;
    for (let tries = 0; tries < 5 && !improved; tries++) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const step = solve(M, g);
      if (!step) break;
      const next = perturb(pose, step);
      const rn = residuals(next, model, image, new Array(8));
      const c = rn.reduce((s, v) => s + v * v, 0);
      if (c < cost && next.t.z > 0) {
        [pose, r0, cost] = [next, rn, c];
        lambda = Math.max(lambda / 10, 1e-9);
        improved = true;
      } else lambda *= 10;
    }
    if (!improved || cost < 1e-16) break;
  }
  return pose;
}

/** Resuelve A x = b (6×6) por eliminación gaussiana con pivote. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-20) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** De una matriz de three.js (y arriba, z detrás) a OpenCV. */
function toCv(m: THREE.Matrix4): CvPose {
  const e = m.elements;
  return {
    r: new THREE.Matrix3().set(e[0], e[4], e[8], -e[1], -e[5], -e[9], -e[2], -e[6], -e[10]),
    t: new THREE.Vector3(e[12], -e[13], -e[14]),
  };
}

function rotationAngle(a: THREE.Matrix3, b: THREE.Matrix3): number {
  // Ángulo de a·bᵀ: traza = 1 + 2 cos θ.
  const ea = a.elements;
  const eb = b.elements;
  let trace = 0;
  for (let i = 0; i < 9; i++) trace += ea[i] * eb[i];
  return Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
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
