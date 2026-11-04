import { getElement } from '@webar/chem';
import { describe, expect, it } from 'vitest';
import { BOND_SLOTS, bondCount } from './card-svg';

describe('enlaces dibujados en las tarjetas', () => {
  it('cada átomo, los enlaces que suele formar', () => {
    const count = (s: string) => bondCount(getElement(s));
    expect(['H', 'O', 'N', 'C', 'He', 'Na', 'Mg', 'Cl', 'S', 'Al', 'Si'].map(count)).toEqual([1, 2, 3, 4, 0, 1, 2, 1, 2, 3, 4]);
  });

  it('las alturas son comunes: dos tarjetas juntas comparten tantas rayas como el menor de sus enlaces', () => {
    const shared = (a: string, b: string) => {
      const ya = BOND_SLOTS.slice(0, bondCount(getElement(a)));
      return BOND_SLOTS.slice(0, bondCount(getElement(b))).filter((y) => ya.includes(y)).length;
    };
    expect(shared('H', 'O')).toBe(1);
    expect(shared('O', 'C')).toBe(2);
    expect(shared('N', 'N')).toBe(3);
    expect(shared('He', 'H')).toBe(0);
  });
});
