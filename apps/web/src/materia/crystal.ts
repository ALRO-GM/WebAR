import * as THREE from 'three';
import type { ARProvider } from '@webar/ar-core';
import { getElement } from '@webar/chem';
import type { AppContext, Experience } from '../experience';
import { t } from '../i18n';
import { elementName } from '../i18n/content';
import { calm } from '../settings';
import { h, segmented, toggle } from './dom';
import { STRUCTURES, buildLattice, latticeIce, unitCellEdges, type Lattice, type StructureDef, type StructureId, type Vec3 } from './lattices';
import { disposeTree, ease, setSphere, setStick, spheres, sticks } from './meshes';
import { Stage } from './stage';

/** Radio del modelo (m): unos 20 cm de lado sobre la mesa. */
const MODEL_RADIUS = 0.1;
/** Colores de las capas A, B y C (los del tema: violeta, menta, naranja). */
const LAYER_COLORS = ['#7c5cff', '#2ec4a6', '#ff9600'];
const CELL_COLOR = '#ffc800';
const STICK_COLOR = '#d5d9e2';
const HBOND_COLOR = '#8fd3ff';

export interface CrystalOptions {
  metal?: string;
  cells?: 1 | 2 | 3;
  compact?: boolean;
}

interface Atom {
  el: string;
  /** Posición final en la escena (m, ya con y hacia arriba). */
  target: THREE.Vector3;
  /** Desde dónde llega. */
  from: THREE.Vector3;
  order: number;
  layer: number;
  /** Índice del O al que pertenece (los H del hielo llegan con su molécula). */
  owner: number;
}

/** Celda de cristal en 3D/RA: crece átomo a átomo, con celda unidad, capas y dos modelos. */
export class CrystalExperience implements Experience {
  readonly id: string;
  private readonly def: StructureDef;
  private cells: number;
  private compact: boolean;
  private metal: string;
  private showCell = true;
  private layers = false;
  private spin = !calm();

  private readonly root = new THREE.Group();
  private readonly model = new THREE.Group();
  private stage?: Stage;
  private hud?: HTMLElement;
  private status?: HTMLElement;
  private legend?: HTMLElement;

  private lattice?: Lattice;
  private atoms: Atom[] = [];
  private bonds: Array<[number, number]> = [];
  private hbonds: Array<[number, number]> = [];
  private k = 0.01;
  private atomMesh?: THREE.InstancedMesh;
  private stickMesh?: THREE.InstancedMesh;
  private dotMesh?: THREE.InstancedMesh;
  private edgeMesh?: THREE.InstancedMesh;
  private growth = 0;
  private growthEnd = 0;
  private settled = false;
  private readonly positions: THREE.Vector3[] = [];
  private readonly progress: number[] = [];

  constructor(
    private readonly ctx: AppContext,
    structure: StructureId,
    options: CrystalOptions = {},
  ) {
    this.def = STRUCTURES[structure];
    this.id = `cristal-${structure}`;
    this.cells = options.cells ?? 2;
    this.compact = options.compact ?? (this.def.bond !== 'covalente' && !this.def.water);
    this.metal = options.metal && this.def.metals?.some((m) => m.el === options.metal) ? options.metal : (this.def.metals?.[0]?.el ?? '');
    this.root.add(this.model);
    this.root.name = this.id;
  }

  onStart(provider: ARProvider): void {
    this.build();
    this.stage = new Stage(this.ctx, provider, this.root, MODEL_RADIUS);
    this.renderHud();
  }

  onSelect(): void {
    void this.stage?.select();
  }

  frame(dt: number): void {
    this.stage?.frame();
    if (this.spin) this.model.rotation.y += dt * (calm() ? 0.15 : 0.35);
    if (this.settled) return;
    this.growth += dt;
    this.updateInstances();
    if (this.growth >= this.growthEnd) {
      this.settled = true;
      if (this.status) this.status.textContent = t('materia.c.listo', { n: this.atoms.length });
    }
  }

  onEnd(): void {
    this.stage?.dispose();
    this.stage = undefined;
    disposeTree(this.model);
    this.hud?.remove();
    this.hud = undefined;
  }

  /** Vuelve a empezar la animación de crecimiento. */
  replay(): void {
    this.growth = 0;
    this.settled = false;
    if (this.status) this.status.textContent = t('materia.c.creciendo');
  }

  // --- Modelo ---------------------------------------------------------------------

