/** El botón «Instalar la app» (Android/escritorio) y la pista para iPhone. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function setupInstall(button: HTMLButtonElement, iosHint: HTMLElement, ios: boolean): void {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return;
  if (ios) iosHint.hidden = false;

  let deferred: BeforeInstallPromptEvent | undefined;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => (button.hidden = true));
  button.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = undefined;
    button.hidden = true;
  });
}
