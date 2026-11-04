import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './api.ts';
import { resolveToken } from './auth.ts';
import { CAST_LIMITS, CastHub, createCastHandler } from './cast.ts';
import { openDatabase } from './db.ts';

const jpeg = (size = 100) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(size)]);

/** Un reloj que el test mueve a mano. */
function hubAt(start = 1_000_000) {
  const clock = { now: start };
  return { hub: new CastHub({ now: () => clock.now }), clock };
}

describe('emisión: señalización en memoria', () => {
  it('pantalla y emisor del mismo profesor se ven y se mandan mensajes', async () => {
    const { hub } = hubAt();
    const screen = hub.join(1, 'pantalla', 'Aula 2');
    const phone = hub.join(1, 'emisor', 'Móvil\u0007 de Ana');
    expect(hub.status(1)).toMatchObject({ emisores: [{ id: phone.id, nombre: 'Móvil de Ana', modo: 'app' }], pantallas: [{ id: screen.id }] });

    // La pantalla espera; el mensaje del emisor la despierta enseguida.
    const waiting = hub.poll(1, screen.id, 10_000);
    hub.send(1, phone.id, screen.id, 'oferta', { sdp: 'v=0' });
    const out = await waiting;
    expect(out.mensajes).toEqual([{ de: phone.id, tipo: 'oferta', datos: { sdp: 'v=0' } }]);
    // Ya se entregó: no vuelve a salir.
    expect((await hub.poll(1, screen.id, 0)).mensajes).toEqual([]);

    // Que entre o salga alguien también despierta la espera.
    const again = hub.poll(1, screen.id, 10_000);
    hub.leave(1, phone.id);
    expect((await again).emisores).toEqual([]);
  });

  it('un profesor no ve ni toca lo de otro', async () => {
    const { hub } = hubAt();
    const phone = hub.join(1, 'emisor', 'A');
    const screen = hub.join(1, 'pantalla', 'A');
    const intruder = hub.join(2, 'pantalla', 'B');
    expect(hub.status(2).emisores).toEqual([]);
    expect(() => hub.send(2, intruder.id, phone.id, 'ver', undefined)).toThrow(/No existe/);
    expect(() => hub.send(1, phone.id, intruder.id, 'oferta', {})).toThrow(/No existe/);
    await expect(hub.poll(2, screen.id, 0)).rejects.toThrow(/No existe/);
    await expect(hub.getFrame(2, phone.id, 0, 0)).rejects.toThrow(/No existe/);
    expect(() => hub.putFrame(2, phone.id, jpeg())).toThrow(/No existe/);
    expect(() => hub.leave(2, phone.id)).toThrow(/No existe/);
    expect(hub.status(1).emisores).toHaveLength(1);
  });

  it('valida tipos, tamaños y topes', () => {
    const { hub } = hubAt();
    expect(() => hub.join(1, 'admin', '')).toThrow(/rol/);
    const phone = hub.join(1, 'emisor', '');
    const screen = hub.join(1, 'pantalla', '');
    expect(() => hub.send(1, screen.id, phone.id, 'ejecutar', {})).toThrow(/tipo/);
    expect(() => hub.send(1, screen.id, phone.id, 'ice', { x: 'a'.repeat(CAST_LIMITS.maxMessage) })).toThrow(/grande/);
    // Entre dos pantallas no: siempre emisor ↔ pantalla.
    const screen2 = hub.join(1, 'pantalla', '');
    expect(() => hub.send(1, screen.id, screen2.id, 'ver', undefined)).toThrow(/No existe/);
    for (let i = 1; i < CAST_LIMITS.emittersPerTeacher; i++) hub.join(1, 'emisor', '');
    expect(() => hub.join(1, 'emisor', '')).toThrow(/demasiados/);
    expect(() => hub.update(1, phone.id, { modo: 'raro' })).toThrow(/modo/);
    hub.update(1, phone.id, { modo: 'mundo' });
    expect(hub.status(1).emisores[0].modo).toBe('mundo');
  });

  it('si el mismo navegador vuelve a entrar, sustituye a su fantasma', () => {
    const { hub } = hubAt();
    const ghost = hub.join(1, 'emisor', 'Móvil', 'pestana-1234');
    const other = hub.join(1, 'emisor', 'Móvil', 'pestana-5678');
    const again = hub.join(1, 'emisor', 'Móvil', 'pestana-1234');
    expect(hub.status(1).emisores.map((e) => e.id)).toEqual([other.id, again.id]);
    expect(hub.status(1).emisores.some((e) => e.id === ghost.id)).toBe(false);
    // De otro profesor no se toca aunque coincida la clave.
    hub.join(2, 'emisor', 'X', 'pestana-5678');
    expect(hub.status(1).emisores).toHaveLength(2);
  });

  it('el buzón no crece sin límite', async () => {
    const { hub } = hubAt();
    const phone = hub.join(1, 'emisor', '');
    const screen = hub.join(1, 'pantalla', '');
    for (let i = 0; i < CAST_LIMITS.inbox + 50; i++) hub.send(1, phone.id, screen.id, 'ice', { i });
    const { mensajes } = await hub.poll(1, screen.id, 0);
    expect(mensajes).toHaveLength(CAST_LIMITS.inbox);
    expect(mensajes.at(-1)).toMatchObject({ datos: { i: CAST_LIMITS.inbox + 49 } });
  });

  it('caduca a quien deja de preguntar', () => {
    const { hub, clock } = hubAt();
    const phone = hub.join(1, 'emisor', '');
    hub.join(1, 'pantalla', '');
    clock.now += CAST_LIMITS.idleMs - 1000;
    hub.status(1);
    hub.update(1, phone.id, { modo: 'camara' }); // el emisor sigue vivo
    clock.now += 2000;
    hub.sweep();
    expect(hub.status(1)).toMatchObject({ emisores: [{ id: phone.id }], pantallas: [] });
    expect(hub.size).toBe(1);
  });
});

