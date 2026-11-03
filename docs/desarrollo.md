# Desarrollo

## Ahora mismo

Aún no hay pila: `public/` se sirve tal cual. Es una página con un botón que
prueba la cámara trasera, para comprobar que HTTPS y los permisos van bien.

```sh
docker build -f infra/docker/Dockerfile --build-arg GIT_SHA=local -t webar:dev .
docker run --rm -p 8080:8080 webar:dev
# http://localhost:8080   ·   http://localhost:8080/health
```

O, sin Docker: `python3 -m http.server 8080 -d public`.

La cámara solo funciona en `localhost` o por HTTPS. Para probar en el móvil,
despliega (push a `main`) y abre https://webar.peer4u.app.

## El contrato de la imagen

La CI y `deploy.sh` cuentan con esto. Si lo cambias, cámbialos también:

- **`infra/docker/Dockerfile`** construye una imagen que escucha en el
  **8080**, sin TLS.
- **`GET /health`** responde 200 con `{"ok":true,"version":"<GIT_SHA>"}`. El
  commit llega como `--build-arg GIT_SHA`.
- **`GET /`** responde 200.
- La imagen arranca con el sistema de ficheros de **solo lectura** (salvo
  `/tmp`), **sin capacidades** y sin root.

## Meter una pila

Por ejemplo, Vite con three.js, A-Frame o MindAR.

1. Crea `package.json` con, como mínimo:
   - `build`, que genere `dist/`;
   - `check`, para lint y tipos;
   - `test`, si hay tests.

   La CI los ejecuta solos en cuanto existe `package.json`.
2. En el Dockerfile, añade una etapa de build delante:
   ```dockerfile
   FROM node:22-alpine AS build
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   ```
   En la etapa de Caddy, cambia `COPY public/ /srv/` por
   `COPY --from=build /app/dist/ /srv/`. Mantén la ruta `/health` del
   `Caddyfile.app`.
3. Si hace falta un servidor propio (API, WebSocket), que cumpla el mismo
   contrato: puerto 8080 y `/health` con la versión.

   Con estado (base de datos, ficheros subidos), añade un volumen en
   `infra/compose.yml` y quita `read_only` solo si no hay otra forma.
4. Modelos 3D, vídeos o marcadores pesados: pocos megas y comprimidos
   (glTF/Draco, KTX2). Todo el tráfico de la máquina cuenta en el límite
   mensual de Oracle (`docs/servidor.md`).
