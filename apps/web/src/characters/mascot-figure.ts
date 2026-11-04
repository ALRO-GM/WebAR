import * as THREE from 'three';
import { disposeTree, mesh, Palette, sphere } from './figure';

/**
 * Schrödingato en 3D: el gato asomando de su caja de cartón, para
 * ponerlo en RA o en la foto. Mismos colores que el SVG.
 *
 * ```ts
 * const gato = new MascotFigure()   // 0,2 m de alto
 * scene.add(gato.object)
 * gato.superpose()                  // copias translúcidas que parpadean
 * gato.collapse()                   // vuelven a ser un solo gato
 * // en cada frame: gato.update(dt)
 * ```
 * El origen está en el centro de la base de la caja; mira hacia +Z.
 */

export interface MascotFigureOptions {
  /** Alto en metros (caja + gato). Por defecto 0,2. */
  height?: number;
  scale?: number;
}

const C = {
  fur: '#b9a8ff',
  furDark: '#8f78f2',
  furLight: '#ece6ff',
  inner: '#ff9fbf',
  iris: '#2ec4a6',
  ink: '#262236',
  nose: '#ff7da6',
  box: '#e2ab6e',
  boxSide: '#c88a4c',
  boxIn: '#8d5c2e',
  flap: '#eebd85',
};

export class MascotFigure {
  readonly object = new THREE.Group();
  readonly height: number;

  private readonly pal = new Palette();
  private readonly ghostPal = new Palette();
  private readonly inner = new THREE.Group();
  private readonly cat = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly paw = new THREE.Group();
  private readonly ghosts: { obj: THREE.Group; mats: THREE.Material[]; dir: number; phase: number }[] = [];
  private t = 0;
  private blinkIn = 2;
  private blinkT = 0;
  private superT = 0; // >0: superpuesto (segundos que quedan)
  private ghostAmt = 0; // 0..1 cuánto se separan las copias
  private peekT = 0;
  private waveT = 0;
  private jumpT = 0;
  private look: THREE.Vector3 | null = null;
  private yaw = 0;

