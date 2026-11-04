import * as THREE from 'three';
import { getElement, getSpecies } from '@webar/chem';
import * as device from './archetypes/device';
import * as home from './archetypes/home';
import * as light from './archetypes/light';
import * as metalA from './archetypes/metal';
import { CATALOG, type ArchetypeId } from './catalog';
import { Kit, disposeTree, type Params } from './kit';

/**
 * Objetos cotidianos en 3D: dónde encontramos cada elemento y sustancia en la
 * vida diaria (el helio → el Sol, el oro → un doblón, el agua → una gota que
 * ondula). Cada uno es un arquetipo parametrizable y animado.
 *
 * Textos: `objeto.<contenido>` (lo que se ve) y `objeto.<contenido>.porque`
 * (su relación con el elemento), en i18n/es/objetos.json.
 */

export interface EverydayObject {
  object: THREE.Object3D;
  /** Radio aproximado (m): el objeto cabe en una esfera de este radio centrada en su origen. */
  radius: number;
  update(dt: number): void;
  dispose(): void;
}

export interface EverydayOptions {
  /** Radio deseado en metros (por defecto 0,03: cabe encima de una tarjeta de 6,3 × 8,8 cm). */
  size?: number;
  /** Modo calma: movimiento mínimo y sin parpadeos. */
  calm?: boolean;
}

type Builder = (k: Kit, p: Params) => void;

export const ARCHETYPES: Record<ArchetypeId, Builder> = {
  estrella: light.star,
  globo: light.balloon,
  neon: light.neon,
  bombilla: light.bulb,
  farola: light.lamp,
  led: light.led,
  laser: light.laser,
  planeta: light.planet,
  nube: light.cloud,
  chispas: light.sparks,
  llama: light.flame,
  cohete: light.rocket,
  volcan: light.volcano,
  moneda: metalA.coin,
  lingote: metalA.ingot,
  anillo: metalA.ring,
  cable: metalA.cable,
  ferreteria: metalA.ironware,
  sarten: metalA.pan,
  grifo: metalA.tap,
  lata: metalA.can,
  bateria: metalA.battery,
  iman: metalA.magnet,
  implante: metalA.implant,
  turbina: metalA.turbine,
  chip: device.chip,
  movil: device.phone,
  reloj: device.clock,
  detector: device.detector,
  termometro: device.thermometer,
  jeringa: device.syringe,
  billete: device.banknote,
  gafas: device.glasses,
  bombona: device.tank,
  barra: device.rod,
  nucleo: device.nucleus,
  gema: home.gem,
  vidrio: home.vase,
  frasco: home.bottle,
  tubo_ensayo: home.testTube,
  agua: home.water,
  refresco: home.soda,
  saco: home.sack,
  salero: home.saltShaker,
  jabon: home.soap,
  huevo: home.egg,
  fruta: home.fruit,
  hueso: home.bone,
  planta: home.plant,
  piscina: home.pool,
  tubo: home.squeezeTube,
};

/** Todos los contenidos con objeto (los 118 elementos y las 50 sustancias). */
export const EVERYDAY_CONTENTS: readonly string[] = Object.keys(CATALOG);

export function hasEveryday(content: string): boolean {
  return content in CATALOG;
}

/** Arquetipo y variante de un contenido (para depurar o agrupar). */
export function everydayArchetype(content: string): { archetype: ArchetypeId; variant?: string } | undefined {
  const e = CATALOG[content];
  return e && { archetype: e[0], variant: e[1]?.variant };
}

/** Claves de texto: nombre de lo que se ve y por qué. */
export const everydayKeys = (content: string) => ({ name: `objeto.${content}`, why: `objeto.${content}.porque` });

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Crea el objeto cotidiano de `content`: símbolo de elemento ('He') o id de
 * sustancia ('H2O', 'Fe2O3'). Centrado en el origen, con «arriba» en +Y y de
 * frente hacia +Z.
 */
export function createEveryday(content: string, opts: EverydayOptions = {}): EverydayObject {
  const size = opts.size ?? 0.03;
  const entry = CATALOG[content];
  const kit = new Kit(!!opts.calm, hash(content));
  if (entry) {
    const [id, params = {}] = entry;
    const p: Params = { seed: hash(content) % 1000, ...params };
    // Los núcleos llevan el color del elemento (CPK de la tabla).
    if (id === 'nucleo' && !p.color && !getSpecies(content)) p.color = getElement(content).color;
    ARCHETYPES[id](kit, p);
  } else {
    // Sin objeto: un núcleo genérico, para no romper nada.
    device.nucleus(kit, { color: '#9aa3ad' });
  }
  const object = new THREE.Group();
  object.name = `objeto:${content}`;
  object.add(kit.root);
  object.scale.setScalar(size);
  // El tamaño de los puntos (chispas, humo) no hereda la escala del objeto: se ajusta a mano.
  kit.root.traverse((o) => {
    if ((o as THREE.Points).isPoints) ((o as THREE.Points).material as THREE.PointsMaterial).size *= size;
  });
  let t = 0;
  const step = (dt: number) => {
    const d = Math.min(dt, 0.1) * kit.motion;
    t += d;
    for (const a of kit.anims) a(t, d);
  };
  step(0); // primera pose
  return {
    object,
    radius: size,
    update: step,
    dispose: () => {
      object.removeFromParent();
      disposeTree(object);
    },
  };
}
