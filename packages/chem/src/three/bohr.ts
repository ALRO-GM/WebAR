import * as THREE from 'three';
import { glowMaterial } from './glow';

export const ELECTRON_COLOR = 0x6fd8ff;

/**
 * Modelo de Bohr: los electrones como destellos que giran en órbitas circulares,
 * una por capa (n = 1, 2, 3…), con tantos electrones como tiene esa capa.
 * Las capas internas giran más deprisa, como en el modelo original.
 */
export class BohrModel {
  readonly object = new THREE.Group();

  private readonly shells: Array<{ pivot: THREE.Group; electrons: THREE.InstancedMesh; glows: THREE.Sprite[]; radius: number; speed: number; count: number }> = [];
  private readonly glowSize: number;
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  private readonly matrix = new THREE.Matrix4();
  private time = 0;

  constructor(shells: number[], innerRadius: number, outerRadius: number, electronRadius: number) {
    // Un núcleo blanco pequeño y un halo de luz a su alrededor que titila.
    const electronGeometry = new THREE.SphereGeometry(electronRadius * 0.7, 12, 8);
    const electronMaterial = new THREE.MeshBasicMaterial({ color: 0xeafaff });
    const glow = glowMaterial(ELECTRON_COLOR, 0.95);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.3, depthWrite: false });
    this.disposables.push(electronGeometry, electronMaterial, glow, ringMaterial);
    this.glowSize = electronRadius * 7;

    const n = shells.length;
    shells.forEach((count, i) => {
      const radius = n === 1 ? outerRadius : innerRadius + ((outerRadius - innerRadius) * i) / (n - 1);
      const pivot = new THREE.Group();
      // Cada capa en su propio plano, para que se vea en 3D desde cualquier lado.
      pivot.rotation.set(0.5 * Math.sin(i * 2.4 + 0.7), i * 1.1, 0.5 * Math.cos(i * 1.7 + 0.3));

      const ringGeometry = new THREE.TorusGeometry(radius, electronRadius * 0.18, 4, 96).rotateX(Math.PI / 2);
      this.disposables.push(ringGeometry);
      pivot.add(new THREE.Mesh(ringGeometry, ringMaterial));

      const electrons = new THREE.InstancedMesh(electronGeometry, electronMaterial, Math.max(count, 1));
      electrons.count = count;
      pivot.add(electrons);
      const glows = Array.from({ length: count }, () => {
        const sprite = new THREE.Sprite(glow);
        sprite.scale.setScalar(this.glowSize);
        pivot.add(sprite);
        return sprite;
      });
      this.object.add(pivot);
      this.shells.push({ pivot, electrons, glows, radius, speed: 2.4 / (i + 1) ** 1.5, count });
    });
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.shells.forEach(({ pivot, electrons, glows, radius, speed, count }, i) => {
      const offset = this.time * speed;
      for (let e = 0; e < count; e++) {
        const angle = offset + (e / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        this.matrix.makeTranslation(x, 0, z);
        electrons.setMatrixAt(e, this.matrix);
        // Titileo: cada electrón a su ritmo.
        const twinkle = 0.8 + 0.35 * Math.sin(this.time * (7 + ((e * 5 + i * 3) % 7)) + e * 2.1 + i);
        glows[e].position.set(x, 0, z);
        glows[e].scale.setScalar(this.glowSize * twinkle);
      }
      electrons.instanceMatrix.needsUpdate = true;
      // Las órbitas también rotan despacio (precesión), para dar volumen.
      pivot.rotation.y += dt * 0.15 * (i % 2 ? -1 : 1);
    });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