describe('emisión: relevo de imágenes', () => {
  it('guarda solo la última imagen, unos segundos, y se la da a quien mira', async () => {
    const { hub, clock } = hubAt();
    const phone = hub.join(1, 'emisor', '');
    // Quien mira espera a la primera imagen.
    const next = hub.getFrame(1, phone.id, 0, 10_000);
    expect(hub.putFrame(1, phone.id, jpeg(10))).toEqual({ secuencia: 1, mirando: true });
    expect((await next)?.seq).toBe(1);
    clock.now += 100;
    hub.putFrame(1, phone.id, jpeg(20));
    expect(hub.frameBytes).toBe(23); // la primera ya no está
    expect((await hub.getFrame(1, phone.id, 1, 0))?.data.length).toBe(23);
    // Si ya tiene la última, no hay nada nuevo.
    expect(await hub.getFrame(1, phone.id, 2, 0)).toBeNull();
    // Pasado un rato sin imágenes, se borra.
    clock.now += CAST_LIMITS.frameTtlMs + 1;
    hub.sweep();
    expect(hub.frameBytes).toBe(0);
    // Al irse el emisor, tampoco queda nada.
    clock.now += 100;
    hub.putFrame(1, phone.id, jpeg());
    hub.leave(1, phone.id);
    expect(hub.frameBytes).toBe(0);
  });

  it('rechaza lo que no es JPEG, lo grande y el exceso de ritmo', () => {
    const { hub, clock } = hubAt();
    const phone = hub.join(1, 'emisor', '');
    const screen = hub.join(1, 'pantalla', '');
    expect(() => hub.putFrame(1, phone.id, Buffer.from('<svg/>'))).toThrow(/JPEG/);
    expect(() => hub.putFrame(1, phone.id, jpeg(CAST_LIMITS.maxFrame))).toThrow(/grande/);
    expect(() => hub.putFrame(1, screen.id, jpeg())).toThrow(/No existe/); // solo los emisores suben
    hub.putFrame(1, phone.id, jpeg());
    expect(() => hub.putFrame(1, phone.id, jpeg())).toThrow(/Demasiadas/);
    clock.now += CAST_LIMITS.minFrameGapMs;
    expect(hub.putFrame(1, phone.id, jpeg()).secuencia).toBe(2);
  });
});

