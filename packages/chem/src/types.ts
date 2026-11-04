/** Familia del elemento en la tabla periódica. */
export type ElementFamily =
  | 'no-metal'
  | 'gas-noble'
  | 'alcalino'
  | 'alcalinoterreo'
  | 'metaloide'
  | 'halogeno'
  | 'metal-postransicion'
  | 'metal-transicion'
  | 'lantanido'
  | 'actinido';

/** Un elemento de la tabla periódica (ver scripts/generar-elementos.py). */
export interface ElementData {
  /** Número atómico: protones (y electrones en el átomo neutro). */
  z: number;
  symbol: string;
  name: string;
  nameEn: string;
  /** Masa atómica estándar (u). */
  atomicMass: number;
  /**
   * Número másico (protones + neutrones) del isótopo que se dibuja: el más
   * abundante en la naturaleza o, si no hay estables, el de vida más larga.
   */
  massNumber: number;
  /** Sin isótopos estables. */
  radioactive: boolean;
  family: ElementFamily;
  /** Grupo (1-18). `null` en lantánidos y actínidos. */
  group: number | null;
  period: number;
  /** Color CPK/Jmol, el habitual en modelos moleculares. */
  color: string;
  /** Radio atómico calculado (Clementi, 1967), en picómetros. */
  radius: number;
  /** Del 87 en adelante el radio es una estimación. */
  radiusEstimated: boolean;
  /** Configuración electrónica, abreviada con el gas noble: «[Ne]3s2 3p4». */
  configuration: string;
  /** Configuración teórica (aún no medida). */
  configurationPredicted: boolean;
}
