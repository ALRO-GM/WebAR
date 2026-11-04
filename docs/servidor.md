# El servidor

WebAR vive en la máquina de Peer4U. Comparte Caddy y red con Peer4U, pero
tiene su carpeta, su compose y sus contenedores.

| | |
| --- | --- |
| Máquina | Oracle Cloud, `eu-madrid-1`, VM.Standard.A1.Flex (ARM): 4 OCPU, 24 GB, 200 GB. Es el máximo gratuito: no pedir más |
| Acceso | `ssh ubuntu@51.170.34.214` (la clave de Alberto ya está en local) |
| Carpeta | `/opt/webar` (clon de `https://github.com/ALRO-GM/WebAR.git`, rama `main`) |
| Contenedor | `webar-web-1` (compose `webar`, servicio `web`), imagen `webar:local` y `webar:previous`: Node sirve la PWA, la API de clases y `/health` |
| Datos | Volumen `webar_datos` montado en `/data` (SQLite `webar.db`: profesorado, clases, alias del alumnado y su progreso, y las ligas con jugadores anónimos) |
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

## La base de datos

SQLite (el de Node, sin dependencias) en el volumen `webar_datos`. Copia en
caliente (WAL), desde la máquina:

```sh
ssh ubuntu@51.170.34.214 'cd /opt/webar/infra && docker compose exec -T web node -e "
const {DatabaseSync}=require(\"node:sqlite\");new DatabaseSync(\"/data/webar.db\").exec(\"vacuum into \x27/tmp/copia.db\x27\")
" && docker compose cp web:/tmp/copia.db ./webar-$(date +%F).db' < /dev/null
```

Datos personales: solo correo y nombre del profesorado; del alumnado, un alias
y su progreso (guía de la AEPD para centros). Borrar una clase borra todo lo
suyo.

Los cambios de esquema son **aditivos** (`create table if not exists`, columnas
nuevas con `alter table` protegido): la base de producción ya existe y nunca se
borra ni se recrea una tabla.

| Tabla | Qué guarda |
| --- | --- |
| `teachers`, `classes`, `students`, `tokens`, `events`, `challenges` | Profesorado, clases, alias + hash del PIN, tokens (hash), eventos de progreso y retos |
| `players` | Jugador anónimo de la liga mundial: apodo generado, avatar (id), liga actual y, si es de una clase, `student_id` |
| `player_tokens` | Hash de los tokens de jugador (uno por dispositivo) |
| `league_entries` | Por semana: liga, grupo y XP (el máximo recibido) de cada jugador que ha jugado |
| `league_results` | Por semana cerrada: liga, puesto y si subió, bajó o se quedó |
| `league_weeks` | Semanas ya cerradas (para cerrarlas una sola vez) |
| `class_xp` | XP semanal de cada alumno para la liga de su clase |

## La API

Todo JSON, con `Authorization: Bearer <token>`; los errores son `{ error }`.
Hay tres tipos de token: profesor, alumno (de `POST /api/unirse`) y jugador
(de `POST /api/jugadores`).

Eventos aceptados en `POST /api/sync` (alumno): `descubrir`, `reaccion`,
`reto`, `elemento`, `leccion`, `lectura`, `adivina`, `compra`, `cofre`,
`foto`, `racha`. `datos` es libre, hasta 2000 caracteres en JSON; si se pasa,
el evento no se acepta (antes se recortaba y quedaba JSON roto).

### Ligas semanales

