import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ELEMENTS, SPECIES } from '@webar/chem';
import textos from '../i18n/es/objetos.json';
import { ARCHETYPES, EVERYDAY_CONTENTS, createEveryday, everydayArchetype, hasEveryday } from './index';

// Sin WebGL: solo se construyen, se animan y se desechan los objetos.
const table = textos as Record<string, { texto: string; descripcion?: string }>;
const ALL = [...ELEMENTS.map((e) => e.symbol), ...SPECIES.map((s) => s.id)];

describe('objetos cotidianos', () => {
  it('los 118 elementos y las 50 sustancias tienen arquetipo y textos', () => {
    expect(ALL).toHaveLength(168);
    for (const c of ALL) {
      expect(hasEveryday(c), c).toBe(true);
      expect(everydayArchetype(c)!.archetype in ARCHETYPES, c).toBe(true);
      expect(table[`objeto.${c}`]?.texto, `objeto.${c}`).toBeTruthy();
      expect(table[`objeto.${c}.porque`]?.texto, `objeto.${c}.porque`).toBeTruthy();
    }
    expect(EVERYDAY_CONTENTS).toHaveLength(168);
    expect(hasEveryday('Xx')).toBe(false);
  });

  it('no sobran textos ni objetos de contenidos que no existen', () => {
    const known = new Set(ALL);
    for (const c of EVERYDAY_CONTENTS) expect(known.has(c), c).toBe(true);
    for (const key of Object.keys(table)) expect(known.has(key.replace(/^objeto\./, '').replace(/\.porque$/, '')), key).toBe(true);
  });

  it('se crean, se animan, caben en su radio y se desechan', () => {
    const scene = new THREE.Scene();
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    for (const c of ALL) {
      for (const calm of [false, true]) {
        const obj = createEveryday(c, { size: 0.5, calm });
        scene.add(obj.object);
        expect(obj.radius).toBe(0.5);
        for (let i = 0; i < 5; i++) obj.update(1 / 30);
        obj.update(10); // un salto grande no debe romper nada
        obj.object.updateMatrixWorld(true);
        // Las mallas (sin halos ni partículas) caben, con holgura, en el radio.
        box.makeEmpty();
        obj.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
        });
        box.getBoundingSphere(sphere);
        expect(sphere.radius, `${c}: radio ${sphere.radius.toFixed(2)}`).toBeLessThan(0.5 * 1.6);
        expect(Number.isFinite(sphere.radius), c).toBe(true);
        obj.dispose();
        expect(obj.object.parent).toBeNull();
      }
    }
    expect(scene.children).toHaveLength(0);
  });

  it('el tamaño por defecto cabe encima de una tarjeta', () => {
    const obj = createEveryday('He');
    expect(obj.radius).toBeCloseTo(0.03);
    expect(obj.object.scale.x).toBeCloseTo(0.03);
    obj.dispose();
    // Los puntos no heredan la escala: su tamaño va proporcional al objeto.
    const sizes = (s: number) => {
      const o = createEveryday('Sr', { size: s });
      const out: number[] = [];
      o.object.traverse((c) => (c as THREE.Points).isPoints && out.push(((c as THREE.Points).material as THREE.PointsMaterial).size));
      o.dispose();
      return out;
    };
    expect(sizes(0.016)[0] / sizes(0.5)[0]).toBeCloseTo(0.016 / 0.5);
  });
});
