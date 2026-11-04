import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Caja de herramientas de los arquetipos: materiales, piezas y texturas
 * pintadas por código. Todo se construye a escala 1 (cabe en una esfera de
 * radio 1 centrada en el origen); `createEveryday` lo escala al tamaño pedido.
 */

/** Parámetros comunes de un arquetipo (cada uno usa los que le sirven). */
export interface Params {
  /** Variante del arquetipo ('doblon', 'aa', 'farola'…). */
  variant?: string;
  color?: string;
  color2?: string;
  /** Color de lo que brilla (luz, llama, resplandor). */
  glow?: string;
  /** Metalicidad y rugosidad del material principal. */
  metal?: number;
  rough?: number;
  /** Símbolo o fórmula impresa en etiquetas (no es texto de interfaz: es química). */
  label?: string;
  /** Semilla para lo aleatorio (manchas, chispas, burbujas). */
  seed?: number;
}

export type Anim = (t: number, dt: number) => void;

/** Lo que recibe un arquetipo: dónde colgar piezas y cómo animarlas. */
export class Kit {
  readonly root = new THREE.Group();
  readonly anims: Anim[] = [];
  /** 1 normalmente; casi 0 en modo calma. Ya va aplicado a `t` y `dt`. */
  readonly motion: number;
  readonly calm: boolean;
  readonly rand: () => number;

  constructor(calm: boolean, seed: number) {
    this.calm = calm;
    this.motion = calm ? 0.15 : 1;
    this.rand = seeded(seed);
  }

  add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = this.root): T {
    parent.add(obj);
    return obj;
  }

  animate(fn: Anim): void {
    this.anims.push(fn);
  }
}

export function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ruido suave y barato: suma de senos, entre −1 y 1. */
export function wave(t: number, seed = 0): number {
  return (Math.sin(t * 1.7 + seed * 12.9) + Math.sin(t * 2.9 + seed * 7.3) * 0.6 + Math.sin(t * 5.3 + seed * 3.1) * 0.3) / 1.9;
}

// --- Materiales ---------------------------------------------------------------

export interface MatOpts {
  metal?: number;
  rough?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  opacity?: number;
  map?: THREE.Texture | null;
  flat?: boolean;
  side?: THREE.Side;
  depthWrite?: boolean;
}

export function mat(color: THREE.ColorRepresentation, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness: o.metal ?? 0,
    roughness: o.rough ?? 0.5,
    flatShading: o.flat ?? false,
    side: o.side ?? THREE.FrontSide,
  });
  if (o.emissive !== undefined) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (o.map) m.map = o.map;
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = o.depthWrite ?? false;
  }
  return m;
}

export const metal = (color: THREE.ColorRepresentation, rough = 0.25, o: MatOpts = {}) => mat(color, { metal: 1, rough, ...o });

/** Vidrio barato para móvil: transparente con reflejos del entorno (sin transmisión real). */
export function glass(color: THREE.ColorRepresentation = '#dff4ff', opacity = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  });
}

/** Material que brilla por sí mismo (no le afecta la luz). */
export function glowMat(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

// --- Piezas ---------------------------------------------------------------------

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, pos?: [number, number, number], rot?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  return m;
}

/** Sólido de revolución a partir de [radio, altura]. */
export function lathe(profile: Array<[number, number]>, segments = 32): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

export function roundedBox(w: number, h: number, d: number, r = 0.05, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

/** Tubo que sigue unos puntos (cables, neón, filamentos). */
export function tube(points: Array<[number, number, number]>, radius: number, segments = 64, closed = false): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    closed,
  );
  return new THREE.TubeGeometry(curve, segments, radius, 8, closed);
}

// --- Texturas pintadas por código ------------------------------------------------

