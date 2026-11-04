# Desarrollo

## Ahora mismo

Monorepo con *npm workspaces*, Vite y TypeScript (la arquitectura y por qué,
en [arquitectura.md](arquitectura.md)):

- `packages/ar-core`: la base de realidad aumentada, reutilizable.
- `packages/chem`: los elementos y sus átomos en 3D, reutilizable.
- `apps/web`: la PWA (Vite + `vite-plugin-pwa`), que une las dos; el juego,
  la plataforma del alumno (`src/platform`), el panel del profesorado
  (`profesor.html`) y la tabla de textos (`src/i18n/es.json`).
- `server`: Node sin dependencias (`node:http`, `node:sqlite`) que sirve la
  PWA, la API de clases y `/health`. Es TypeScript que Node ejecuta tal cual.

```sh
npm install
npm run dev        # http://localhost:5173 (también en la red local, sin HTTPS)
npm run check      # tipos de los tres paquetes
npm test           # tests (vitest)
npm run build      # apps/web/dist
npm run server     # build + servidor en :8080 con la API (base de datos en .datos/)
```

`npm run dev` sirve solo la PWA (sin API: la clase y el panel del profesorado
no funcionan); para probarlos, `npm run server`.

La cámara y WebXR solo funcionan en `localhost` o por HTTPS. Para probar en el
móvil lo más rápido es desplegar (push a `main`) y abrir
https://labtory.peer4u.app. Otra opción, con el móvil por USB:
`adb reverse tcp:5173 tcp:5173` y abrir `http://localhost:5173` en su Chrome.
En el ordenador, la extensión *Immersive Web Emulator* simula un móvil con
WebXR.

La realidad aumentada necesita WebXR: Android con Chrome y los Servicios de
Google Play para RA. En cualquier otro sitio (iPhone, ordenador) está «Ver en
3D», el mismo átomo en un visor sin cámara.

Enlaces directos (para compartir y para pruebas):

| Parámetro | Qué hace |
| --- | --- |
| `vista=3d`, `el=Fe`, `modelo=orbitales` | Abre el visor de átomos con ese elemento y modelo |
| `vista=mesa&cartas=H,H,O&juntas=1` | Mesa virtual con esas tarjetas (juntas: reaccionan solas) |
| `vista=tarjetas&imagen=/foto.png` | Modo tarjetas sobre una foto en vez de la cámara |
| `avanzar=3.4` | Adelanta la animación esos segundos (`ARSession.advance`) |

Capturas y pruebas sin pantalla (Chrome sin interfaz apenas pinta frames, por
eso `avanzar`; y siempre con un perfil nuevo, o el service worker servirá una
versión vieja):

```sh
npm run build && npm run preview &
P=$(mktemp -d); google-chrome --headless=new --user-data-dir=$P --enable-unsafe-swiftshader \
  --window-size=412,860 --timeout=3000 --screenshot=agua.png \
  'http://localhost:4173/?vista=mesa&cartas=H,H,O&juntas=1&avanzar=3.4'
# Para leer el DOM: --dump-dom con --virtual-time-budget=6000 (--timeout no espera).
```

En Chrome sin interfaz `getUserMedia` no responde ni con
`--use-fake-device-for-media-stream`: para probar la detección de tarjetas,
usa `imagen=` con una foto (o una imagen generada) de tarjetas impresas.

Los datos de los elementos se regeneran con
`packages/chem/scripts/generar-elementos.py` (instrucciones dentro).

Con Docker, igual que en producción:

```sh
docker build -f infra/docker/Dockerfile --build-arg GIT_SHA=local -t webar:dev .
docker run --rm -p 8080:8080 webar:dev
# http://localhost:8080   ·   http://localhost:8080/health
```

## Textos e idiomas

Ningún texto va escrito en el código: todos están en
`apps/web/src/i18n/es.json` (clave → `texto` y `descripcion`, para quien
traduzca). En el código, `t('clave', { variable })`; en el HTML,
`data-t="clave"` (o `data-t-attr="aria-label:clave"`). Los nombres de
`@webar/chem` se muestran con `src/i18n/content.ts`. Hay inglés (`en.json`);
cómo añadir otro idioma, en [ux.md](ux.md).

Para probar la interfaz sin móvil va bien controlar Chrome por el protocolo de
depuración (CDP), con el `WebSocket` que ya trae Node 22: navegar, evaluar
JavaScript, pulsar botones y hacer capturas.

## El contrato de la imagen

La CI y `deploy.sh` cuentan con esto. Si lo cambias, cámbialos también:

- **`infra/docker/Dockerfile`** construye una imagen que escucha en el
  **8080**, sin TLS (Node: `server/src/main.ts`).
- **`GET /health`** responde 200 con `{"ok":true,"version":"<GIT_SHA>"}`. El
  commit llega como `--build-arg GIT_SHA`.
- **`GET /`** responde 200.
- La imagen arranca con el sistema de ficheros de **solo lectura** (salvo
  `/tmp` y el volumen `/data`), **sin capacidades** y sin root. Si `/data` no
  se puede escribir (la CI), la base de datos va a `/tmp`.

## Dependencias y peso

- Modelos 3D, vídeos o marcadores pesados: pocos megas y comprimidos
  (glTF/Draco, KTX2). Todo el tráfico de la máquina cuenta en el límite
  mensual de Oracle (`docs/servidor.md`).
- El service worker guarda en caché todo lo que hay en `dist/` (precache). Si
  algo grande no debe ir ahí, sácalo de `workbox.globPatterns` en
  `apps/web/vite.config.ts`.
- Si hace falta un servidor propio (API, WebSocket), que cumpla el mismo
  contrato: puerto 8080 y `/health` con la versión.
