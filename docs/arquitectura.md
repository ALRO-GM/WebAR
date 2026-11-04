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
    viewer.ts            visor 3D sin cámara (iPhone, ordenador, desarrollo)
packages/chem/         @webar/chem: los 118 elementos y sus átomos en 3D (no sabe de RA)
  src/data/elements.ts   datos generados (scripts/generar-elementos.py)
  src/configuration.ts   capas, subniveles, Hund y Slater
  src/nucleus.ts         cómo se apilan protones y neutrones
  src/orbitals.ts        nubes de probabilidad |ψ|²
  src/three/             AtomView: núcleo + Bohr o nubes, con su animación
apps/web/              la PWA: une las dos; interfaz e instalación
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

## Hecho y lo siguiente

- [x] Base de RA con WebXR y visor 3D sin cámara.
- [x] Los 118 elementos: protones, neutrones, electrones, capas y
  configuración; átomos con modelo de Bohr y con orbitales.
- [ ] Proveedor `MindARImageProvider` (`image`): cartas con un `.mind`
  compilado desde sus imágenes, varias a la vez (`maxTrack`).
- [ ] Reglas de enlace (valencias) en `@webar/chem` y detección de cercanía
  entre anclas → animación de la molécula formada.
