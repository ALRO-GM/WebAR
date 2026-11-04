import * as THREE from 'three';

/**
 * Efectos de partículas para las reacciones: destello al formarse una
 * sustancia, fuego (exotérmica), hielo (endotérmica) y liberación de energía
 * (al descomponer). Todo con texturas de canvas y Points: ligero en móviles.
 */
export class Effects {
  private readonly active: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Destello y onda al aparecer una sustancia. `size` en metros. */
  flash(position: THREE.Vector3, size: number, color: THREE.ColorRepresentation = 0xfff2c0): void {
    this.add(new Flash(position, size, color));
  }

  /**
   * Llamas que suben: la reacción desprende calor. `up` orienta el efecto
   * (la «y» de la tarjeta); por defecto, la y de la escena.
   */
  fire(position: THREE.Vector3, size: number, up?: THREE.Quaternion, seconds = 3.5): void {
    this.add(new Particles(position, up, size, seconds, 'fire'));
  }

  /** Copos y cristales de hielo: la reacción absorbe calor. */
  ice(position: THREE.Vector3, size: number, up?: THREE.Quaternion, seconds = 3.5): void {
    this.add(new Particles(position, up, size, seconds, 'ice'));
    this.add(new Frost(position, up, size, seconds));
  }

  /** Estallido de chispas y onda: se libera la energía de los enlaces. */
  energy(position: THREE.Vector3, size: number): void {
    this.add(new Flash(position, size * 1.6, 0xbfe9ff));
    this.add(new Particles(position, undefined, size, 0.25, 'burst'));
  }

  update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (!this.active[i].update(dt, camera)) {
        this.active[i].dispose();
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const e of this.active) e.dispose();
    this.active.length = 0;
  }

  private add(effect: Effect): void {
    this.scene.add(effect.object);
    this.active.push(effect);
  }
}

interface Effect {
  object: THREE.Object3D;
  update(dt: number, camera: THREE.Camera): boolean;
  dispose(): void;
}

// --- Texturas ------------------------------------------------------------------

const textures = new Map<string, THREE.Texture>();
function texture(name: string, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  let t = textures.get(name);
  if (!t) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    draw(canvas.getContext('2d')!, 128);
    t = new THREE.CanvasTexture(canvas);
    textures.set(name, t);
  }
  return t;
}

export const glowTexture = () =>
  texture('glow', (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });

export const ringTexture = () =>
  texture('ring', (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });

const snowflakeTexture = () =>
  texture('copo', (g, s) => {
    g.translate(s / 2, s / 2);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineCap = 'round';
    g.lineWidth = s * 0.05;
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -s * 0.42);
      g.moveTo(0, -s * 0.24);
      g.lineTo(-s * 0.1, -s * 0.34);
      g.moveTo(0, -s * 0.24);
      g.lineTo(s * 0.1, -s * 0.34);
      g.stroke();
    }
  });

// --- Destello -------------------------------------------------------------------

class Flash implements Effect {
  readonly object = new THREE.Group();
  private readonly glow: THREE.Sprite;
  private readonly ring: THREE.Sprite;
  private t = 0;

  constructor(position: THREE.Vector3, private readonly size: number, color: THREE.ColorRepresentation) {
    this.object.position.copy(position);
    const material = (map: THREE.Texture) =>
      new THREE.SpriteMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    this.glow = new THREE.Sprite(material(glowTexture()));
    this.ring = new THREE.Sprite(material(ringTexture()));
    this.object.add(this.glow, this.ring);
  }

  update(dt: number): boolean {
    this.t += dt;
    const k = this.t / 0.7;
    this.glow.scale.setScalar(this.size * (0.6 + 2.2 * Math.min(this.t / 0.15, 1)));
    this.glow.material.opacity = Math.max(0, 1 - k * 1.3);
    this.ring.scale.setScalar(this.size * (0.5 + k * 4));
    this.ring.material.opacity = Math.max(0, 1 - k);
    return k < 1;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.glow.material.dispose();
    this.ring.material.dispose();
  }
}

// --- Partículas -------------------------------------------------------------------

type Kind = 'fire' | 'ice' | 'burst';

class Particles implements Effect {
  readonly object: THREE.Points;
  private readonly count: number;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly colors: Float32Array;
  private t = 0;
  /** Las partículas van en coordenadas locales: el objeto lleva la posición y la orientación. */
  private readonly origin = new THREE.Vector3();

