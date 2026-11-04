import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ARProvider } from '@webar/ar-core';
import type { AppContext, Experience } from '../experience';
import { t } from '../i18n';
import { calm } from '../settings';
import { fmt, h, toggle } from './dom';
import { disposeTree, setSphere, spheres } from './meshes';
import { Stage } from './stage';
import { BOX, T_MAX, T_MIN, WaterSim, type WaterPhase } from './water-sim';

const MODEL_RADIUS = 0.1;
/** Velocidad de los botones calentar/enfriar (°C por segundo). */
const RAMP = 8;
const O_RADIUS = 0.62;
const H_RADIUS = 0.36;
const DOTS = 3;

/** Simulación del agua en 3D/RA: hielo ↔ líquido ↔ vapor con un deslizador de temperatura. */
export class WaterExperience implements Experience {
  readonly id = 'agua';
  readonly sim: WaterSim;
  /** +1 calentando, −1 enfriando, 0 quieto. */
  private ramp = 0;
  private showBonds = true;

  private readonly root = new THREE.Group();
  private readonly content = new THREE.Group();
  private stage?: Stage;
  private extent: number;

  private oMesh!: THREE.InstancedMesh;
  private hMesh!: THREE.InstancedMesh;
  private dotMesh!: THREE.InstancedMesh;
  private cube!: THREE.Mesh<RoundedBoxGeometry, THREE.MeshPhysicalMaterial>;
  private drop!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private dropBase!: Float32Array;
  private dropRadius = 0;
  private box!: THREE.Group;
  private boxMaterials: Array<THREE.Material & { opacity: number }> = [];

  private hud?: HTMLElement;
  private ui?: {
    title: HTMLElement;
    text: HTMLElement;
    temp: HTMLElement;
    slider: HTMLInputElement;
    heat: HTMLButtonElement;
    cool: HTMLButtonElement;
    count: HTMLElement;
    panel: HTMLElement;
  };
  private shownPhase?: WaterPhase;
  private uiTimer = 0;

  constructor(
    private readonly ctx: AppContext,
    temperature = -10,
  ) {
    this.sim = new WaterSim(THREE.MathUtils.clamp(temperature, T_MIN, T_MAX));
    this.extent = this.targetExtent();
    this.root.add(this.content);
    this.root.name = 'agua';
  }

  onStart(provider: ARProvider): void {
    this.build();
    this.stage = new Stage(this.ctx, provider, this.root, MODEL_RADIUS);
    this.renderHud();
    this.frame(0);
  }

  onSelect(): void {
    void this.stage?.select();
  }

  onEnd(): void {
    this.stage?.dispose();
    this.stage = undefined;
    disposeTree(this.content);
    this.hud?.remove();
    this.hud = this.ui = undefined;
  }

  /** Cambia la temperatura (el deslizador, los botones, la página de pruebas). */
  setTemperature(value: number): void {
    this.sim.temperature = THREE.MathUtils.clamp(Math.round(value * 10) / 10, T_MIN, T_MAX);
  }

  /** Empieza a calentar (+1), a enfriar (−1) o para (0). */
  setRamp(direction: number): void {
    this.ramp = direction;
    this.ui?.heat.setAttribute('aria-pressed', String(direction > 0));
    this.ui?.cool.setAttribute('aria-pressed', String(direction < 0));
    if (this.ui) {
      this.ui.heat.lastChild!.textContent = direction > 0 ? t('materia.w.parar') : t('materia.w.calentar');
      this.ui.cool.lastChild!.textContent = direction < 0 ? t('materia.w.parar') : t('materia.w.enfriar');
    }
  }

