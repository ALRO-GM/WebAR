# El servidor

WebAR vive en la máquina de Peer4U. Comparte Caddy y red con Peer4U, pero
tiene su carpeta, su compose y sus contenedores.

| | |
| --- | --- |
| Máquina | Oracle Cloud, `eu-madrid-1`, VM.Standard.A1.Flex (ARM): 4 OCPU, 24 GB, 200 GB. Es el máximo gratuito: no pedir más |
| Acceso | `ssh ubuntu@51.170.34.214` (la clave de Alberto ya está en local) |
| Carpeta | `/opt/webar` (clon de `https://github.com/ALRO-GM/WebAR.git`, rama `main`) |
| Contenedor | `webar-web-1` (compose `webar`, servicio `web`), imagen `webar:local` y `webar:previous` |
| Dominio | `webar.peer4u.app`, registro `A` en Cloudflare a `51.170.34.214`, nube gris (sin proxy) |
| HTTPS | El Caddy de Peer4U (`sanatorio-caddy-1`) pide y renueva el certificado solo |
| Registro de despliegues | `/opt/webar/infra/deploy.log` |

## Cómo llega una visita

```
navegador ──443──▶ sanatorio-caddy-1 (Peer4U)
                     ├─ peer4u.app        ──▶ sanatorio-app-1:3000
                     └─ webar.peer4u.app  ──▶ webar:8080 (webar-web-1)
                          red docker: sanatorio_default
```

- El Caddyfile de Peer4U importa al final `/etc/caddy/sitios/*.caddy`, que
  es `/opt/caddy-sitios/` en la máquina (solo lectura para Caddy).
- El bloque de WebAR está en este repo, en `infra/caddy/webar.caddy`.
  `deploy.sh` lo copia a `/opt/caddy-sitios/webar.caddy`, lo valida y recarga
  Caddy. Si no valida, deja el de antes.
- El contenedor no publica puertos. Se une a la red externa
  `sanatorio_default`, que crea Peer4U, con el alias `webar`.
- Las cabeceras (HSTS, `Permissions-Policy` con cámara y sensores para esta
  web) van en `webar.caddy`. No hay CSP; si se añade, que deje cargar lo que
  use la pila (CDN, `blob:` para WebAssembly y modelos).

## Qué se puede hacer por SSH

Sin preguntar:

- **Leer**: `docker ps`, `docker logs`, `docker stats --no-stream`,
  `docker inspect`, `free -h`, `df -h`, ficheros de `/opt/webar`,
  `tail /opt/webar/infra/deploy.log`.
- **WebAR**: lanzar `deploy.sh`, `docker compose` dentro de `/opt/webar/infra`
  (logs, restart, up, down) y editar `/opt/caddy-sitios/webar.caddy`, solo a
  través de `deploy.sh`.

Nunca:

- Nada de Peer4U: ni `docker compose` en `/opt/sanatorio`, ni
  restart/stop/rm de `sanatorio-*`, ni su base de datos (ni leerla), ni su
  `.env`.
- Reiniciar Caddy. Solo `caddy validate` y luego `caddy reload` dentro de
  `sanatorio-caddy-1`: así no se corta Peer4U.
- Abrir puertos nuevos o publicar puertos del contenedor. Todo entra por
  Caddy (80/443).
- Cambiar la máquina en Oracle.

## Recursos

Peer4U usa unos 2 GB y puede subir a 2 GB más; la máquina tiene 24 GB. WebAR va
con topes (`infra/compose.yml`): 512 MB, 1 CPU y 128 procesos. Para ver el
consumo:

```sh
ssh ubuntu@51.170.34.214 'docker stats --no-stream; free -h' < /dev/null
```

La guardia de límites de Peer4U (`/opt/sanatorio/infra/scripts/limits-guard.sh`,
por cron) cuenta todo el tráfico de salida de la máquina, también el de WebAR.
Al 95 % de los 10 TB al mes para Peer4U, pero no WebAR. Un vídeo o un modelo 3D
muy pesado servido a mucha gente cuenta.

## Puesta en marcha (ya hecha el 2026-11-03)

Se deja apuntada por si hay que rehacerla en otra máquina:

```sh
# DNS (desde local): A webar → 51.170.34.214, sin proxy
# Máquina:
sudo install -d -o ubuntu -g ubuntu /opt/caddy-sitios /opt/webar
git clone https://github.com/ALRO-GM/WebAR.git /opt/webar
/opt/webar/infra/scripts/deploy.sh
( crontab -l; echo '*/2 * * * * /opt/webar/infra/scripts/auto-deploy.sh >> /opt/webar/infra/deploy.log 2>&1' ) | crontab -
```

El Caddyfile y el compose de Peer4U importan `/opt/caddy-sitios` desde el
mismo día (repo `ALRO-GM/sanatorio-42`, `docs/deploy-oracle.md`, § «Otras webs
en la misma máquina»).

## Quitar WebAR de la máquina

```sh
crontab -l | grep -v webar | crontab -
cd /opt/webar/infra && docker compose down
rm /opt/caddy-sitios/webar.caddy
docker exec sanatorio-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Después, borrar el registro DNS `webar` en Cloudflare.
