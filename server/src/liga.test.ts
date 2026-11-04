import { describe, expect, it } from 'vitest';
import { createApi } from './api.ts';
import { openDatabase } from './db.ts';
import { ADJECTIVES, NOUNS, nickname, previousWeek, quotas, weekOf } from './liga.ts';

/** API con un reloj que el test mueve a mano. */
function setup(start = '2026-11-04T10:00:00Z') {
  const clock = { now: new Date(start) };
  const db = openDatabase(':memory:');
  const api = createApi(db, { now: () => clock.now });
  const call = (method: string, path: string, body?: unknown, token?: string) => api({ method, path, body, token });
  const at = (iso: string) => (clock.now = new Date(iso));
  const join = (avatar?: string, token?: string) => call('POST', '/api/jugadores', avatar ? { avatar } : {}, token).body as { token: string; id: number; apodo: string; liga: number };
  return { call, at, join, db };
}

type Liga = {
  semana: string;
  termina: string;
  liga: number;
  enGrupo: boolean;
  grupo: Array<{ apodo: string; xp: number; yo: boolean }>;
  sube: number;
  baja: number;
  resultadoAnterior?: { liga: number; puesto: number; cambio: string };
};

describe('semana de Madrid', () => {
  it('lunes 00:00 a domingo, hora de Madrid, con semana ISO', () => {
    // Miércoles 4 de noviembre de 2026 (invierno, UTC+1).
    expect(weekOf(new Date('2026-11-04T10:00:00Z'))).toEqual({ id: '2026-W45', starts: '2026-11-01T23:00:00.000Z', ends: '2026-11-08T23:00:00.000Z', day: 3 });
    // Domingo 23:30 en UTC ya es lunes en Madrid.
    expect(weekOf(new Date('2026-11-08T23:30:00Z')).id).toBe('2026-W46');
    expect(weekOf(new Date('2026-11-08T22:59:59Z')).day).toBe(7);
    // Semana del cambio de hora (25 de octubre de 2026): empieza a UTC+2 y acaba a UTC+1.
    expect(weekOf(new Date('2026-10-21T12:00:00Z'))).toMatchObject({ id: '2026-W43', starts: '2026-10-18T22:00:00.000Z', ends: '2026-10-25T23:00:00.000Z' });
    // Fin de año: el 1 de enero de 2027 (viernes) es de la semana 53 de 2026.
    expect(weekOf(new Date('2027-01-01T12:00:00Z')).id).toBe('2026-W53');
    expect(previousWeek(weekOf(new Date('2026-11-04T10:00:00Z'))).id).toBe('2026-W44');
  });

  it('cuotas: 7 y 5, y proporcionales en grupos pequeños sin cruzarse', () => {
    expect(quotas(30)).toEqual({ up: 7, down: 5 });
    expect(quotas(12)).toEqual({ up: 7, down: 5 });
    expect(quotas(10)).toEqual({ up: 6, down: 4 });
    expect(quotas(1)).toEqual({ up: 1, down: 0 });
    for (let n = 0; n <= 30; n++) expect(quotas(n).up + quotas(n).down).toBeLessThanOrEqual(n);
  });
});

describe('jugadores anónimos', () => {
  it('apodo generado con concordancia de género y listas largas', () => {
    expect(NOUNS.length).toBeGreaterThanOrEqual(40);
    expect(ADJECTIVES.length).toBeGreaterThanOrEqual(40);
    for (let i = 0; i < 200; i++) expect(nickname()).toMatch(/^\p{Lu}[\p{L}]* \p{Lu}\p{L}* \d{1,3}$/u);
    const fem = new Set(NOUNS.filter(([, g]) => g === 'f').map(([n]) => n));
    for (let i = 0; i < 300; i++) {
      const [noun, adj] = nickname().split(' ');
      const pair = ADJECTIVES.find(([m, f]) => m === adj || f === adj)!;
      expect(adj).toBe(fem.has(noun) ? (pair[1] ?? pair[0]) : pair[0]);
    }
  });

  it('registro, perfil, cambio de avatar y apodo, y baja', () => {
    const { call, join } = setup();
    const me = join('mascota');
    expect(me.apodo).toMatch(/ \d+$/);
    expect(me.liga).toBe(0);
    expect(call('POST', '/api/jugadores', { avatar: 'Mal Avatar' }).status).toBe(400);
    expect(call('GET', '/api/jugadores/yo', undefined, me.token).body).toEqual({ id: me.id, apodo: me.apodo, avatar: 'mascota', liga: 0 });
    const changed = call('PATCH', '/api/jugadores/yo', { avatar: 'gato-1', nuevoApodo: true }, me.token).body as { apodo: string; avatar: string };
    expect(changed.avatar).toBe('gato-1');
    expect(call('GET', '/api/liga', undefined, 'falso').status).toBe(401);
    expect(call('DELETE', '/api/jugadores/yo', undefined, me.token).status).toBe(200);
    expect(call('GET', '/api/jugadores/yo', undefined, me.token).status).toBe(401);
  });
});

