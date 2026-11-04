import * as THREE from 'three';
import { CARD } from './deck';

/** El reflejo del entorno (la escena ya trae uno muy luminoso): bajo, para que la madera no se queme. */
const ENV = 0.15;

/**
 * El entorno de la mesa virtual: mesa de madera clara, un tapete de fieltro,
 * una habitación difuminada alrededor, luz cálida y dos adornos low-poly
 * (una planta y un flexo). Todo generado por código (sin descargas) y barato:
 * texturas de lienzo, sombras falsas en vez de mapas de sombras y pocas caras.
 */
export class TableScene {
  readonly object = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private previousFog: THREE.Scene['fog'] = null;

  constructor(private readonly scene: THREE.Scene) {
    this.object.name = 'mesa';
    this.build();
  }

  /** Se mete en la escena (con su niebla, que funde el fondo de la mesa con la pared). */
  attach(): void {
    this.previousFog = this.scene.fog;
    this.scene.fog = new THREE.Fog(0xe9dccb, 1.4, 4.2);
    this.scene.add(this.object);
  }

  detach(): void {
    this.object.removeFromParent();
    this.scene.fog = this.previousFog;
  }

  dispose(): void {
    this.detach();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }

  private keep<T extends { dispose(): void }>(thing: T): T {
    this.disposables.push(thing);
    return thing;
  }

  private build(): void {
    const g = this.object;

    // Habitación: una esfera grande pintada por dentro (pared cálida, ventana
    // luminosa y manchas desenfocadas de muebles). Gira con la cámara, así que
    // se nota que hay espacio alrededor.
    const room = new THREE.Mesh(
      this.keep(new THREE.SphereGeometry(5, 32, 16)),
      this.keep(new THREE.MeshBasicMaterial({ map: this.keep(roomTexture()), side: THREE.BackSide, fog: false, depthWrite: false })),
    );
    room.renderOrder = -10;
    g.add(room);

    // Mesa: tablero de madera clara con canto.
    const wood = this.keep(woodTexture());
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
    wood.repeat.set(2, 1.3);
    const woodMaterial = this.keep(new THREE.MeshStandardMaterial({ map: wood, color: 0xc2b6a6, roughness: 0.62, metalness: 0, envMapIntensity: ENV }));
    const top = new THREE.Mesh(this.keep(new THREE.BoxGeometry(2, 0.03, 1.3)), woodMaterial);
    top.position.y = -0.0012 - 0.015;
    g.add(top);

    // Tapete de fieltro con pespunte, bajo las tarjetas.
    const felt = new THREE.Mesh(
      this.keep(roundedPlane(0.7, 0.46, 0.035)),
      this.keep(new THREE.MeshStandardMaterial({ map: this.keep(feltTexture()), color: 0xa9aaa6, roughness: 1, metalness: 0, envMapIntensity: ENV })),
    );
    felt.position.y = -0.0009;
    g.add(felt);
    const feltShadow = this.blob(0.82, 0.58, 0.28, true);
    feltShadow.position.y = -0.00115;
    g.add(feltShadow);

    // Luz: cielo cálido y suelo de madera, y la del flexo.
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0xa8825a, 0.15);
    g.add(hemi);
    const warm = new THREE.DirectionalLight(0xffc98a, 0.25);
    warm.position.set(0.6, 1.1, -0.4);
    g.add(warm);

