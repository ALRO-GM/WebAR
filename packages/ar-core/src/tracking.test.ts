import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MARKER_DICTIONARY } from './markers';
import { OneEuroQuaternion, OneEuroVector } from './one-euro';
import { alignCoplanar, markerPose, type PinholeCamera, type Point2 } from './pose';
import { refineCorners, type GreyImage } from './refine';
import { AR } from './vendor/js-aruco2/index.js';

const camera: PinholeCamera = { focal: 520, cx: 320, cy: 240 };
const SIZE = 0.04;

/** Semilla fija: las pruebas dan siempre lo mismo. */
function random(seed = 7) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
function gauss(rnd: () => number) {
  return Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
}

function project(pose: THREE.Matrix4): Point2[] {
  const h = SIZE / 2;
  return [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ].map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(pose);
    return { x: camera.cx + (camera.focal * p.x) / -p.z, y: camera.cy - (camera.focal * p.y) / -p.z };
  });
}

/** Dibuja un cuadrado negro sobre blanco con bordes suavizados, como lo ve una cámara. */
function render(corners: Point2[], width = 640, height = 480): GreyImage {
  const data = new Uint8Array(width * height).fill(230);
  const inside = (x: number, y: number) =>
    corners.every((a, i) => {
      const b = corners[(i + 1) % 4];
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= 0;
    });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  for (let y = Math.floor(Math.min(...ys)) - 2; y <= Math.max(...ys) + 2; y++)
    for (let x = Math.floor(Math.min(...xs)) - 2; x <= Math.max(...xs) + 2; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      data[y * width + x] = 230 - (n / 16) * 210;
    }
  return { width, height, data };
}

// Las esquinas del píxel: el centro de un píxel (x, y) está en x + 0,5.
const shift = (c: Point2[], d: number) => c.map((p) => ({ x: p.x + d, y: p.y + d }));

describe('esquinas a décimas de píxel', () => {
  it('afina esquinas redondeadas al píxel hasta menos de 0,15 px', () => {
    const truth: Point2[] = [
      { x: 300.3, y: 200.7 },
      { x: 372.6, y: 206.2 },
      { x: 366.1, y: 271.9 },
      { x: 296.8, y: 265.4 },
    ];
    const img = render(truth);
    const rnd = random();
    const rough = truth.map((p) => ({ x: Math.round(p.x + (rnd() - 0.5) * 2), y: Math.round(p.y + (rnd() - 0.5) * 2) }));
    const refined = shift(refineCorners(img, rough), 0.5);
    const error = (c: Point2[]) => Math.max(...c.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y)));
    expect(error(rough)).toBeGreaterThan(0.6);
    expect(error(refined)).toBeLessThan(0.15);
  });
});

describe('pose de un marcador casi de frente', () => {
  const truth = new THREE.Matrix4().compose(
    new THREE.Vector3(0.02, -0.01, -0.3),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, -0.08, 0.4)),
    new THREE.Vector3(1, 1, 1),
  );
  const q = new THREE.Quaternion();
  const angleTo = (m: THREE.Matrix4) => (m.decompose(new THREE.Vector3(), q, new THREE.Vector3()), q.angleTo(new THREE.Quaternion().setFromRotationMatrix(truth)));

  it('con ruido, la pista del frame anterior evita los saltos de inclinación', () => {
    const rnd = random(11);
    const corners = project(truth);
    let worstFree = 0;
    let worstHint = 0;
    for (let i = 0; i < 200; i++) {
      const noisy = corners.map((p) => ({ x: p.x + gauss(rnd) * 0.5, y: p.y + gauss(rnd) * 0.5 }));
      worstFree = Math.max(worstFree, angleTo(markerPose(noisy, SIZE, camera)!));
      worstHint = Math.max(worstHint, angleTo(markerPose(noisy, SIZE, camera, undefined, truth)!));
    }
    expect(worstHint).toBeLessThanOrEqual(worstFree);
  });

  it('con esquinas afinadas (ruido de 0,15 px) la inclinación no pasa de 4°', () => {
    const rnd = random(11);
    const corners = project(truth);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const noisy = corners.map((p) => ({ x: p.x + gauss(rnd) * 0.15, y: p.y + gauss(rnd) * 0.15 }));
      worst = Math.max(worst, angleTo(markerPose(noisy, SIZE, camera, undefined, truth)!));
    }
    expect(THREE.MathUtils.radToDeg(worst)).toBeLessThan(4);
  });

  it('sin ruido sigue siendo exacta', () => {
    expect(angleTo(markerPose(project(truth), SIZE, camera, undefined, truth)!)).toBeLessThan(1e-5);
  });
});

describe('tarjetas en la misma mesa', () => {
  it('la normal común tiembla menos que la de cada tarjeta y respeta la inclinada', () => {
    const rnd = random(21);
    const table = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, 0, 0));
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(table);
    let before = 0;
    let after = 0;
    for (let trial = 0; trial < 50; trial++) {
      const poses = [-0.06, 0, 0.06].map((x) => {
        const wobble = new THREE.Quaternion().setFromEuler(new THREE.Euler(gauss(rnd) * 0.05, gauss(rnd) * 0.05, 0));
        return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, -0.35), table.clone().multiply(wobble), new THREE.Vector3(1, 1, 1));
      });
      // Una cuarta tarjeta levantada a 60°: no cuenta ni se toca.
      const lifted = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.05, -0.3), table.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(1, 0, 0))), new THREE.Vector3(1, 1, 1));
      const liftedCopy = lifted.clone();
      const normal = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixColumn(m, 2);
      before += poses.reduce((s, m) => s + normal(m).angleTo(up), 0);
      alignCoplanar([...poses, lifted], [1, 1, 1, 1]);
      after += poses.reduce((s, m) => s + normal(m).angleTo(up), 0);
      expect(lifted.equals(liftedCopy)).toBe(true);
      expect(new THREE.Vector3().setFromMatrixPosition(poses[0]).x).toBeCloseTo(-0.06, 6);
    }
    expect(after).toBeLessThan(before * 0.75);
  });
});