  frame(dt: number): void {
    this.stage?.frame();
    const sim = this.sim;
    // Calentar/enfriar con mesetas: mientras se funde (0 °C) o hierve (100 °C), la temperatura no cambia.
    if (this.ramp) {
      let T = sim.temperature + this.ramp * RAMP * dt;
      if (this.ramp > 0 && sim.temperature <= 0 && T > 0 && sim.melt < 1) T = 0;
      if (this.ramp > 0 && sim.temperature <= 100 && T > 100 && sim.liquidCount > 0) T = 100;
      // Al enfriar, meseta justo bajo 0 °C hasta que todo se ha congelado.
      if (this.ramp < 0 && T < 0 && sim.temperature > -0.2 && sim.melt > 0) T = -0.1;
      this.setTemperature(T);
      if (sim.temperature >= T_MAX || sim.temperature <= T_MIN) this.setRamp(0);
    }
    // Física a pasos pequeños (estable aunque el móvil vaya a tirones); en calma, a cámara lenta.
    const total = dt * (calm() ? 0.6 : 1);
    const steps = Math.max(1, Math.ceil(total / (1 / 30)));
    for (let i = 0; i < steps; i++) sim.step(total / steps);

    // Encuadre: se aleja cuando el gas ocupa más (la caja entera cabe en el modelo).
    const target = this.targetExtent();
    this.extent += (target - this.extent) * Math.min(1, dt * 1.5);
    this.content.scale.setScalar(MODEL_RADIUS / this.extent);
    this.updateMeshes(dt);
    this.uiTimer -= dt;
    if (this.uiTimer <= 0 || dt === 0) {
      this.uiTimer = 0.2;
      this.updateHud();
    }
  }

  private targetExtent(): number {
    const sim = this.sim;
    const near = sim.melt < 1 ? sim.iceHalf * 1.6 : sim.fullRadius + 3;
    let far = near;
    for (const m of sim.molecules) if (m.gas) far = Math.max(far, m.p.length() + 2);
    far = Math.min(far, BOX * Math.sqrt(3) + 1);
    // Con poco vapor no se aleja del todo (la gota seguiría siendo un punto): las que escapan salen de cuadro.
    return near + (far - near) * Math.sqrt(sim.gasCount / sim.count);
  }

  // --- 3D ---------------------------------------------------------------------------

