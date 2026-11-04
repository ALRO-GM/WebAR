# Arquitectura y elección de la pila

## Qué queremos

Una PWA educativa de química: átomos en 3D en realidad aumentada y **cartas
de átomos** que, al juntarlas delante de la cámara, forman moléculas (la idea
de *Arloon Chemistry*, pero en la web, sin instalar nada de una tienda). La
parte de realidad aumentada tiene que poder **reutilizarse en otros proyectos**.

## Opciones analizadas (noviembre de 2026)

| Opción | Qué da | Android | iPhone | Veredicto |
| --- | --- | --- | --- | --- |
| **WebXR** (`immersive-ar`, `hit-test`, `anchors`) | Superficies reales y anclas estables (ARCore) | Chrome, sí | Safari, no | **Sí**, para colocar cosas en el mundo |
| **MindAR** (seguimiento de imágenes en JS/WASM) | Cartas e imágenes, varias a la vez | Sí | Sí | **Sí**, para las cartas (siguiente paso) |
| AR.js | Marcadores tipo QR y NFT | Sí | Sí | Más antiguo y menos preciso que MindAR |
| WebXR `image-tracking` | Cartas con ARCore | Solo con un flag de Chrome | No | Aún experimental |
| 8th Wall | SLAM e imágenes en todos los móviles | Sí | Sí | Cerró su plataforma de pago; el motor liberado no compensa el peso |
| Zappar, Niantic Studio, etc. | Todo hecho | Sí | Sí | De pago o atado a su plataforma: no es reutilizable |
| A-Frame | Escenas declarativas en HTML | — | — | Cómodo, pero ata la base a su modelo de componentes |

**Motor 3D: three.js.** Es la base sobre la que se montan WebXR, MindAR y
A-Frame, tiene los tipos de TypeScript y pesa unos 140 KB con gzip.

**Conclusión:** una base propia y fina sobre three.js, con **proveedores de
seguimiento intercambiables**. Hoy: WebXR para el mundo. Después: MindAR para
las cartas (y que funcione también en iPhone). Si mañana Safari trae WebXR o
sale algo mejor, se añade otro proveedor sin tocar la aplicación.

## Cómo está montado

```
packages/ar-core/      @webar/ar-core: la base reutilizable (no sabe de química)
  src/session.ts         ARSession: renderizador, escena, cámara, bucle y eventos
  src/anchor.ts          ARAnchor: un punto del mundo real del que se cuelgan objetos
  src/types.ts           ARProvider: el contrato de un sistema de seguimiento
  src/providers/
    webxr-world.ts       WebXR: superficies y anclas (Android)
    marker-tracking.ts   tarjetas impresas con marcadores ArUco (cualquier móvil con cámara)
    viewer.ts            visor 3D sin cámara (iPhone, ordenador, desarrollo)
  src/pose.ts            pose de un marcador a partir de sus 4 esquinas (homografía)
  src/vendor/js-aruco2/  detector ArUco (MIT), pasado a ESM
packages/chem/         @webar/chem: los 118 elementos y sus átomos en 3D (no sabe de RA)
  src/data/elements.ts   datos generados (scripts/generar-elementos.py)
  src/configuration.ts   capas, subniveles, Hund y Slater
  src/nucleus.ts         cómo se apilan protones y neutrones
  src/orbitals.ts        nubes de probabilidad |ψ|²
  src/species.ts         50 sustancias de ≤5 átomos: geometría 3D y ΔHf°
  src/reactions.ts       38 reacciones de libro, síntesis directa, ΔH (Hess) y reparto en tarjetas
  src/three/             AtomView (núcleo + Bohr o nubes) y MoleculeView (bolas y varillas)
apps/web/              la PWA: une las dos; interfaz e instalación
  src/cards/             el juego de tarjetas: baraja, caras, reglas, mesa virtual
  src/platform/          progreso, colección, desbloqueos, retos y clase (sin conexión)
  src/i18n/              la tabla de textos (es.json) y t()
  cartas.html            imprimir las tarjetas en A4
  profesor.html          panel del profesorado: clases, alumnado, estadísticas y retos
server/                Node sin dependencias: PWA + API de clases + /health (SQLite)
```

- La **sesión** es dueña del renderizador y del bucle y emite `start`, `frame`,
  `select` (toque) y `end`.
- El **proveedor** arranca la cámara o la sesión XR y, en cada frame, mueve la
  cámara virtual y las anclas.
- Un **ancla** es un `THREE.Group` con `found`/`lost`. Da igual que venga de una
  superficie o de una carta: la app cuelga ahí su átomo y no sabe de dónde sale
  la pose.