  private build(): void {
    disposeTree(this.model);
    const metal = this.def.metals?.find((m) => m.el === this.metal);
    const lattice = buildLattice(this.def, this.cells, metal);
    this.lattice = lattice;
    this.k = MODEL_RADIUS / lattice.extent;
    const toScene = (p: Vec3) => new THREE.Vector3(p[0], p[2], -p[1]).multiplyScalar(this.k);
    const lift = Math.max(lattice.extent * 0.6, 4) * this.k;

    this.atoms = lattice.atoms.map((a, i) => {
      const target = toScene(a.p);
      const outward = target.clone().setY(0).multiplyScalar(0.35);
      return { el: a.el, target, from: target.clone().add(outward).setY(target.y + lift), order: a.order, layer: a.layer, owner: i };
    });
    this.bonds = lattice.bonds.slice();
    this.hbonds = [];
    if (this.def.water) {
      // Hielo: los O–O de la red son puentes de hidrógeno; las varillas son los O–H.
      const ice = latticeIce(lattice, this.cells);
      this.hbonds = [];
      this.bonds = [];
      ice.hydrogens.forEach((pair, o) => {
        for (const p of pair) {
          const target = toScene(p);
          const owner = this.atoms[o];
          this.bonds.push([o, this.atoms.length]);
          this.atoms.push({ el: 'H', target, from: owner.from.clone().add(target.clone().sub(owner.target)), order: owner.order, layer: -1, owner: o });
        }
      });
      for (const [i, hIndex, j] of ice.hbonds) this.hbonds.push([lattice.atoms.length + i * 2 + hIndex, j]);
    }

    const metallic = this.def.bond === 'metalico';
    const atomMaterial = new THREE.MeshStandardMaterial({ roughness: metallic ? 0.25 : 0.38, metalness: metallic ? 0.55 : 0.05, envMapIntensity: 1.1 });
    this.atomMesh = spheres(this.atoms.length, atomMaterial, this.atoms.length > 250 ? [16, 12] : [24, 16]);
    this.stickMesh = sticks(this.bonds.length, new THREE.MeshStandardMaterial({ color: STICK_COLOR, roughness: 0.5 }));
    this.dotMesh = spheres(this.hbonds.length * 4, new THREE.MeshBasicMaterial({ color: HBOND_COLOR }), [8, 6]);
    this.edgeMesh = sticks(12, new THREE.MeshBasicMaterial({ color: CELL_COLOR }));
    unitCellEdges(lattice).forEach(([a, b], i) => setStick(this.edgeMesh!, i, toScene(a), toScene(b), 0.07 * this.k));
    this.edgeMesh.count = unitCellEdges(lattice).length;
    this.model.add(this.atomMesh, this.stickMesh, this.dotMesh, this.edgeMesh);
    this.applyColors();
    this.applyVisibility();

    const n = this.atoms.length;
    const step = calm() ? Math.min(0.02, 1.5 / n) : Math.min(0.09, 5 / n);
    this.growthEnd = (lattice.atoms.length - 1) * step + this.flightTime() + 0.1;
    this.positions.length = 0;
    this.progress.length = 0;
    for (let i = 0; i < n; i++) {
      this.positions.push(new THREE.Vector3());
      this.progress.push(0);
    }
    this.step = step;
    this.replay();
    this.updateInstances();
  }

  private step = 0.05;
  private flightTime = () => (calm() ? 0.35 : 0.75);

  private radiusOf(el: string): number {
    const r = this.lattice!.radii[el];
    if (this.def.water) {
      if (el === 'H') return this.compact ? 0.62 : 0.2;
      return this.compact ? r : 0.42;
    }
    return this.compact ? r : Math.max(0.24, r * 0.3);
  }

  private applyColors(): void {
    const color = new THREE.Color();
    this.atoms.forEach((a, i) => {
      color.set(this.layers && a.layer >= 0 ? LAYER_COLORS[a.layer] : getElement(a.el).color);
      this.atomMesh!.setColorAt(i, color);
    });
    if (this.atomMesh!.instanceColor) this.atomMesh!.instanceColor.needsUpdate = true;
  }

  private applyVisibility(): void {
    this.stickMesh!.visible = !this.compact;
    this.dotMesh!.visible = !this.compact;
    this.edgeMesh!.visible = this.showCell;
  }

  /** Coloca cada átomo según la animación de crecimiento. */
  private updateInstances(): void {
    const quiet = calm();
    const dur = this.flightTime();
    this.atoms.forEach((a, i) => {
      const order = this.atoms[a.owner].order;
      const u = THREE.MathUtils.clamp((this.growth - order * this.step) / dur, 0, 1);
      this.progress[i] = u;
      const p = this.positions[i];
      if (quiet) p.copy(a.target);
      else p.lerpVectors(a.from, a.target, ease.outBack(u, 1.2));
      const scale = quiet ? ease.smooth(u) : Math.min(1, ease.outCubic(u) * 1.6);
      setSphere(this.atomMesh!, i, p, this.radiusOf(a.el) * this.k * scale);
    });
    this.atomMesh!.instanceMatrix.needsUpdate = true;
    const stickR = (this.def.water ? 0.12 : 0.11) * this.k;
    this.bonds.forEach(([i, j], b) => {
      const u = Math.min(this.progress[i], this.progress[j]);
      setStick(this.stickMesh!, b, this.positions[i], this.positions[j], u >= 1 ? stickR : stickR * ease.smooth(u) * 0.01);
    });
    this.stickMesh!.instanceMatrix.needsUpdate = true;
    const dot = new THREE.Vector3();
    this.hbonds.forEach(([hIndex, o], b) => {
      const u = Math.min(this.progress[hIndex], this.progress[o]);
      for (let k = 0; k < 4; k++) {
        // Puntos entre el H y el O (sin tocarlos): la «línea de puntos».
        dot.lerpVectors(this.positions[hIndex], this.positions[o], 0.2 + k * 0.17);
        setSphere(this.dotMesh!, b * 4 + k, dot, u >= 1 ? 0.09 * this.k : 1e-6);
      }
    });
    this.dotMesh!.instanceMatrix.needsUpdate = true;
  }

