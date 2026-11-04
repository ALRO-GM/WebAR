/// <reference lib="webworker" />
import { createDetector, detectMarkers } from '../detection';

/**
 * La detección de marcadores fuera del hilo principal: recibe el fotograma
 * ya reducido (ImageBitmap, transferido sin copia), lo pasa a píxeles, busca
 * los marcadores y afina sus esquinas. Mientras, el hilo principal sigue
 * dibujando a 60 fps.
 */
let detector: ReturnType<typeof createDetector> | undefined;
let canvas: OffscreenCanvas | undefined;
let g: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = (event: MessageEvent<{ frame: number; bitmap: ImageBitmap; maxBitErrors: number }>) => {
  const { frame, bitmap, maxBitErrors } = event.data;
  detector ??= createDetector(maxBitErrors);
  if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    g = canvas.getContext('2d', { willReadFrequently: true });
  }
  g!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const markers = detectMarkers(detector, g!.getImageData(0, 0, canvas.width, canvas.height));
  self.postMessage({ frame, markers });
};
