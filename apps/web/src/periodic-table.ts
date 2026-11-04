import { ELEMENTS, tablePosition, type ElementData } from '@webar/chem';

/** Pinta la tabla periódica como botones; `onPick` recibe el elemento tocado. */
export function renderPeriodicTable(container: HTMLElement, onPick: (element: ElementData) => void): void {
  container.replaceChildren(
    ...ELEMENTS.map((element) => {
      const { row, column } = tablePosition(element);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'celda';
      cell.dataset.family = element.family;
      cell.dataset.z = String(element.z);
      // Fila 8 vacía: separa lantánidos y actínidos, como en las tablas impresas.
      cell.style.gridRow = String(row > 7 ? row + 1 : row);
      cell.style.gridColumn = String(column);
      cell.title = element.name;
      cell.innerHTML = `<small>${element.z}</small>${element.symbol}`;
      cell.addEventListener('click', () => onPick(element));
      return cell;
    }),
  );
}

export function markSelected(container: HTMLElement, z: number): void {
  container.querySelector('.celda[aria-current]')?.removeAttribute('aria-current');
  container.querySelector(`.celda[data-z="${z}"]`)?.setAttribute('aria-current', 'true');
}
