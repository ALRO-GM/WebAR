// Tipos mínimos de lo que usamos de js-aruco2.
export interface ArucoCorner {
  x: number;
  y: number;
}
export interface ArucoMarker {
  id: number;
  /** Esquinas en píxeles: superior izquierda, superior derecha, inferior derecha, inferior izquierda. */
  corners: ArucoCorner[];
  hammingDistance: number;
}
export interface ArucoDetector {
  detect(image: { width: number; height: number; data: Uint8ClampedArray }): ArucoMarker[];
  /** La imagen en grises del último `detect` (1 byte por píxel). */
  grey?: { width: number; height: number; data: ArrayLike<number> };
  /** `tau`: bits erróneos máximos + 1 (lo que fija `maxHammingDistance`). */
  dictionary: { tau: number };
  relativeThreshold: number;
  thresholdKernel: number;
}
export interface ArucoDictionary {
  codeList: string[];
  generateSVG(id: number): string;
}
export declare const AR: {
  Detector: new (config?: { dictionaryName?: string; maxHammingDistance?: number; relativeThreshold?: number; brightestChannel?: boolean; thresholdKernel?: number }) => ArucoDetector;
  Dictionary: new (name: string) => ArucoDictionary;
};
