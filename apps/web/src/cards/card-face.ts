import * as THREE from 'three';
import { getElement, getSpecies, type Content } from '@webar/chem';
import nunitoUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import { FAMILY_COLORS, SVG_H, SVG_W, cardSVG } from './card-svg';
import type { CardSpec } from './deck';

export { FAMILY_COLORS } from './card-svg';

/** Píxeles de la textura a lo ancho (≈ 1 px por décima de milímetro). */
const W = 600;
const H = Math.round((W * SVG_H) / SVG_W);

/**
 * Un SVG usado como imagen no ve las fuentes de la página: la Nunito se
 * incrusta dentro (una vez, en base64) para que la tarjeta virtual tenga la
 * misma letra que la impresa.
 */
let fontCSS: Promise<string> | undefined;
function embeddedFont(): Promise<string> {
  fontCSS ??= fetch(nunitoUrl)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(`@font-face{font-family:'Nunito Variable';font-weight:200 1000;src:url(${reader.result as string}) format('woff2');}`);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => '');
  return fontCSS;
}

/**
 * La cara virtual de la tarjeta: la misma tarjeta que se imprime (SVG → imagen
 * → lienzo → textura). Se devuelve en el acto con el color de fondo y se
 * dibuja en cuanto la imagen está lista.
 */
export function cardFaceTexture(content: Content, spec: CardSpec): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Mientras carga: el color de la tarjeta, para que no parpadee en blanco.
  const species = getSpecies(content);
  g.fillStyle = species ? '#7c5cff' : FAMILY_COLORS[getElement(spec.symbol).family];
  g.beginPath();
  g.roundRect(0, 0, W, H, (32 * W) / SVG_W);
  g.fill();

  void embeddedFont().then((css) => {
    const svg = cardSVG(spec, content, { css, noCutLine: true });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      g.clearRect(0, 0, W, H);
      g.drawImage(image, 0, 0, W, H);
      URL.revokeObjectURL(url);
      texture.needsUpdate = true;
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  });
  return texture;
}
