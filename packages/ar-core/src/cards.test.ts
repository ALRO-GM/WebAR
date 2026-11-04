import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IdentityGate, type Detection } from './gate';
import { MARKER_DICTIONARY } from './markers';
import { AR } from './vendor/js-aruco2/index.js';

const SIZE = 0.04;
function random(seed = 7) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
function gauss(rnd: () => number) {
  return Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
}
const dict = new AR.Dictionary(MARKER_DICTIONARY);
/** Los ajustes del detector que usa `MarkerTrackingProvider`. */
const WEBAR = { relativeThreshold: 0.16, thresholdKernel: 3, brightestChannel: true };

/** Foto sintética de tarjetas sobre una mesa: marcador, panel blanco, marco de color; desenfoque y ruido. */
function photo(markers: { pose: THREE.Matrix4; id: number }[], rnd: () => number, width: number, height: number, focal: number, blur: number, noise: number) {
  const cam = { cx: width / 2, cy: height / 2, focal };
  const inv = markers.map((m) => ({ inv: m.pose.clone().invert(), code: dict.codeList[m.id] }));
  const g = new Float32Array(width * height);
  const ray = new THREE.Vector3(); const o = new THREE.Vector3();
  const val = (px: number, py: number) => {
    for (const { inv: I, code } of inv) {
      o.setFromMatrixPosition(I);
      ray.set((px - cam.cx) / cam.focal, -(py - cam.cy) / cam.focal, -1).transformDirection(I);
      const s = -o.z / ray.z;
      // card: marker 4 cm, white margin 5 mm, colored frame around (card 6.3 x 8.8)
      const X = o.x + ray.x * s, Y = o.y + ray.y * s;
      const u = (X / SIZE + 0.5) * 8, v = (0.5 - Y / SIZE) * 8;
      if (u >= 0 && v >= 0 && u < 8 && v < 8) { const i = Math.floor(u), j = Math.floor(v); const black = i === 0 || j === 0 || i === 7 || j === 7 || code[(j - 1) * 6 + (i - 1)] !== '1'; return black ? 40 : 200; }
      if (Math.abs(X) < 0.025 && Y < 0.025 && Y > -0.03) return 200; // white panel
      if (Math.abs(X) < 0.0315 && Y < 0.028 && Y > -0.06) return 120; // colored frame
    }
    return 90; // table
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { let s = 0; for (let k = 0; k < 4; k++) s += val(x + 0.25 + (k % 2) * 0.5, y + 0.25 + Math.floor(k / 2) * 0.5); g[y * width + x] = s / 4; }
  // box blur
  let src = g;
  for (let b = 0; b < blur; b++) { const d = new Float32Array(width * height); for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * width + x + dx]; d[y * width + x] = s / 9; } src = d; }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { const v = src[i] + gauss(rnd) * noise; data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = v; data[4 * i + 3] = 255; }
  return { width, height, data };
}

/** 5 tarjetas (H, O, C, H nº2, N) en dos filas sobre una mesa a `dist` metros, inclinada `tilt`. */
function scene(dist: number, tilt: number) {
  const ids = [1, 8, 6, 119, 7];
  const table = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, -dist), new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  return ids.map((id, k) => ({
    id,
    pose: table.clone().multiply(
      new THREE.Matrix4().compose(
        new THREE.Vector3(((k % 3) - 1) * 0.075, k < 3 ? 0.05 : -0.06, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (k - 2) * 0.3),
        new THREE.Vector3(1, 1, 1),
      ),
    ),
  }));
}
const W = 640;
const H = 1138;
const FOCAL = H / 2 / Math.tan(THREE.MathUtils.degToRad(32.5));