  constructor(at: THREE.Vector3, up: THREE.Quaternion | undefined, private readonly size: number, private readonly emitFor: number, private readonly kind: Kind) {
    this.count = kind === 'burst' ? 90 : 110;
    this.position = new Float32Array(this.count * 3);
    this.velocity = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count).fill(-1);
    this.maxLife = new Float32Array(this.count);
    this.colors = new Float32Array(this.count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.object = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: size * (kind === 'ice' ? 0.28 : 0.22),
        map: kind === 'ice' ? snowflakeTexture() : glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.object.frustumCulled = false;
    this.object.position.copy(at);
    if (up) this.object.quaternion.copy(up);
    if (kind === 'burst') for (let i = 0; i < this.count; i++) this.spawn(i);
  }

  private spawn(i: number): void {
    const s = this.size;
    const p = i * 3;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * s * 0.55;
    if (this.kind === 'burst') {
      const dir = new THREE.Vector3().randomDirection();
      const speed = s * (2.5 + Math.random() * 3);
      this.position.set([this.origin.x, this.origin.y, this.origin.z], p);
      this.velocity.set([dir.x * speed, dir.y * speed, dir.z * speed], p);
      this.maxLife[i] = 0.5 + Math.random() * 0.5;
    } else if (this.kind === 'fire') {
      this.position.set([this.origin.x + Math.cos(angle) * r, this.origin.y - s * 0.3, this.origin.z + Math.sin(angle) * r], p);
      this.velocity.set([(Math.random() - 0.5) * s * 0.3, s * (1.2 + Math.random() * 1.2), (Math.random() - 0.5) * s * 0.3], p);
      this.maxLife[i] = 0.5 + Math.random() * 0.6;
    } else {
      this.position.set([this.origin.x + Math.cos(angle) * r * 1.4, this.origin.y + s * (0.2 + Math.random() * 0.6), this.origin.z + Math.sin(angle) * r * 1.4], p);
      this.velocity.set([Math.cos(angle + 1.6) * s * 0.25, -s * (0.15 + Math.random() * 0.25), Math.sin(angle + 1.6) * s * 0.25], p);
      this.maxLife[i] = 1.2 + Math.random() * 1.2;
    }
    this.life[i] = 0;
  }

  update(dt: number): boolean {
    this.t += dt;
    let alive = false;
    const emitting = this.t < this.emitFor;
    const spawnRate = this.count / 0.9;
    let toSpawn = emitting && this.kind !== 'burst' ? Math.ceil(spawnRate * dt) : 0;
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      if (this.life[i] < 0) {
        if (toSpawn-- > 0) this.spawn(i);
        else continue;
      }
      this.life[i] += dt;
      const k = this.life[i] / this.maxLife[i];
      if (k >= 1) {
        this.life[i] = -1;
        this.colors.set([0, 0, 0], p);
        continue;
      }
      alive = true;
      if (this.kind === 'burst') for (let c = 0; c < 3; c++) this.velocity[p + c] *= 1 - dt * 3;
      for (let c = 0; c < 3; c++) this.position[p + c] += this.velocity[p + c] * dt;
      // Color según la edad (con mezcla aditiva, oscurecer = desvanecer).
      const fade = 1 - k;
      if (this.kind === 'fire') this.colors.set([fade, fade * (0.85 - k * 0.6), fade * Math.max(0, 0.4 - k)], p);
      else if (this.kind === 'ice') this.colors.set([fade * 0.75, fade * 0.9, fade], p);
      else this.colors.set([fade, fade * 0.95, fade * 0.7 + 0.3 * fade], p);
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.color.needsUpdate = true;
    return alive || emitting;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

/** Escarcha: un disco azul helado que aparece y se va bajo la sustancia. */
class Frost implements Effect {
  readonly object: THREE.Mesh;
  private t = 0;
  constructor(position: THREE.Vector3, up: THREE.Quaternion | undefined, size: number, private readonly seconds: number) {
    this.object = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.9, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x9fdcff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.object.geometry.translate(0, -size * 0.45, 0);
    this.object.position.copy(position);
    if (up) this.object.quaternion.copy(up);
  }
  update(dt: number): boolean {
    this.t += dt;
    const k = this.t / this.seconds;
    (this.object.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.8;
    return k < 1;
  }
  dispose(): void {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
