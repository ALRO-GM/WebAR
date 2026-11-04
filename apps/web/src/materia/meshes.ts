import * as THREE from 'three';

// Piezas de three.js compartidas por el cristal y el agua: muchas esferas y
// varillas iguales en un solo InstancedMesh (una llamada de dibujo cada uno),
// que es lo que deja ir fluido en un móvil con cientos de átomos.

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const dir = new THREE.Vector3();
const mid = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function spheres(count: number, material: THREE.Material, detail: [number, number] = [20, 14]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, detail[0], detail[1]), material, Math.max(count, 1));
  mesh.count = count;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function sticks(count: number, material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), material, Math.max(count, 1));
  mesh.count = count;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function setSphere(mesh: THREE.InstancedMesh, i: number, p: THREE.Vector3, r: number): void {
  s.setScalar(Math.max(r, 1e-6));
  m.compose(p, q.identity(), s);
  mesh.setMatrixAt(i, m);
}

/** Varilla de `a` a `b` con radio `r`. */
export function setStick(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  dir.subVectors(b, a);
  const length = dir.length();
  mid.addVectors(a, b).multiplyScalar(0.5);
  q.setFromUnitVectors(UP, length > 0 ? dir.divideScalar(length) : UP);
  s.set(Math.max(r, 1e-6), Math.max(length, 1e-6), Math.max(r, 1e-6));
  m.compose(mid, q, s);
  mesh.setMatrixAt(i, m);
}

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((x) => x.dispose());
    else material?.dispose();
  });
  root.clear();
}

/** Curvas de animación. */
export const ease = {
  outCubic: (u: number) => 1 - (1 - u) ** 3,
  /** Llega pasándose un poco y vuelve: el «rebote suave» al encajar. */
  outBack: (u: number, k = 1.6) => 1 + (k + 1) * (u - 1) ** 3 + k * (u - 1) ** 2,
  smooth: (u: number) => u * u * (3 - 2 * u),
};
