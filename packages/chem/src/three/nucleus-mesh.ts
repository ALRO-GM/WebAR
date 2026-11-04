import * as THREE from 'three';
import { nucleusLayout } from '../nucleus';

export const PROTON_COLOR = 0xff4d5a;
export const NEUTRON_COLOR = 0xc3cad6;

/**
 * El núcleo: una esfera por nucleón (InstancedMesh, dos llamadas de dibujo
 * aunque haya 294 nucleones) que vibran un poco, como una gota.
 */
export class NucleusMesh {
  readonly object = new THREE.Group();
  /** Radio del núcleo, en metros. */
  readonly radius: number;

  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly base: Float32Array;
  private readonly owner: Uint16Array; // índice dentro de su InstancedMesh
  private readonly kind: Uint8Array;
  private readonly phase: Float32Array;
  private readonly amplitude: number;
  private readonly matrix = new THREE.Matrix4();
  private time = 0;

  constructor(protons: number, neutrons: number, nucleonRadius: number) {
    const layout = nucleusLayout(protons, neutrons);
    this.radius = layout.radius * nucleonRadius;
    this.amplitude = nucleonRadius * 0.12;
    const total = protons + neutrons;
    this.base = layout.positions.map((v) => v * nucleonRadius);
    this.kind = layout.isProton;
    this.owner = new Uint16Array(total);
    this.phase = Float32Array.from({ length: total * 3 }, () => Math.random() * Math.PI * 2);

    const geometry = new THREE.SphereGeometry(nucleonRadius, total > 120 ? 10 : 16, total > 120 ? 8 : 12);
    const counts = [neutrons, protons];
    [NEUTRON_COLOR, PROTON_COLOR].forEach((color, k) => {
      if (!counts[k]) return;
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 }),
        counts[k],
      );
      mesh.name = k ? 'protones' : 'neutrones';
      this.meshes[k] = mesh;
      this.object.add(mesh);
    });
    const next = [0, 0];
    for (let i = 0; i < total; i++) this.owner[i] = next[this.kind[i]]++;
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time * 9;
    for (let i = 0; i < this.kind.length; i++) {
      const p = i * 3;
      this.matrix.makeTranslation(
        this.base[p] + Math.sin(t + this.phase[p]) * this.amplitude,
        this.base[p + 1] + Math.sin(t * 1.13 + this.phase[p + 1]) * this.amplitude,
        this.base[p + 2] + Math.sin(t * 0.91 + this.phase[p + 2]) * this.amplitude,
      );
      this.meshes[this.kind[i]].setMatrixAt(this.owner[i], this.matrix);
    }
    for (const mesh of this.meshes) if (mesh) mesh.instanceMatrix.needsUpdate = true;
    this.object.rotation.y += dt * 0.3;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
