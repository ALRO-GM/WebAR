import * as THREE from 'three';
import { atomComposition, contentFormula, getElement, getSpecies, isMolecule, formatConfiguration, type Content } from '@webar/chem';
import { t } from '../i18n';
import { elementName, familyName, num, speciesName, speciesUse } from '../i18n/content';
import { CARD } from './deck';

const W = 512;
const H = Math.round((W * CARD.height) / CARD.width);

export const FAMILY_COLORS: Record<string, string> = {
  'no-metal': '#7fd46e', 'gas-noble': '#a58cff', alcalino: '#ff7f73', alcalinoterreo: '#ffb35c', metaloide: '#c9c95a',
  halogeno: '#4fd1c0', 'metal-postransicion': '#9fb1c9', 'metal-transicion': '#f08fb0', lantanido: '#ffc98a', actinido: '#e59be5',
};

/** La cara virtual de la tarjeta: los datos del elemento o de la molécula que tiene ahora. */
export function cardFaceTexture(content: Content, printed: string, cardId: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  roundRect(g, 0, 0, W, H, 34);
  g.fillStyle = '#14171c';
  g.fill();
  g.save();
  g.clip();
  if (isMolecule(content)) drawMolecule(g, content, printed);
  else drawElement(g, content);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.font = '500 22px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(t('cara.tarjeta', { simbolo: printed, n: cardId }), W / 2, H - 22);
  g.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawElement(g: CanvasRenderingContext2D, symbol: string): void {
  const e = getElement(symbol);
  const color = FAMILY_COLORS[e.family];
  const c = atomComposition(e);
  g.fillStyle = color;
  g.fillRect(0, 0, W, 96);
  g.fillStyle = '#0b1020';
  g.font = '700 40px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText(String(e.z), 30, 62);
  g.textAlign = 'right';
  g.font = '600 30px system-ui, sans-serif';
  g.fillText(`${num(e.atomicMass, e.atomicMass < 100 ? 2 : 1)} u`, W - 30, 60);

  g.textAlign = 'center';
  g.fillStyle = color;
  g.font = '800 220px system-ui, sans-serif';
  g.fillText(e.symbol, W / 2, 330);
  g.fillStyle = '#ffffff';
  g.font = '700 54px system-ui, sans-serif';
  fitText(g, elementName(e.symbol), W / 2, 410, W - 60);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = '500 28px system-ui, sans-serif';
  g.fillText(familyName(e.family), W / 2, 452);

  const rows: Array<[string, string, string]> = [
    ['#ff4d5a', `${c.protons}`, t('cara.protones')],
    ['#c3cad6', `${c.neutrons}`, t('cara.neutrones')],
    ['#6fd8ff', `${c.electrons}`, t('cara.electrones')],
  ];
  rows.forEach(([col, n, label], i) => {
    const x = 90 + i * 166;
    g.fillStyle = col;
    g.font = '800 52px system-ui, sans-serif';
    g.fillText(n, x, 540);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '500 22px system-ui, sans-serif';
    g.fillText(label, x, 572);
  });
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '500 26px system-ui, sans-serif';
  fitText(g, `${t('explorar.capas', { capas: c.shells.join('·') })}  ·  ${formatConfiguration(e)}`, W / 2, 630, W - 50);
}

function drawMolecule(g: CanvasRenderingContext2D, id: string, printed: string): void {
  const s = getSpecies(id)!;
  const gradient = g.createLinearGradient(0, 0, W, 0);
  gradient.addColorStop(0, '#7aa5ff');
  gradient.addColorStop(1, '#c77dff');
  g.fillStyle = gradient;
  g.fillRect(0, 0, W, 96);
  g.fillStyle = '#0b1020';
  g.font = '700 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText((s.ionic ? t('cara.ionico') : t('cara.molecula')).toUpperCase(), W / 2, 60);

  g.fillStyle = '#ffffff';
  g.font = '800 150px system-ui, sans-serif';
  fitText(g, contentFormula(id), W / 2, 280, W - 50);
  g.font = '700 46px system-ui, sans-serif';
  fitText(g, speciesName(id), W / 2, 360, W - 50);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '500 28px system-ui, sans-serif';
  wrap(g, speciesUse(id), W / 2, 420, W - 70, 36, 4);
  g.fillStyle = s.deltaHf < 0 ? '#ff9f43' : s.deltaHf > 0 ? '#7fd3ff' : 'rgba(255,255,255,0.7)';
  g.font = '600 28px system-ui, sans-serif';
  g.fillText(`ΔHf° = ${num(s.deltaHf, 2)} kJ/mol`, W / 2, 605);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = '500 22px system-ui, sans-serif';
  g.fillText(t('cara.descomponer', { simbolo: printed }), W / 2, 650);
}

function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number): void {
  const size = parseFloat(g.font.split(' ')[1]);
  let s = size;
  while (s > 12 && g.measureText(text).width > max) {
    s -= 2;
    g.font = g.font.replace(/\d+px/, `${s}px`);
  }
  g.fillText(text, x, y);
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number, lines: number): void {
  const words = text.split(' ');
  let current = '';
  let n = 0;
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (g.measureText(test).width > max && current) {
      g.fillText(current, x, y + n * line);
      current = word;
      if (++n >= lines) return;
    } else current = test;
  }
  if (current) g.fillText(current, x, y + n * line);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