    const plant = this.plant();
    plant.position.set(-0.33, -0.0012, -0.36);
    g.add(plant);
    const lamp = this.lamp();
    lamp.position.set(0.36, -0.0012, -0.37);
    lamp.rotation.y = -0.6;
    g.add(lamp);
    const books = this.books();
    books.position.set(0.47, -0.0012, 0.12);
    books.rotation.y = 0.35;
    g.add(books);
  }

  /** Sombra suave (falsa) en el suelo: un rectángulo o un círculo difuminado. */
  blob(w: number, h: number, opacity: number, rect = false): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.keep(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2)),
      this.keep(new THREE.MeshBasicMaterial({ map: rect ? cardShadowTexture() : roundShadowTexture(), transparent: true, opacity, depthWrite: false })),
    );
    mesh.renderOrder = -1;
    return mesh;
  }

  private flat(color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    return this.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, envMapIntensity: ENV, ...extra }));
  }

  private plant(): THREE.Group {
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.055, 0.04, 0.09, 8)), this.flat(0xd9774f));
    pot.position.y = 0.045;
    const rim = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 8)), this.flat(0xe68a63));
    rim.position.y = 0.088;
    const soil = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.05, 0.05, 0.005, 8)), this.flat(0x5b3f2c));
    soil.position.y = 0.094;
    plant.add(pot, rim, soil);
    const leafGeometry = this.keep(new THREE.IcosahedronGeometry(0.045, 0));
    const greens = [0x5fae5a, 0x77c26b, 0x4f9a50, 0x8ad07a];
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(leafGeometry, this.flat(greens[i % greens.length]));
      const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.4;
      const r = i < 6 ? 0.04 : 0.012;
      leaf.position.set(Math.cos(a) * r, 0.13 + (i % 3) * 0.035 + (i >= 6 ? 0.05 : 0), Math.sin(a) * r);
      leaf.scale.set(0.7, 1.5, 0.45);
      leaf.rotation.set(Math.cos(a) * 0.5, -a, Math.sin(a) * 0.5);
      plant.add(leaf);
    }
    const shadow = this.blob(0.2, 0.2, 0.45);
    shadow.position.set(0.012, 0.0004, 0.012);
    plant.add(shadow);
    return plant;
  }

  /** Flexo: pie, dos brazos con codo y pantalla mirando hacia la mesa. */
  private lamp(): THREE.Group {
    const lamp = new THREE.Group();
    const metal = this.flat(0xffc84a, { roughness: 0.45, metalness: 0.1 });
    const dark = this.flat(0x3c3c46);
    const base = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.045, 0.052, 0.014, 14)), metal);
    base.position.y = 0.007;
    lamp.add(base);
    const foot = new THREE.Vector3(0, 0.014, 0);
    const elbow = new THREE.Vector3(0, 0.17, -0.035);
    const head = new THREE.Vector3(0, 0.235, 0.085);
    const rod = (from: THREE.Vector3, to: THREE.Vector3) => {
      const length = from.distanceTo(to);
      const mesh = new THREE.Mesh(this.keep(new THREE.CylinderGeometry(0.0055, 0.0055, length, 6)), metal);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      return mesh;
    };
    lamp.add(rod(foot, elbow), rod(elbow, head));
    for (const at of [foot, elbow, head]) {
      const joint = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.009, 8, 6)), dark);
      joint.position.copy(at);
      lamp.add(joint);
    }
    // Pantalla: un cono abierto con la boca hacia abajo y hacia delante.
    const down = new THREE.Vector3(0, -1, 0.75).normalize();
    const shade = new THREE.Mesh(
      this.keep(new THREE.ConeGeometry(0.042, 0.065, 12, 1, true)),
      this.keep(new THREE.MeshStandardMaterial({ color: 0xffc84a, roughness: 0.5, flatShading: true, side: THREE.DoubleSide, envMapIntensity: ENV })),
    );
    // El cono apunta su vértice hacia +Y: se gira para que la boca mire hacia `down`.
    shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
    shade.position.copy(head).addScaledVector(down, 0.022);
    lamp.add(shade);
    const bulb = new THREE.Mesh(this.keep(new THREE.SphereGeometry(0.014, 10, 8)), this.keep(new THREE.MeshBasicMaterial({ color: 0xfff4d6 })));
    bulb.position.copy(head).addScaledVector(down, 0.045);
    lamp.add(bulb);
    const light = new THREE.PointLight(0xffc98a, 0.35, 0.9, 1.5);
    light.position.copy(bulb.position);
    lamp.add(light);
    const shadow = this.blob(0.15, 0.15, 0.4);
    shadow.position.set(0.008, 0.0004, 0.01);
    lamp.add(shadow);
    return lamp;
  }

  private books(): THREE.Group {
    const books = new THREE.Group();
    const colors = [0x7c5cff, 0x2ec4a6, 0xff9600];
    let y = 0;
    colors.forEach((color, i) => {
      const h = 0.02 + i * 0.003;
      const book = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.15 - i * 0.012, h, 0.21 - i * 0.015)), this.flat(color, { roughness: 0.7 }));
      book.position.y = y + h / 2;
      book.rotation.y = (i - 1) * 0.12;
      const pages = new THREE.Mesh(this.keep(new THREE.BoxGeometry(0.15 - i * 0.012 - 0.004, h * 0.7, 0.21 - i * 0.015 + 0.002)), this.flat(0xfff8ec));
      pages.position.copy(book.position).add(new THREE.Vector3(0.003, 0, 0));
      pages.rotation.y = book.rotation.y;
      books.add(book, pages);
      y += h;
    });
    const shadow = this.blob(0.24, 0.3, 0.35, true);
    shadow.position.set(0.01, 0.0004, 0.01);
    books.add(shadow);
    return books;
  }
}