| Ruta | Token | Qué hace |
| --- | --- | --- |
| `POST /api/jugadores` `{ avatar? }` | ninguno o alumno | Crea un jugador anónimo → `{ token, id, apodo, avatar, liga }`. Con token de alumno queda enlazado a él (si ya tenía, devuelve otro token del mismo jugador) |
| `GET /api/jugadores/yo` | jugador | `{ id, apodo, avatar, liga }` |
| `PATCH /api/jugadores/yo` `{ avatar?, nuevoApodo?: true }` | jugador | Cambia el avatar y/o genera otro apodo |
| `DELETE /api/jugadores/yo` | jugador | Sale de la liga mundial: borra jugador, tokens, grupos y resultados (el XP de clase es del alumno y se queda) |
| `PUT /api/liga/xp` `{ xp }` | jugador o alumno | XP de la semana actual → `{ semana, xp, tope }` |
| `GET /api/liga` | jugador | Su liga y su grupo de la semana, `sube`, `baja` y `resultadoAnterior` (de la semana pasada, si jugó) |
| `GET /api/liga/clase` | alumno | Ranking semanal de su clase `[{ puesto, alias, xp, yo }]` |
| `GET /api/clases/:id/liga` | profesor | Lo mismo con todos los alumnos (`{ puesto, id, alias, xp }`) |

- **Semana**: de lunes 00:00 a domingo 23:59 **hora de Madrid** (`Intl` con
  `Europe/Madrid`, también en los cambios de hora); se nombra como la semana
  ISO, `2026-W45`. `createApi(db, { now })` acepta un reloj para los tests.
- **Apodo**: lo genera el servidor (sustantivo de ciencia o animal + adjetivo
  concordado en género + número: «Neutrón Veloz 427», «Gata Cuántica 81»), así
  nadie pone su nombre real. El avatar es un id corto (`^[a-z0-9-]{1,30}$`).
- **XP**: se guarda el máximo recibido (nunca baja) y como mucho 2000 por día
  transcurrido de la semana (lunes 2000, martes 4000…), para frenar trampas.
- **Grupos**: 10 ligas (0-9; los nombres, de Grafito a Diamante, los pone la
  app). Al primer XP > 0 de la semana, el jugador entra en el último grupo de
  su liga con sitio (hasta 30), por orden de llegada. Quien no suma XP no
  entra en ningún grupo.
- **Cierre**: perezoso. La primera petición a `/api/liga*` o `/api/jugadores*`
  de una semana nueva cierra las semanas anteriores pendientes, en una
  transacción (`begin immediate`) y apuntándolas en `league_weeks`, así que es
  idempotente. En cada grupo (ordenado por XP y, a igualdad, por llegada)
  suben los 7 primeros (con XP > 0, hasta la liga 9) y bajan los 5 últimos (no
  de la 0). Con menos de 12 en el grupo (7 + 5 se pisarían) se reparte en la
  misma proporción: suben `round(n·7/12)` y bajan `floor(n·5/12)` (uno solo
  sube; 10 → 6 y 4). **Quien no jugó esa semana se queda en su liga**: no
  está en ningún grupo, así que ni sube ni baja (no castigamos descansar).
- **Liga de la clase**: el XP semanal del alumno (`class_xp`) llega con su
  token de alumno o con el de su jugador enlazado (se apunta en los dos).

Ejemplo:

```http
POST /api/jugadores            {"avatar":"mascota"}
→ {"token":"…","id":12,"apodo":"Gata Cuántica 81","avatar":"mascota","liga":0}
PUT /api/liga/xp               {"xp":340}
→ {"semana":"2026-W45","xp":340,"tope":6000}
GET /api/liga
→ {"semana":"2026-W45","termina":"2026-11-08T23:00:00.000Z","liga":3,"enGrupo":true,
   "grupo":[{"puesto":1,"apodo":"Quark Curioso 12","avatar":"gato","xp":910,"yo":false},
            {"puesto":2,"apodo":"Gata Cuántica 81","avatar":"mascota","xp":340,"yo":true}],
   "sube":1,"baja":0,"resultadoAnterior":{"liga":2,"puesto":4,"cambio":"sube"}}
```

**Por qué no hay datos personales**: el jugador es un apodo que no elige nadie,
un id de avatar de la app (no una foto), su liga y su XP. No se guarda IP,
correo, nombre ni ubicación; el enlace con un alumno es solo para la liga de
su clase, donde ya se le conoce por su alias. Borrarse (`DELETE
/api/jugadores/yo`) lo quita todo de la liga mundial.

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
