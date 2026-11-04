# @webar/chem

Los 118 elementos y sus átomos en 3D con three.js. No depende de
`@webar/ar-core`: un `AtomView` es un `Object3D` que vale para cualquier escena.

```ts
import { AtomView, getElement, atomComposition } from '@webar/chem'

const oxigeno = getElement('O')               // o getElement(8)
atomComposition(oxigeno)                      // { protons: 8, neutrons: 8, electrons: 8, shells: [2, 6], … }

const atomo = new AtomView(oxigeno, { model: 'bohr' })
scene.add(atomo.object)                       // origen = centro del núcleo
atomo.update(dt)                              // en cada frame
atomo.setModel('cloud')                       // nubes de probabilidad
atomo.dispose()
```

## Sustancias y reacciones

- `SPECIES`: 50 sustancias de hasta 5 átomos de la ESO y el Bachillerato,
  con geometría 3D (VSEPR, enlaces reales en Å), ΔHf° (NBS) y para qué sirven.
- `REACTIONS`: 38 reacciones de libro ajustadas (combustiones, Haber,
  neutralización, termita…); ΔH por la ley de Hess, o el medido cuando las
  condiciones lo cambian (disolución, vapor).
- `findOutcome(contenidos)`: qué pasa al juntar unas cartas (reacción de libro
  o síntesis directa: H + H + O → H₂O). `assignProducts` dice qué carta se
  queda cada producto. `MoleculeView`: bolas y varillas que vibran.

## Los datos

`src/data/elements.ts` lo genera `scripts/generar-elementos.py` (las
instrucciones están en el propio script):

| Dato | Fuente |
| --- | --- |
| Masa, configuración electrónica, color CPK, familia | PubChem (NIH), dominio público |
| Radio atómico (1–86) | Calculado, Clementi et al. (1967), vía Wikipedia |
| Radio atómico (87–118) | Estimado: el del mismo grupo en el periodo 6, corregido con Slater (`radiusEstimated`) |
| Neutrones | Isótopo más abundante (corregido a mano donde no es la masa redondeada); en los radiactivos, el de vida más larga |

Configuraciones con excepciones reales (Cr, Cu, Pd, Au, lantánidos…); del 109
en adelante son teóricas (`configurationPredicted`). Lr va con `7p¹`
(medido en 2015).

## Las dos representaciones

- **Bohr** (`'bohr'`): una órbita circular por capa con sus electrones como
  bolitas. Las capas internas giran más deprisa. Cada órbita va en su plano y
  todas precesan un poco, para que se vean en 3D.
- **Orbitales** (`'cloud'`): una nube de puntos por orbital ocupado, sorteados
  con la probabilidad |ψ|² del orbital hidrogenoide con la carga efectiva de
  Slater. Las formas (s, p, d, f), los nodos y la fase de cada lóbulo (tono
  claro u oscuro) son los reales. Los electrones no giran: la nube se renueva
  sin parar y cada electrón (chispa blanca) salta de una posición probable a
  otra.

Colores: protón `#ff4d5a`, neutrón `#c3cad6`, electrón `#6fd8ff`; orbitales s
azul, p naranja, d verde y f morado.

## Escalas

- **Entre átomos, proporcionales**: `metersPerPm` (0,0004 por defecto: H ≈ 2 cm
  de radio, Cs ≈ 12 cm).
- **Núcleo, exagerado**: el de verdad es unas 100 000 veces más pequeño que su
  átomo. Entre núcleos se respeta la proporción: los nucleones se apilan como
  naranjas (red cúbica centrada en las caras), así que el radio crece como
  A^⅓, igual que en los núcleos reales. Protones y neutrones van mezclados.
- **En la nube**, el orbital más externo tiene su máximo en el radio del
  átomo y los internos se encogen según su carga efectiva, como en la realidad
  (los 1s de los átomos pesados quedan diminutos).

## Rendimiento

Núcleo y electrones con `InstancedMesh` (pocas llamadas de dibujo aunque haya
294 nucleones). La nube, unos 9 000 puntos por átomo (`cloud.maxPoints`).

## Tests

`npm test` en la raíz: electrones = protones y Pauli en los 118, isótopos,
capas, cargas de Slater de los libros, Hund y el 1s del hidrógeno (máximo en
a₀ y radio medio 1,5 a₀).
