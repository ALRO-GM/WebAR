# Desarrollo

## Ahora mismo

Monorepo con *npm workspaces*, Vite y TypeScript (la arquitectura y por qué,
en [arquitectura.md](arquitectura.md)):

- `packages/ar-core`: la base de realidad aumentada, reutilizable.
- `apps/web`: la PWA (Vite + `vite-plugin-pwa`), con la demo de la esfera.

```sh
npm install
npm run dev        # http://localhost:5173 (también en la red local, sin HTTPS)
npm run check      # tipos de los dos paquetes
npm run build      # apps/web/dist
```

La cámara y WebXR solo funcionan en `localhost` o por HTTPS. Para probar en el
móvil lo más rápido es desplegar (push a `main`) y abrir
https://webar.peer4u.app. Otra opción, con el móvil por USB:
`adb reverse tcp:5173 tcp:5173` y abrir `http://localhost:5173` en su Chrome.
En el ordenador, la extensión *Immersive Web Emulator* simula un móvil con
WebXR.

La demo de la esfera necesita WebXR: Android con Chrome y los Servicios de
Google Play para RA. En iPhone avisa de que aún no hay soporte.

Con Docker, igual que en producción:

```sh
docker build -f infra/docker/Dockerfile --build-arg GIT_SHA=local -t webar:dev .
docker run --rm -p 8080:8080 webar:dev
# http://localhost:8080   ·   http://localhost:8080/health
```

## El contrato de la imagen

La CI y `deploy.sh` cuentan con esto. Si lo cambias, cámbialos también:

- **`infra/docker/Dockerfile`** construye una imagen que escucha en el
  **8080**, sin TLS.
- **`GET /health`** responde 200 con `{"ok":true,"version":"<GIT_SHA>"}`. El
  commit llega como `--build-arg GIT_SHA`.
- **`GET /`** responde 200.
- La imagen arranca con el sistema de ficheros de **solo lectura** (salvo
  `/tmp`), **sin capacidades** y sin root.

## Dependencias y peso

- Modelos 3D, vídeos o marcadores pesados: pocos megas y comprimidos
  (glTF/Draco, KTX2). Todo el tráfico de la máquina cuenta en el límite
  mensual de Oracle (`docs/servidor.md`).
- El service worker guarda en caché todo lo que hay en `dist/` (precache). Si
  algo grande no debe ir ahí, sácalo de `workbox.globPatterns` en
  `apps/web/vite.config.ts`.
- Si hace falta un servidor propio (API, WebSocket), que cumpla el mismo
  contrato: puerto 8080 y `/health` con la versión.