describe('emisión: rutas HTTP', () => {
  let close: () => void = () => {};
  afterEach(() => close());

  async function serve() {
    const db = openDatabase(':memory:');
    const api = createApi(db);
    const hub = new CastHub();
    const handler = createCastHandler(hub, (token) => {
      const who = resolveToken(db, token);
      return who?.kind === 'teacher' ? who.ownerId : null;
    });
    const server = createServer((req, res) => void handler(req, res, new URL(req.url ?? '/', 'http://x')));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    close = () => (server.closeAllConnections(), server.close());
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const teacher = (email: string) => (api({ method: 'POST', path: '/api/profesores', body: { email, nombre: 'P', password: 'segura123' } }).body as { token: string }).token;
    const call = async (method: string, path: string, token: string | undefined, body?: unknown, raw?: Buffer) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(raw ? { 'Content-Type': 'image/jpeg' } : {}) },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      const type = res.headers.get('content-type') ?? '';
      return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    return { call, teacher, api };
  }

  it('solo con token de profesor; dos dispositivos de la misma cuenta se encuentran', async () => {
    const { call, teacher, api } = await serve();
    const ana = teacher('ana@insti.es');
    // Segundo dispositivo de la misma cuenta: otro token que también vale.
    const anaPc = (api({ method: 'POST', path: '/api/sesion', body: { email: 'ana@insti.es', password: 'segura123' } }).body as { token: string }).token;
    const luis = teacher('luis@insti.es');

    expect((await call('GET', '/api/emision', undefined)).status).toBe(401);
    const cls = api({ method: 'POST', path: '/api/clases', body: { nombre: 'A', curso: '3ESO' }, token: ana }).body as { code: string };
    const student = (api({ method: 'POST', path: '/api/unirse', body: { codigo: cls.code, alias: 'Neón', pin: '1234' } }).body as { token: string }).token;
    expect((await call('POST', '/api/emision', student, { rol: 'emisor' })).status).toBe(401);

    const screen = (await call('POST', '/api/emision', anaPc, { rol: 'pantalla', nombre: 'Proyector' })).body as { id: string; ice: unknown[] };
    expect(screen.ice.length).toBeGreaterThan(0);
    const phone = (await call('POST', '/api/emision', ana, { rol: 'emisor', nombre: 'Móvil' })).body as { id: string; pantallas: unknown[] };
    expect(phone.pantallas).toHaveLength(1);

    // La pantalla pide ver; el móvil lo recibe por su buzón (espera larga).
    const inbox = call('GET', `/api/emision/${phone.id}/buzon`, ana);
    expect((await call('POST', `/api/emision/${screen.id}/mensajes`, anaPc, { a: phone.id, tipo: 'ver' })).status).toBe(200);
    expect((await inbox).body).toMatchObject({ mensajes: [{ de: screen.id, tipo: 'ver' }] });

    // Luis no ve nada de Ana.
    expect((await call('GET', '/api/emision', luis)).body).toEqual({ emisores: [], pantallas: [] });
    expect((await call('GET', `/api/emision/${phone.id}/imagen?tras=0`, luis)).status).toBe(404);
    expect((await call('POST', `/api/emision/${screen.id}/mensajes`, luis, { a: phone.id, tipo: 'ver' })).status).toBe(404);

    // Relevo: el móvil sube un JPEG y la pantalla lo recibe con su número.
    const up = await call('PUT', `/api/emision/${phone.id}/imagen`, ana, undefined, jpeg(1000));
    expect(up.body).toMatchObject({ secuencia: 1 });
    const frame = await call('GET', `/api/emision/${phone.id}/imagen?tras=0`, anaPc);
    expect(frame.status).toBe(200);
    expect(frame.headers.get('content-type')).toBe('image/jpeg');
    expect(frame.headers.get('x-secuencia')).toBe('1');
    expect((frame.body as Buffer).length).toBe(1003);
    expect((await call('PUT', `/api/emision/${phone.id}/imagen`, ana, undefined, jpeg(CAST_LIMITS.maxFrame + 10))).status).toBe(413);

    // Al dejar de emitir desaparece de la lista.
    expect((await call('DELETE', `/api/emision/${phone.id}`, ana)).status).toBe(200);
    expect((await call('GET', '/api/emision', anaPc)).body).toMatchObject({ emisores: [] });
  });
});
