#!/bin/sh
# Pone en marcha el último commit de main en la máquina (/opt/webar).
#
#   infra/scripts/deploy.sh            lo normal (lo lanza también auto-deploy.sh)
#   SIN_CI=1 infra/scripts/deploy.sh   solo con GitHub caído: sin esperar a la CI
#
# La secuencia, con una barrera en cada paso (`set -e`: lo que falla, para):
#
#   1. Cerrojo: dos despliegues a la vez no pueden correr.
#   2. `git pull` y espera a que la CI de ese commit diga `ci-ok/<sha>` (una
#      etiqueta de git, mirada con `git ls-remote`: sin la API de GitHub).
#   3. La imagen que funciona se guarda como `webar:previous` y se construye la
#      nueva con el commit dentro (GIT_SHA).
#   4. `up -d` y hasta 60 s a que /health responda con ese commit.
#   5. El bloque de Caddy (infra/caddy/webar.caddy): si cambió, se copia a
#      /opt/caddy-sitios, se valida en el Caddy de Peer4U y se recarga. Si no
#      valida, se vuelve al bloque de antes y Peer4U no se entera.
#   6. Si la versión nueva no responde: vuelta a `webar:previous`.
#
# No toca nada de Peer4U salvo `caddy validate` y `caddy reload` en su Caddy.
set -eu

cd "$(dirname "$0")/.."

IMAGE=webar:local
PREVIOUS=webar:previous
LOCK=/tmp/webar-deploy.lock
CADDY=sanatorio-caddy-1
SITES=/opt/caddy-sitios
BLOCK=caddy/webar.caddy
PUBLIC_URL=https://labtory.peer4u.app
CI_WAIT_S=${CI_WAIT_S:-900}
CI_EVERY_S=20
HEALTH_WAIT_S=60

started=$(date +%s)

# --- 1. Cerrojo ---------------------------------------------------------------
exec 9> "$LOCK"
if ! flock -n 9; then
  echo "Ya hay un despliegue de WebAR en marcha (cerrojo $LOCK)." >&2
  exit 1
fi

# --- 2. Código y CI -------------------------------------------------------------
git -C .. fetch -q origin main
git -C .. checkout -q main
git -C .. merge -q --ff-only origin/main
sha=$(git -C .. rev-parse HEAD)

wait_for_ci() {
  end=$((started + CI_WAIT_S))
  echo "Esperando a la CI de $sha (etiqueta ci-ok/$sha)..."
  while :; do
    refs=$(git -C .. ls-remote origin "refs/tags/ci-ok/$sha" "refs/tags/ci-ko/$sha" refs/heads/main 2> /dev/null) || refs=''
    case "$refs" in
      *"refs/tags/ci-ok/$sha"*) echo "CI de $sha en verde." && return 0 ;;
      *"refs/tags/ci-ko/$sha"*) echo "La CI de $sha ha fallado: no se despliega." >&2 && return 1 ;;
    esac
    head=$(printf '%s\n' "$refs" | awk '$2 == "refs/heads/main" { print $1 }')
    if [ -n "$head" ] && [ "$head" != "$sha" ]; then
      echo "main ya tiene un commit más nuevo ($head): vuelve a desplegar." >&2
      return 1
    fi
    [ "$(date +%s)" -lt "$end" ] || { echo "La CI de $sha no ha terminado en ${CI_WAIT_S} s." >&2; return 1; }
    sleep "$CI_EVERY_S"
  done
}

if [ "${SIN_CI:-0}" = 1 ]; then
  echo "SIN_CI=1: se despliega sin mirar la CI." >&2
else
  wait_for_ci
fi

# --- 3. Imagen ------------------------------------------------------------------
docker network inspect sanatorio_default > /dev/null 2>&1 ||
  { echo "No existe la red sanatorio_default: Peer4U no está en marcha." >&2; exit 1; }
docker image tag "$IMAGE" "$PREVIOUS" 2> /dev/null || true
GIT_SHA=$sha docker compose build -q web

# --- 4. Arranque y salud -----------------------------------------------------------
healthy() {
  want=$1
  end=$(($(date +%s) + HEALTH_WAIT_S))
  while [ "$(date +%s)" -lt "$end" ]; do
    got=$(docker compose exec -T web wget -qO- http://127.0.0.1:8080/health 2> /dev/null) || got=''
    case "$got" in
      *"\"version\":\"$want\""*) echo "Salud: $got" && return 0 ;;
    esac
    sleep 2
  done
  return 1
}

docker compose up -d web
if ! healthy "$sha"; then
  echo "La versión nueva no responde en ${HEALTH_WAIT_S} s:" >&2
  docker compose logs --no-color --tail 30 web >&2 || true
  if docker image inspect "$PREVIOUS" > /dev/null 2>&1; then
    docker image tag "$PREVIOUS" "$IMAGE"
    docker compose up -d web
    echo "Vuelta a la versión anterior." >&2
  fi
  exit 1
fi
docker image prune -f > /dev/null

# --- 5. Bloque de Caddy --------------------------------------------------------------
target=$SITES/webar.caddy
# Sin el DNS apuntando aquí, Caddy pediría un certificado que no puede obtener
# y reintentaría sin parar: el bloque espera a que el dominio esté listo.
host=${PUBLIC_URL#https://}
me=$(curl -fsS --max-time 5 https://ifconfig.me 2> /dev/null || true)
if ! getent ahostsv4 "$host" | awk '{ print $1 }' | grep -qx "${me:-x}"; then
  echo "$host aún no apunta a esta máquina (${me:-IP desconocida}): el bloque de Caddy espera." >&2
  echo "Desplegado ($sha) solo por dentro; falta el DNS."
  exit 0
fi
if ! cmp -s "$BLOCK" "$target"; then
  echo "El bloque de Caddy cambió: lo valido y recargo."
  backup=''
  if [ -f "$target" ]; then
    backup=$(mktemp)
    cp "$target" "$backup"
  fi
  cp "$BLOCK" "$target"
  if docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null 2>&1 &&
    docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null 2>&1; then
    echo "Caddy recargado con el bloque nuevo."
  else
    if [ -n "$backup" ]; then cp "$backup" "$target"; else rm -f "$target"; fi
    echo "El bloque nuevo no valida en el Caddy de Peer4U: se deja el anterior." >&2
    docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -3 >&2 || true
    exit 1
  fi
fi

# --- 6. Desde fuera ----------------------------------------------------------------------
# Solo informa: el certificado de un subdominio nuevo puede tardar un minuto.
if curl -fsS --max-time 10 "$PUBLIC_URL/health" 2> /dev/null | grep -q "\"version\":\"$sha\""; then
  echo "Responde desde fuera: $PUBLIC_URL"
else
  echo "Aún no responde desde fuera ($PUBLIC_URL): mira DNS, certificado o 'docker logs $CADDY'." >&2
fi

echo "Desplegado y respondiendo ($sha, $(($(date +%s) - started)) s)."
