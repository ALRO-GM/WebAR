# @webar/ar-core

Base de realidad aumentada web sobre three.js: sesión, anclas y proveedores
de seguimiento intercambiables. No sabe nada de la aplicación que la usa.

```ts
import { ARSession, WebXRWorldProvider, detectARSupport } from '@webar/ar-core'

const provider = new WebXRWorldProvider()
const ar = new ARSession({ provider, overlay: document.getElementById('overlay')! })

ar.on('select', async () => {
  const anchor = await provider.placeAnchor() // null si no hay superficie
  anchor?.object.add(miMalla)
})
ar.on('frame', ({ dt }) => { /* animar */ })

if ((await detectARSupport()).webxrAR) boton.onclick = () => ar.start()
```

- `ARSession`: `scene`, `camera`, `renderer`, `start()` (desde un gesto del
  usuario), `end()` y los eventos `start`, `frame`, `select` y `end`.
- `ARAnchor`: `object` (un `THREE.Group` que mueve el proveedor), `tracking`,
  los eventos `found`/`lost`/`disposed` y `dispose()`.
- `ARProvider`: el contrato para añadir otro sistema de seguimiento
  (`isSupported`, `start`, `update`, `stop`).
- `WebXRWorldProvider`: superficies y anclas con WebXR (Android con Chrome).
  Muestra un anillo donde caerá el siguiente objeto (`reticle`).
- `MarkerTrackingProvider`: marcadores ArUco impresos con la cámara (cualquier
  móvil). Un ancla por marcador (evento `marker`), con la y hacia fuera del
  papel y `anchorOffset` para mover el ancla (p. ej. al centro de una
  tarjeta). `useImage(url)` sustituye la cámara por una foto. `markerSVG(id)`
  (también en `@webar/ar-core/markers`) da el marcador para imprimir.
- `ViewerProvider`: visor 3D sin cámara con la misma API de anclas
  (`createAnchor`, `frame`, `setView`). `setControls({...})` ajusta la cámara
  de la sesión en marcha (`maxPolarAngle` para no bajar de cierta altura,
  `dampingFactor`, `rotateSpeed`, `zoomSpeed`, `panSpeed`, `enablePan`,
  `screenSpacePanning: false` para desplazar sobre una mesa, `zoomToCursor`,
  `minDistance`/`maxDistance` y `panBounds`, una caja de la que no sale el
  punto de mira); al parar vuelve a los del constructor (`controls`).
  `setDragHandler({ down, move, up })` deja arrastrar objetos con un dedo
  (si `down` devuelve true, la cámara no ve ese dedo); al caer un segundo dedo
  se cancela el arrastre (`up(e, true)`) y los dos dedos desplazan y hacen
  zoom aunque estén encima de objetos.
- `ARSession.advance(segundos)`: avanza la sesión sin esperar al navegador
  (pruebas y capturas automáticas).

En la capa HTML (`overlay`), los toques en `button`, `a`, campos de formulario
o en cualquier cosa con `data-ar-ui` no cuentan como `select` en la escena.

Requisitos: `three` ≥ 0.160 y HTTPS (o `localhost`).

Para usarla en otro proyecto, copia esta carpeta (o publícala como paquete).
Exporta TypeScript directamente (`src/index.ts`); el bundler del proyecto
(Vite, etc.) la compila.
