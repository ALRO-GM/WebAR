# GitHub, CI y despliegue

- **Repo**: https://github.com/ALRO-GM/WebAR (público), remoto
  `git@github.com:ALRO-GM/WebAR.git`.
- **Rama**: `main`. Lo que llega a `main` con la CI en verde se despliega solo.
- **`gh`**: `~/.local/bin/gh`, con sesión de ALRO-GM.

## El ciclo

1. **En local**: el cambio y la comprobación (`docs/desarrollo.md`: construir
   la imagen y mirar `/health`; con `package.json`, también
   `npm run check` y `npm test`).
2. **Commit y `git push origin main`.**
3. **CI** (`.github/workflows/ci.yml`, 1–3 min):
   - con `package.json`: `npm ci`, `npm run check` y `npm test`, si existen;
   - construye la imagen con el commit dentro;
   - la arranca como en producción (solo lectura, sin capacidades) y comprueba
     que `/health` devuelve ese commit y que `/` responde;
   - deja una **etiqueta de git**: `ci-ok/<sha>` si todo pasó, `ci-ko/<sha>`
     si no. Así la máquina sabe el resultado con `git ls-remote`, sin la API de
     GitHub ni su cupo. Las etiquetas de hace más de 30 días se borran.
4. **Despliegue continuo** (`infra/scripts/auto-deploy.sh`, cron cada 2 min en
   la máquina). Si la punta de `main` tiene `ci-ok` y no es lo que está en
   marcha, lanza `deploy.sh`. Un commit que falló al desplegarse no se
   reintenta hasta que llegue otro.
5. **`deploy.sh`**:
   - cerrojo;
   - `git` al último `main` y espera a la `ci-ok`;
   - guarda `webar:previous`;
   - construye con `GIT_SHA`;
   - `up -d`;
   - espera hasta 60 s a que `/health` lleve el commit;
   - instala el bloque de Caddy, si cambió, validándolo antes;
   - comprueba desde fuera.

   Si la versión nueva no responde, vuelve a la anterior.

De push a desplegado suelen pasar unos 3–5 min.

## Vigilar un despliegue

```sh
# ¿Qué commit está sirviendo?
curl -s https://webar.peer4u.app/health
# El registro de despliegues:
ssh ubuntu@51.170.34.214 'tail -20 /opt/webar/infra/deploy.log' < /dev/null
```

Para esperar en segundo plano a que salga tu commit (`sha=$(git rev-parse HEAD)`):

```sh
for i in $(seq 1 30); do curl -fsS https://webar.peer4u.app/health 2>/dev/null | grep -q "$sha" && { echo desplegado; exit 0; }; sleep 20; done; echo "no llega"; exit 1
```

Al buscar procesos con `pgrep -f`, el patrón no puede aparecer en la línea de
comandos del propio vigilante, o se encontrará a sí mismo y no acabará nunca.
Usa `pgrep -f '[d]eploy.sh'`.

## Desplegar a mano

Si el cron no lo coge o quieres relanzar:

```sh
ssh -o ConnectTimeout=10 ubuntu@51.170.34.214 "cd /opt/webar && (setsid nohup infra/scripts/deploy.sh >> infra/deploy.log 2>&1 < /dev/null &) ; echo lanzado" < /dev/null
```

Va desacoplado del SSH a propósito: si se corta la conexión, el despliegue
sigue. Si dice «Ya hay un despliegue en marcha» y no corre ninguno
(`pgrep -f '[w]ebar.*deploy.sh'` vacío), borra `/tmp/webar-deploy.lock`.

## Si la CI falla

No se despliega (`ci-ko/<sha>`). Para leer el fallo:

```sh
~/.local/bin/gh run list -R ALRO-GM/WebAR -L 3
~/.local/bin/gh run view -R ALRO-GM/WebAR --log-failed
```

Arregla, comprueba en local, commit y push.

## Volver atrás

- Lo rápido, la imagen anterior:
  ```sh
  ssh ubuntu@51.170.34.214 'cd /opt/webar/infra && docker image tag webar:previous webar:local && docker compose up -d web' < /dev/null
  ```
  El cron la volverá a cambiar al desplegar el siguiente `ci-ok`.
- Lo limpio: `git revert <sha>` y push.
