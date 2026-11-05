import { MARKER_DICTIONARY } from './markers';
import type { Point2 } from './pose';
import { refineCorners } from './refine';
import { AR, type ArucoDetector } from './vendor/js-aruco2/index.js';

/**
 * Detectar marcadores en un fotograma: lo comparten el hilo principal y el
 * worker de detección (detect-worker.ts). Sin three.js ni DOM, para que el
 * worker cargue poco.
 */
export interface DetectedMarker {
  id: number;
  /** Esquinas del detector (píxeles enteros): para decidir identidades. */
  corners: Point2[];
  /** Las mismas, afinadas a décimas de píxel: para la pose. */
  refined: Point2[];
  hammingDistance: number;
}

/**
 * Dos formas de separar la tinta del papel, que se alternan fotograma a
 * fotograma (ver cards.test.ts, con fotos sintéticas):
 *
 * - `papel`: exigente, para que las líneas de un papel cuadriculado o de
 *   color no cuenten como tinta (tarjetas dibujadas a mano);
 * - `movimiento`: con la tarjeta o el móvil moviéndose, la imagen sale
 *   borrosa y con poco contraste; una ventana más grande y un umbral más
 *   suave la siguen leyendo (con `papel`, casi nunca).
 *
 * Ninguna de las dos se inventa tarjetas (la lectura del código es igual de
 * estricta) y las ya reconocidas se mantienen entre fotogramas: el
 * seguimiento suma lo mejor de las dos.
 */
export const THRESHOLD_PROFILES = {
  papel: { relativeThreshold: 0.16, thresholdKernel: 3 },
  movimiento: { relativeThreshold: 0.08, thresholdKernel: 6 },
} as const;
export type ThresholdProfile = keyof typeof THRESHOLD_PROFILES;
export interface Threshold {
  relativeThreshold: number;
  thresholdKernel: number;
}

export function createDetector(maxBitErrors = 3): ArucoDetector {
  return new AR.Detector({
    dictionaryName: MARKER_DICTIONARY,
    // El detector compara con `<`: 3 bits erróneos como mucho → 4.
    maxHammingDistance: maxBitErrors + 1,
    ...THRESHOLD_PROFILES.papel,
    brightestChannel: true,
  });
}

/** El perfil de umbral para el fotograma número `frame`: uno y otro, alternos. */
export const profileFor = (frame: number): ThresholdProfile => (frame % 2 ? 'movimiento' : 'papel');

/** Detecta con un perfil o con un umbral concreto (los del ajuste fino), y con los bits erróneos que se toleran. */
export function detectMarkers(detector: ArucoDetector, image: ImageData, profile: ThresholdProfile | Threshold = 'papel', maxBitErrors?: number): DetectedMarker[] {
  Object.assign(detector, typeof profile === 'string' ? THRESHOLD_PROFILES[profile] : profile);
  if (maxBitErrors !== undefined) detector.dictionary.tau = maxBitErrors + 1;
  return detector.detect(image).map((m) => ({
    id: m.id,
    corners: m.corners,
    // El detector da esquinas en píxeles enteros: afinarlas quita la mayor parte del temblor.
    refined: detector.grey ? refineCorners(detector.grey, m.corners) : m.corners,
    hammingDistance: m.hammingDistance,
  }));
}