const hasCanvas = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/** Textura de canvas; en Node (tests) devuelve null y el material va sin ella. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.CanvasTexture | null {
  if (!hasCanvas()) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let glowTex: THREE.Texture | null | undefined;
/** Mancha radial blanca para halos (compartida: no se desecha). */
export function glowTexture(): THREE.Texture | null {
  if (glowTex !== undefined) return glowTex;
  glowTex = canvasTexture(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
  if (glowTex) glowTex.userData.shared = true;
  return glowTex;
}

/** Halo aditivo (sprite) del color dado. */
export function halo(color: THREE.ColorRepresentation, size: number, opacity = 0.8): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

/** Etiqueta: fondo de color con un texto corto centrado (símbolos, fórmulas). */
export function labelTexture(text: string, bg: string, fg: string, w = 256, h = 128, extra?: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture | null {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    extra?.(g, w, h);
    if (text) {
      g.fillStyle = fg;
      g.font = `bold ${Math.round(h * 0.5)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + h * 0.03);
    }
  });
}

/** Rayo dibujado (pilas y baterías). */
export function drawBolt(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx + 0.1 * s, cy - 0.5 * s);
  g.lineTo(cx - 0.25 * s, cy + 0.05 * s);
  g.lineTo(cx - 0.02 * s, cy + 0.05 * s);
  g.lineTo(cx - 0.1 * s, cy + 0.5 * s);
  g.lineTo(cx + 0.25 * s, cy - 0.08 * s);
  g.lineTo(cx + 0.02 * s, cy - 0.08 * s);
  g.closePath();
  g.fill();
}

/** Manchas aleatorias sobre un color base (óxido, cráteres, vetas). */
export function spotsTexture(base: string, spots: string[], n: number, seed: number, w = 256, h = 256): THREE.CanvasTexture | null {
  const r = seeded(seed);
  return canvasTexture(w, h, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = (0.03 + r() * 0.12) * w;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = spots[i % spots.length];
      grd.addColorStop(0, c);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// --- Más piezas --------------------------------------------------------------------

/** Tubo que se estrecha o ensancha a lo largo (plátanos, llamas, colas). */
export function taperedTube(points: Array<[number, number, number]>, radius: (u: number) => number, tubular = 32, radial = 12): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, c);
    const r = radius(u);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Nube de puntos redondos (chispas, sal, humo). Posiciones a mano. Mezcla
 * normal, no aditiva: así se ven también sobre fondos claros (una mesa, un
 * folio), que es lo habitual en realidad aumentada. `glow` = no le afecta el tono.
 */
export function particles(n: number, color: THREE.ColorRepresentation, size: number, glow = true): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({
    color,
    size,
    map: glowTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: !glow,
  });
  const p = new THREE.Points(geo, m);
  p.frustumCulled = false;
  return p;
}

/** Bucle de partículas que nacen, viajan y renacen. */
export function emitter(
  k: Kit,
  points: THREE.Points,
  spawn: (i: number, out: THREE.Vector3, vel: THREE.Vector3) => void,
  opts: { life: number; gravity?: number; drag?: number },
): void {
  const pos = points.geometry.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const vel = Array.from({ length: n }, () => new THREE.Vector3());
  const age = Array.from({ length: n }, (_, i) => (i / n) * opts.life);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    spawn(i, p, vel[i]);
    // Reparte las edades para que no salgan todas a la vez.
    p.addScaledVector(vel[i], age[i]);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  k.animate((_t, dt) => {
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      if (age[i] > opts.life) {
        age[i] = 0;
        spawn(i, p, vel[i]);
      } else {
        p.fromBufferAttribute(pos, i);
        if (opts.gravity) vel[i].y -= opts.gravity * dt;
        if (opts.drag) vel[i].multiplyScalar(1 - opts.drag * dt);
        p.addScaledVector(vel[i], dt);
      }
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;
  });
}

/** Burbujas (esferas de verdad) que suben y renacen abajo. */
export function bubbles(
  k: Kit,
  parent: THREE.Object3D,
  n: number,
  material: THREE.Material,
  area: { x: number; z: number; y0: number; y1: number; r: [number, number]; speed: number; wobble?: number; center?: [number, number] },
): void {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const list = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(geo, material);
    parent.add(m);
    return { m, x: 0, z: 0, y: 0, r: 0, ph: 0 };
  });
  const [cx, cz] = area.center ?? [0, 0];
  const reset = (b: (typeof list)[number], y: number) => {
    b.x = cx + (k.rand() - 0.5) * 2 * area.x;
    b.z = cz + (k.rand() - 0.5) * 2 * area.z;
    b.y = y;
    b.r = area.r[0] + k.rand() * (area.r[1] - area.r[0]);
    b.ph = k.rand() * 10;
  };
  list.forEach((b) => reset(b, area.y0 + k.rand() * (area.y1 - area.y0)));
  const place = (t: number) => {
    for (const b of list) {
      const w = area.wobble ?? 0.02;
      b.m.position.set(b.x + Math.sin(t * 4 + b.ph) * w, b.y, b.z + Math.cos(t * 3 + b.ph) * w);
      // Se desvanecen al llegar arriba.
      const f = Math.min(1, (area.y1 - b.y) / 0.08);
      b.m.scale.setScalar(b.r * Math.max(0.05, f));
    }
  };
  place(0);
  k.animate((t, dt) => {
    for (const b of list) {
      b.y += dt * area.speed * (0.6 + b.r * 8);
      if (b.y > area.y1) reset(b, area.y0);
    }
    place(t);
  });
}

// --- Desechar ---------------------------------------------------------------------

export function disposeTree(root: THREE.Object3D): void {
  const done = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !done.has(m.geometry)) {
      done.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const material of mats) {
      if (done.has(material)) continue;
      done.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !value.userData.shared && !done.has(value)) {
          done.add(value);
          value.dispose();
        }
      }
      material.dispose();
    }
  });
}
