import type { ARProvider, ARSession, ViewerProvider, WebXRWorldProvider } from '@webar/ar-core';

/**
 * Una «experiencia» es todo lo que ocupa la pantalla en 3D o en RA: explorar
 * átomos, las tarjetas, los cristales, el agua, la foto con personajes…
 * Todas comparten la misma sesión (renderizador, escena y cámara) y se turnan:
 * la app arranca una con `launch` y, al salir, se llama a su `onEnd`.
 *
 * Cada experiencia crea su propia interfaz (HUD) dentro de `ctx.overlay` en
 * `onStart` y la quita en `onEnd`; así no hace falta tocar index.html.
 */
export interface Experience {
  /** Nombre corto, para los enlaces directos (?vista=<id>) y la depuración. */
  readonly id: string;
  /** Ya arrancada la sesión. `provider` dice si es el visor, WebXR o la cámara con marcadores. */
  onStart(provider: ARProvider): void;
  /** Cada frame, antes de pintar. `dt` en segundos (ya limitado a 0,1 s). */
  frame(dt: number): void;
  /** Toque en la pantalla fuera de los botones (en WebXR: colocar algo). */
  onSelect?(): void;
  /** La sesión ha terminado (botón salir, atrás del sistema…): limpiar escena y HUD. */
  onEnd(): void;
}

/** Lo que la app comparte con las experiencias y las pantallas. */
export interface AppContext {
  ar: ARSession;
  /** Visor 3D sin cámara (girar con el dedo). Siempre disponible. */
  viewer: ViewerProvider;
  /** RA del mundo con WebXR (Android con Chrome). Mirar `supportsWorldAR`. */
  xr: WebXRWorldProvider;
  /** Si el móvil tiene RA del mundo (WebXR immersive-ar). */
  supportsWorldAR(): boolean;
  /** Capa HTML encima del 3D/cámara: el HUD de cada experiencia va aquí. */
  overlay: HTMLElement;
  /** Arranca una experiencia con un proveedor. Llamar desde un toque del usuario. */
  launch(experience: Experience, provider: ARProvider): Promise<void>;
  /** Sale de la experiencia en marcha (vuelve a la pantalla de la que se vino). */
  exit(): Promise<void>;
}
