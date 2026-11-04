import * as THREE from 'three';
import { atomComposition, type AtomComposition } from '../configuration';
import type { ElementData } from '../types';
import { BohrModel } from './bohr';
import { ElectronCloud, type CloudOptions } from './cloud';
import { nucleusLayout } from '../nucleus';
import { NucleusMesh } from './nucleus-mesh';

/** `bohr`: electrones en órbitas. `cloud`: nubes de probabilidad (orbitales). */
export type AtomModel = 'bohr' | 'cloud';

export interface AtomViewOptions {
  model?: AtomModel;
  /**
   * Metros por picómetro. Por defecto 0,0004: el hidrógeno (53 pm) mide unos
   * 2 cm de radio y el cesio (298 pm), unos 12. Los tamaños entre átomos son
   * proporcionales a los reales.
   */
  metersPerPm?: number;
  /**
   * Radio de un protón o neutrón, en metros. Un núcleo real es ~100 000 veces
   * más pequeño que su átomo: invisible. Aquí se exagera mucho, para que
   * protones y neutrones se vean bien; en los átomos pesados se reduce lo
   * justo para que el núcleo no pase del 40 % del radio del átomo.
   */
  nucleonRadius?: number;
  cloud?: CloudOptions;
}

/**
 * Un átomo en 3D listo para la escena: núcleo con sus protones y neutrones, y
 * los electrones en el modelo de Bohr o en nubes de probabilidad.
 *
 * ```ts
 * const atom = new AtomView(getElement('O'), { model: 'cloud' })
 * scene.add(atom.object)
 * // en cada frame: atom.update(dt)
 * ```
 *
 * El origen de `object` es el centro del núcleo.
 */
export class AtomView {
  readonly object = new THREE.Group();
  readonly composition: AtomComposition;
  /** Radio del átomo en metros (el de sus electrones más externos). */
  readonly radius: number;

  private readonly nucleus: NucleusMesh;
  private bohr?: BohrModel;
  private cloud?: ElectronCloud;
  private _model: AtomModel;
  private readonly k: number;

  constructor(
    readonly element: ElementData,
    private readonly options: AtomViewOptions = {},
  ) {
    this.composition = atomComposition(element);
    this.radius = element.radius * (options.metersPerPm ?? 0.0004);
    // Tamaños de partículas pensados para la escala por defecto; a otra escala, proporcionales.
    this.k = (options.metersPerPm ?? 0.0004) / 0.0004;
    const { protons, neutrons } = this.composition;
    const nucleonRadius = options.nucleonRadius ?? Math.min(0.0032 * this.k, (this.radius * 0.4) / nucleusLayout(protons, neutrons).radius);
    this.nucleus = new NucleusMesh(protons, neutrons, nucleonRadius);
    this.object.add(this.nucleus.object);
    this.object.name = `atomo:${element.symbol}`;
    this._model = options.model ?? 'bohr';
    this.setModel(this._model);
  }

  get model(): AtomModel {
    return this._model;
  }

  /** Cambia la representación de los electrones. Cada una se crea la primera vez que se pide. */
  setModel(model: AtomModel): void {
    this._model = model;
    if (model === 'bohr' && !this.bohr) {
      const electronRadius = Math.min(Math.max(this.radius * 0.035, 0.0012 * this.k), 0.0022 * this.k);
      const inner = Math.min(this.nucleus.radius + electronRadius * 3, this.radius * 0.6);
      this.bohr = new BohrModel(this.composition.shells, inner, this.radius, electronRadius);
      this.object.add(this.bohr.object);
    }
    if (model === 'cloud' && !this.cloud) {
      this.cloud = new ElectronCloud(this.element.z, this.composition.subshells, this.radius, this.options.cloud);
      this.object.add(this.cloud.object);
    }
    if (this.bohr) this.bohr.object.visible = model === 'bohr';
    if (this.cloud) this.cloud.object.visible = model === 'cloud';
    // En la nube el núcleo se encoge: ahí lo que importa son los orbitales.
    this.nucleus.object.scale.setScalar(model === 'cloud' ? 0.6 : 1);
  }

  update(dt: number): void {
    this.nucleus.update(dt);
    if (this._model === 'bohr') this.bohr?.update(dt);
    else this.cloud?.update(dt);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.nucleus.dispose();
    this.bohr?.dispose();
    this.cloud?.dispose();
  }
}
