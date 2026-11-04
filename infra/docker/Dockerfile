# La imagen de WebAR: se construye la PWA (apps/web, con Vite) y un Caddy
# pequeño sirve el resultado en el puerto 8080.
#
# El contrato con el despliegue (no cambiarlo sin cambiar deploy.sh y la CI):
#   - escucha en 8080, sin TLS (el TLS lo pone el Caddy de Peer4U, delante);
#   - `GET /health` responde 200 con `{"ok":true,"version":"<GIT_SHA>"}`.
#
# Si hace falta un servidor propio (Node, Python), cambia la segunda etapa por
# la suya cumpliendo el mismo contrato.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/ar-core/package.json packages/ar-core/
COPY packages/chem/package.json packages/chem/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/ packages/
COPY apps/ apps/
RUN npm run build

FROM caddy:2-alpine

ARG GIT_SHA=
ENV GIT_SHA=${GIT_SHA} \
    XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config

COPY infra/docker/Caddyfile.app /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist/ /srv/

# El binario de la imagen lleva la capacidad de abrir puertos bajos, y con
# `cap_drop: ALL` (compose) no arrancaría: una copia sin ella basta para 8080.
RUN cp /usr/bin/caddy /usr/local/bin/caddy-app

# Sin root: el puerto es alto y lo único que escribe va a /tmp.
USER 65534:65534
EXPOSE 8080
CMD ["caddy-app", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
