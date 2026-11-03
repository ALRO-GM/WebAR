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

En la capa HTML (`overlay`), los toques en `button`, `a`, campos de formulario
o en cualquier cosa con `data-ar-ui` no cuentan como `select` en la escena.

Requisitos: `three` ≥ 0.160 y HTTPS (o `localhost`).

Para usarla en otro proyecto, copia esta carpeta (o publícala como paquete).
Exporta TypeScript directamente (`src/index.ts`); el bundler del proyecto
(Vite, etc.) la compila.
