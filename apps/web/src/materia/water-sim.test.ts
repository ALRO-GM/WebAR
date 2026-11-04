import { describe, expect, it } from 'vitest';
import { BOX, WaterSim } from './water-sim';

const run = (sim: WaterSim, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 30) sim.step(1 / 30);
};

describe('simulación del agua', () => {
  it('empieza como hielo, con forma de agua y puentes de hidrógeno', () => {
    const sim = new WaterSim(-10);
    expect(sim.count).toBeGreaterThanOrEqual(40);
    expect(sim.count).toBeLessThanOrEqual(80);
    run(sim, 1);
    expect(sim.phase()).toBe('solido');
    // Cada molécula del interior tiene 2 puentes dados: en total, más de una por molécula.
    expect(sim.hydrogenBonds().length).toBeGreaterThan(sim.count);
  });

  it('vibra más cuanto más caliente está el hielo', () => {
    const sim = new WaterSim(-30);
    const cold = sim.vibration();
    sim.temperature = -2;
    expect(sim.vibration()).toBeGreaterThan(cold * 2);
  });

  it('se funde a 0 °C, hierve a 100 °C y todo pasa a gas', () => {
    const sim = new WaterSim(-10);
    sim.temperature = 20;
    run(sim, 1);
    expect(sim.phase()).toBe('fusion');
    run(sim, 4);
    expect(sim.melt).toBe(1);
    expect(sim.liquidCount).toBeGreaterThan(sim.count - 3);
    // La gota no se escapa de su sitio: todas cerca del centro.
    for (const m of sim.molecules.filter((x) => !x.gas)) expect(m.p.length()).toBeLessThan(sim.fullRadius + 2);
    sim.temperature = 120;
    run(sim, 3);
    expect(sim.phase()).toBe('ebullicion');
    const radius = sim.dropRadius;
    run(sim, 40);
    expect(sim.dropRadius).toBeLessThan(radius);
    expect(sim.phase()).toBe('gas');
    for (const m of sim.molecules) expect(Math.abs(m.p.x)).toBeLessThanOrEqual(BOX + 1e-9);
  });

  it('se evapora un poco por debajo de 100 °C (más a más temperatura)', () => {
    const warm = new WaterSim(30);
    const hot = new WaterSim(90);
    run(warm, 20);
    run(hot, 20);
    expect(hot.gasCount).toBeGreaterThan(warm.gasCount);
    expect(hot.liquidCount).toBeGreaterThan(0);
  });

  it('al enfriar condensa y se congela otra vez', () => {
    const sim = new WaterSim(130);
    expect(sim.gasCount).toBe(sim.count);
    sim.temperature = -10;
    run(sim, 90);
    expect(sim.gasCount).toBe(0);
    run(sim, 6);
    expect(sim.phase()).toBe('solido');
  });
});
