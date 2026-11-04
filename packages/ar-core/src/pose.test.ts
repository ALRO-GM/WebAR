import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { markerPose, type PinholeCamera } from './pose';

const camera: PinholeCamera = { focal: 520, cx: 320, cy: 240 };

/** Proyecta las esquinas de un marcador con pose conocida (en espacio de three.js). */
function project(pose: THREE.Matrix4, size: number) {
  const h = size / 2;
  return [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ].map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(pose);
    // three.js → píxeles: la cámara mira a -z y la imagen tiene y hacia abajo.
    return { x: camera.cx + (camera.focal * p.x) / -p.z, y: camera.cy - (camera.focal * p.y) / -p.z };
  });
}

describe('pose de un marcador', () => {
  it('recupera posición y orientación de una pose conocida', () => {
    const truth = new THREE.Matrix4().compose(
      new THREE.Vector3(0.05, -0.03, -0.4),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0.3, 0.2)),
      new THREE.Vector3(1, 1, 1),
    );
    const pose = markerPose(project(truth, 0.04), 0.04, camera)!;
    expect(pose).not.toBeNull();
    const [p1, q1] = [new THREE.Vector3(), new THREE.Quaternion()];
    const [p2, q2] = [new THREE.Vector3(), new THREE.Quaternion()];
    pose.decompose(p1, q1, new THREE.Vector3());
    truth.decompose(p2, q2, new THREE.Vector3());
    expect(p1.distanceTo(p2)).toBeLessThan(1e-6);
    expect(q1.angleTo(q2)).toBeLessThan(1e-6);
  });

  it('un marcador de frente tiene su eje z hacia la cámara', () => {
    const truth = new THREE.Matrix4().makeTranslation(0, 0, -0.3);
    const pose = markerPose(project(truth, 0.04), 0.04, camera)!;
    const z = new THREE.Vector3().setFromMatrixColumn(pose, 2);
    expect(z.z).toBeCloseTo(1);
  });
});
