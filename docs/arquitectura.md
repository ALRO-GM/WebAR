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
  src/pose.ts            pose de un marcador (homografía + Levenberg-Marquardt, ambigüedad, mesa común)
  src/refine.ts          esquinas a décimas de píxel (rectas ajustadas a los bordes)
  src/one-euro.ts        filtro «1 €» contra el temblor
  src/gate.ts            qué lecturas son tarjetas de verdad y con qué identidad
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
  src/teacher/           estadísticas del profesorado: cálculo (stats.ts), gráficas y página
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

## Átomos: tamaños y fondo

Protones y neutrones se exageran mucho (3,2 mm de radio a la escala por
defecto) para que se vean; en los átomos pesados se reducen lo justo para que
el núcleo no pase del 40 % del radio. Los electrones son destellos
(`three/glow.ts`: núcleo blanco y halo aditivo): en Bohr titilan al girar; en
orbitales estallan cada vez que el electrón «aparece» en otro sitio. Como el
brillo aditivo no se ve sobre blanco, el visor 3D usa un fondo oscuro de
escenario también en el tema claro.

## Sin WebGL, la app sigue funcionando

Hay ordenadores en los que el navegador no puede crear WebGL (gráfica en su
lista negra, aceleración por hardware desactivada, escritorios remotos…).
Antes, `new WebGLRenderer` lanzaba al arrancar y la app se quedaba en blanco
(solo respondía el botón de tema, que se engancha antes). Ahora `ARSession`
se crea igual con `has3D = false` y su `start` falla con
`WebGLUnavailableError`, que la app traduce a un aviso con cómo arreglarlo;
las vistas 3D pequeñas de las lecciones (`MiniScene`) se ocultan. Lecciones,
colección, liga, perfil y Materia (salvo sus visores) funcionan igual.

## Tarjetas: por qué marcadores ArUco

Las tarjetas llevan un marcador ArUco (diccionario MIP 36h12, 250 códigos) en
lugar de una imagen para MindAR:

- se detectan en milisegundos y se siguen **muchas a la vez** (MindAR sufre a
  partir de 2-3 imágenes), que es justo lo que pide combinar átomos;
- funcionan en **cualquier móvil con cámara**, iPhone incluido;
- una tarjeta nueva es un número nuevo: no hay que compilar imágenes.

La cara de la tarjeta se tapa con una virtual con los datos de lo que
contiene, y cada átomo persigue a su tarjeta con un poco de retardo, para que
se deslice suave al moverla.

### Por qué temblaba y cómo se evita

Un marcador de 4 cm a 30-40 cm ocupa unos 60 px de los 640 en los que se
busca, y el detector da sus esquinas **en píxeles enteros**. Un píxel de error
en una esquina son grados de inclinación, y el átomo, que flota 2-3 cm por
encima, lo amplifica: eso era el temblor. Además, visto casi de frente, un
cuadrado pequeño encaja casi igual con dos inclinaciones (la ambigüedad de los
marcadores planos) y la pose saltaba de una a otra. Se hace como en OpenCV,
AprilTag, MindAR o los visores de RA:

1. **Esquinas a décimas de píxel** (`refine.ts`): en cada lado se busca el
   borde en perpendicular (máximo del gradiente, con una parábola) en hasta 40
   puntos, se ajusta una recta y las esquinas salen de cruzarlas. Con el
   detector de verdad sobre fotos sintéticas, el error de giro baja de 1,25° a
   0,35° (`tracking.test.ts`).
2. **Pose afinada y sin saltos** (`pose.ts`): de la homografía se sacan las dos
   inclinaciones posibles, se afinan con Levenberg-Marquardt (menor error de
   reproyección, como `solvePnP`) y, si las dos explican la imagen, gana la
   más parecida a la del fotograma anterior.
3. **La mesa es común** (`alignCoplanar`, opción `coplanar`): las tarjetas
   están en el mismo plano, así que comparten la normal, que es lo peor medido
   de cada una; se usa la media ponderada por tamaño. Una tarjeta levantada
   más de 25° va por libre.
