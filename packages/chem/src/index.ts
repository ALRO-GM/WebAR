/**
 * @webar/chem — los 118 elementos y sus átomos en 3D (three.js).
 *
 * No depende de @webar/ar-core: un AtomView es un Object3D que se puede poner
 * en cualquier escena (realidad aumentada, visor 3D, una web normal).
 */
export type { ElementData, ElementFamily } from './types';
export { ELEMENTS, FAMILY_NAMES, getElement, tablePosition } from './elements';
export {
  atomComposition,
  effectiveCharge,
  electronShells,
  formatConfiguration,
  orbitalOccupancy,
  parseConfiguration,
  L_LETTERS,
  type AtomComposition,
  type Subshell,
} from './configuration';
export { nucleusLayout, type NucleusLayout } from './nucleus';
export { BOHR_RADIUS_PM, orbitalPeakRadius, sampleOrbital, type OrbitalSamples, type OrbitalSpec } from './orbitals';
export { AtomView, type AtomModel, type AtomViewOptions } from './three/atom-view';
export { ORBITAL_COLORS, type CloudOptions } from './three/cloud';
export { ELECTRON_COLOR } from './three/bohr';
export { NEUTRON_COLOR, PROTON_COLOR } from './three/nucleus-mesh';
export { ATOM_DELTA_HF, SPECIES, composition, compositionKey, getSpecies, type Bond, type MoleculeAtom, type Species, type State } from './species';
export {
  REACTIONS,
  assignProducts,
  contentComposition,
  contentDeltaHf,
  contentFormula,
  contentMass,
  contentName,
  findOutcome,
  formatEquation,
  isMolecule,
  reactionEnthalpy,
  termsComposition,
  type Content,
  type Outcome,
  type Reaction,
  type Term,
} from './reactions';
export { MoleculeView, type MoleculeViewOptions } from './three/molecule-view';
