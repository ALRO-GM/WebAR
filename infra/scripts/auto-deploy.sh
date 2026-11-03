#!/bin/sh
# Despliegue continuo: lo lanza cron cada 2 minutos en la máquina.
#
#   */2 * * * * /opt/webar/infra/scripts/auto-deploy.sh >> /opt/webar/infra/deploy.log 2>&1
#
# Si main tiene un commit con `ci-ok/<sha>` que no es el que está en marcha,
# lanza deploy.sh. Una sola conexión `git ls-remote` por vuelta (protocolo git
# por HTTPS, no la API de GitHub: no gasta el cupo de 60 consultas por hora).
# Un commit que ya falló al desplegarse no se reintenta hasta que llegue otro.
set -eu

cd "$(dirname "$0")/.."

STATE=/tmp/webar-auto-deploy.last

refs=$(git -C .. ls-remote origin refs/heads/main 'refs/tags/ci-ok/*' 2> /dev/null) || exit 0
head=$(printf '%s\n' "$refs" | awk '$2 == "refs/heads/main" { print $1 }')
[ -n "$head" ] || exit 0
printf '%s\n' "$refs" | grep -q "refs/tags/ci-ok/$head\$" || exit 0

running=$(docker compose exec -T web wget -qO- http://127.0.0.1:8080/health 2> /dev/null || true)
case "$running" in *"\"version\":\"$head\""*) exit 0 ;; esac
[ "$(cat "$STATE" 2> /dev/null || true)" != "$head" ] || exit 0
echo "$head" > "$STATE"

echo "--- $(date -u +%FT%TZ) auto-deploy de $head"
scripts/deploy.sh
