import * as THREE from 'three';
import { Emitter } from './emitter';

export interface ARAnchorEvents {
  /** El proveedor vuelve a saber dónde está el ancla (p. ej. la carta vuelve a verse). */
  found: undefined;
  /** El proveedor ha perdido el ancla (p. ej. la carta sale de la cámara). */
  lost: undefined;
  disposed: undefined;
}

/**
 * Un punto del mundo real al que se pegan objetos 3D.
 *
 * Es igual para todos los proveedores: un punto en una superficie (WebXR), una
 * imagen o carta (seguimiento de imágenes)… La aplicación solo cuelga cosas de
 * `object` y escucha `found`/`lost`; el proveedor mueve `object` en cada frame.
 */
export class ARAnchor extends Emitter<ARAnchorEvents> {
  /** Grupo cuya pose actualiza el proveedor. Añade aquí tus mallas. */
  readonly object = new THREE.Group();
  private _tracking = false;
  private _disposed = false;

  constructor(
    /** Identificador del proveedor (p. ej. el índice de la carta). */
    readonly id: string,
    private readonly onDispose?: () => void,
  ) {
    super();
    // La pose viene entera del proveedor: no recalcular desde position/rotation.
    this.object.matrixAutoUpdate = false;
    this.object.name = `ar-anchor:${id}`;
  }

  get tracking(): boolean {
    return this._tracking;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /** Lo llama el proveedor. */
  setPose(matrix: THREE.Matrix4 | ArrayLike<number>): void {
    if (matrix instanceof THREE.Matrix4) this.object.matrix.copy(matrix);
    else this.object.matrix.fromArray(matrix as number[]);
    this.object.matrixWorldNeedsUpdate = true;
  }

  /** Lo llama el proveedor. */
  setTracking(tracking: boolean): void {
    if (tracking === this._tracking) return;
    this._tracking = tracking;
    this.emit(tracking ? 'found' : 'lost', undefined);
  }

  /** Quita el ancla de la escena y libera lo que tenga el proveedor. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.object.removeFromParent();
    this.onDispose?.();
    this.emit('disposed', undefined);
  }
}
