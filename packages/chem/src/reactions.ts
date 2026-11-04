import { getElement } from './elements';
import { ATOM_DELTA_HF, compositionKey, composition as speciesComposition, getSpecies, SPECIES } from './species';

/**
 * Lo que hay en una carta: un elemento («O», «Fe») o una sustancia («O2»,
 * «H2O»). Se distinguen por las mayúsculas: «CO» no es «Co».
 */
export type Content = string;

export interface Term {
  content: Content;
  count: number;
}

export interface Reaction {
  id: string;
  name: string;
  reactants: Term[];
  products: Term[];
  /** Lo que conviene contar en clase. */
  note: string;
  /** ΔH medido en otras condiciones (disolución, vapor…), si difiere del calculado. */
  deltaH?: number;
  conditions?: string;
}

function parseSide(side: string): Term[] {
  return side.split('+').map((t) => {
    const m = /^\s*(\d+)?\s*(\S+)\s*$/.exec(t);
    if (!m) throw new Error(`Término mal escrito: ${t}`);
    return { content: m[2], count: Number(m[1] ?? 1) };
  });
}

const r = (id: string, name: string, equation: string, note: string, extra: Partial<Reaction> = {}): Reaction => {
  const [left, right] = equation.split('->');
  return { id, name, reactants: parseSide(left), products: parseSide(right), note, ...extra };
};

/**
 * Reacciones de libro (ajustadas). Con las cartas, cada término es una carta:
 * «2 C + O2» son tres cartas (C, C y una con O₂). Como mucho 5 cartas.
 */
