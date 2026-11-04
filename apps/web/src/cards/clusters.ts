import type * as THREE from 'three';

/** Grupos de tarjetas conectadas (cada una a menos de `distance` de alguna del grupo). */
export function clusterCards(positions: THREE.Vector3[], distance: number): number[][] {
  const parent = positions.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++)
      if (positions[i].distanceTo(positions[j]) < distance) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  positions.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  return [...groups.values()];
}