Así, el átomo de oxígeno se dibuja igual sobre la mesa (WebXR) que sobre su
carta (MindAR), y la lógica de «si dos anclas están cerca, forman un enlace»
solo mira posiciones de anclas.

Los átomos (`@webar/chem`) tampoco saben de realidad aumentada: un
`AtomView` es un `Object3D`. La app es la única que conoce las dos partes.
Los detalles de los átomos (datos, fuentes, modelos y escalas) están en
[packages/chem/README.md](../packages/chem/README.md).

## Tarjetas: por qué marcadores ArUco

Las tarjetas llevan un marcador ArUco (diccionario MIP 36h12, 250 códigos) en
lugar de una imagen para MindAR:

- se detectan en milisegundos y se siguen **muchas a la vez** (MindAR sufre a
  partir de 2-3 imágenes), que es justo lo que pide combinar átomos;
- funcionan en **cualquier móvil con cámara**, iPhone incluido;
- una tarjeta nueva es un número nuevo: no hay que compilar imágenes.

La pose se calcula con la homografía de las 4 esquinas (sin la ambigüedad de
POSIT) y se suaviza con un filtro adaptativo; encima, cada átomo persigue a su
tarjeta con retardo, para que se deslice suave al moverla. La cara de la
tarjeta se tapa con una virtual con los datos de lo que contiene.

### Una sola tarjeta: papel = mesa virtual

La tarjeta se dibuja **una vez**, en SVG (`apps/web/src/cards/card-svg.ts`,
`cardSVG(spec, content?)`), en décimas de milímetro (630 × 880):

- marco del color de su familia, panel blanco con el marcador (40 mm de negro,
  a 8 mm del borde superior y centrado) y su **margen blanco de 5 mm**, en el
  que no se dibuja nada (si no, deja de detectarse);
- debajo: casilla con número atómico, símbolo y masa; nombre, familia,
  p⁺/n⁰/e⁻, capas con un icono del modelo de Bohr, y el nº de la tarjeta;
- si la tarjeta ha formado una molécula, la «tarjeta de molécula» con el mismo
  diseño: la molécula dibujada (bolas y palitos, de su geometría real),
  fórmula, nombre, uso y ΔHf°.

`cartas.html` mete ese SVG tal cual en la hoja A4. La mesa virtual y la cara
que se superpone a la tarjeta real en la cámara lo convierten en textura
(`card-face.ts`: SVG → imagen → lienzo → `CanvasTexture`, con la letra Nunito
incrustada), así que lo virtual es idéntico al papel, marcador incluido (las
tarjetas virtuales llevan el marcador de su equivalente impresa). Comprobado
con `?vista=tarjetas&imagen=…` sobre una captura de `cartas.html`: se
reconocen todas y la cara virtual cae encima de la impresa.

### La mesa virtual

- **Gestos** (con `ViewerProvider.setDragHandler`): un dedo sobre una tarjeta
  la arrastra (se levanta un poco y su sombra se abre); un dedo en vacío gira;
  dos dedos desplazan y el pellizco acerca, se toquen tarjetas o no (si se
  estaba arrastrando una, se suelta y pasa a gesto de cámara).
- **Cámara** (`ViewerProvider.setControls`): giro lento y con inercia, nunca
  por debajo de 35° sobre la mesa, desplazamiento en el plano de la mesa y
  límites de zoom y de desplazamiento para no perderla.
- **Entorno** (`table-scene.ts`, todo generado por código): mesa de madera
  clara, tapete de fieltro con pespunte, habitación difuminada (una esfera
  pintada por dentro y niebla cálida), luz cálida, una planta, un flexo y unos
  libros low-poly. Las sombras son falsas (texturas difuminadas bajo tarjetas,
  átomos y adornos): baratas en cualquier móvil.
- **Tamaño** de los átomos y moléculas de 1× a 3×: botones +/− en el HUD (y
  pellizco con dos dedos en la cámara), guardado en `localStorage`
  (`webar:escala-tarjetas`).
- `CardVisual.setExtra(objeto | null)`: un objeto 3D extra al lado del átomo
  o la molécula, que sigue a la tarjeta y aparece con un saltito (se quita al
  cambiar el contenido de la tarjeta).

Cada tarjeta física tiene un id distinto (la primera de cada elemento, su
número atómico; las copias extra de H, O, C… del 119 en adelante), en
`apps/web/src/cards/deck.ts`. **No cambiar ese orden**: los ids ya impresos
dependen de él.

### Reglas del juego

