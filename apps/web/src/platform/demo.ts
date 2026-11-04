import { REACTIONS, SPECIES, composition } from '@webar/chem';
import { NODES, START_ELEMENTS } from '../learn/path';
import type { ProgressEvent } from './progress';

/**
 * Modo demostración del alumnado (para presentar): otro almacén en el móvil
 * (IndexedDB `webar-demo`), así que el progreso propio no se toca; todos los
 * elementos desbloqueados; un mes de actividad inventada (racha, lecciones,
 * colección, insignias), y dentro de la clase de demostración del servidor,
 * donde el profesor de demostración lanza actividades. Se sale desde Ajustes
 * y todo vuelve a ser lo de antes.
 */
const FLAG = 'webar:demo';

export const isDemo = () => localStorage.getItem(FLAG) === '1';

/** Un mes de uso: lecciones del camino por orden, alguna Adivina, moléculas y reacciones. */
export function demoEvents(now = new Date(), days = 30): ProgressEvent[] {
  const events: ProgressEvent[] = [];
  let k = 0;
  const at = (day: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, hour, (k * 7) % 60).toISOString();
  const add = (tipo: ProgressEvent['tipo'], datos: Record<string, unknown>, fecha: string) => events.push({ id: `demo-${k++}`, tipo, datos, fecha });
  const unlocked = new Set(START_ELEMENTS);
  const lessons = NODES.filter((n) => n.kind !== 'laboratorio');
  let next = 0;
  for (let day = days - 1; day >= 0; day--) {
    // Unos 4 pasos del camino al día: en un mes, las primeras unidades enteras.
    for (let i = 0; i < 4 && next < lessons.length; i++) {
      const node = lessons[next++];
      const fecha = at(day, 17 + i);
      if (node.kind === 'leccion' || node.kind === 'repaso') {
        add('leccion', { nodo: node.id, aciertos: 5, total: 5, xp: 20, segundos: 150 }, fecha);
        for (const el of node.elements) unlocked.add(el);
      } else if (node.kind === 'adivina') add('adivina', { nodo: node.id, aciertos: 4, total: 5, xp: 16 }, fecha);
      else if (node.kind === 'cofre') add('cofre', { nodo: node.id }, fecha);
    }
    // Las moléculas que ya se pueden formar, de dos en dos.
    const possible = SPECIES.filter((s) => Object.keys(composition(s)).every((el) => unlocked.has(el)) && !events.some((e) => e.datos.sustancia === s.id));
    for (const s of possible.slice(0, 2)) add('descubrir', { sustancia: s.id }, at(day, 20));
  }
  for (const r of REACTIONS.slice(0, 12)) add('reaccion', { reaccion: r.id }, at(1, 19));
  add('lectura', { elemento: 'H' }, at(0, 10));
  return events;
}

export function enableDemo(): void {
  localStorage.setItem(FLAG, '1');
}

export function disableDemo(): void {
  localStorage.removeItem(FLAG);
}
