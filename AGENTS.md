# WebAR — guía para agentes

Proyecto de hackathon de Alberto José Rodríguez Díaz (`albrodri` en 42 Madrid,
`ALRO-GM` en GitHub): **realidad aumentada desde la propia web**. Se sirve en
**https://webar.peer4u.app** desde la misma máquina de Oracle que Peer4U.

Responde y escribe (commits, docs, comentarios) **en español**.

## Lee primero

| Documento | Qué cuenta |
| --- | --- |
| [docs/servidor.md](docs/servidor.md) | La máquina, cómo convive con Peer4U, qué se puede tocar por SSH y qué no |
| [docs/ci-cd.md](docs/ci-cd.md) | GitHub, la CI, el despliegue automático, cómo vigilarlo y cómo volver atrás |
| [docs/arquitectura.md](docs/arquitectura.md) | Por qué three.js + WebXR (+ MindAR) y cómo se separa la base de RA de la app |
| [docs/desarrollo.md](docs/desarrollo.md) | Arrancar en local (npm workspaces, Vite) y el contrato de la imagen |
| [.claude/skills/desplegar/SKILL.md](.claude/skills/desplegar/SKILL.md) | Los pasos exactos de un despliegue |

## El ciclo en una línea

Cambio → comprobación local → commit en `main` → `git push` → la CI de GitHub
construye y prueba la imagen y deja la etiqueta `ci-ok/<sha>` → la máquina la
ve en ≤ 2 min (cron) y despliega sola → comprueba
`curl -s https://webar.peer4u.app/health` (lleva el commit).

## Reglas

1. **Peer4U es producción con gente real y va primero.** Vive en la misma
   máquina (`/opt/sanatorio`, contenedores `sanatorio-*`). Desde este proyecto
   no se para, reinicia, reconstruye ni edita nada de Peer4U. Lo único
   permitido en su Caddy es `caddy validate` y `caddy reload`, y solo lo hace
   `infra/scripts/deploy.sh` (valida antes y vuelve atrás si falla). Nunca
   `docker restart sanatorio-caddy-1`, nunca `docker compose` dentro de
   `/opt/sanatorio`, nunca tocar su base de datos.
2. **Topes del contenedor** (`infra/compose.yml`: 512 MB, 1 CPU, 128 procesos).
   Si hacen falta más, se sube con cabeza y se dice por qué; la máquina tiene
   24 GB y Peer4U usa unos 2.
3. **No pedir más recursos a Oracle** ni cambiar la forma de la máquina: ya es
   el máximo gratuito y pasar de ahí se cobra.
4. **Despliega sin preguntar** tras comprobar en local, commit y push; no se
   despliega con la CI en rojo (el despliegue lo impide).
5. **Cupo de la API de GitHub**: sin token son 60 consultas por hora por IP;
   quédate por debajo del 90 %. La CI y el despliegue no la usan (etiquetas
   con `git ls-remote`). `gh` está con sesión de ALRO-GM en `~/.local/bin/gh`
   (5 000/h): úsalo para leer fallos de la CI y gestionar el repo.
6. **Secretos**: nunca imprimirlos ni pedirlos por el chat. El token de
   Cloudflare (`~/.config/cloudflare/peer4u.token`) solo dentro de comandos:
   `$(tr -d '[:space:]' < ~/.config/cloudflare/peer4u.token)`.
7. **Docs en el mismo commit**: si cambias cómo se despliega, se arranca o qué
   hace la web, actualiza README y el doc de `docs/` que toque.
8. **Commits** en español, explicando el porqué, en `main` (en hackathon no
   hacen falta ramas; si hay más gente, ramas y PR, que la CI también prueba).
9. La web necesita **HTTPS** para la cámara y los sensores: siempre se prueba
   en el dominio, o en `localhost` en local.
