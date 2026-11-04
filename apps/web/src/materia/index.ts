// Sección «Materia»: cómo se ordena la materia (cristales, otras formas de
// agruparse y los estados del agua). La app solo necesita renderMateriaScreen;
// lo demás, para enlaces directos y pruebas.
export { renderMateriaScreen, createMateriaExperience, type MateriaTarget } from './screen';
export { CrystalExperience, type CrystalOptions } from './crystal';
export { WaterExperience } from './water';
export { STRUCTURES, STRUCTURE_IDS, type StructureId } from './lattices';
