# WebAR

Realidad aumentada desde la propia web, sin instalar nada. Proyecto de
hackathon.

**En marcha:** https://webar.peer4u.app

## Estado

Esqueleto con el despliegue ya funcionando: una página que prueba la cámara
por HTTPS. La pila de realidad aumentada está por elegir
([docs/desarrollo.md](docs/desarrollo.md)).

## Cómo funciona

- **Código**: `public/` (la web), `infra/` (imagen, compose, bloque de Caddy
  y scripts de despliegue).
- **Servidor**: la máquina de Oracle de Peer4U, detrás de su Caddy, en un
  contenedor propio con topes ([docs/servidor.md](docs/servidor.md)).
- **CI/CD**: push a `main` → la CI prueba la imagen y deja `ci-ok/<sha>` → la
  máquina despliega sola en ≤ 2 min ([docs/ci-cd.md](docs/ci-cd.md)).

Las reglas para agentes de IA están en [AGENTS.md](AGENTS.md).

## Últimos cambios

| Fecha | Qué cambió |
| --- | --- |
| 2026-11-03 | Esqueleto: página de prueba de cámara, imagen con `/health`, CI con etiquetas `ci-ok`/`ci-ko` y despliegue continuo en `webar.peer4u.app` |
