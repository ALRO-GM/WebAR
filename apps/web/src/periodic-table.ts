import { ELEMENTS, tablePosition, type ElementData } from '@webar/chem';

/**
 * Pinta la tabla periódica como botones; `onPick` recibe el elemento tocado.
 * Con `isLocked`, los bloqueados se ven apagados con un candado (y se anuncian
 * así a los lectores de pantalla), pero se pueden tocar para saber cómo conseguirlos.
 */
export function renderPeriodicTable(container: HTMLElement, onPick: (element: ElementData) => void, isLocked?: (element: ElementData) => boolean): void {
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
      cell.innerHTML = `<small>${element.z}</small>${element.symbol}`;
      cell.addEventListener('click', () => onPick(element));
      return cell;
    }),
  );
  updateLocks(container, isLocked);
}

export function updateLocks(container: HTMLElement, isLocked?: (element: ElementData) => boolean): void {
  container.querySelectorAll<HTMLButtonElement>('.celda').forEach((cell) => {
    const element = ELEMENTS[Number(cell.dataset.z) - 1];
    const locked = !!isLocked?.(element);
    cell.classList.toggle('bloqueada', locked);
    cell.setAttribute('aria-label', `${element.name}${locked ? ' (bloqueado)' : ''}`);
  });
}

export function markSelected(container: HTMLElement, z: number): void {
  container.querySelector('.celda[aria-current]')?.removeAttribute('aria-current');
  container.querySelector(`.celda[data-z="${z}"]`)?.setAttribute('aria-current', 'true');
}