// --- Texturas generadas --------------------------------------------------------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Ruido pseudoaleatorio repetible (la mesa sale igual cada vez). */
function random(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Tablones de arce claro con veta (líneas onduladas) y juntas finas. */
function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rnd = random(7);
  const planks = 6;
  const ph = c.height / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    const tone = 0.92 + rnd() * 0.12;
    g.fillStyle = `rgb(${Math.round(242 * tone)}, ${Math.round(220 * tone)}, ${Math.round(188 * tone)})`;
    g.fillRect(0, y0, c.width, ph);
    // Veta: muchas líneas onduladas de distinto tono.
    for (let k = 0; k < 38; k++) {
      const y = y0 + rnd() * ph;
      const amp = 2 + rnd() * 6;
      const freq = 0.004 + rnd() * 0.01;
      const phase = rnd() * 10;
      g.strokeStyle = rnd() < 0.5 ? `rgba(150, 100, 55, ${0.06 + rnd() * 0.1})` : `rgba(255, 240, 215, ${0.08 + rnd() * 0.1})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      for (let x = 0; x <= c.width; x += 16) {
        const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
    // Algún nudo suave.
    if (rnd() < 0.5) {
      const x = rnd() * c.width;
      const y = y0 + ph * (0.3 + rnd() * 0.4);
      const knot = g.createRadialGradient(x, y, 0, x, y, 18);
      knot.addColorStop(0, 'rgba(130, 85, 45, 0.35)');
      knot.addColorStop(1, 'rgba(130, 85, 45, 0)');
      g.fillStyle = knot;
      g.fillRect(x - 30, y - 20, 60, 40);
    }
    // Junta entre tablones y testas escalonadas.
    g.fillStyle = 'rgba(110, 72, 40, 0.35)';
    g.fillRect(0, y0, c.width, 2);
    const cut = (p * 397) % c.width;
    g.fillRect(cut, y0, 2, ph);
  }
  return texture(c);
}

/** Fieltro verde salvia con motas y un pespunte claro cerca del borde. */
function feltTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 672);
  g.fillStyle = '#86b99a';
  g.fillRect(0, 0, c.width, c.height);
  const rnd = random(3);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,70,50,0.06)';
    g.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // Centro un poco más claro: como si la luz cayera ahí.
  const light = g.createRadialGradient(c.width / 2, c.height / 2, 50, c.width / 2, c.height / 2, c.width * 0.6);
  light.addColorStop(0, 'rgba(255,250,235,0.14)');
  light.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = light;
  g.fillRect(0, 0, c.width, c.height);
  g.setLineDash([16, 12]);
  g.strokeStyle = 'rgba(255, 252, 240, 0.65)';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(28, 28, c.width - 56, c.height - 56, 40);
  g.stroke();
  return texture(c);
}

/** Pared crema arriba, suelo cálido abajo y manchas desenfocadas (ventana, muebles). */
function roomTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#f6efe4');
  sky.addColorStop(0.45, '#f1e4d1');
  sky.addColorStop(0.52, '#dcc6aa');
  sky.addColorStop(1, '#b9946d');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);
  const blob = (x: number, y: number, rx: number, ry: number, color: string) => {
    for (const dx of [-c.width, 0, c.width]) {
      g.save();
      g.translate(x + dx, y);
      g.scale(1, ry / rx);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grad;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    }
  };
  // La cámara mira hacia abajo: lo que se ve está cerca del horizonte (y = 256).
  blob(250, 200, 150, 120, 'rgba(255, 255, 250, 0.95)'); // ventana
  blob(250, 210, 280, 170, 'rgba(255, 246, 225, 0.55)');
  blob(540, 250, 120, 70, 'rgba(124, 92, 255, 0.22)'); // estantería con libros
  blob(620, 235, 90, 60, 'rgba(46, 196, 166, 0.2)');
  blob(820, 270, 170, 60, 'rgba(255, 150, 0, 0.2)'); // sofá
  blob(70, 250, 80, 90, 'rgba(95, 174, 90, 0.28)'); // planta grande
  blob(960, 240, 60, 90, 'rgba(255, 75, 75, 0.12)'); // cojín
  blob(512, 300, 520, 34, 'rgba(120, 80, 45, 0.22)'); // rodapié y sombra del suelo
  return texture(c);
}

let cardShadow: THREE.CanvasTexture | undefined;
/** Sombra de un rectángulo de esquinas redondeadas, muy difuminada. */
export function cardShadowTexture(): THREE.CanvasTexture {
  if (cardShadow) return cardShadow;
  const [c, g] = canvas(128, 160);
  g.shadowColor = 'rgba(40, 25, 10, 1)';
  g.shadowBlur = 14;
  g.fillStyle = 'rgba(40, 25, 10, 1)';
  g.beginPath();
  g.roundRect(22, 22, c.width - 44, c.height - 44, 10);
  g.fill();
  return (cardShadow = texture(c));
}

let roundShadow: THREE.CanvasTexture | undefined;
export function roundShadowTexture(): THREE.CanvasTexture {
  if (roundShadow) return roundShadow;
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40, 25, 10, 0.75)');
  grad.addColorStop(0.45, 'rgba(40, 25, 10, 0.35)');
  grad.addColorStop(1, 'rgba(40, 25, 10, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return (roundShadow = texture(c));
}

/** Un plano horizontal con esquinas redondeadas (UV de 0 a 1). */
function roundedPlane(w: number, h: number, r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ShapeGeometry(shape, 6);
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geometry.rotateX(-Math.PI / 2);
}

/** Medidas de la sombra de una tarjeta (un poco más grande que ella). */
export const CARD_SHADOW = { width: (CARD.width * 128) / 84, height: (CARD.height * 160) / 116 };