4. **Filtro «1 €»** (`one-euro.ts`, Casiez et al., 2012): paso bajo cuyo corte
   sube con la velocidad: quieto apenas tiembla y al mover la tarjeta no se
   queda atrás (menos de 4 mm a 30 cm/s).
5. Cada fotograma de la cámara se analiza **una sola vez** (se pinta a 60 fps,
   la cámara da 30): menos batería y calor, que también tiran los fps.

### Varias tarjetas, sin fantasmas y sin cambiar de átomo

El detector de serie aceptaba un código con hasta 11 bits erróneos de 36 y se
inventaba tarjetas (un trozo del propio marcador leído como el 97, berkelio).
Esa tarjeta fantasma caía encima de una real, «reaccionaba» con ella y le
cambiaba el átomo. Ahora, como en el «tracking by detection» de los sistemas
reales:

- **lectura estricta**: como mucho 2 bits erróneos (`maxBitErrors`);
- **confirmación**: una tarjeta nueva tiene que verse 3 fotogramas seguidos en
  el mismo sitio (≈ 0,1 s); un reflejo no aguanta tanto;
- **identidad bloqueada** (`IdentityGate`): donde hay una tarjeta conocida no
  puede aparecer otra con otro número durante 1 s, aunque un fotograma
  borroso la lea mal; la tarjeta sigue siendo el átomo que era;
- de dos lecturas solapadas en el mismo fotograma gana la de menos errores.

`cards.test.ts` fotografía (sintéticamente) 5 tarjetas a 40-60 cm, rectas e
inclinadas, con desenfoque: se leen las 5 y ninguna inventada.

### Tarjetas dibujadas a mano y papel cuadriculado

El umbral adaptativo del detector marcaba como tinta cualquier línea un poco
más oscura que su entorno: en papel cuadriculado, las líneas cruzan los
marcadores y los unen en una red, y deja de haber cuadrados sueltos. Dos
cambios en `vendor/js-aruco2/cv.js` (marcados con «WebAR»):

- **umbral relativo** (`relativeThreshold: 0.16`, ventana 3): además de ser
  más oscuro que su entorno, el píxel tiene que serlo en un 16 %; las líneas
  claras no pasan;
- **canal más claro** (`brightestChannel`): cada píxel vale su canal más
  claro, así que una línea azul, verde o roja queda casi blanca y el
  rotulador negro sigue negro.

Con fotos sintéticas: tarjetas impresas 60/60 (también desenfocadas);
cuadrícula gris clara o azul, las 5 tarjetas en ≥ 90 % de los fotogramas
(antes, en torno a la mitad). Una cuadrícula gris oscura sigue molestando:
ayuda repasar fuerte el borde negro y dejar un cuadro en blanco alrededor.
Se toleran 3 bits erróneos (trazo a mano); la confirmación evita fantasmas.

**Modo diagnóstico** (Ajustes → «Ver lo que lee la cámara»): recuadra cada
marcador leído con su número y un color según lo que se hizo con él.

Lo que hacen ARKit y ARCore y aquí no se puede: fundir la cámara con el
giroscopio y el acelerómetro (odometría visual-inercial) para que la tarjeta
quede fija en el mundo aunque se mueva el móvil. Ayuda en la práctica: buena
luz, tarjetas planas (pegadas a cartulina) y no acercar el móvil a menos de
20 cm.

### Una sola tarjeta: papel = mesa virtual

La tarjeta se dibuja **una vez**, en SVG (`apps/web/src/cards/card-svg.ts`,
`cardSVG(spec, content?)`), en décimas de milímetro (630 × 880):

- fondo del color de su familia **en degradado** (vivo: con el canal más
  claro que usa el detector, el fondo queda casi blanco y el marcador
  destaca) con **órbitas** suaves, una por capa del átomo, como si el
  marcador fuera el núcleo;
- panel blanco con el marcador (40 mm de negro, a 8 mm del borde superior y
  centrado) y su **margen blanco de 5 mm**, en el que no se dibuja nada (si
  no, deja de detectarse);
