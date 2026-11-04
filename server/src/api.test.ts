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

    // Actividades: el profesor lanza un acertijo y una Adivina; el alumno las ve al sincronizar y su resultado le llega al profesor.
    expect(call('POST', `/api/clases/${cls.id}/actividades`, { tipo: 'adivina', elementos: ['H'] }, teacher).status).toBe(400);
    const riddle = call('POST', `/api/clases/${cls.id}/actividades`, { tipo: 'acertijo', acertijo: 'H2O' }, teacher).body as { id: number };
    call('POST', `/api/clases/${cls.id}/actividades`, { tipo: 'adivina', elementos: ['H', 'O', 'He'] }, teacher);
    const seen = call('POST', '/api/sync', { eventos: [{ id: 'act1', tipo: 'actividad', datos: { actividad: riddle.id, tipo: 'acertijo', puntos: 85, resuelto: true }, fecha: '2026-11-04T11:00:00Z' }] }, student).body as { actividades: Array<{ id: number; tipo: string }> };
    expect(seen.actividades.map((a) => a.tipo).sort()).toEqual(['acertijo', 'adivina']);
    const withResults = call('GET', `/api/clases/${cls.id}`, undefined, teacher).body as { actividades: Array<{ id: number; resultados: Array<{ alias: string; puntos: number }> }> };
    expect(withResults.actividades.find((a) => a.id === riddle.id)!.resultados).toEqual([expect.objectContaining({ alias: 'Neón', puntos: 85 })]);
    call('DELETE', `/api/clases/${cls.id}/actividades/${riddle.id}`, undefined, teacher);
    const after = call('POST', '/api/sync', { eventos: [] }, student).body as { actividades: Array<{ tipo: string }> };
    expect(after.actividades.map((a) => a.tipo)).toEqual(['adivina']);

    // Otro profesor no ve la clase; un alumno no puede usar rutas de profesor.
    const other = (call('POST', '/api/profesores', { email: 'otro@insti.es', nombre: 'Luis', password: 'segura123' }).body as { token: string }).token;
    expect(call('GET', `/api/clases/${cls.id}`, undefined, other).status).toBe(404);
    expect(call('GET', `/api/clases/${cls.id}/eventos`, undefined, other).status).toBe(404);
    expect(call('GET', `/api/clases/${cls.id}/eventos`, undefined, student).status).toBe(401);
    expect(call('GET', '/api/profesor', undefined, student).status).toBe(401);
  });

  it('demostración: un profesor con una clase de alias inventados y un alumno «Demo» en ella', () => {
    const { call } = setup();
    const demo = call('POST', '/api/demo').body as { token: string; clase: number };
    const stats = call('GET', `/api/clases/${demo.clase}/eventos`, undefined, demo.token).body as { alumnos: unknown[]; eventos: unknown[] };
    expect(stats.alumnos.length).toBe(24);
    expect(stats.eventos.length).toBeGreaterThan(200);
    const detail = call('GET', `/api/clases/${demo.clase}`, undefined, demo.token).body as { actividades: Array<{ resultados: unknown[] }> };
    expect(detail.actividades).toHaveLength(2);
    expect(detail.actividades.every((a) => a.resultados.length > 3)).toBe(true);
    // Otra vez: la misma clase, sin duplicar alias.
    expect((call('POST', '/api/demo').body as { clase: number }).clase).toBe(demo.clase);
    const student = call('POST', '/api/demo/alumno').body as { token: string; alumno: { alias: string } };
    expect(student.alumno.alias).toBe('Demo');
    const sync = call('POST', '/api/sync', { eventos: [] }, student.token).body as { actividades: unknown[]; clase: { alumnos: number } };
    expect(sync.actividades).toHaveLength(2);
    expect(sync.clase.alumnos).toBe(25);
  });
});