  // --- HUD --------------------------------------------------------------------------

  private renderHud(): void {
    const id = this.def.id;
    const name = t(`materia.s.${id}.nombre`);
    const chips = h('div', { class: 'mat-datos' }, h('span', { class: 'chip', text: t(`materia.enlace.${this.def.bond}`) }));
    const cn = this.def.coordination;
    chips.append(h('span', { class: 'chip', text: Array.isArray(cn) ? t('materia.dato.vecinos2', { a: cn[0], b: cn[1] }) : t('materia.dato.vecinos', { n: cn }) }));
    chips.append(h('span', { class: 'chip', text: this.def.flat ? t('materia.dato.plano') : t('materia.dato.ocupado', { p: this.def.packing }) }));

    const cellsLabel = (n: number) => t(this.def.flat ? 'materia.c.celdas.plano' : 'materia.c.celdas.valor', { n });
    const rows: HTMLElement[] = [
      segmented(
        t('materia.c.modelo'),
        [
          { value: 'compacto', text: t('materia.c.compacto') },
          { value: 'varillas', text: t('materia.c.varillas') },
        ],
        this.compact ? 'compacto' : 'varillas',
        (v) => {
          this.compact = v === 'compacto';
          this.applyVisibility();
          this.updateInstances();
        },
      ),
      segmented(
        t('materia.c.celdas'),
        [1, 2, 3].map((n) => ({ value: n, text: cellsLabel(n) })),
        this.cells,
        (n) => {
          this.cells = n;
          this.build();
        },
      ),
    ];
    if ((this.def.metals?.length ?? 0) > 1)
      rows.push(
        segmented(
          t('materia.c.metal'),
          this.def.metals!.map((m) => ({ value: m.el, text: elementName(m.el) })),
          this.metal,
          (el) => {
            this.metal = el;
            this.build();
          },
        ),
      );

    const toggles = h('div', { class: 'mat-fila' });
    toggles.append(
      h('button', { type: 'button', class: 'btn mat-peq menta', 'aria-label': t('materia.c.repetir.aria'), onclick: () => this.replay() }, h('span', { 'aria-hidden': 'true', text: '↻' }), t('materia.c.repetir')),
      toggle(t('materia.c.celda'), this.showCell, (on) => {
        this.showCell = on;
        this.applyVisibility();
      }),
    );
    if (this.def.layers) {
      this.legend = h('p', { class: 'mat-leyenda', hidden: true, text: t(`materia.c.capas.leyenda.${this.def.layers}`) });
      toggles.append(
        toggle(t('materia.c.capas'), this.layers, (on) => {
          this.layers = on;
          this.legend!.hidden = !on;
          this.applyColors();
        }),
      );
    }
    toggles.append(toggle(t('materia.c.girar'), this.spin, (on) => (this.spin = on)));

    const settingsBox = h('details', { class: 'mat-info' }, h('summary', { text: t('materia.c.ajustes') }), h('div', { class: 'mat-ajustes' }, ...rows));
    const info = h(
      'details',
      { class: 'mat-info' },
      h('summary', { text: t('materia.c.info') }),
      h('p', { text: t(`materia.s.${id}.formacion`) }),
      h('p', { text: t(`materia.s.${id}.diferencia`) }),
    );
    this.status = h('p', { class: 'mat-sr', role: 'status', 'aria-live': 'polite' });

    this.hud = h(
      'div',
      { class: 'mat-hud' },
      h(
        'div',
        { class: 'mat-hud-arriba' },
        h('button', { type: 'button', class: 'btn claro redondo', 'aria-label': t('materia.salir'), onclick: () => void this.ctx.exit() }, h('span', { 'aria-hidden': 'true', text: '✕' })),
        h('div', { class: 'mat-titulo flotante' }, h('strong', { text: name }), h('span', { class: 'pequeno', text: t(`materia.s.${id}.ejemplo`) })),
      ),
      h(
        'div',
        { class: 'mat-panel flotante', role: 'group', 'aria-label': t('materia.c.ajustes') },
        this.stage?.controls ?? null,
        chips,
        toggles,
        this.legend ?? null,
        h('div', { class: 'mat-plegables' }, settingsBox, info),
        this.status,
      ),
    );
    this.ctx.overlay.append(this.hud);
    this.status.textContent = t('materia.c.creciendo');
  }
}
