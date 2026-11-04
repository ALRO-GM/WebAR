import * as THREE from 'three';
import { getCharacter, luminance, shade, type Accessory, type Appearance } from './data';

/**
 * Figura 3D de un personaje, del mismo diseño que su avatar plano: muñeco de
 * cabeza grande, pelo, gafas, ropa y su accesorio en la mano.
 *
 * ```ts
 * const fig = new CharacterFigure('marie-curie') // 0,25 m de alto
 * scene.add(fig.object)
 * // en cada frame: fig.update(dt)
 * fig.wave(); fig.lookAt(camera.position)
 * ```
 *
 * El origen de `object` está entre los pies; mira hacia +Z. Los materiales
 * son de dibujo (MeshToonMaterial): la escena necesita alguna luz.
 * Unos 4 000 triángulos por figura.
 */

export interface FigureOptions {
  /** Alto en metros antes de `scale`. Por defecto 0,25 (para una mesa en RA). */
  height?: number;
  /** Multiplica el alto. */
  scale?: number;
}

/** Materiales compartidos dentro de una figura (y que se liberan con ella). */
export class Palette {
  private readonly cache = new Map<string, THREE.Material>();
  toon(color: string, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
    const key = `t${color}${JSON.stringify(extra)}`;
    let m = this.cache.get(key) as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, ...extra });
      this.cache.set(key, m);
    }
    return m;
  }
  basic(color: string, opacity = 1): THREE.MeshBasicMaterial {
    const key = `b${color}${opacity}`;
    let m = this.cache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
      this.cache.set(key, m);
    }
    return m;
  }
  dispose(): void {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

/** Libera geometrías de un árbol (los materiales van aparte, en su Palette). */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g && !seen.has(g)) {
      seen.add(g);
      g.dispose();
    }
  });
}

const INK = '#2b2730';
const MOUTH = '#5a2228';
const GLASS = '#dff1ff';

export class CharacterFigure {
  readonly object = new THREE.Group();
  readonly height: number;
  readonly id: string;

  private readonly pal = new Palette();
  private readonly inner = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
  private readonly waveArm = new THREE.Group();
  private readonly holdArm = new THREE.Group();
  private readonly accessory = new THREE.Group();
  private readonly glow: THREE.Object3D[] = [];
  private t = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blinkT = 0;
  private waveT = 0;
  private jumpT = 0;
  private look: THREE.Vector3 | null = null;
  private yaw = 0;
  private pitch = 0;