describe('5 tarjetas a la vez con la cámara', () => {
  it('las lee todas, sin tarjetas inventadas, de 40 a 60 cm, rectas o inclinadas, con desenfoque', () => {
    const rnd = random(3);
    const strict = new AR.Detector({ dictionaryName: MARKER_DICTIONARY, maxHammingDistance: 4, ...WEBAR });
    for (const dist of [0.4, 0.5, 0.6])
      for (const tilt of [0, 0.6])
        for (const blur of [0, 2, 3]) {
          // El mismo marcador puede salir 2 veces (contorno exterior e interior): la puerta de identidad lo junta.
          const ids = [...new Set(strict.detect(photo(scene(dist, tilt), rnd, W, H, FOCAL, blur, 4)).map((m) => m.id))];
          expect(ids.sort((a, b) => a - b), `${dist} m, ${tilt} rad, desenfoque ${blur}`).toEqual([1, 6, 7, 8, 119]);
        }
  }, 60000);

  it('el detector de serie (hasta 11 bits erróneos) sí se inventa tarjetas', () => {
    const loose = new AR.Detector({ dictionaryName: MARKER_DICTIONARY });
    const ids = loose.detect(photo(scene(0.3, 0), random(3), W, H, FOCAL, 0, 4)).map((m) => m.id);
    expect(ids.some((id) => ![1, 6, 7, 8, 119].includes(id))).toBe(true);
  }, 60000);
});

const square = (x: number, y: number, s = 60) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const det = (id: number, x: number, y: number, hammingDistance = 0, s = 60): Detection => ({ id, corners: square(x, y, s), hammingDistance });

describe('identidad de las tarjetas', () => {
  it('una tarjeta nueva se confirma al tercer fotograma; luego basta uno', () => {
    const gate = new IdentityGate();
    expect(gate.filter([det(1, 100, 100)], 0)).toHaveLength(0);
    expect(gate.filter([det(1, 101, 100)], 33)).toHaveLength(0);
    expect(gate.filter([det(1, 102, 101)], 66)).toHaveLength(1);
    expect(gate.filter([det(1, 103, 101)], 99)).toHaveLength(1);
  });

  it('una lectura suelta (un reflejo) nunca llega a tarjeta', () => {
    const gate = new IdentityGate();
    for (let i = 0; i < 10; i++) expect(gate.filter([det(50 + i, 100 + i * 70, 100)], i * 33)).toHaveLength(0);
  });

  it('una tarjeta conocida sigue siendo su átomo aunque un fotograma la lea con otro número', () => {
    const gate = new IdentityGate();
    for (let i = 0; i < 3; i++) gate.filter([det(1, 100, 100)], i * 33);
    // Fotogramas borrosos: en su sitio se lee el 97 (berkelio) varias veces seguidas.
    for (let i = 3; i < 8; i++) expect(gate.filter([det(97, 100, 100, 2)], i * 33)).toHaveLength(0);
    expect(gate.filter([det(1, 100, 100)], 300).map((d) => d.id)).toEqual([1]);
  });

  it('dos lecturas solapadas en un fotograma: gana la que tiene menos bits erróneos', () => {
    const gate = new IdentityGate({ confirmFrames: 1 });
    expect(gate.filter([det(97, 110, 110, 2, 40), det(1, 100, 100, 0)], 0).map((d) => d.id)).toEqual([1]);
  });

  it('5 tarjetas distintas se confirman a la vez', () => {
    const gate = new IdentityGate();
    const five = [1, 8, 6, 119, 7].map((id, k) => det(id, 50 + k * 110, 300));
    let out: Detection[] = [];
    for (let i = 0; i < 3; i++) out = gate.filter(five, i * 33);
    expect(out.map((d) => d.id).sort((a, b) => a - b)).toEqual([1, 6, 7, 8, 119]);
  });
});

/**
 * Tarjetas dibujadas a mano con rotulador en papel cuadriculado (cuadros de
 * 5 mm, como los cuadros del marcador): toda la hoja tiene líneas de la
 * cuadrícula, también dentro de los cuadros blancos, y los bordes de la tinta
 * no son rectos del todo.
 */
