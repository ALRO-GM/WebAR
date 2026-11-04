/**
 * Sustancias que se pueden formar con las cartas: moléculas y compuestos de
 * hasta 5 átomos, las que más salen en la ESO y el Bachillerato.
 *
 * Entalpías de formación estándar (25 °C, 1 bar) de las tablas del NBS, las
 * de los libros de texto (Atkins, CRC). Geometrías aproximadas con VSEPR y
 * longitudes de enlace reales (Å).
 */

export type Vec3 = [number, number, number];
export type State = 'g' | 'l' | 's';

export interface MoleculeAtom {
  symbol: string;
  position: Vec3; // Å
}

/** Enlace entre los átomos i y j, de orden 1, 2 o 3 (0,5 para iónico). */
export type Bond = [number, number, number];

export interface Species {
  /** Clave canónica: la fórmula tal cual (H2O, Ca(OH)2…). */
  id: string;
  /** Fórmula para mostrar, con subíndices. */
  formula: string;
  name: string;
  /** Para qué se usa o dónde aparece. */
  note: string;
  /** Entalpía de formación estándar, kJ/mol. */
  deltaHf: number;
  state: State;
  /** Iónico: enlaces dibujados como atracción, no como palitos. */
  ionic?: boolean;
  atoms: MoleculeAtom[];
  bonds: Bond[];
}

/**
 * Elementos cuyo estado natural es una molécula diatómica: su carta es un
 * átomo suelto (gas monoatómico), con su entalpía de formación. Juntar dos
 * desprende la energía del enlace. El resto de cartas (C, Na, Fe…) son el
 * elemento en su estado natural (ΔHf = 0), como en las ecuaciones de los libros.
 */
export const ATOM_DELTA_HF: Record<string, number> = { H: 217.97, N: 472.7, O: 249.17, F: 78.99, Cl: 121.68, Br: 111.88, I: 106.84 };

// --- Geometría --------------------------------------------------------------

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (symbol: string, x = 0, y = 0, z = 0): MoleculeAtom => ({ symbol, position: [x, y, z] });

/** A–B en línea (eje x), centrado. */
function diatomic(a: string, b: string, d: number, order: number) {
  return { atoms: [at(a, -d / 2), at(b, d / 2)], bonds: [[0, 1, order]] as Bond[] };
}

/** Lineal de 3: ligando–centro–ligando (sobre el eje x). */
function linear(left: string, center: string, right: string, d1: number, d2: number, o1: number, o2: number) {
  return { atoms: [at(center), at(left, -d1), at(right, d2)], bonds: [[0, 1, o1], [0, 2, o2]] as Bond[] };
}

/** Angular: centro con dos ligandos formando `angle` grados (plano xy, apuntando hacia abajo). */
function bent(center: string, a: string, b: string, d: number, angle: number, order = 1, d2 = d, order2 = order) {
  const h = rad(angle / 2);
  return {
    atoms: [at(center), at(a, -d * Math.sin(h), -d * Math.cos(h)), at(b, d2 * Math.sin(h), -d2 * Math.cos(h))],
    bonds: [[0, 1, order], [0, 2, order2]] as Bond[],
  };
}

/** Trigonal plana: centro y tres ligandos a 120° (plano xy). */
function trigonal(center: string, ligands: string[], d: number[], orders: number[]) {
  return {
    atoms: [at(center), ...ligands.map((l, i) => at(l, d[i] * Math.cos(rad(90 + 120 * i)), d[i] * Math.sin(rad(90 + 120 * i))))],
    bonds: ligands.map((_, i) => [0, i + 1, orders[i]]) as Bond[],
  };
}

/** Pirámide trigonal (NH3): el centro arriba y tres ligandos debajo. */
function pyramidal(center: string, ligand: string, d: number, angle: number) {
  // Ángulo entre la vertical y cada enlace para que el ángulo entre enlaces sea `angle`.
  const c = Math.cos(rad(angle));
  const theta = Math.acos(Math.sqrt((1 + 2 * c) / 3));
  return {
    atoms: [
      at(center),
      ...[0, 1, 2].map((i) => {
        const phi = rad(120 * i);
        return at(ligand, d * Math.sin(theta) * Math.cos(phi), -d * Math.cos(theta), d * Math.sin(theta) * Math.sin(phi));
      }),
    ],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] as Bond[],
  };
}

/** Tetraédrica (CH4, CCl4). */
function tetrahedral(center: string, ligand: string, d: number) {
  const k = d / Math.sqrt(3);
  const corners: Vec3[] = [[k, k, k], [-k, -k, k], [-k, k, -k], [k, -k, -k]];
  return { atoms: [at(center), ...corners.map((p) => at(ligand, ...p))], bonds: corners.map((_, i) => [0, i + 1, 1]) as Bond[] };
}

