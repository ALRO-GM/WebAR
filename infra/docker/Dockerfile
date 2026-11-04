# La imagen de WebAR: se construye la PWA (apps/web, con Vite) y un servidor
# Node sin dependencias (server/) la sirve junto con la API de clases.
#
# El contrato con el despliegue (no cambiarlo sin cambiar deploy.sh y la CI):
#   - escucha en 8080, sin TLS (el TLS lo pone el Caddy de Peer4U, delante);
#   - `GET /health` responde 200 con `{"ok":true,"version":"<GIT_SHA>"}`;
#   - sistema de ficheros de solo lectura: la base de datos va en /data (un
#     volumen); si no se puede escribir ahí (la CI), en /tmp.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ar-core/package.json packages/ar-core/
COPY packages/chem/package.json packages/chem/
COPY apps/web/package.json apps/web/
COPY server/package.json server/
RUN npm ci
COPY packages/ packages/
COPY apps/ apps/
RUN npm run build

FROM node:22-alpine
ARG GIT_SHA=
ENV GIT_SHA=${GIT_SHA} \
    NODE_ENV=production \
    STATIC_DIR=/app/web/ \
    DB_PATH=/data/webar.db
WORKDIR /app
# El servidor es TypeScript que Node ejecuta tal cual (sin compilar) y solo usa
# módulos de Node (node:http, node:sqlite).
COPY server/package.json server/
COPY server/src/ server/src/
COPY --from=build /app/apps/web/dist/ web/
# El volumen /data hereda este dueño la primera vez: así el usuario sin
# privilegios puede escribir la base de datos.
RUN mkdir -p /data && chown 65534:65534 /data
USER 65534:65534
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/main.ts"]