describe('XP semanal', () => {
  it('monótono y con tope por día transcurrido', () => {
    const { call, join } = setup('2026-11-02T08:00:00Z'); // lunes: tope 2000
    const me = join();
    const put = (xp: unknown) => call('PUT', '/api/liga/xp', { xp }, me.token);
    expect(put(-1).status).toBe(400);
    expect(put('100').status).toBe(400);
    expect(put(150).body).toEqual({ semana: '2026-W45', xp: 150, tope: 2000 });
    expect((put(90).body as { xp: number }).xp).toBe(150); // no baja
    expect((put(999_999).body as { xp: number }).xp).toBe(2000); // tope del lunes
    const liga = call('GET', '/api/liga', undefined, me.token).body as Liga;
    expect(liga).toMatchObject({ semana: '2026-W45', termina: '2026-11-08T23:00:00.000Z', liga: 0, enGrupo: true });
    expect(liga.grupo).toEqual([{ puesto: 1, apodo: me.apodo, avatar: null, xp: 2000, yo: true }]);
  });

  it('sin XP no entra en grupo', () => {
    const { call, join } = setup();
    const me = join();
    call('PUT', '/api/liga/xp', { xp: 0 }, me.token);
    const liga = call('GET', '/api/liga', undefined, me.token).body as Liga;
    expect(liga).toMatchObject({ enGrupo: false, sube: 7, baja: 5 });
    expect(liga.grupo).toEqual([expect.objectContaining({ xp: 0, yo: true })]);
  });
});

describe('cierre de semana', () => {
  it('grupos de 30, suben 7 y bajan 5, una sola vez', () => {
    const { call, at, join, db } = setup('2026-11-04T10:00:00Z');
    // 31 jugadores en la liga 0: el 31.º abre un grupo nuevo (y, solo, sube).
    const players = Array.from({ length: 31 }, () => join());
    players.forEach((p, i) => call('PUT', '/api/liga/xp', { xp: 1000 - i * 10 }, p.token));
    const first = call('GET', '/api/liga', undefined, players[0].token).body as Liga;
    expect(first.grupo).toHaveLength(30);
    expect(first.grupo.map((g) => g.xp)).toEqual([...first.grupo.map((g) => g.xp)].sort((a, b) => b - a));
    expect(call('GET', '/api/liga', undefined, players[30].token).body).toMatchObject({ sube: 1, baja: 0 });
    // Uno que no juega esa semana se queda igual.
    const idle = join();

    // Lunes siguiente en Madrid (domingo 23:30 UTC).
    at('2026-11-08T23:30:00Z');
    const after = (i: number) => call('GET', '/api/liga', undefined, players[i].token).body as Liga;
    expect(after(0)).toMatchObject({ semana: '2026-W46', liga: 1, enGrupo: false, resultadoAnterior: { liga: 0, puesto: 1, cambio: 'sube' } });
    expect(after(6).liga).toBe(1);
    expect(after(7)).toMatchObject({ liga: 0, resultadoAnterior: { puesto: 8, cambio: 'igual' } });
    // En la liga 0 no se baja.
    expect(after(29)).toMatchObject({ liga: 0, resultadoAnterior: { puesto: 30, cambio: 'igual' } });
    expect(after(30)).toMatchObject({ liga: 1, resultadoAnterior: { puesto: 1, cambio: 'sube' } });
    expect((call('GET', '/api/liga', undefined, idle.token).body as Liga).liga).toBe(0);
    // Idempotente: más peticiones no vuelven a subir a nadie.
    call('GET', '/api/liga', undefined, players[0].token);
    expect(after(0).liga).toBe(1);
    expect((db.prepare('select count(*) as n from league_weeks').get() as { n: number }).n).toBe(1);

    // Semana 46: los 12 primeros, ya en liga 1, juegan juntos; bajan los 5 últimos.
    players.slice(0, 7).concat(players[30], ...players.slice(7, 11)).forEach((p, i) => call('PUT', '/api/liga/xp', { xp: 500 - i }, p.token));
    const league1 = call('GET', '/api/liga', undefined, players[0].token).body as Liga;
    expect(league1).toMatchObject({ liga: 1, sube: 5, baja: 3 }); // 8 en el grupo de la liga 1
    // Se salta una semana entera (W47) y vuelven en la W48: se cierra la W46.
    at('2026-11-25T10:00:00Z');
    expect(after(0)).toMatchObject({ semana: '2026-W48', liga: 2 }); // sube (5 primeros de 8)
    expect(after(0).resultadoAnterior).toBeUndefined(); // el resultado era de la W46, no de la anterior
    expect(after(30).liga).toBe(0); // último de 8 en la liga 1: baja
    expect(after(8).liga).toBe(1); // en el grupo de la liga 0 con 4: sube 2
  });
});