function handDrawn(dist: number, tilt: number, rnd: () => number, line: [number, number, number] = [150, 150, 150]) {
  const ids = [1, 8, 6, 119, 7];
  const table = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, -dist), new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  const inv = table.clone().invert();
  const origin = new THREE.Vector3().setFromMatrixPosition(inv);
  const ray = new THREE.Vector3();
  const cell = 0.005;
  // Esquina superior izquierda de cada marcador, en cuadros de la hoja.
  const at = ids.map((_, k) => [((k % 3) - 1) * 14 - 4, k < 3 ? 12 : -2]);
  const value = (px: number, py: number) => {
    ray.set((px - W / 2) / FOCAL, -(py - H / 2) / FOCAL, -1).transformDirection(inv);
    const s = -origin.z / ray.z;
    const X = origin.x + ray.x * s;
    const Y = origin.y + ray.y * s;
    const gx = X / cell;
    const gy = Y / cell;
    // Trazo a mano: el borde de la tinta ondula ±0,4 mm.
    const wobble = 0.08 * Math.sin(gx * 2.3 + gy * 1.7) + 0.06 * Math.sin(gy * 3.1 - gx * 0.9);
    for (let k = 0; k < ids.length; k++) {
      const u = gx - at[k][0] + wobble;
      const v = at[k][1] - gy + wobble;
      if (u < 0 || v < 0 || u >= 8 || v >= 8) continue;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const black = i === 0 || j === 0 || i === 7 || j === 7 || dict.codeList[ids[k]][(j - 1) * 6 + (i - 1)] !== '1';
      if (black) return 45;
    }
    return Math.min(Math.abs(gx - Math.round(gx)), Math.abs(gy - Math.round(gy))) * cell < 0.0002 ? -1 : 215;
  };
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rgb = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const v = value(x + 0.25 + (k % 2) * 0.5, y + 0.25 + Math.floor(k / 2) * 0.5);
        for (let c = 0; c < 3; c++) rgb[c] += (v < 0 ? line[c] : v) / 4; // -1: línea de la cuadrícula
      }
      const noise = gauss(rnd) * 3;
      const p = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) data[p + c] = rgb[c] + noise;
      data[p + 3] = 255;
    }
  return { width: W, height: H, data };
}

describe('tarjetas dibujadas a mano en papel cuadriculado', () => {
  /** Fracción de fotogramas en que se lee cada tarjeta (la peor de las 5). */
  function worstRate(line: [number, number, number], options: { relativeThreshold?: number; brightestChannel?: boolean }): number {
    const rnd = random(9);
    const detector = new AR.Detector({ dictionaryName: MARKER_DICTIONARY, maxHammingDistance: 4, ...options });
    const seen = new Map<number, number>();
    let frames = 0;
    for (const dist of [0.35, 0.5])
      for (const tilt of [0, 0.5])
        for (let f = 0; f < 3; f++) {
          frames++;
          for (const id of new Set(detector.detect(handDrawn(dist, tilt, rnd, line)).map((m) => m.id))) seen.set(id, (seen.get(id) ?? 0) + 1);
        }
    return Math.min(...[1, 6, 7, 8, 119].map((id) => (seen.get(id) ?? 0) / frames));
  }

  it('cuadrícula gris clara: antes se perdía la mitad de las veces, ahora se leen todas', () => {
    expect(worstRate([150, 150, 150], {})).toBeLessThan(0.7);
    expect(worstRate([150, 150, 150], WEBAR)).toBeGreaterThanOrEqual(0.9);
  }, 120000);

  it('cuadrícula azul bien marcada (libreta): se leen todas', () => {
    expect(worstRate([90, 120, 210], {})).toBeLessThan(0.7);
    expect(worstRate([90, 120, 210], WEBAR)).toBeGreaterThanOrEqual(0.9);
  }, 120000);
});

