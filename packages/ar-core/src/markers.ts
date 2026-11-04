import { AR } from './vendor/js-aruco2/index.js';

/** Diccionario de los marcadores: ArUco MIP 36h12 (250 códigos, muy robusto a errores). */
export const MARKER_DICTIONARY = 'ARUCO_MIP_36h12';
export const MARKER_COUNT = 250;

let dictionary: InstanceType<typeof AR.Dictionary> | undefined;

/**
 * El SVG del marcador `id` (0-249), con su margen blanco. Para imprimir: el
 * cuadrado negro ocupa 8/10 del ancho del SVG.
 */
export function markerSVG(id: number): string {
  dictionary ??= new AR.Dictionary(MARKER_DICTIONARY);
  return dictionary.generateSVG(id);
}