- **enlaces en los bordes**: medio enlace saliendo por la izquierda y por la
  derecha por cada enlace que suele formar el átomo (`bondCount`: H y
  halógenos 1, O 2, N 3, C 4, gases nobles 0; metales de transición, su
  valencia habitual), a **alturas fijas comunes a todas las tarjetas**
  (`BOND_SLOTS`: primero a la altura del centro del marcador, luego arriba,
  abajo…). Al juntar dos tarjetas de lado, los trazos coinciden: tantas rayas
  seguidas como el enlace que pueden formar (H–O una, O=C dos, N≡N tres). Va
  a ambos lados porque la misma tarjeta puede quedar a la izquierda o a la
  derecha (H₂O es H–O–H). Los metales, discontinuos: ceden electrones
  (enlace iónico). El pie dice cuántos enlaces son;
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

- **Empieza vacía.** El botón «➕ Añadir elemento» abre la tabla periódica:
  un elemento desbloqueado cae en un **hueco libre**, a más de la distancia
  de unión de las demás (no reacciona hasta que se junta a mano); uno
  bloqueado explica en qué unidad se aprende. Antes se repartían 12 tarjetas
  a 9,3 cm (menos que los 10 cm a los que se juntan) y reaccionaban solas; y
  una bandeja de elementos en fila se cortaba en el móvil. Los acertijos y el
  laboratorio siguen poniendo sus tarjetas, también separadas (o juntas si
  lo piden).
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
- [x] Emitir al proyector: el móvil del profesor se ve en el ordenador del
  aula (ver «Emitir al proyector» más abajo).

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
- **Explorar átomos** es un solo modo: dentro, «En 3D | En tu mesa» cambia
  entre el visor y colocarlos en la habitación con WebXR (antes eran dos
  botones en el laboratorio). Sin WebXR, «En tu mesa» se ve apagado y explica
  por qué al tocarlo.
- **Experiencias 3D** (`src/experience.ts`): explorar átomos, tarjetas, la
  sección Materia (`src/materia/`), la foto con científicos (`src/photo/`, **en
  pausa**: no se puede entrar ni se enseña su insignia; se reactiva en
  `src/features.ts`)
  comparten una sola `ARSession`; cada una crea y quita su HUD.
- **Objetos cotidianos** (`src/objects/`): un modelo 3D animado para cada
  elemento y sustancia (el Sol, un doblón, una gota de agua…), en Adivina, en
  las lecciones y junto a cada molécula que se forma con las tarjetas.
- **Panel del profesorado**: alumnado (renombrar, quitar), números de la
  clase, actividad de 14 días (gráfica con tabla alternativa), qué moléculas
  tiene la clase (buenas candidatas para retos) y creación de retos.
- **Estadísticas y recomendaciones** (`src/teacher/`, ruta
  `profesor.html#clase/<id>/estadisticas`): ver la sección siguiente.

## Actualizaciones de la PWA

`registerSW` (`virtual:pwa-register`, en `main.ts`) con `autoUpdate`: al
desplegar, el service worker nuevo toma el control y la página se recarga
sola; con la app abierta, se comprueba cada hora. Antes se veía la copia
vieja hasta cerrar y abrir la app dos veces.

## Actividades de clase y demostración

- **Actividades**: el profesorado lanza un acertijo o una Adivina (elige los
  elementos y sustancias) desde su panel; a la clase le sale en la pestaña
  Clase (sync cada minuto) y su resultado vuelve como evento `actividad`
  (puntos, resuelto o aciertos). El panel enseña quién la ha hecho y la
  media.
- **Demostración** (`platform/demo.ts`, `server/src/demo.ts`): en Ajustes o
  con `?demo=alumno`, la app usa otro almacén (`webar-demo`), con todo
  desbloqueado, un mes de progreso inventado y el alumno «Demo» en la clase
  de demostración; «Salir de la demostración» (o `?demo=salir`) vuelve al
  progreso propio. En el panel, «Ver la clase de demostración» entra sin
  cuenta en esa clase.

## Estadísticas del profesorado

Cada respuesta del alumnado se guarda con su **tipo de pregunta** (datos de
la ficha, protones, electrones, neutrones, símbolo, pista, fórmula, objeto
cotidiano), su **tema** (elemento o sustancia) y si se acertó **a la
primera** (lo que se repite hasta acertar no cuenta como acierto). Va dentro
del evento `leccion` o `adivina`: así funciona sin conexión y no hace falta
otra tabla.

