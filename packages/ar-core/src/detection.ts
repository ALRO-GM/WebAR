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

export function createDetector(maxBitErrors = 3): ArucoDetector {
  return new AR.Detector({
    dictionaryName: MARKER_DICTIONARY,
    // El detector compara con `<`: 3 bits erróneos como mucho → 4.
    maxHammingDistance: maxBitErrors + 1,
    // Que las líneas de un papel cuadriculado o de color no cuenten como tinta (ver cv.js).
    // Valores elegidos con las fotos sintéticas de cards.test.ts (impresas y a mano).
    relativeThreshold: 0.16,
    thresholdKernel: 3,
    brightestChannel: true,
  });
}

export function detectMarkers(detector: ArucoDetector, image: ImageData): DetectedMarker[] {
  return detector.detect(image).map((m) => ({
    id: m.id,
    corners: m.corners,
    // El detector da esquinas en píxeles enteros: afinarlas quita la mayor parte del temblor.
    refined: detector.grey ? refineCorners(detector.grey, m.corners) : m.corners,
    hammingDistance: m.hammingDistance,
  }));
}