describe('filtro 1 €', () => {
  const options = { position: { minCutoff: 0.5, beta: 30, dCutoff: 0.5 }, rotation: { minCutoff: 0.5, beta: 2, dCutoff: 0.3 } };

  it('quieto: el temblor baja a menos de la mitad', () => {
    const rnd = random(3);
    const f = new OneEuroVector(options.position);
    const out: number[] = [];
    const raw: number[] = [];
    for (let i = 0; i < 300; i++) {
      const x = gauss(rnd) * 0.002;
      raw.push(x);
      out.push(f.filter(new THREE.Vector3(x, 0, -0.3), 1 / 30).x);
    }
    const sd = (v: number[]) => Math.sqrt(v.slice(30).reduce((s, x) => s + x * x, 0) / (v.length - 30));
    expect(sd(out)).toBeLessThan(sd(raw) / 2);
  });

  it('moviéndose a 30 cm/s se queda menos de 1 cm atrás', () => {
    const f = new OneEuroVector(options.position);
    let x = 0;
    let lag = 0;
    for (let i = 0; i < 60; i++) {
      x += 0.3 / 30;
      lag = x - f.filter(new THREE.Vector3(x, 0, 0), 1 / 30).x;
    }
    expect(lag).toBeLessThan(0.01);
  });

  it('el giro también se suaviza quieto y sigue al girar', () => {
    const rnd = random(5);
    const f = new OneEuroQuaternion(options.rotation);
    const axis = new THREE.Vector3(0, 1, 0);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const out = f.filter(new THREE.Quaternion().setFromAxisAngle(axis, gauss(rnd) * 0.01), 1 / 30);
      if (i > 30) worst = Math.max(worst, out.angleTo(new THREE.Quaternion()));
    }
    expect(worst).toBeLessThan(0.015);
    let angle = 0;
    let lag = 0;
    for (let i = 0; i < 60; i++) {
      angle += 1.5 / 30; // 1,5 rad/s
      lag = f.filter(new THREE.Quaternion().setFromAxisAngle(axis, angle), 1 / 30).angleTo(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    }
    expect(lag).toBeLessThan(0.12);
  });
});

describe('de la imagen a la pose, con el detector de verdad', () => {
  /** Fotografía sintética: marcador ArUco en perspectiva, bordes suavizados y ruido del sensor. */
  function photo(pose: THREE.Matrix4, id: number, rnd: () => number, width = 640, height = 480) {
    const code = new AR.Dictionary(MARKER_DICTIONARY).codeList[id];
    const inverse = new THREE.Matrix4().copy(pose).invert();
    const origin = new THREE.Vector3().setFromMatrixPosition(inverse);
    const data = new Uint8ClampedArray(width * height * 4);
    const ray = new THREE.Vector3();
    const n = 8; // 6 × 6 bits + el borde negro
    const value = (px: number, py: number) => {
      // Rayo de la cámara por el píxel, cortado con el plano del marcador (z = 0).
      ray.set((px - camera.cx) / camera.focal, -(py - camera.cy) / camera.focal, -1).transformDirection(inverse);
      const s = -origin.z / ray.z;
      const u = ((origin.x + ray.x * s) / SIZE + 0.5) * n;
      const v = (0.5 - (origin.y + ray.y * s) / SIZE) * n;
      const i = Math.floor(u);
      const j = Math.floor(v);
      if (i < 0 || j < 0 || i >= n || j >= n) return 225;
      const black = i === 0 || j === 0 || i === n - 1 || j === n - 1 || code[(j - 1) * 6 + (i - 1)] !== '1';
      return black ? 25 : 225;
    };
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += value(x + 0.25 + (k % 2) * 0.5, y + 0.25 + Math.floor(k / 2) * 0.5);
        const g = sum / 4 + gauss(rnd) * 3;
        const p = (y * width + x) * 4;
        data[p] = data[p + 1] = data[p + 2] = g;
        data[p + 3] = 255;
      }
    return { width, height, data };
  }

  it('afinar las esquinas reduce el temblor de la pose a menos de la mitad', () => {
    const rnd = random(31);
    const detector = new AR.Detector({ dictionaryName: MARKER_DICTIONARY });
    // Tarjeta sobre la mesa, móvil a unos 35 cm mirando hacia abajo.
    const truth = new THREE.Matrix4().compose(
      new THREE.Vector3(0.01, -0.02, -0.35),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.05, 0.3)),
      new THREE.Vector3(1, 1, 1),
    );
    const tq = new THREE.Quaternion().setFromRotationMatrix(truth);
    const q = new THREE.Quaternion();
    const spread = { rough: [] as number[], refined: [] as number[] };
    for (let frame = 0; frame < 6; frame++) {
      // Un poco de movimiento de la mano entre fotogramas: el redondeo al píxel cambia.
      const pose = truth.clone().multiply(new THREE.Matrix4().makeTranslation(gauss(rnd) * 0.0008, gauss(rnd) * 0.0008, 0));
      const [marker] = detector.detect(photo(pose, 8, rnd));
      expect(marker?.id).toBe(8);
      const refined = refineCorners(detector.grey!, marker.corners);
      for (const [key, corners] of [['rough', marker.corners], ['refined', refined]] as const) {
        markerPose(corners, SIZE, camera, undefined, truth)!.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        spread[key].push(q.angleTo(tq));
      }
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(mean(spread.refined)).toBeLessThan(mean(spread.rough) / 2);
  });
});
