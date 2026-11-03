/** Emisor de eventos mínimo y tipado, sin dependencias. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  /** Se suscribe a un evento. Devuelve la función que deshace la suscripción. */
  on<K extends keyof Events>(name: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  protected emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    for (const listener of this.listeners.get(name) ?? []) (listener as (p: Events[K]) => void)(payload);
  }
}
