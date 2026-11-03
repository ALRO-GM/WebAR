import type * as THREE from 'three';

/**
 * Qué sabe hacer un proveedor de seguimiento:
 * - `world`: detectar superficies y dejar objetos fijos en el espacio.
 * - `image`: seguir imágenes conocidas (cartas, fichas, láminas).
 */
export type ARCapability = 'world' | 'image';

/** Lo que la sesión comparte con el proveedor. */
export interface ARContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Capa HTML que se ve encima de la cámara durante la sesión. */
  overlay: HTMLElement;
}

/** Cómo avisa el proveedor a la sesión. */
export interface ARProviderHooks {
  /** El usuario ha tocado la pantalla (fuera de los botones de la capa HTML). */
  select(): void;
  /** La sesión ha terminado por su cuenta (botón atrás, error del sistema…). */
  ended(): void;
}

/**
 * Un sistema de seguimiento (WebXR, seguimiento de imágenes…).
 *
 * La sesión es dueña del renderizador y del bucle; el proveedor arranca la
 * cámara o la sesión XR y, en cada frame, coloca la cámara virtual y las anclas.
 */
export interface ARProvider {
  readonly id: string;
  readonly capabilities: readonly ARCapability[];
  /** Si este navegador y dispositivo pueden usarlo. No pide permisos. */
  isSupported(): Promise<boolean>;
  /** Tiene que llamarse desde un gesto del usuario (un toque en un botón). */
  start(ctx: ARContext, hooks: ARProviderHooks): Promise<void>;
  /** Se llama antes de pintar cada frame. `xrFrame` solo existe con WebXR. */
  update(time: number, xrFrame?: XRFrame): void;
  stop(): Promise<void>;
}

export interface ARSessionEvents {
  start: undefined;
  end: undefined;
  /** Antes de pintar: anima aquí. `dt` en segundos. */
  frame: { time: number; dt: number };
  /** Toque en la pantalla durante la sesión. */
  select: undefined;
}