- Tarjetas a menos de 10 cm entre centros forman un grupo. Si el grupo
  reacciona (reacción de libro con esas tarjetas exactas, o síntesis directa
  cuando sus átomos forman una sustancia conocida), se carga 3 s: vibran,
  brillan y se acercan.
- Al reaccionar, cada sustancia nueva va a la tarjeta del elemento más pesado
  que contenga; las demás vuelven a su elemento impreso (quedan libres). Fuego
  si ΔH < 0, hielo si ΔH > 0, y un destello.
- Las tarjetas que acaban de reaccionar no vuelven a hacerlo hasta separarlas.
- «Descomponer» (mantener 3 s) devuelve la tarjeta apuntada a su elemento.
- Las cartas de H, N, O, F, Cl, Br e I son átomos sueltos (su ΔHf es la de
  atomización); las de C, Na, Fe… el elemento tal cual (ΔHf = 0). Así los
  números salen de la ley de Hess y coinciden con los libros
  (2 C + O₂ → 2 CO: −221 kJ).

## Hecho y lo siguiente

- [x] Base de RA con WebXR y visor 3D sin cámara.
- [x] Los 118 elementos: protones, neutrones, electrones, capas y
  configuración; átomos con modelo de Bohr y con orbitales.
- [x] Tarjetas con marcadores, mesa virtual, reacciones con fuego/hielo,
  descomponer e impresión de tarjetas.
- [x] Plataforma educativa (ver más abajo).
- [x] Repaso de UX y accesibilidad, todos los textos en una tabla traducible
  (español e inglés) e introducción animada: ver [ux.md](ux.md).
- [x] Renovación al estilo de las apps de idiomas: camino, personajes, gato
  cuántico, rachas, ligas, Adivina, foto en RA y sección Materia.

## Plataforma educativa

Basada en [investigacion-plataforma.md](investigacion-plataforma.md).

- **Sin conexión primero.** Todo lo que hace el alumno es un evento en
  IndexedDB (`src/platform/store.ts`); su progreso se calcula de ahí
  (`progress.ts`, con tests). Sin clase, todo se queda en el móvil. Con clase,
  los eventos se envían cuando hay red (al abrir la app, al volver la conexión,
  al volver a la pestaña y tras cada evento: iOS no tiene Background Sync) y
  `POST /api/sync` es idempotente por id.
- **Clases.** El profesorado crea una cuenta y clases (curso de la LOMLOE);
  cada clase tiene un código de 6 caracteres, un enlace `/?unirse=CÓDIGO` y su
  QR. El alumnado se une con el código, un **alias** y un PIN (para entrar
  desde otro móvil). Nada de nombres, correos ni ubicación.
- **Camino de aprendizaje** (`src/learn/path.ts`): unidades con un guía
  histórico (`src/characters/`) y nodos de lección, laboratorio, Adivina,
  repaso y cofre. Se empieza solo con el hidrógeno; una lección presenta un
  elemento y lo desbloquea (también lo desbloquea formar una sustancia que lo
  lleve). Las 17 primeras unidades están pensadas a mano para que enseguida se
  puedan formar las moléculas de la ESO; el resto agrupa los elementos de 4
  en 4. Los ejercicios (`exercises.ts`) salen de las fichas de los elementos
  (`i18n/es/elementos-*.json`) y el motor de lecciones es `lesson.ts`.
- **Gamificación** (`progress.ts`, todo recalculado desde los eventos): XP y
  15 niveles, racha diaria con protectores, meta diaria, tres misiones al día
  (estables para todos ese día), quarks (moneda del juego: lecciones, misiones,
  cofres, niveles; se gastan en protectores y doble XP), insignias, colección
  de moléculas, tabla que se desbloquea, retos por curso y del profesorado,
  acertijos, meta cooperativa de clase y **ligas semanales** (`league.ts`; el
  servidor las cierra cada lunes: [servidor.md](servidor.md)).
- **Experiencias 3D** (`src/experience.ts`): explorar átomos, tarjetas, la
  sección Materia (`src/materia/`), la foto con científicos (`src/photo/`)
  comparten una sola `ARSession`; cada una crea y quita su HUD.
- **Objetos cotidianos** (`src/objects/`): un modelo 3D animado para cada
  elemento y sustancia (el Sol, un doblón, una gota de agua…), en Adivina, en
  las lecciones y junto a cada molécula que se forma con las tarjetas.
- **Panel del profesorado**: alumnado (renombrar, quitar), números de la
  clase, actividad de 14 días (gráfica con tabla alternativa), qué moléculas
  tiene la clase (buenas candidatas para retos) y creación de retos.