  constructor(opts: MascotFigureOptions = {}) {
    this.object.name = 'schrodingato';
    this.buildBox();
    this.buildCat(this.cat, this.pal, true);
    this.inner.add(this.cat);

    // Copias de la superposición: el mismo gato con materiales translúcidos.
    for (const [dir, hue] of [[-1, -0.08], [1, 0.12]] as const) {
      const g = new THREE.Group();
      const mats: THREE.Material[] = [];
      const ghostPal = new GhostPalette(this.ghostPal, hue, mats);
      this.buildCat(g, ghostPal as unknown as Palette, false);
      g.visible = false;
      this.inner.add(g);
      this.ghosts.push({ obj: g, mats, dir, phase: Math.random() * 6 });
    }

    this.object.add(this.inner);
    this.height = (opts.height ?? 0.2) * (opts.scale ?? 1);
    this.inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.inner);
    const k = this.height / (box.max.y - box.min.y);
    this.inner.scale.setScalar(k);
    this.inner.position.y = -box.min.y * k;
  }

  private buildBox(): void {
    const P = this.pal;
    const W = 0.56;
    const H = 0.34;
    const D = 0.44;
    const T = 0.014;
    const box = new THREE.Group();
    const front = P.toon(C.box);
    const side = P.toon(C.boxSide);
    const inside = P.toon(C.boxIn);
    box.add(mesh(new THREE.BoxGeometry(W, T, D), inside, 0, T / 2, 0));
    box.add(mesh(new THREE.BoxGeometry(W, H, T), front, 0, H / 2, D / 2));
    box.add(mesh(new THREE.BoxGeometry(W, H, T), side, 0, H / 2, -D / 2));
    for (const s of [-1, 1]) box.add(mesh(new THREE.BoxGeometry(T, H, D), side, (s * W) / 2, H / 2, 0));
    // Interior más oscuro (para que se vea hueca)
    const innerFace = mesh(new THREE.PlaneGeometry(W - T, H - T), inside, 0, H / 2, -D / 2 + T);
    box.add(innerFace);
    // Solapas abiertas
    const flapMat = P.toon(C.flap, { side: THREE.DoubleSide });
    // Cada solapa gira sobre su borde de arriba: [ancho, fondo, pivote x, z, hacia dónde sale (x, z), giro]
    const flap = (w: number, d: number, px: number, pz: number, ox: number, oz: number, angle: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, H, pz);
      if (oz) pivot.rotation.x = angle;
      else pivot.rotation.z = angle;
      pivot.add(mesh(new THREE.BoxGeometry(w, T, d), flapMat, (ox * w) / 2, 0, (oz * d) / 2));
      box.add(pivot);
    };
    flap(W, D * 0.42, 0, D / 2, 0, 1, 0.55); // delantera: abierta y algo caída
    flap(W, D * 0.42, 0, -D / 2, 0, -1, 1.15); // trasera: levantada
    flap(D * 0.42, D, -W / 2, 0, -1, 0, -1.0); // izquierda
    flap(D * 0.42, D, W / 2, 0, 1, 0, 0.5); // derecha
    // Cinta de embalar en la cara delantera (una caja normal, sin símbolos).
    const tape = mesh(new THREE.BoxGeometry(W * 0.22, H * 0.98, 0.004), P.toon('#f3d3a4'), 0, H / 2, D / 2 + T);
    box.add(tape);
    this.inner.add(box);
  }

  /** El gato (pivote en la caja para poder esconderse). */
  private buildCat(g: THREE.Group, P: Palette, main: boolean): void {
    const fur = P.toon(C.fur);
    const furLight = P.toon(C.furLight);
    const dark = P.toon(C.furDark);
    const body = mesh(sphere(0.17, 22, 16), fur, 0, 0.3, 0);
    body.scale.set(1.05, 0.9, 0.85);
    g.add(body);
    const belly = mesh(sphere(0.1, 16, 12), furLight, 0, 0.3, 0.1);
    belly.scale.set(1, 1, 0.6);
    g.add(belly);

    const head = main ? this.head : new THREE.Group();
    head.position.set(0, 0.47, 0.02);
    g.add(head);
    const skull = mesh(sphere(0.19, 26, 18), fur, 0, 0.06, 0);
    skull.scale.set(1.18, 0.95, 0.95);
    head.add(skull);
    const muzzle = mesh(sphere(0.08, 16, 12), furLight, 0, 0.0, 0.15);
    muzzle.scale.set(1.2, 0.7, 0.6);
    head.add(muzzle);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.07, 0.14, 4), fur, s * 0.13, 0.25, 0);
      ear.rotation.set(0, Math.PI / 4, s * -0.35);
      head.add(ear);
      const innerEar = mesh(new THREE.ConeGeometry(0.04, 0.09, 4), P.toon(C.inner), s * 0.128, 0.24, 0.035);
      innerEar.rotation.set(0.15, Math.PI / 4, s * -0.35);
      head.add(innerEar);
      // Rayas en las mejillas
      for (const y of [0.04, -0.01]) {
        const stripe = mesh(new THREE.CapsuleGeometry(0.008, 0.04, 2, 6), dark, s * 0.2, 0.05 + y, 0.08);
        stripe.rotation.z = Math.PI / 2;
        stripe.rotation.y = s * -0.6;
        head.add(stripe);
      }
    }
    for (const x of [-0.035, 0, 0.035]) {
      const stripe = mesh(new THREE.CapsuleGeometry(0.008, 0.05, 2, 6), dark, x, 0.21, 0.11);
      stripe.rotation.x = -0.6;
      head.add(stripe);
    }
    // Ojos redondos y oscuros con dos brillos: mirada dulce (como en el dibujo).
    const eyes = main ? this.eyes : new THREE.Group();
    eyes.position.set(0, 0.07, 0);
    for (const s of [-1, 1]) {
      const eye = mesh(sphere(0.038, 16, 12), P.basic(C.ink), s * 0.08, 0, 0.165);
      eye.scale.set(0.9, 1.05, 0.45);
      const shine = mesh(sphere(0.013, 8, 6), P.basic('#ffffff'), s * 0.08 + 0.012, 0.016, 0.183);
      const shine2 = mesh(sphere(0.006, 6, 5), P.basic('#ffffff'), s * 0.08 - 0.01, -0.014, 0.182);
      eyes.add(eye, shine, shine2);
      // Mejillas sonrosadas
      const cheek = mesh(sphere(0.026, 10, 8), P.basic('#ff9fbf'), s * 0.125, -0.045, 0.15);
      cheek.scale.set(1.2, 0.7, 0.3);
      head.add(cheek);
    }
    head.add(eyes);
    head.add(mesh(sphere(0.018, 10, 8), P.toon(C.nose), 0, 0.025, 0.2));
    // Sonrisa de gato (ω): dos arcos hacia arriba.
    for (const s of [-1, 1]) {
      const arc = mesh(new THREE.TorusGeometry(0.016, 0.0045, 6, 12, Math.PI), P.basic('#4b3f8f'), s * 0.016, -0.008, 0.198);
      arc.rotation.z = Math.PI;
      head.add(arc);
    }
    const whisker = P.basic('#4b3f8f');
    for (const s of [-1, 1])
      for (const a of [0.08, -0.08]) {
        const w = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 3), whisker, s * 0.17, 0.0 + a * 0.3, 0.14);
        w.rotation.z = Math.PI / 2 + a * s;
        head.add(w);
      }

    // Patitas apoyadas en el borde de la caja
    const paws = main ? this.paw : new THREE.Group();
    for (const s of [-1, 1]) {
      const p = mesh(sphere(0.05, 12, 10), fur, s * 0.09, 0.345, 0.2);
      p.scale.set(1.1, 0.7, 1.2);
      paws.add(p);
    }
    g.add(paws);

    // Cola ondulada (una función de onda)
    const tail = main ? this.tail : new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const p = i / 12;
      pts.push(new THREE.Vector3(0.05 * Math.sin(p * Math.PI * 3), p * 0.32, -0.02 * p));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.024, 8, false);
    tail.add(mesh(tube, fur));
    tail.add(mesh(sphere(0.026, 10, 8), dark, pts[12].x, pts[12].y, pts[12].z));
    tail.position.set(0.18, 0.3, -0.12);
    tail.rotation.z = -0.3;
    g.add(tail);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Reposo: respira, mueve la cola, parpadea.
    this.cat.position.y = Math.sin(t * 1.6) * 0.006;
    this.tail.rotation.z = -0.3 + Math.sin(t * 1.7) * 0.18;
    this.head.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.eyes.scale.y = this.blinkT > 0 ? 0.12 : 1;

    // Asomarse: se esconde en la caja y vuelve a salir.
    if (this.peekT > 0) {
      this.peekT = Math.max(0, this.peekT - dt);
      const p = 1 - this.peekT / 2.6;
      const down = p < 0.25 ? p / 0.25 : p < 0.55 ? 1 : p < 0.8 ? 1 - (p - 0.55) / 0.25 : 0;
      this.cat.position.y -= down * 0.42;
    }
    // Saltito
    if (this.jumpT > 0) {
      this.jumpT = Math.max(0, this.jumpT - dt);
      const p = 1 - this.jumpT / 1;
      this.cat.position.y += Math.sin(Math.PI * p) * 0.18;
      this.cat.rotation.y = p * Math.PI * 2;
    } else this.cat.rotation.y = 0;
    // Saludo con una pata
    const pawL = this.paw.children[0];
    if (this.waveT > 0) {
      this.waveT = Math.max(0, this.waveT - dt);
      const p = 1 - this.waveT / 1.6;
      const up = Math.min(1, p * 5, (1 - p) * 5);
      pawL.position.set(-0.09 - up * 0.12, 0.345 + up * 0.25, 0.2);
      pawL.rotation.z = up * Math.sin(t * 12) * 0.5;
    } else pawL.position.set(-0.09, 0.345, 0.2);

    // Mirar
    let yaw = 0;
    if (this.look) {
      const local = this.inner.worldToLocal(this.look.clone());
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
    }
    this.yaw += (yaw - this.yaw) * (1 - Math.exp(-dt * 6));
    this.head.rotation.y = this.yaw;

    // Superposición
    if (this.superT > 0) this.superT = Math.max(0, this.superT - dt);
    const target = this.superT > 0 ? 1 : 0;
    this.ghostAmt += (target - this.ghostAmt) * (1 - Math.exp(-dt * (target ? 4 : 10)));
    for (const g of this.ghosts) {
      g.obj.visible = this.ghostAmt > 0.02;
      if (!g.obj.visible) continue;
      g.obj.position.copy(this.cat.position);
      g.obj.position.x += g.dir * 0.2 * this.ghostAmt;
      g.obj.position.z -= 0.04 * this.ghostAmt;
      g.obj.rotation.z = -g.dir * 0.18 * this.ghostAmt;
      g.obj.rotation.y = this.cat.rotation.y;
      // Parpadeo «a saltos», como si el gato no se decidiera.
      const flicker = Math.sin(t * 9 + g.phase) > 0 ? 1 : 0.45;
      for (const m of g.mats) m.opacity = 0.4 * this.ghostAmt * flicker;
    }
  }

  /** Superposición: aparecen dos copias translúcidas que parpadean (`seconds`, o hasta `collapse()`). */
  superpose(seconds = 6): void {
    this.superT = seconds;
  }

  collapse(): void {
    this.superT = 0;
  }

  get superposed(): boolean {
    return this.superT > 0;
  }

  peek(): void {
    this.peekT = 2.6;
  }

  wave(): void {
    this.waveT = 1.6;
  }

  celebrate(): void {
    this.jumpT = 1;
  }

  lookAt(point: THREE.Vector3 | null): void {
    this.look = point ? point.clone() : null;
  }

  dispose(): void {
    this.object.removeFromParent();
    disposeTree(this.object);
    this.pal.dispose();
    this.ghostPal.dispose();
  }
}

/** Paleta que da materiales translúcidos (y algo cambiados de tono) para las copias. */
class GhostPalette {
  constructor(
    private readonly base: Palette,
    private readonly hue: number,
    private readonly mats: THREE.Material[],
  ) {}
  private shift(color: string): string {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL((hsl.h + this.hue + 1) % 1, hsl.s, hsl.l);
    return `#${c.getHexString()}`;
  }
  toon(color: string): THREE.Material {
    const m = this.base.basic(this.shift(color), 0.399 + this.hue * 0.001);
    if (!this.mats.includes(m)) this.mats.push(m);
    return m;
  }
  basic(color: string): THREE.Material {
    return this.toon(color);
  }
}