  constructor(id: string, opts: FigureOptions = {}) {
    this.id = id;
    const L = getCharacter(id).look;
    this.object.name = `personaje:${id}`;
    this.build(L);
    this.object.add(this.inner);
    this.inner.add(this.body);

    // A escala: medir la figura (en reposo) y dejar los pies en y = 0.
    this.height = (opts.height ?? 0.25) * (opts.scale ?? 1);
    this.inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.inner);
    const k = this.height / (box.max.y - box.min.y);
    this.inner.scale.setScalar(k);
    this.inner.position.y = -box.min.y * k;
  }

  private build(L: Appearance): void {
    const P = this.pal;
    const skin = P.toon(L.skin);
    const main = P.toon(L.outfit.main);
    const accent = P.toon(L.outfit.accent);
    const under = P.toon(L.outfit.under ?? L.outfit.accent);
    const shoe = P.toon('#3a3340');
    const long = ['vestido', 'sari', 'tunica'].includes(L.outfit.style);
    const b = this.body;

    // Piernas y zapatos
    const legMat = long ? P.toon(shade(L.outfit.main, -0.25)) : P.toon(L.outfit.style === 'bata' ? (L.outfit.under ?? '#3a4a63') : shade(L.outfit.main, -0.1));
    for (const s of [-1, 1]) {
      const leg = mesh(new THREE.CapsuleGeometry(0.042, 0.12, 4, 10), legMat, s * 0.055, 0.12, 0);
      b.add(leg);
      const foot = mesh(sphere(0.05, 14, 10), shoe, s * 0.058, 0.03, 0.02);
      foot.scale.set(1, 0.6, 1.45);
      b.add(foot);
    }
    if (long || L.outfit.style === 'casaca') {
      const skirt = mesh(new THREE.CylinderGeometry(0.115, long ? 0.19 : 0.16, long ? 0.24 : 0.14, 24, 1), main, 0, long ? 0.17 : 0.25, 0);
      b.add(skirt);
    }

    // Tronco y hombros
    const torso = mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.24, 24, 1), main, 0, 0.38, 0);
    b.add(torso);
    const shoulders = mesh(sphere(0.105, 22, 12), main, 0, 0.495, 0);
    shoulders.scale.set(1.32, 0.5, 0.95);
    b.add(shoulders);
    if (L.outfit.style === 'bata') {
      // Bata abierta: se ve la ropa de debajo y las solapas.
      b.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), under, 0, 0.4, 0.105));
      for (const s of [-1, 1]) {
        const lap = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.012), P.toon(shade(L.outfit.main, -0.08)), s * 0.035, 0.45, 0.112);
        lap.rotation.z = s * 0.35;
        b.add(lap);
      }
      b.add(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), P.toon(shade(L.outfit.main, -0.06)), -0.06, 0.36, 0.112));
    } else if (L.outfit.style === 'traje') {
      b.add(mesh(new THREE.BoxGeometry(0.05, 0.12, 0.02), under, 0, 0.45, 0.105));
      const tie = mesh(new THREE.BoxGeometry(0.022, 0.1, 0.012), accent, 0, 0.43, 0.118);
      b.add(tie);
      for (const s of [-1, 1]) {
        const lap = mesh(new THREE.BoxGeometry(0.03, 0.13, 0.012), P.toon(shade(L.outfit.main, -0.18)), s * 0.04, 0.44, 0.112);
        lap.rotation.z = s * 0.4;
        b.add(lap);
      }
    } else if (L.outfit.style === 'vestido' || L.outfit.style === 'jersey') {
      const collar = mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 20), accent, 0, 0.51, 0.01);
      collar.rotation.x = Math.PI / 2 - 0.25;
      b.add(collar);
    } else if (L.outfit.style === 'sari') {
      const drape = mesh(new THREE.CylinderGeometry(0.128, 0.142, 0.07, 24, 1, true), P.toon(L.outfit.accent, { side: THREE.DoubleSide }), 0, 0.38, 0);
      drape.rotation.z = 0.75;
      drape.scale.set(1, 1, 0.95);
      b.add(drape);
    } else if (L.outfit.style === 'tunica') {
      const belt = mesh(new THREE.TorusGeometry(0.118, 0.014, 8, 28), accent, 0, 0.32, 0);
      belt.rotation.x = Math.PI / 2;
      b.add(belt);
      b.add(mesh(new THREE.BoxGeometry(0.018, 0.2, 0.01), accent, 0, 0.42, 0.108));
    } else if (L.outfit.style === 'casaca') {
      const jabot = mesh(sphere(0.035, 12, 8), accent, 0, 0.47, 0.1);
      jabot.scale.set(1, 1.3, 0.6);
      b.add(jabot);
      const gold = P.toon('#e8c35a');
      for (const y of [0.4, 0.34, 0.28]) for (const s of [-1, 1]) b.add(mesh(sphere(0.008, 8, 6), gold, s * 0.025, y, 0.112));
    }

    // Cuello y cabeza (la cabeza gira sobre el cuello)
    b.add(mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.06, 14), P.toon(shade(L.skin, -0.1)), 0, 0.53, 0));
    this.head.position.set(0, 0.54, 0);
    b.add(this.head);
    this.buildHead(L, skin);

    // Brazos (el que saluda a la derecha del personaje, el que sujeta a su izquierda)
    const arm = (g: THREE.Group, x: number) => {
      g.position.set(x, 0.49, 0);
      g.add(mesh(new THREE.CapsuleGeometry(0.034, 0.14, 4, 10), main, 0, -0.1, 0));
      g.add(mesh(sphere(0.04, 14, 10), skin, 0, -0.205, 0));
      b.add(g);
    };
    arm(this.waveArm, -0.145);
    arm(this.holdArm, 0.145);
    this.waveArm.rotation.z = -0.14;
    this.holdArm.rotation.set(-1.15, 0, -0.32);

    // Accesorio delante, junto a la mano
    b.updateMatrixWorld(true);
    const hand = new THREE.Vector3(0, -0.205, 0);
    this.holdArm.localToWorld(hand);
    this.accessory.position.copy(hand).add(new THREE.Vector3(-0.02, 0.06, 0.03));
    this.accessory.add(accessory3D(L.accessory, L.accessoryColor, P, this.glow));
    b.add(this.accessory);
  }

  private buildHead(L: Appearance, skin: THREE.Material): void {
    const P = this.pal;
    const h = this.head;
    const R = 0.19;
    const cy = 0.17; // centro de la cabeza sobre el cuello
    const skull = mesh(sphere(R, 28, 20), skin, 0, cy, 0);
    skull.scale.set(1, 0.98, 0.93);
    h.add(skull);
    for (const s of [-1, 1]) {
      const ear = mesh(sphere(0.036, 12, 8), P.toon(shade(L.skin, -0.06)), s * 0.185, cy - 0.01, 0);
      ear.scale.set(0.6, 1, 0.8);
      h.add(ear);
      const cheek = mesh(sphere(0.03, 12, 8), P.basic('#ff7d8c', 0.35), s * 0.1, cy - 0.06, 0.15);
      cheek.scale.set(1, 0.6, 0.4);
      h.add(cheek);
    }
    // Ojos grandes con brillo; se cierran (escala y) al parpadear.
    this.eyes.position.set(0, cy + 0.005, 0);
    for (const s of [-1, 1]) {
      const white = mesh(sphere(0.04, 16, 12), P.toon('#ffffff'), s * 0.072, 0, 0.148);
      white.scale.set(0.9, 1.1, 0.5);
      const pupil = mesh(sphere(0.027, 14, 10), P.basic(INK), s * 0.072, -0.004, 0.166);
      pupil.scale.set(1, 1.1, 0.5);
      const shine = mesh(sphere(0.009, 8, 6), P.basic('#ffffff'), s * 0.072 + 0.01, 0.012, 0.18);
      this.eyes.add(white, pupil, shine);
    }
    h.add(this.eyes);
    // Cejas
    const brow = P.toon(shade(L.hair.color, luminance(L.hair.color) > 0.55 ? -0.38 : -0.1));
    for (const s of [-1, 1]) {
      const b = mesh(new THREE.CapsuleGeometry(0.008, 0.04, 2, 6), brow, s * 0.072, cy + 0.07, 0.165);
      b.rotation.z = Math.PI / 2 + s * 0.12;
      h.add(b);
    }
    // Nariz y boca sonriente
    const nose = mesh(sphere(0.018, 10, 8), P.toon(shade(L.skin, -0.12)), 0, cy - 0.035, 0.175);
    nose.scale.set(1.2, 0.8, 0.8);
    h.add(nose);
    const mouth = mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI), P.basic(MOUTH), 0, cy - 0.06, 0.168);
    mouth.rotation.z = Math.PI;
    mouth.rotation.x = -0.25;
    h.add(mouth);

    this.buildHair(L, cy, R);

    // Barba y bigote
    if (L.facialHair !== 'ninguno') {
      const fh = P.toon(L.facialHairColor ?? L.hair.color);
      const mus = mesh(new THREE.CapsuleGeometry(0.012, 0.05, 3, 8), fh, 0, cy - 0.048, 0.175);
      mus.rotation.z = Math.PI / 2;
      h.add(mus);
      if (L.facialHair !== 'bigote') {
        const long = L.facialHair === 'barba-larga';
        const beard = mesh(sphere(0.12, 18, 12), fh, 0, cy - (long ? 0.185 : 0.14), 0.07);
        beard.scale.set(1.08, long ? 0.95 : 0.6, 0.75);
        h.add(beard);
        if (long) {
          const tip = mesh(new THREE.ConeGeometry(0.085, 0.14, 14), fh, 0, cy - 0.3, 0.08);
          tip.rotation.x = Math.PI;
          h.add(tip);
        }
        // La boca asoma por encima de la barba
        mouth.position.z = 0.19;
      }
    }

    // Gafas
    if (L.glasses !== 'ninguna') {
      const frame = P.toon('#34303a');
      const lensMat = P.basic(GLASS, 0.25);
      const round = L.glasses === 'redondas';
      for (const s of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.048, 0.007, 6, round ? 20 : 4), frame, s * 0.074, cy + 0.003, 0.178);
        if (!round) {
          ring.rotation.z = Math.PI / 4;
          ring.scale.set(1.15, 0.9, 1);
        }
        h.add(ring);
        const lens = mesh(new THREE.CircleGeometry(0.046, round ? 20 : 4), lensMat, s * 0.074, cy + 0.003, 0.177);
        if (!round) lens.rotation.z = Math.PI / 4;
        h.add(lens);
      }
      h.add(mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), frame, 0, cy + 0.01, 0.185));
    }
  }

  private buildHair(L: Appearance, cy: number, R: number): void {
    const P = this.pal;
    const h = this.head;
    const hair = P.toon(L.hair.color);
    const cap = (theta: number, tilt: number, k = 1.06) => {
      const g = new THREE.SphereGeometry(R * k, 28, 14, 0, Math.PI * 2, 0, theta);
      const m = mesh(g, hair, 0, cy, 0);
      m.rotation.x = tilt;
      m.scale.set(1, 1, 0.97);
      h.add(m);
      return m;
    };
    if (L.headwear) {
      const tw = P.toon(L.headwear.color);
      const top = mesh(new THREE.SphereGeometry(R * 1.13, 28, 14, 0, Math.PI * 2, 0, 1.3), tw, 0, cy + 0.02, 0);
      top.rotation.x = -0.15;
      top.scale.y = 1.12;
      h.add(top);
      for (const [y, rx] of [[0.07, 0.3], [0.12, -0.2]] as const) {
        const ring = mesh(new THREE.TorusGeometry(R * 0.98, 0.022, 8, 28), P.toon(shade(L.headwear.color, -0.1)), 0, cy + y, -0.01);
        ring.rotation.x = Math.PI / 2 + rx;
        h.add(ring);
      }
      h.add(mesh(sphere(0.022, 10, 8), P.toon(L.outfit.accent), 0, cy + 0.12, R * 1.08));
      for (const s of [-1, 1]) h.add(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.04), hair, s * 0.17, cy - 0.02, 0.03));
      return;
    }
    switch (L.hair.style) {
      case 'corto':
        cap(1.2, -0.38);
        break;
      case 'entradas': {
        cap(1.25, -1.05, 1.04);
        break;
      }
      case 'ondulado': {
        cap(1.45, -0.32);
        for (const s of [-1, 1])
          for (const [y, z] of [[-0.02, -0.02], [-0.07, -0.06]] as const) {
            const w = mesh(sphere(0.06, 12, 10), hair, s * 0.17, cy + y, z);
            w.scale.set(0.8, 1, 1);
            h.add(w);
          }
        break;
      }
      case 'melena': {
        cap(1.4, -0.3);
        const back = mesh(new THREE.CylinderGeometry(R * 1.08, R * 1.12, 0.17, 24, 1, true, Math.PI * 0.3, Math.PI * 1.4), P.toon(L.hair.color, { side: THREE.DoubleSide }), 0, cy - 0.06, 0);
        h.add(back);
        break;
      }
      case 'mono':
        cap(1.35, -0.25);
        h.add(mesh(sphere(0.075, 16, 12), hair, 0, cy + 0.15, -0.1));
        break;
      case 'recogido': {
        cap(1.3, -0.2);
        const puff = mesh(sphere(R, 22, 14), hair, 0, cy + 0.1, -0.02);
        puff.scale.set(1.02, 0.55, 0.95);
        h.add(puff);
        h.add(mesh(sphere(0.07, 16, 12), hair, 0, cy + 0.22, -0.04));
        break;
      }
      case 'largo': {
        cap(1.3, -0.3);
        const back = mesh(sphere(R, 22, 14), hair, 0, cy - 0.12, -0.07);
        back.scale.set(1.12, 1.25, 0.7);
        h.add(back);
        break;
      }
      case 'empolvado': {
        cap(1.35, -0.25);
        const puff = mesh(sphere(R, 22, 14), hair, 0, cy + 0.13, -0.03);
        puff.scale.set(1.05, 0.8, 0.95);
        h.add(puff);
        for (const s of [-1, 1])
          for (const y of [0, -0.07, -0.14]) h.add(mesh(sphere(0.045, 12, 10), hair, s * 0.18, cy + y, -0.03));
        const ribbon = mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12), P.toon('#6f93cf'), 0, cy + 0.25, 0.08);
        ribbon.rotation.x = -0.5;
        h.add(ribbon);
        break;
      }
    }
  }

  /** Avanza las animaciones `dt` segundos. */
  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Reposo: balanceo suave y respiración.
    this.body.rotation.z = Math.sin(t * 1.1) * 0.025;
    this.body.position.y = 0;
    this.head.rotation.z = Math.sin(t * 0.9 + 1) * 0.04;
    for (const g of this.glow) g.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    this.accessory.rotation.y = Math.sin(t * 0.8) * 0.25;

    // Parpadeo
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.14;
      this.blinkIn = 2.2 + Math.random() * 3.5;
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.eyes.scale.y = this.blinkT > 0 ? 0.12 : 1;

    // Saludo
    let waveZ = -0.14;
    if (this.waveT > 0) {
      this.waveT = Math.max(0, this.waveT - dt);
      const p = 1 - this.waveT / 1.8;
      const up = Math.min(1, p * 5, (1 - p) * 5);
      waveZ = -0.14 + up * (-2.45 + Math.sin(t * 11) * 0.28);
    }
    // Saltito de celebración
    if (this.jumpT > 0) {
      this.jumpT = Math.max(0, this.jumpT - dt);
      const p = 1 - this.jumpT / 0.9;
      this.body.position.y = Math.sin(Math.PI * p) * 0.12;
      this.body.rotation.y = p * Math.PI * 2;
      waveZ = -0.14 - Math.sin(Math.PI * p) * 2.6;
    } else this.body.rotation.y = 0;
    this.waveArm.rotation.z = waveZ;

    // Mirar a un punto (con suavidad y sin torcer el cuello)
    let yaw = 0;
    let pitch = 0;
    if (this.look) {
      const local = this.head.parent!.worldToLocal(this.look.clone());
      local.sub(this.head.position);
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
      pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 0.17, Math.hypot(local.x, local.z)), -0.35, 0.35);
    }
    const k = 1 - Math.exp(-dt * 6);
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;
    this.head.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch;
  }

  wave(): void {
    this.waveT = 1.8;
  }

  celebrate(): void {
    this.jumpT = 0.9;
  }

  /** Gira la cabeza hacia un punto del mundo (p. ej. la cámara). `null`: al frente. */
  lookAt(point: THREE.Vector3 | null): void {
    this.look = point ? point.clone() : null;
  }

  dispose(): void {
    this.object.removeFromParent();
    disposeTree(this.object);
    this.pal.dispose();
  }
}

