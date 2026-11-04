---
name: desplegar
description: Subir a GitHub y desplegar WebAR en labtory.peer4u.app (comprobación local, commit, push, CI con etiqueta ci-ok, despliegue automático por cron y verificación). Úsala para cada despliegue o cuando un despliegue o la CI fallen.
---

# Desplegar WebAR

Lee antes [docs/ci-cd.md](../../../docs/ci-cd.md) y [docs/servidor.md](../../../docs/servidor.md).
Lo que nunca se hace: tocar Peer4U (`/opt/sanatorio`, `sanatorio-*`) salvo
el `validate` y `reload` de Caddy que hace `deploy.sh`.

## 1. Comprobar en local

```sh
docker build -f infra/docker/Dockerfile --build-arg GIT_SHA=local -t webar:dev .
docker run -d --rm --name webar-dev --read-only --tmpfs /tmp --cap-drop ALL -p 18080:8080 webar:dev
sleep 2; curl -fsS localhost:18080/health && curl -fsS -o /dev/null -w '%{http_code}\n' localhost:18080/
docker stop webar-dev
```

Con `package.json`: además `npm run check` y `npm test`.

## 2. Commit y push

Mensaje en español que explique el porqué. Docs al día en el mismo commit
(README «Últimos cambios» y el doc de `docs/` que toque).

```sh
git push -q origin main
```

## 3. Esperar al despliegue (en segundo plano)

El cron de la máquina despliega solo al ver `ci-ok/<sha>`:

```sh
sha=$(git rev-parse HEAD); for i in $(seq 1 30); do curl -fsS https://labtory.peer4u.app/health 2>/dev/null | grep -q "$sha" && { echo "desplegado $sha"; exit 0; }; git ls-remote origin "refs/tags/ci-ko/$sha" | grep -q . && { echo "CI en rojo"; exit 1; }; sleep 20; done; echo "no llega en 10 min"; exit 1
```

- **CI en rojo**: `~/.local/bin/gh run view -R ALRO-GM/WebAR --log-failed`.
  Arregla y vuelve al paso 1.
- **No llega**: mira el registro.
  ```sh
  ssh ubuntu@51.170.34.214 'tail -30 /opt/webar/infra/deploy.log' < /dev/null
  ```
  Para relanzar a mano:
  ```sh
  ssh -o ConnectTimeout=10 ubuntu@51.170.34.214 "cd /opt/webar && (setsid nohup infra/scripts/deploy.sh >> infra/deploy.log 2>&1 < /dev/null &) ; echo lanzado" < /dev/null
  ```

## 4. Después

```sh
curl -s https://labtory.peer4u.app/health
ssh ubuntu@51.170.34.214 'docker ps --filter name=webar --format "{{.Names}} {{.Status}}"; docker stats --no-stream webar-web-1' < /dev/null
curl -s -o /dev/null -w 'peer4u %{http_code}\n' https://peer4u.app/
```

Comprueba también que Peer4U sigue respondiendo (la última línea).
