import { atomComposition, getElement } from '@webar/chem';

/**
 * El átomo de un elemento en SVG (modelo de Bohr): núcleo y capas con sus
 * electrones girando. Para las lecciones y las fichas, donde un 3D sería caro.
 */
export function bohrSVG(symbol: string, size = 160): string {
  const e = getElement(symbol);
  const { shells } = atomComposition(e);
  const c = 100;
  const maxR = 92;
  // Pocas capas: más separadas, para que el átomo llene el dibujo.
  const step = Math.min(56, (maxR - 30) / Math.max(shells.length, 1));
  const rings = shells
    .map((count, i) => {
      const r = 30 + step * (i + 0.8);
      const dots = Array.from({ length: count }, (_, k) => {
        const a = (k / count) * Math.PI * 2;
        return `<circle cx="${(c + r * Math.cos(a)).toFixed(1)}" cy="${(c + r * Math.sin(a)).toFixed(1)}" r="${count > 18 ? 2.2 : 3.4}" class="bohr-e"/>`;
      }).join('');
      // Cada capa gira a su ritmo (las de fuera, más despacio).
      return `<circle cx="${c}" cy="${c}" r="${r.toFixed(1)}" class="bohr-capa"/><g class="bohr-giro" style="--d:${(6 + i * 3).toFixed(0)}s; --dir:${i % 2 ? -1 : 1}">${dots}</g>`;
    })
    .join('');
  return `<svg class="bohr" viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="24" fill="${e.color}" class="bohr-nucleo"/>
    <text x="${c}" y="${c + 7}" text-anchor="middle" class="bohr-simbolo">${e.symbol}</text>
    ${rings}
  </svg>`;
}