export const REACTIONS: readonly Reaction[] = [
  r('combustion-h2', 'Combustión del hidrógeno', '2 H2 + O2 -> 2 H2O', 'Explosiva. Es la reacción de los cohetes y de las pilas de combustible.'),
  r('combustion-c', 'Combustión completa del carbono', 'C + O2 -> CO2', 'El carbón arde con oxígeno suficiente.'),
  r('combustion-c-incompleta', 'Combustión incompleta del carbono', '2 C + O2 -> 2 CO', 'Con poco oxígeno sale monóxido de carbono, tóxico.'),
  r('combustion-co', 'Combustión del monóxido de carbono', '2 CO + O2 -> 2 CO2', 'La llama azul del CO.'),
  r('boudouard', 'Reacción de Boudouard', 'CO2 + C -> 2 CO', 'En los altos hornos: el CO2 se reduce con carbón al rojo.'),
  r('gas-agua', 'Gas de agua', 'C + H2O -> CO + H2', 'Vapor sobre carbón al rojo: un combustible antiguo.', { deltaH: 131.3, conditions: 'con vapor de agua' }),
  r('desplazamiento-gas-agua', 'Desplazamiento del gas de agua', 'CO + H2O -> CO2 + H2', 'Así se obtiene hidrógeno en la industria.', { deltaH: -41.2, conditions: 'con vapor de agua' }),
  r('combustion-metano', 'Combustión del metano', 'CH4 + 2 O2 -> CO2 + 2 H2O', 'La llama de la cocina de gas.'),
  r('sintesis-metano', 'Síntesis del metano', 'C + 2 H2 -> CH4', 'Carbono e hidrógeno: el hidrocarburo más sencillo.'),
  r('sintesis-acetileno', 'Síntesis del acetileno', '2 C + H2 -> C2H2', 'Hace falta mucha energía: es endotérmica.'),
  r('haber', 'Síntesis de Haber-Bosch', 'N2 + 3 H2 -> 2 NH3', 'Da de comer al mundo: el amoniaco de los abonos.'),
  r('no-aire', 'Óxido de nitrógeno del aire', 'N2 + O2 -> 2 NO', 'Solo ocurre con mucho calor: rayos y motores.'),
  r('no2', 'Oxidación del NO', '2 NO + O2 -> 2 NO2', 'El humo pardo de la contaminación.'),
  r('no2-directo', 'Dióxido de nitrógeno', 'N2 + 2 O2 -> 2 NO2', 'Endotérmica: hay que darle energía.'),
  r('gas-risa', 'Gas de la risa', '2 N2 + O2 -> 2 N2O', 'Endotérmica.'),
  r('ozono', 'Formación del ozono', '3 O2 -> 2 O3', 'En la estratosfera, con luz ultravioleta.'),
  r('agua-oxigenada', 'Síntesis del agua oxigenada', 'H2 + O2 -> H2O2', 'Peróxido de hidrógeno.'),
  r('combustion-mg', 'Combustión del magnesio', '2 Mg + O2 -> 2 MgO', 'Una luz blanca cegadora: los flashes antiguos.'),
  r('oxidacion-ca', 'Oxidación del calcio', '2 Ca + O2 -> 2 CaO', 'Da cal viva.'),
  r('oxidacion-cu', 'Oxidación del cobre', '2 Cu + O2 -> 2 CuO', 'El cobre se ennegrece al calentarlo.'),
  r('cal-apagada', 'Apagado de la cal', 'CaO + H2O -> Ca(OH)2', 'Desprende tanto calor que puede hervir el agua.'),
  r('carbonatacion', 'Carbonatación de la cal', 'CaO + CO2 -> CaCO3', 'Los morteros de cal se endurecen así, con el CO2 del aire.'),
  r('combustion-s', 'Combustión del azufre', 'S + O2 -> SO2', 'Llama azul y olor picante.'),
  r('contacto', 'Método de contacto', '2 SO2 + O2 -> 2 SO3', 'Paso clave para fabricar ácido sulfúrico.'),
  r('fe-s', 'Hierro y azufre', 'Fe + S -> FeS', 'La reacción clásica del laboratorio: mezcla frente a compuesto.'),
  r('sintesis-nacl', 'Síntesis de la sal', '2 Na + Cl2 -> 2 NaCl', 'Un metal explosivo y un gas venenoso dan sal de mesa.'),
  r('sintesis-hcl', 'Síntesis del cloruro de hidrógeno', 'H2 + Cl2 -> 2 HCl', 'Con luz, explosiva.'),
  r('sintesis-hf', 'Síntesis del fluoruro de hidrógeno', 'H2 + F2 -> 2 HF', 'Violentísima, incluso a oscuras y en frío.'),
  r('sintesis-h2s', 'Síntesis del sulfuro de hidrógeno', 'H2 + S -> H2S', 'Huele a huevos podridos.'),
  r('combustion-si', 'Oxidación del silicio', 'Si + O2 -> SiO2', 'Así se forma la sílice.'),
  r('sintesis-cs2', 'Síntesis del disulfuro de carbono', 'C + 2 S -> CS2', 'Endotérmica: necesita un horno.'),
  r('na-agua', 'Sodio en agua', '2 Na + 2 H2O -> 2 NaOH + H2', 'El sodio corre por el agua y hasta arde.'),
  r('k-agua', 'Potasio en agua', '2 K + 2 H2O -> 2 KOH + H2', 'Aún más violento que el sodio: llama lila.'),
  r('neutralizacion', 'Neutralización', 'HCl + NaOH -> NaCl + H2O', 'Ácido + base → sal + agua.', { deltaH: -57.3, conditions: 'en disolución' }),
  r('zn-hcl', 'Cinc y ácido clorhídrico', 'Zn + 2 HCl -> ZnCl2 + H2', 'Metal + ácido: burbujas de hidrógeno.', { deltaH: -153.9, conditions: 'en disolución' }),
  r('mg-hcl', 'Magnesio y ácido clorhídrico', 'Mg + 2 HCl -> MgCl2 + H2', 'Metal + ácido: el tubo de ensayo se calienta.', { deltaH: -466.9, conditions: 'en disolución' }),
  r('caliza-hcl', 'Caliza y ácido clorhídrico', 'CaCO3 + 2 HCl -> CaCl2 + H2O + CO2', 'La efervescencia que delata un carbonato.', { deltaH: -15.2, conditions: 'en disolución' }),
  r('termita', 'Termita', 'Fe2O3 + 2 Al -> Al2O3 + 2 Fe', 'Tan caliente que funde el hierro: se usa para soldar vías de tren.'),
];

// --- Energía ---------------------------------------------------------------

/** ΔHf de lo que hay en una carta (kJ/mol). */
export function contentDeltaHf(content: Content): number {
  const species = getSpecies(content);
  if (species) return species.deltaHf;
  getElement(content); // lanza si no existe
  return ATOM_DELTA_HF[content] ?? 0;
}

/** ΔH de la reacción tal y como está escrita (kJ), por la ley de Hess si no hay medida. */
export function reactionEnthalpy(reaction: Pick<Reaction, 'reactants' | 'products' | 'deltaH'>): number {
  if (reaction.deltaH !== undefined) return reaction.deltaH;
  const sum = (terms: Term[]) => terms.reduce((s, t) => s + t.count * contentDeltaHf(t.content), 0);
  return Math.round((sum(reaction.products) - sum(reaction.reactants)) * 10) / 10;
}

// --- Composición -----------------------------------------------------------

export function contentComposition(content: Content): Record<string, number> {
  const species = getSpecies(content);
  if (species) return speciesComposition(species);
  return { [getElement(content).symbol]: 1 };
}

export function contentMass(content: Content): number {
  return Object.entries(contentComposition(content)).reduce((m, [s, n]) => m + n * getElement(s).atomicMass, 0);
}