describe('liga de la clase', () => {
  it('alumnos con y sin jugador, y vista del profesorado', () => {
    const { call, join } = setup();
    const teacher = (call('POST', '/api/profesores', { email: 'p@insti.es', nombre: 'Ana', password: 'segura123' }).body as { token: string }).token;
    const cls = call('POST', '/api/clases', { nombre: '3.º B', curso: '3ESO' }, teacher).body as { id: number; code: string };
    const student = (alias: string) => (call('POST', '/api/unirse', { codigo: cls.code, alias, pin: '1234' }).body as { token: string }).token;
    const neon = student('Neón');
    const argon = student('Argón');
    student('Xenón'); // no juega: 0

    // Neón se apunta a la liga mundial desde su cuenta de clase: queda enlazado.
    const neonPlayer = join('mascota', neon);
    expect(join(undefined, neon).id).toBe(neonPlayer.id); // otro dispositivo, mismo jugador
    call('PUT', '/api/liga/xp', { xp: 300 }, neonPlayer.token);
    // Argón no tiene jugador: suma con su token de alumno.
    expect((call('PUT', '/api/liga/xp', { xp: 450 }, argon).body as { xp: number }).xp).toBe(450);
    // Con el token de alumno, Neón también suma en su jugador.
    call('PUT', '/api/liga/xp', { xp: 320 }, neon);
    expect((call('GET', '/api/liga', undefined, neonPlayer.token).body as Liga).grupo[0].xp).toBe(320);

    const mine = call('GET', '/api/liga/clase', undefined, neon).body as { semana: string; ranking: unknown[] };
    expect(mine.semana).toBe('2026-W45');
    expect(mine.ranking).toEqual([
      { puesto: 1, alias: 'Argón', xp: 450, yo: false },
      { puesto: 2, alias: 'Neón', xp: 320, yo: true },
      { puesto: 3, alias: 'Xenón', xp: 0, yo: false },
    ]);
    expect(call('GET', '/api/liga/clase', undefined, neonPlayer.token).status).toBe(401);

    const panel = call('GET', `/api/clases/${cls.id}/liga`, undefined, teacher).body as { alumnos: Array<{ alias: string; xp: number }> };
    expect(panel.alumnos.map((a) => [a.alias, a.xp])).toEqual([['Argón', 450], ['Neón', 320], ['Xenón', 0]]);
    expect(call('GET', `/api/clases/${cls.id}/liga`, undefined, neon).status).toBe(401);

    // Si Neón deja la liga mundial, su XP de clase sigue.
    call('DELETE', '/api/jugadores/yo', undefined, neonPlayer.token);
    expect((call('GET', '/api/liga/clase', undefined, neon).body as { ranking: Array<{ xp: number }> }).ranking[1].xp).toBe(320);
  });

  it('acepta los eventos nuevos en la sincronización', () => {
    const { call } = setup();
    const teacher = (call('POST', '/api/profesores', { email: 'p@insti.es', nombre: 'Ana', password: 'segura123' }).body as { token: string }).token;
    const cls = call('POST', '/api/clases', { nombre: 'A', curso: '2ESO' }, teacher).body as { code: string };
    const token = (call('POST', '/api/unirse', { codigo: cls.code, alias: 'Kr', pin: '1234' }).body as { token: string }).token;
    const tipos = ['leccion', 'lectura', 'adivina', 'compra', 'cofre', 'foto', 'racha'];
    const eventos = tipos.map((tipo) => ({ id: tipo, tipo, datos: { n: 1 } }));
    eventos.push({ id: 'grande', tipo: 'foto', datos: { n: 'x'.repeat(3000) } as unknown as { n: number } });
    expect((call('POST', '/api/sync', { eventos }, token).body as { aceptados: string[] }).aceptados).toEqual(tipos);
  });
});