  private build(): void {
    disposeTree(this.content);
    const n = this.sim.count;
    this.oMesh = spheres(n, new THREE.MeshStandardMaterial({ color: '#ff2a2a', roughness: 0.3, metalness: 0.05 }));
    this.hMesh = spheres(n * 2, new THREE.MeshStandardMaterial({ color: '#f4f6fb', roughness: 0.35 }), [14, 10]);
    this.dotMesh = spheres(n * 4 * DOTS, new THREE.MeshBasicMaterial({ color: '#7fd0ff' }), [6, 4]);

    const side = this.sim.iceHalf * 2;
    this.cube = new THREE.Mesh(
      new RoundedBoxGeometry(side, side, side, 5, side * 0.12),
      // Sin transmisión (que en un móvil cuesta otra pasada y emborrona lo de dentro):
      // transparente con brillo de barniz y reflejos del entorno, y se ve todo lo de dentro.
      new THREE.MeshPhysicalMaterial({
        color: '#c4ecff',
        emissive: new THREE.Color('#6cc8ff'),
        emissiveIntensity: 0.22,
        roughness: 0.08,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        sheen: 0.4,
        sheenColor: new THREE.Color('#ffffff'),
        transparent: true,
        depthWrite: false,
        envMapIntensity: 1.6,
      }),
    );
    this.cube.renderOrder = 2;

    const sphere = new THREE.SphereGeometry(1, 64, 40);
    this.dropBase = Float32Array.from(sphere.attributes.position.array as Float32Array);
    this.drop = new THREE.Mesh(
      sphere,
      new THREE.MeshPhysicalMaterial({
        color: '#4fb6ff',
        emissive: new THREE.Color('#1c8fe0'),
        emissiveIntensity: 0.18,
        roughness: 0.03,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        transparent: true,
        depthWrite: false,
        envMapIntensity: 1.8,
      }),
    );
    this.drop.renderOrder = 2;
    this.dropRadius = this.sim.dropRadius + 1;

    // La caja del gas: aristas y caras muy tenues.
    const boxGeometry = new THREE.BoxGeometry(BOX * 2, BOX * 2, BOX * 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry), new THREE.LineBasicMaterial({ color: '#cfe9ff', transparent: true }));
    const faces = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, side: THREE.BackSide, depthWrite: false }));
    this.boxMaterials = [edges.material, faces.material];
    this.box = new THREE.Group();
    this.box.add(faces, edges);

    this.content.add(this.oMesh, this.hMesh, this.dotMesh, this.cube, this.drop, this.box);
  }

  private readonly hs: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly dot = new THREE.Vector3();

  private updateMeshes(dt: number): void {
    const sim = this.sim;
    sim.molecules.forEach((m, i) => {
      setSphere(this.oMesh, i, m.p, O_RADIUS);
      sim.hydrogens(i, this.hs);
      setSphere(this.hMesh, i * 2, this.hs[0], H_RADIUS);
      setSphere(this.hMesh, i * 2 + 1, this.hs[1], H_RADIUS);
    });
    this.oMesh.instanceMatrix.needsUpdate = true;
    this.hMesh.instanceMatrix.needsUpdate = true;

    // Puentes de hidrógeno: puntos entre el H y el O aceptor.
    let count = 0;
    if (this.showBonds) {
      for (const [i, k, j] of sim.hydrogenBonds()) {
        if (count + DOTS > this.dotMesh.instanceMatrix.count) break;
        sim.hydrogens(i, this.hs);
        const o = sim.molecules[j].p;
        for (let d = 0; d < DOTS; d++) {
          this.dot.lerpVectors(this.hs[k], o, 0.25 + d * 0.25);
          setSphere(this.dotMesh, count++, this.dot, 0.11);
        }
      }
    }
    this.dotMesh.count = count;
    this.dotMesh.instanceMatrix.needsUpdate = true;

    // Cubo de hielo: se encoge y se desvanece al fundirse.
    const melt = sim.melt;
    this.cube.visible = melt < 1;
    this.cube.material.opacity = 0.36 * (1 - melt);
    this.cube.scale.setScalar(1 - 0.3 * melt);

    // Gota: aparece al fundirse y su tamaño sigue a las moléculas que quedan.
    const liquid = sim.liquidCount;
    this.dropRadius += (sim.dropRadius + 1 - this.dropRadius) * Math.min(1, dt * 3);
    this.drop.visible = melt > 0 && liquid > 0;
    if (this.drop.visible) {
      this.drop.material.opacity = 0.34 * Math.min(1, melt * 1.2) * Math.min(1, liquid / 3);
      this.drop.scale.setScalar(this.dropRadius * (0.75 + 0.25 * melt));
      this.wave(sim.time);
    }

    // Caja del gas: se ve cuando hay vapor.
    const gas = sim.gasCount / sim.count;
    const show = Math.min(1, gas * 3);
    this.box.visible = show > 0.01;
    this.boxMaterials[0].opacity = 0.5 * show;
    this.boxMaterials[1].opacity = 0.06 * show;
  }

  /** La superficie de la gota ondula (más cuanto más caliente; casi nada en modo calma). */
  private wave(time: number): void {
    const position = this.drop.geometry.attributes.position as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    const T = this.sim.temperature;
    const amp = (calm() ? 0.012 : 0.03) + (calm() ? 0 : THREE.MathUtils.clamp(T, 0, 100) / 100) * 0.03 + (T >= 100 && !calm() ? 0.04 : 0);
    const s = calm() ? 0.4 : 1;
    for (let i = 0; i < array.length; i += 3) {
      const x = this.dropBase[i];
      const y = this.dropBase[i + 1];
      const z = this.dropBase[i + 2];
      const r =
        1 +
        amp *
          (Math.sin(x * 3.1 + time * 1.9 * s) * Math.sin(y * 2.7 + time * 1.4 * s) +
            0.6 * Math.sin(z * 4.3 - time * 2.3 * s + x * 1.7) +
            0.35 * Math.sin((x + y + z) * 6 + time * 3.1 * s));
      array[i] = x * r;
      array[i + 1] = y * r;
      array[i + 2] = z * r;
    }
    position.needsUpdate = true;
    this.drop.geometry.computeVertexNormals();
  }

  // --- HUD ------------------------------------------------------------------------

  private renderHud(): void {
    const slider = h('input', {
      type: 'range',
      class: 'mat-temp',
      min: String(T_MIN),
      max: String(T_MAX),
      step: '1',
      value: String(this.sim.temperature),
      'aria-label': t('materia.w.temperatura'),
    });
    slider.addEventListener('input', () => {
      this.setRamp(0);
      this.setTemperature(Number(slider.value));
      this.updateHud();
    });
    const rampButton = (direction: number, cls: string, icon: string, key: string) => {
      const b = h('button', { type: 'button', class: `btn mat-peq ${cls}`, 'aria-pressed': 'false' }, h('span', { 'aria-hidden': 'true', text: icon }), h('span', { text: t(key) }));
      b.addEventListener('click', () => this.setRamp(this.ramp === direction ? 0 : direction));
      return b;
    };
    const cool = rampButton(-1, 'info', '❄', 'materia.w.enfriar');
    const heat = rampButton(1, 'mal', '🔥', 'materia.w.calentar');
    const title = h('h2', { class: 'mat-fase' });
    const temp = h('output', { class: 'mat-grados' });
    const text = h('p', { class: 'mat-explica' });
    const count = h('span', { class: 'chip mat-cuenta' });
    const panel = h(
      'div',
      { class: 'mat-panel flotante mat-panel-agua', role: 'group', 'aria-label': t('materia.w.titulo') },
      this.stage?.controls ?? null,
      h('div', { class: 'mat-cabeza', 'aria-live': 'polite' }, title, temp),
      text,
      h('div', { class: 'mat-termo' }, cool, slider, heat),
      h(
        'div',
        { class: 'mat-fila' },
        count,
        toggle(t('materia.w.puentes'), this.showBonds, (on) => (this.showBonds = on)),
      ),
    );
    this.ui = { title, text, temp, slider, heat, cool, count, panel };
    this.hud = h(
      'div',
      { class: 'mat-hud' },
      h(
        'div',
        { class: 'mat-hud-arriba' },
        h('button', { type: 'button', class: 'btn claro redondo', 'aria-label': t('materia.salir'), onclick: () => void this.ctx.exit() }, h('span', { 'aria-hidden': 'true', text: '✕' })),
        h('div', { class: 'mat-titulo flotante' }, h('strong', { text: t('materia.w.titulo') })),
      ),
      panel,
    );
    this.ctx.overlay.append(this.hud);
    this.updateHud();
  }

  private updateHud(): void {
    const ui = this.ui;
    if (!ui) return;
    const sim = this.sim;
    const phase = sim.phase();
    const T = Math.round(sim.temperature) || 0; // sin «−0»
    if (phase !== this.shownPhase) {
      this.shownPhase = phase;
      ui.title.textContent = t(`materia.w.fase.${phase}.titulo`);
      ui.text.textContent = t(`materia.w.fase.${phase}.texto`);
      ui.panel.dataset.fase = phase;
    }
    ui.temp.textContent = t('materia.w.temp', { t: fmt(T) });
    if (document.activeElement !== ui.slider || this.ramp) ui.slider.value = String(sim.temperature);
    ui.slider.style.setProperty('--p', String((sim.temperature - T_MIN) / (T_MAX - T_MIN)));
    const short = phase === 'solido' ? 'solido' : phase === 'liquido' ? 'liquido' : phase === 'gas' ? 'gas' : 'mezcla';
    ui.slider.setAttribute('aria-valuetext', t('materia.w.temp.texto', { t: fmt(T), fase: t(`materia.w.fase.${short}.corto`) }));
    ui.count.textContent = t('materia.w.cuenta', { l: sim.liquidCount, g: sim.gasCount });
  }
}
