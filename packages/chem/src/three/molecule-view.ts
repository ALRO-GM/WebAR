import * as THREE from 'three';
import { getElement } from '../elements';
import type { Species } from '../species';

export interface MoleculeViewOptions {
  /** Metros por ångström. Por defecto 0,012: el agua mide unos 2 cm. */
  metersPerAngstrom?: number;
}

/** Radio de la bola de cada átomo (Å): crece con el radio atómico, sin que el sodio tape al cloro. */
const ballRadius = (symbol: string) => 0.2 + getElement(symbol).radius / 450;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Una molécula de bolas y varillas con los colores habituales (CPK): enlaces
 * dobles y triples como varillas paralelas; los iónicos, como una unión
 * translúcida. Vibra un poco (los enlaces se estiran y encogen) y gira.
 */
export class MoleculeView {
  readonly object = new THREE.Group();
  /** Radio de la esfera que la envuelve, en metros. */
  readonly radius: number;

  private readonly inner = new THREE.Group();
  private readonly balls: THREE.Mesh[] = [];
  private readonly base: THREE.Vector3[];
  private readonly sticks: Array<{ mesh: THREE.Mesh; i: number; j: number; offset: number }> = [];
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  private time = Math.random() * 10;

  constructor(
    readonly species: Species,
    options: MoleculeViewOptions = {},
  ) {
    const k = options.metersPerAngstrom ?? 0.012;
    const center = new THREE.Vector3();
    for (const a of species.atoms) center.add(new THREE.Vector3(...a.position));
    center.divideScalar(species.atoms.length);
    this.base = species.atoms.map((a) => new THREE.Vector3(...a.position).sub(center).multiplyScalar(k));

    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.disposables.push(sphere, cylinder);
    const materials = new Map<string, THREE.Material>();
    let radius = 0;
    species.atoms.forEach((a, i) => {
      let material = materials.get(a.symbol);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color: getElement(a.symbol).color, roughness: 0.35, metalness: 0.05 });
        materials.set(a.symbol, material);
        this.disposables.push(material);
      }
      const ball = new THREE.Mesh(sphere, material);
      const r = ballRadius(a.symbol) * k;
      ball.scale.setScalar(r);
      ball.position.copy(this.base[i]);
      this.balls.push(ball);
      this.inner.add(ball);
      radius = Math.max(radius, this.base[i].length() + r);
    });
    this.radius = radius;

    const stickMaterial = new THREE.MeshStandardMaterial({ color: 0xd9dde6, roughness: 0.5 });
    const ionicMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
    this.disposables.push(stickMaterial, ionicMaterial);
    const stickRadius = 0.07 * k;
    for (const [i, j, order] of species.bonds) {
      const ionic = order < 1;
      const count = ionic ? 1 : Math.round(order === 1.5 ? 2 : order);
      for (let n = 0; n < count; n++) {
        const mesh = new THREE.Mesh(cylinder, ionic ? ionicMaterial : stickMaterial);
        const thin = count > 1 ? 0.7 : 1;
        mesh.scale.set(stickRadius * thin * (ionic ? 1.6 : 1), 1, stickRadius * thin * (ionic ? 1.6 : 1));
        this.sticks.push({ mesh, i, j, offset: (n - (count - 1) / 2) * stickRadius * 2.4 });
        this.inner.add(mesh);
      }
    }
    this.object.add(this.inner);
    this.object.name = `molecula:${species.id}`;
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    // Vibración: cada átomo se aleja y acerca del centro (como un enlace que se estira).
    this.balls.forEach((ball, i) => {
      const stretch = 1 + Math.sin(this.time * 7 + i * 1.7) * 0.035;
      ball.position.copy(this.base[i]).multiplyScalar(stretch);
    });
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (const { mesh, i, j, offset } of this.sticks) {
      a.copy(this.balls[i].position);
      b.copy(this.balls[j].position);
      dir.subVectors(b, a);
      const length = dir.length();
      dir.normalize();
      side.crossVectors(dir, Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : UP).normalize();
      mesh.position.addVectors(a, b).multiplyScalar(0.5).addScaledVector(side, offset);
      mesh.quaternion.setFromUnitVectors(UP, dir);
      mesh.scale.y = length;
    }
    this.inner.rotation.y += dt * 0.5;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