/** Átomos y enlaces escritos a mano. */
function custom(atoms: Array<[string, number, number, number]>, bonds: Bond[]) {
  return { atoms: atoms.map(([s, x, y, z]) => at(s, x, y, z)), bonds };
}

type Shape = { atoms: MoleculeAtom[]; bonds: Bond[] };
const sp = (id: string, formula: string, name: string, deltaHf: number, state: State, shape: Shape, note: string, ionic = false): Species => ({
  id, formula, name, note, deltaHf, state, atoms: shape.atoms, bonds: shape.bonds, ...(ionic ? { ionic } : {}),
});

export const SPECIES: readonly Species[] = [
  // Moléculas de los elementos
  sp('H2', 'H₂', 'Hidrógeno molecular', 0, 'g', diatomic('H', 'H', 0.74, 1), 'El gas más ligero; combustible limpio: al arder solo da agua.'),
  sp('O2', 'O₂', 'Oxígeno molecular', 0, 'g', diatomic('O', 'O', 1.21, 2), 'El 21 % del aire. Lo respiramos y hace posible la combustión.'),
  sp('N2', 'N₂', 'Nitrógeno molecular', 0, 'g', diatomic('N', 'N', 1.1, 3), 'El 78 % del aire. Su triple enlace lo hace muy poco reactivo.'),
  sp('F2', 'F₂', 'Flúor molecular', 0, 'g', diatomic('F', 'F', 1.42, 1), 'El elemento más reactivo de todos.'),
  sp('Cl2', 'Cl₂', 'Cloro molecular', 0, 'g', diatomic('Cl', 'Cl', 1.99, 1), 'Gas amarillo verdoso; desinfecta el agua de las piscinas.'),
  sp('Br2', 'Br₂', 'Bromo molecular', 0, 'l', diatomic('Br', 'Br', 2.28, 1), 'Uno de los dos elementos líquidos a temperatura ambiente.'),
  sp('I2', 'I₂', 'Yodo molecular', 0, 's', diatomic('I', 'I', 2.67, 1), 'Sólido violeta; la tintura de yodo es antiséptica.'),
  sp('O3', 'O₃', 'Ozono', 142.7, 'g', bent('O', 'O', 'O', 1.28, 116.8, 1.5), 'La capa de ozono nos protege de la radiación ultravioleta.'),

  // Agua y compañía
  sp('H2O', 'H₂O', 'Agua', -285.83, 'l', bent('O', 'H', 'H', 0.96, 104.5), 'La molécula de la vida. Angular: por eso es polar y disuelve tanto.'),
  sp('H2O2', 'H₂O₂', 'Peróxido de hidrógeno', -187.78, 'l', custom([['O', -0.74, 0, 0], ['O', 0.74, 0, 0], ['H', -1.0, 0.9, 0.2], ['H', 1.0, 0.3, 0.85]], [[0, 1, 1], [0, 2, 1], [1, 3, 1]]), 'Agua oxigenada: desinfectante; se descompone en agua y oxígeno.'),

  // Carbono
  sp('CO', 'CO', 'Monóxido de carbono', -110.53, 'g', diatomic('C', 'O', 1.13, 3), 'Gas tóxico de las combustiones con poco oxígeno.'),
  sp('CO2', 'CO₂', 'Dióxido de carbono', -393.51, 'g', linear('O', 'C', 'O', 1.16, 1.16, 2, 2), 'Lo exhalamos y lo usan las plantas en la fotosíntesis. Gas de efecto invernadero.'),
  sp('CH4', 'CH₄', 'Metano', -74.81, 'g', tetrahedral('C', 'H', 1.09), 'El gas natural de las cocinas. Tetraédrico.'),
  sp('C2H2', 'C₂H₂', 'Acetileno (etino)', 226.73, 'g', custom([['C', -0.6, 0, 0], ['C', 0.6, 0, 0], ['H', -1.66, 0, 0], ['H', 1.66, 0, 0]], [[0, 1, 3], [0, 2, 1], [1, 3, 1]]), 'Su llama (soplete oxiacetilénico) corta y suelda metales.'),
  sp('HCN', 'HCN', 'Cianuro de hidrógeno', 135.1, 'g', custom([['C', 0, 0, 0], ['H', -1.07, 0, 0], ['N', 1.16, 0, 0]], [[0, 1, 1], [0, 2, 3]]), 'Muy tóxico; aparece en las semillas de algunas frutas.'),
  sp('CH2O', 'CH₂O', 'Metanal (formaldehído)', -108.57, 'g', trigonal('C', ['O', 'H', 'H'], [1.21, 1.1, 1.1], [2, 1, 1]), 'El formol que conserva muestras biológicas.'),
  sp('CS2', 'CS₂', 'Disulfuro de carbono', 89.7, 'l', linear('S', 'C', 'S', 1.55, 1.55, 2, 2), 'Disolvente; se forma absorbiendo calor.'),
  sp('CCl4', 'CCl₄', 'Tetracloruro de carbono', -135.44, 'l', tetrahedral('C', 'Cl', 1.77), 'Disolvente antiguo, hoy prohibido por dañar la capa de ozono.'),

  // Nitrógeno
  sp('NH3', 'NH₃', 'Amoniaco', -46.11, 'g', pyramidal('N', 'H', 1.01, 107), 'Base de los abonos (síntesis de Haber). Piramidal.'),
  sp('NO', 'NO', 'Monóxido de nitrógeno', 90.25, 'g', diatomic('N', 'O', 1.15, 2), 'Se forma en los motores y los rayos a partir del aire.'),
  sp('NO2', 'NO₂', 'Dióxido de nitrógeno', 33.18, 'g', bent('N', 'O', 'O', 1.2, 134, 1.5), 'Gas pardo de la contaminación urbana.'),
  sp('N2O', 'N₂O', 'Óxido de dinitrógeno', 82.05, 'g', linear('N', 'N', 'O', 1.13, 1.19, 3, 1), 'El «gas de la risa», anestésico.'),
  sp('HNO3', 'HNO₃', 'Ácido nítrico', -174.1, 'l', custom([['N', 0, 0, 0], ['O', 0, 1.2, 0], ['O', 1.04, -0.6, 0], ['O', -1.15, -0.66, 0], ['H', -1.95, -0.15, 0]], [[0, 1, 2], [0, 2, 1.5], [0, 3, 1], [3, 4, 1]]), 'Ácido fuerte: abonos y explosivos.'),

  // Hidruros y ácidos
  sp('HF', 'HF', 'Fluoruro de hidrógeno', -271.1, 'g', diatomic('H', 'F', 0.92, 1), 'Ataca el vidrio: se usa para grabarlo.'),
  sp('HCl', 'HCl', 'Cloruro de hidrógeno', -92.31, 'g', diatomic('H', 'Cl', 1.27, 1), 'Disuelto en agua es el ácido clorhídrico (salfumán, jugo gástrico).'),
  sp('HBr', 'HBr', 'Bromuro de hidrógeno', -36.4, 'g', diatomic('H', 'Br', 1.41, 1), 'Ácido fuerte en disolución.'),
  sp('HI', 'HI', 'Yoduro de hidrógeno', 26.48, 'g', diatomic('H', 'I', 1.61, 1), 'El más débil de los enlaces H–halógeno.'),
  sp('H2S', 'H₂S', 'Sulfuro de hidrógeno', -20.63, 'g', bent('S', 'H', 'H', 1.34, 92.1), 'Huele a huevos podridos.'),

  // Azufre y silicio
  sp('SO2', 'SO₂', 'Dióxido de azufre', -296.83, 'g', bent('S', 'O', 'O', 1.43, 119, 2), 'Causa la lluvia ácida; conserva el vino.'),
  sp('SO3', 'SO₃', 'Trióxido de azufre', -395.72, 'g', trigonal('S', ['O', 'O', 'O'], [1.42, 1.42, 1.42], [2, 2, 2]), 'Paso previo al ácido sulfúrico (método de contacto).'),
  sp('SiO2', 'SiO₂', 'Dióxido de silicio', -910.94, 's', linear('O', 'Si', 'O', 1.61, 1.61, 2, 2), 'Cuarzo y arena; con él se hace el vidrio.'),

  // Sales e iónicos
  sp('NaCl', 'NaCl', 'Cloruro de sodio', -411.15, 's', diatomic('Na', 'Cl', 2.36, 0.5), 'La sal común. Compuesto iónico: Na⁺ y Cl⁻.', true),
  sp('KCl', 'KCl', 'Cloruro de potasio', -436.75, 's', diatomic('K', 'Cl', 2.67, 0.5), 'Sal sin sodio y abono potásico.', true),
  sp('NaF', 'NaF', 'Fluoruro de sodio', -573.65, 's', diatomic('Na', 'F', 1.93, 0.5), 'El flúor de las pastas de dientes.', true),
  sp('AgCl', 'AgCl', 'Cloruro de plata', -127.07, 's', diatomic('Ag', 'Cl', 2.28, 0.5), 'Precipitado blanco que se oscurece con la luz (fotografía).', true),
  sp('MgCl2', 'MgCl₂', 'Cloruro de magnesio', -641.32, 's', linear('Cl', 'Mg', 'Cl', 2.18, 2.18, 0.5, 0.5), 'Del agua de mar; complemento de magnesio.', true),
  sp('CaCl2', 'CaCl₂', 'Cloruro de calcio', -795.8, 's', linear('Cl', 'Ca', 'Cl', 2.51, 2.51, 0.5, 0.5), 'Sal para deshelar carreteras: su disolución desprende calor.', true),
  sp('ZnCl2', 'ZnCl₂', 'Cloruro de cinc', -415.05, 's', linear('Cl', 'Zn', 'Cl', 2.07, 2.07, 0.5, 0.5), 'Sale al atacar cinc con ácido clorhídrico.', true),

  // Óxidos e hidróxidos metálicos
  sp('MgO', 'MgO', 'Óxido de magnesio', -601.7, 's', diatomic('Mg', 'O', 1.75, 0.5), 'Lo que queda al quemar magnesio con su luz blanca cegadora.', true),
  sp('CaO', 'CaO', 'Óxido de calcio', -635.09, 's', diatomic('Ca', 'O', 1.82, 0.5), 'Cal viva: con agua se calienta mucho.', true),
  sp('FeS', 'FeS', 'Sulfuro de hierro(II)', -100.0, 's', diatomic('Fe', 'S', 2.2, 0.5), 'La reacción clásica del laboratorio: limaduras de hierro y azufre.', true),
  sp('CuO', 'CuO', 'Óxido de cobre(II)', -157.3, 's', diatomic('Cu', 'O', 1.95, 0.5), 'Polvo negro que sale al calentar cobre al aire.', true),
  sp('Cu2O', 'Cu₂O', 'Óxido de cobre(I)', -168.6, 's', bent('O', 'Cu', 'Cu', 1.85, 140, 0.5), 'Rojo: da color a algunos vidrios.', true),
  sp('ZnO', 'ZnO', 'Óxido de cinc', -348.28, 's', diatomic('Zn', 'O', 1.98, 0.5), 'Blanco: cremas solares y pomadas.', true),
  sp('Fe2O3', 'Fe₂O₃', 'Óxido de hierro(III)', -824.2, 's', custom([['O', 0, 0.55, 0], ['Fe', -1.5, -0.25, 0], ['Fe', 1.5, -0.25, 0], ['O', -2.6, 0.75, 0], ['O', 2.6, 0.75, 0]], [[0, 1, 0.5], [0, 2, 0.5], [1, 3, 0.5], [2, 4, 0.5]]), 'La herrumbre (óxido) del hierro.', true),
  sp('Al2O3', 'Al₂O₃', 'Óxido de aluminio', -1675.7, 's', custom([['O', 0, 0.5, 0], ['Al', -1.45, -0.2, 0], ['Al', 1.45, -0.2, 0], ['O', -2.5, 0.75, 0], ['O', 2.5, 0.75, 0]], [[0, 1, 0.5], [0, 2, 0.5], [1, 3, 0.5], [2, 4, 0.5]]), 'Corindón: el rubí y el zafiro. Protege el aluminio.', true),
  sp('NaOH', 'NaOH', 'Hidróxido de sodio', -425.61, 's', custom([['Na', -1.95, 0, 0], ['O', 0, 0, 0], ['H', 0.96, 0, 0]], [[0, 1, 0.5], [1, 2, 1]]), 'Sosa cáustica: jabones y desatascadores.', true),
  sp('KOH', 'KOH', 'Hidróxido de potasio', -424.76, 's', custom([['K', -2.2, 0, 0], ['O', 0, 0, 0], ['H', 0.96, 0, 0]], [[0, 1, 0.5], [1, 2, 1]]), 'Potasa cáustica: jabones blandos y pilas alcalinas.', true),
  sp('Ca(OH)2', 'Ca(OH)₂', 'Hidróxido de calcio', -986.09, 's', custom([['Ca', 0, 0, 0], ['O', -2.0, 0, 0], ['O', 2.0, 0, 0], ['H', -2.6, 0.75, 0], ['H', 2.6, 0.75, 0]], [[0, 1, 0.5], [0, 2, 0.5], [1, 3, 1], [2, 4, 1]]), 'Cal apagada: morteros y encalado.', true),
  sp('CaCO3', 'CaCO₃', 'Carbonato de calcio', -1206.92, 's', custom([['C', 0.9, 0, 0], ['O', 0.9, 1.29, 0], ['O', 2.02, -0.65, 0], ['O', -0.22, -0.65, 0], ['Ca', -2.1, -0.2, 0]], [[0, 1, 1.5], [0, 2, 1.5], [0, 3, 1.5], [3, 4, 0.5]]), 'Caliza, mármol, conchas y la tiza.', true),
];

const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: string): Species | undefined {
  return BY_ID.get(id);
}

/** Composición: cuántos átomos de cada elemento. */
export function composition(species: Species): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of species.atoms) counts[a.symbol] = (counts[a.symbol] ?? 0) + 1;
  return counts;
}

/** Clave de una composición para compararlas («H2,O1»). */
export function compositionKey(counts: Record<string, number>): string {
  return Object.keys(counts)
    .sort()
    .map((s) => `${s}${counts[s]}`)
    .join(',');
}
