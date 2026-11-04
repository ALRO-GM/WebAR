/**
 * Instalar la app: un botón bien visible en la barra de arriba (y otro en
 * Ajustes) que solo aparece donde se puede instalar y se va al instalarla.
 *
 * - Chrome, Edge, Samsung Internet… (Android y escritorio) avisan con
 *   `beforeinstallprompt`: el botón abre su diálogo de instalación.
 * - iPhone y iPad no tienen ese aviso: se instala desde Compartir → «Añadir a
 *   pantalla de inicio», así que el botón enseña esos pasos.
 * - Firefox de escritorio y otros que no instalan PWA: sin botón.
 * - Ya instalada (abierta como app, o evento `appinstalled`): sin botón.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Se escucha en cuanto se carga el módulo: el aviso puede llegar antes de que
// la app termine de arrancar (antes se perdía y el botón no salía nunca).
let deferred: BeforeInstallPromptEvent | undefined;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  deferred = undefined;
  notify();
});

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: window-controls-overlay)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function setupInstall(buttons: HTMLButtonElement[], iosHint: HTMLElement, ios: boolean, showIosSteps: () => void): void {
  const update = () => {
    const can = !installed && !standalone() && (!!deferred || ios);
    for (const b of buttons) b.hidden = !can;
    iosHint.hidden = !(can && ios);
  };
  listeners.add(update);
  matchMedia('(display-mode: standalone)').addEventListener('change', update);
  for (const b of buttons)
    b.addEventListener('click', async () => {
      if (!deferred) return ios ? showIosSteps() : undefined;
      const event = deferred;
      await event.prompt();
      const { outcome } = await event.userChoice;
      // El aviso solo sirve una vez; si dice que no, el navegador volverá a avisar más adelante.
      deferred = undefined;
      if (outcome === 'accepted') installed = true;
      update();
    });
  update();
}
