import { isDemo } from './demo';
import type { EventType, ProgressEvent } from './progress';

/**
 * Lo que el alumno hace se guarda en el móvil (IndexedDB): funciona sin
 * conexión y no se pierde. Los eventos solo se añaden; `enviado` marca los ya
 * sincronizados con la clase.
 */
interface StoredEvent extends ProgressEvent {
  enviado: 0 | 1;
}

// En modo demostración, otro almacén: el progreso propio no se toca (platform/demo.ts).
const DB_NAME = isDemo() ? 'webar-demo' : 'webar';
let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('eventos', { keyPath: 'id' }).createIndex('enviado', 'enviado');
      db.createObjectStore('ajustes');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function addEvent(tipo: EventType, datos: Record<string, unknown>): Promise<ProgressEvent> {
  const event: StoredEvent = { id: crypto.randomUUID(), tipo, datos, fecha: new Date().toISOString(), enviado: 0 };
  await run('eventos', 'readwrite', (s) => s.add(event));
  return event;
}

export function allEvents(): Promise<ProgressEvent[]> {
  return run<StoredEvent[]>('eventos', 'readonly', (s) => s.getAll());
}

export function pendingEvents(): Promise<ProgressEvent[]> {
  return run<StoredEvent[]>('eventos', 'readonly', (s) => s.index('enviado').getAll(0));
}

export async function markSent(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('eventos', 'readwrite');
    const store = tx.objectStore('eventos');
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => req.result && store.put({ ...req.result, enviado: 1 });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getSetting<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('ajustes', 'readonly', (s) => s.get(key));
}

export function setSetting(key: string, value: unknown): Promise<void> {
  return run('ajustes', 'readwrite', (s) => {
    s.put(value, key);
  });
}

export function deleteSetting(key: string): Promise<void> {
  return run('ajustes', 'readwrite', (s) => {
    s.delete(key);
  });
}

/**
 * Pide al navegador que no borre los datos si falta espacio (en iPhone lo
 * concede sobre todo con la app instalada en la pantalla de inicio).
 */
export async function persistStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}

export async function isPersisted(): Promise<boolean> {
  return (await navigator.storage?.persisted?.()) ?? false;
}

/** Mete eventos ya hechos (la demostración): marcados como enviados, no se sincronizan. */
export async function importEvents(events: ProgressEvent[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('eventos', 'readwrite');
    for (const e of events) tx.objectStore('eventos').put({ ...e, enviado: 1 });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