// --- Accesorios 3D (unos 0,12 de alto, centrados) ------------------------------

export function accessory3D(kind: Accessory, color: string, P: Palette, glow: THREE.Object3D[] = []): THREE.Group {
  const g = new THREE.Group();
  const c = P.toon(color);
  const dark = P.toon(shade(color, -0.25));
  const glass = P.basic(GLASS, 0.55);
  const halo = (r: number, y = 0) => {
    const m = mesh(sphere(r, 16, 12), P.basic(color, 0.25), 0, y, 0);
    glow.push(m);
    g.add(m);
  };
  switch (kind) {
    case 'matraz': {
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12), glass, 0, 0.045, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.07, 16), glass, 0, -0.01, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.062, 0.035, 16), c, 0, -0.03, 0));
      break;
    }
    case 'probeta': {
      halo(0.07, 0);
      const tube = new THREE.Group();
      tube.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 12), glass, 0, 0, 0));
      tube.add(mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 12), c, 0, -0.03, 0));
      tube.add(mesh(sphere(0.019, 12, 8), c, 0, -0.06, 0));
      tube.rotation.z = 0.25;
      g.add(tube);
      break;
    }
    case 'libro': {
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), c, 0, 0, 0));
      g.add(mesh(new THREE.BoxGeometry(0.094, 0.112, 0.032), P.toon('#ffffff'), 0.004, 0, 0));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.005), P.toon('#ffffff'), 0, 0.01, 0.017));
      g.rotation.z = 0.12;
      break;
    }
    case 'estrella': {
      halo(0.075);
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.026 : 0.06;
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1 });
      geo.center();
      g.add(mesh(geo, c));
      break;
    }
    case 'cristal': {
      const crystal = (s: number, x: number, rz: number, mat: THREE.Material) => {
        const m = new THREE.Group();
        m.add(mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 0.07 * s, 6), mat, 0, 0, 0));
        m.add(mesh(new THREE.ConeGeometry(0.025 * s, 0.035 * s, 6), mat, 0, 0.0525 * s, 0));
        m.position.x = x;
        m.rotation.z = rz;
        g.add(m);
      };
      crystal(1.3, 0, 0.15, c);
      crystal(0.8, 0.04, -0.4, dark);
      crystal(0.7, -0.04, 0.6, P.toon(shade(color, 0.3)));
      break;
    }
    case 'atomo': {
      g.add(mesh(sphere(0.022, 14, 10), P.toon('#ff4d5a')));
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const orbit = new THREE.Group();
        const ring = mesh(new THREE.TorusGeometry(0.065, 0.004, 6, 40), c);
        ring.scale.y = 0.38;
        orbit.add(ring, mesh(sphere(0.01, 8, 6), dark, 0.065, 0, 0));
        orbit.rotation.z = a;
        g.add(orbit);
      }
      break;
    }
    case 'led': {
      halo(0.07, 0.02);
      g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 16), P.toon(color, { emissive: new THREE.Color(color), emissiveIntensity: 0.6 }), 0, 0.005, 0));
      g.add(mesh(new THREE.SphereGeometry(0.028, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.toon(color, { emissive: new THREE.Color(color), emissiveIntensity: 0.6 }), 0, 0.022, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.01, 16), dark, 0, -0.016, 0));
      for (const s of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 4), P.toon('#9aa3b2'), s * 0.01, -0.045, 0));
      break;
    }
    case 'hoja': {
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.13, 5), dark));
      for (let i = 0; i < 6; i++) {
        for (const s of [-1, 1]) {
          const leaf = mesh(sphere(0.022, 8, 6), i % 2 ? c : dark, s * 0.018, -0.05 + i * 0.02, 0);
          leaf.scale.set(1, 0.3, 0.6);
          leaf.rotation.z = s * 0.5;
          g.add(leaf);
        }
      }
      break;
    }
    case 'flor': {
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.08, 5), P.toon('#3f8f3a'), 0, -0.04, 0));
      const head = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = mesh(sphere(0.024, 10, 8), c, Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0);
        p.scale.set(1, 1, 0.3);
        head.add(p);
      }
      head.add(mesh(sphere(0.012, 8, 6), P.toon('#b0174f'), 0, 0, 0.006));
      head.position.y = 0.01;
      g.add(head);
      break;
    }
    case 'alambique': {
      g.add(mesh(sphere(0.045, 16, 12), c, 0, -0.02, 0));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.05, 14), dark, 0, 0.04, 0));
      const spout = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), dark, 0.035, 0.05, 0);
      spout.rotation.z = -1.0;
      g.add(spout);
      break;
    }
    case 'adn': {
      const base = [P.toon('#ffc800'), P.toon('#2ec4a6')];
      for (let i = 0; i < 12; i++) {
        const y = -0.06 + i * 0.011;
        const a = i * 0.6;
        const x = Math.cos(a) * 0.03;
        const z = Math.sin(a) * 0.03;
        g.add(mesh(sphere(0.008, 8, 6), c, x, y, z));
        g.add(mesh(sphere(0.008, 8, 6), dark, -x, y, -z));
        if (i % 2 === 0) {
          const rung = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), base[(i / 2) % 2], 0, y, 0);
          rung.rotation.z = Math.PI / 2;
          rung.rotation.y = -a;
          g.add(rung);
        }
      }
      break;
    }
    case 'tierra': {
      g.add(mesh(sphere(0.05, 20, 14), c));
      for (const [x, y, z] of [[0.02, 0.02, 0.04], [-0.03, -0.01, 0.035], [0.0, -0.03, 0.04]] as const) {
        const land = mesh(sphere(0.02, 10, 8), P.toon('#58c322'), x, y, z);
        land.scale.set(1.2, 0.8, 0.5);
        g.add(land);
      }
      const ozone = mesh(sphere(0.064, 16, 12), P.basic('#9be7ff', 0.25));
      glow.push(ozone);
      g.add(ozone);
      break;
    }
    case 'cronometro': {
      const body = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), c);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const face = mesh(new THREE.CircleGeometry(0.04, 24), P.toon('#ffffff'), 0, 0, 0.0105);
      g.add(face);
      const hand = mesh(new THREE.BoxGeometry(0.004, 0.032, 0.002), P.basic(INK), 0.008, 0.012, 0.012);
      hand.rotation.z = -0.6;
      g.add(hand);
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), dark, 0, 0.058, 0));
      break;
    }
    case 'pluma': {
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.004), P.toon('#fffdf6'), -0.01, 0, 0));
      const feather = mesh(sphere(0.05, 10, 8), c, 0.035, 0.03, 0.01);
      feather.scale.set(0.25, 1, 0.08);
      feather.rotation.z = -0.4;
      g.add(feather);
      break;
    }
    case 'benceno': {
      const ring = mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 6), c);
      ring.rotation.z = Math.PI / 2;
      g.add(ring);
      const inner = mesh(new THREE.TorusGeometry(0.028, 0.005, 6, 20), dark);
      g.add(inner);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
        g.add(mesh(sphere(0.012, 8, 6), P.toon('#4a4f5a'), Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0));
      }
      break;
    }
    case 'fision': {
      halo(0.075);
      const red = P.toon('#ff4d5a');
      const grey = P.toon('#9aa3b2');
      for (const [cx, n] of [[-0.035, 7], [0.035, 6]] as const)
        for (let i = 0; i < n; i++) {
          const a = i * 2.4;
          const r = i ? 0.014 : 0;
          g.add(mesh(sphere(0.012, 8, 6), i % 2 ? red : grey, cx + Math.cos(a) * r, Math.sin(a) * r, Math.sin(i) * 0.008));
        }
      break;
    }
  }
  return g;
}
