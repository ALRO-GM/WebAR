import { describe, expect, it } from 'vitest';
import { createApi } from './api.ts';
import { openDatabase } from './db.ts';

function setup() {
  const api = createApi(openDatabase(':memory:'));
  const call = (method: string, path: string, body?: unknown, token?: string) => api({ method, path, body, token });
  return { call };
}

describe('API de clases', () => {
  it('profesor → clase → alumno se une → sincroniza → el profesor lo ve', () => {
    const { call } = setup();
    const reg = call('POST', '/api/profesores', { email: 'Profe@Insti.es', nombre: 'Ana', password: 'segura123' });
    expect(reg.status).toBe(200);
    const teacher = (reg.body as { token: string }).token;
    expect(call('POST', '/api/sesion', { email: 'profe@insti.es', password: 'mal' }).status).toBe(401);
    expect(call('POST', '/api/sesion', { email: 'profe@insti.es', password: 'segura123' }).status).toBe(200);

    const cls = call('POST', '/api/clases', { nombre: '3.º B', curso: '3ESO' }, teacher).body as { id: number; code: string };
    expect(cls.code).toMatch(/^[A-Z2-9]{6}$/);
    call('POST', `/api/clases/${cls.id}/retos`, { titulo: 'Óxidos', objetivos: ['CO2', 'MgO'] }, teacher);

    const join = call('POST', '/api/unirse', { codigo: cls.code.toLowerCase(), alias: 'Neón', pin: '1234' });
    expect(join.status).toBe(200);
    const student = (join.body as { token: string }).token;
    // Mismo alias con otro PIN: no; con el suyo: entra de nuevo (otro dispositivo).
    expect(call('POST', '/api/unirse', { codigo: cls.code, alias: 'neón', pin: '9999' }).status).toBe(409);
    expect(call('POST', '/api/unirse', { codigo: cls.code, alias: 'neón', pin: '1234' }).status).toBe(200);

    const events = [
      { id: 'a1', tipo: 'descubrir', datos: { sustancia: 'H2O' }, fecha: '2026-11-04T10:00:00Z' },
      { id: 'a2', tipo: 'reaccion', datos: { reaccion: 'combustion-c' }, fecha: '2026-11-04T10:01:00Z' },
      { id: 'mal', tipo: 'hackear', datos: {} },
    ];
    const sync = call('POST', '/api/sync', { eventos: events }, student).body as { aceptados: string[]; retos: unknown[]; discovered: unknown[] };
    expect(sync.aceptados).toEqual(['a1', 'a2']);
    expect(sync.retos).toHaveLength(1);
    // Reenviar no duplica (idempotente por id).
    call('POST', '/api/sync', { eventos: events }, student);

    const detail = call('GET', `/api/clases/${cls.id}`, undefined, teacher).body as { alumnos: Array<{ alias: string; discovered: number; reactions: number }> };
    expect(detail.alumnos).toEqual([expect.objectContaining({ alias: 'Neón', discovered: 1, reactions: 1 })]);

    // Estadísticas: los eventos de la clase (con alias, sin nada más del alumno) y el resumen por clase.
    const stats = call('GET', `/api/clases/${cls.id}/eventos`, undefined, teacher).body as { alumnos: Array<Record<string, unknown>>; eventos: unknown[][] };
    expect(stats.alumnos).toEqual([expect.objectContaining({ alias: 'Neón' })]);
    expect(Object.keys(stats.alumnos[0])).not.toContain('pin');
    expect(stats.eventos.map((e) => e[1])).toEqual(['descubrir', 'reaccion']);
    expect(stats.eventos[0][2]).toEqual({ sustancia: 'H2O' });
    const resumen = call('GET', '/api/profesor/resumen', undefined, teacher).body as { clases: Array<{ alumnos: number }> };
    expect(resumen.clases).toEqual([expect.objectContaining({ id: cls.id, alumnos: 1 })]);

    // Otro profesor no ve la clase; un alumno no puede usar rutas de profesor.
    const other = (call('POST', '/api/profesores', { email: 'otro@insti.es', nombre: 'Luis', password: 'segura123' }).body as { token: string }).token;
    expect(call('GET', `/api/clases/${cls.id}`, undefined, other).status).toBe(404);
    expect(call('GET', `/api/clases/${cls.id}/eventos`, undefined, other).status).toBe(404);
    expect(call('GET', `/api/clases/${cls.id}/eventos`, undefined, student).status).toBe(401);
    expect(call('GET', '/api/profesor', undefined, student).status).toBe(401);
  });
});