/** Fórmula bonita: «O₂», «Fe». */
export function contentFormula(content: Content): string {
  return getSpecies(content)?.formula ?? content;
}

export function contentName(content: Content): string {
  return getSpecies(content)?.name ?? getElement(content).name;
}

export function isMolecule(content: Content): boolean {
  return !!getSpecies(content);
}

function addInto(total: Record<string, number>, part: Record<string, number>, times = 1) {
  for (const [s, n] of Object.entries(part)) total[s] = (total[s] ?? 0) + n * times;
}

/** Los átomos de un lado de la reacción. */
export function termsComposition(terms: Term[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const t of terms) addInto(total, contentComposition(t.content), t.count);
  return total;
}

// --- Buscar qué pasa al juntar cartas ---------------------------------------

export interface Outcome {
  reaction: Reaction;
  /** ΔH en kJ por mol de reacción tal y como está escrita. */
  deltaH: number;
  /** Ecuación para mostrar: «2 C + O₂ → 2 CO». */
  equation: string;
  /** Síntesis directa de los átomos (no está en REACTIONS). */
  synthesis: boolean;
}

const multisetKey = (contents: Content[]) => [...contents].sort().join(' + ');
const expand = (terms: Term[]) => terms.flatMap((t) => Array<Content>(t.count).fill(t.content));
const REACTION_INDEX = new Map(REACTIONS.map((reaction) => [multisetKey(expand(reaction.reactants)), reaction]));
const SPECIES_BY_COMPOSITION = new Map<string, string>();
for (const s of SPECIES) if (!SPECIES_BY_COMPOSITION.has(compositionKey(speciesComposition(s)))) SPECIES_BY_COMPOSITION.set(compositionKey(speciesComposition(s)), s.id);

export function formatEquation(reaction: Pick<Reaction, 'reactants' | 'products'>): string {
  const side = (terms: Term[]) => terms.map((t) => `${t.count > 1 ? `${t.count} ` : ''}${contentFormula(t.content)}`).join(' + ');
  return `${side(reaction.reactants)} → ${side(reaction.products)}`;
}

/** Agrupa cartas iguales: [O, O, H] → 2 O + H. */
function toTerms(contents: Content[]): Term[] {
  const counts = new Map<Content, number>();
  for (const c of contents) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([content, count]) => ({ content, count }));
}

/**
 * ¿Qué pasa si se juntan estas cartas? Primero las reacciones de libro; si no
 * hay, la síntesis directa cuando los átomos juntos forman una sustancia
 * conocida (H + H + O → H₂O). `null` si no reaccionan.
 */
export function findOutcome(contents: Content[]): Outcome | null {
  if (contents.length < 2 && !REACTION_INDEX.has(multisetKey(contents))) return null;
  const known = REACTION_INDEX.get(multisetKey(contents));
  if (known) return { reaction: known, deltaH: reactionEnthalpy(known), equation: formatEquation(known), synthesis: false };
  if (contents.length < 2) return null;

  const total: Record<string, number> = {};
  for (const c of contents) addInto(total, contentComposition(c));
  const product = SPECIES_BY_COMPOSITION.get(compositionKey(total));
  if (!product || contents.includes(product)) return null;
  const reaction: Reaction = {
    id: `sintesis-${product}`,
    name: `Formación de ${contentName(product).toLowerCase()}`,
    reactants: toTerms(contents),
    products: [{ content: product, count: 1 }],
    note: getSpecies(product)!.note,
  };
  return { reaction, deltaH: reactionEnthalpy(reaction), equation: formatEquation(reaction), synthesis: true };
}

/**
 * Qué muestra cada carta tras la reacción. Cada sustancia de los productos va
 * a una carta, empezando por las más pesadas, y en la carta del elemento más
 * pesado que lleve; las cartas que sobran (y los elementos sueltos que salgan,
 * como el Fe de la termita) vuelven a su elemento impreso: `null`.
 */
export function assignProducts(printed: string[], reaction: Pick<Reaction, 'products'>): Array<Content | null> {
  const result: Array<Content | null> = printed.map(() => null);
  const molecules = expand(reaction.products)
    .filter(isMolecule)
    .sort((a, b) => contentMass(b) - contentMass(a));
  const free = new Set(printed.map((_, i) => i));
  const mass = (i: number) => getElement(printed[i]).atomicMass;
  for (const molecule of molecules) {
    const atoms = contentComposition(molecule);
    const pool = [...free];
    const inside = pool.filter((i) => atoms[printed[i]]);
    const best = (inside.length ? inside : pool).sort((a, b) => mass(b) - mass(a) || a - b)[0];
    if (best === undefined) break;
    result[best] = molecule;
    free.delete(best);
  }
  return result;
}