El servidor solo entrega los eventos de la clase (`GET
/api/clases/:id/eventos`); el panel los analiza en el navegador
(`teacher/stats.ts`, puro y con tests) con el **mismo** `computeProgress` de
la app, así que lo que ve el profesorado cuadra con lo que ve cada alumno.

- **Uso**: alumnado activo por día (30 días) y mapa de calor día × hora.
- **Preguntas**: acierto a la primera por tipo de pregunta, por elemento o
  sustancia y por pregunta concreta. Una dificultad cuenta con al menos 5
  respuestas de al menos 2 personas, para que un mal día de alguien no
  parezca un problema de la clase.
- **Avance**: cada unidad del camino (terminada, en curso, sin llegar) y
  cuántas personas han hecho la lección de cada elemento.
- **Estado de cada alias**, comparado con la propia clase (no con un nivel
  fijo): *necesita ayuda* si va por debajo del 60 % de la mediana de pasos
  del camino (y a 2 o más) o acierta menos del 60 % con 10 o más respuestas;
  *sin entrar* si lleva 7 días sin actividad y el resto sí entra;
  *adelantado* si está en el cuarto que más avanza, por encima de la mediana
  y con un 80 % de aciertos. Cada estado dice por qué.
- **Para trabajar en clase**: los tipos de pregunta y temas con menos
  aciertos, con una idea concreta para cada tipo.
- **Parejas y equipos** (tutoría entre iguales): se ordena por avance
  (60 %) y acierto (40 %, ajustado hacia la media de la clase si hay pocas
  respuestas); las parejas emparejan la primera persona de cada mitad, la
  segunda con la segunda… (como PALS: distinto nivel, pero no los extremos),
  con un trío si son impares. Cada pareja dice en qué puede ayudar quien
  explica: los tipos de pregunta en los que va bien y su pareja no, y la
  unidad de su pareja si ya la ha terminado. Los equipos de 4 se reparten en
  serpiente para que cada uno tenga todos los niveles.
- Las gráficas siguen la guía de visualización: una serie azul, escala
  secuencial de un tono con pasos propios en claro y en oscuro (validados),
  estado con icono y palabra (nunca solo color), tooltip y vista de tabla en
  cada gráfica.

## Emitir al proyector

El profesor entra con su cuenta en el móvil (perfil → «Proyectar en clase») y
en el ordenador del aula (`/proyector.html`, o «🖥️ Proyectar» en el panel).
Sin códigos: las dos pantallas se encuentran por la cuenta (el login da un
token por dispositivo). Si emiten varios móviles, el ordenador pregunta cuál.

- **Móvil** (`apps/web/src/cast/`): `Compositor` pinta cada frame en un lienzo
  2D: la cámara recortada como `object-fit: cover` (en espejo si es la
  frontal) y encima el lienzo WebGL, copiado justo después de pintar (con
  `deps.onFrame`, o llamando a `deps.renderNow()` justo antes). De ahí sale
  `canvas.captureStream(24)` hacia WebRTC (≈ 2,5 Mb/s). En RA del mundo
  (WebXR) la cámara no es accesible: se emite la capa 3D sobre fondo oscuro y
  el proyector lo avisa. Sin nada que emitir, una imagen con el logo y
  «Esperando…». `CastSender` es único por página, así que la emisión sigue al
  cambiar de experiencia; pide `wakeLock` para que no se apague la pantalla.
- **Plan B**: si WebRTC no conecta en 8 s (redes de centro que lo bloquean),
  se pasa al relevo de JPEG por el servidor. El proyector lo indica («modo
  ahorro de red») y vuelve a pedir imagen solo si se corta 12 s.
- **Ordenador** (`proyector.html`, `src/cast/projector.ts`): fondo negro,
  imagen centrada y ajustada, insignia «En directo» con la calidad, botones
  de 44 px (pantalla completa, cambiar de móvil, volver) que se apartan con
  el ratón quieto. Se reconecta solo y vuelve al mismo móvil si reaparece.
- Servidor y límites: [servidor.md](servidor.md#emitir-al-proyector-apiemision).

