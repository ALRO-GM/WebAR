/** Lo que ofrece este navegador para la realidad aumentada, sin pedir permisos. */
export interface ARSupport {
  /** HTTPS o localhost: sin esto no hay cámara ni WebXR. */
  secureContext: boolean;
  /** Cámara con getUserMedia (base del seguimiento de imágenes). */
  camera: boolean;
  /** WebXR con `immersive-ar` (Android con Chrome, visores XR). */
  webxrAR: boolean;
  /** iPhone o iPad: hoy sin WebXR en Safari. */
  ios: boolean;
}

export async function detectARSupport(): Promise<ARSupport> {
  const secureContext = window.isSecureContext;
  const camera = secureContext && !!navigator.mediaDevices?.getUserMedia;
  const webxrAR = secureContext && !!navigator.xr && (await withTimeout(navigator.xr.isSessionSupported('immersive-ar')));
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return { secureContext, camera, webxrAR, ios };
}

/** Algunos navegadores (p. ej. sin dispositivo XR) nunca responden: no esperar más de `ms`. */
export function withTimeout(promise: Promise<boolean>, ms = 3000): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms));
  return Promise.race([promise.catch(() => false), timeout]);
}
