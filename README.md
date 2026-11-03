# WebAR

Realidad aumentada desde la propia web, sin instalar nada. Proyecto de
hackathon.

**En marcha:** https://webar.peer4u.app

## Estado

PWA instalable con la base de realidad aumentada (`packages/ar-core`) y una
demo: tocar la pantalla deja esferas fijas sobre el suelo o una mesa (WebXR,
Android con Chrome). Lo siguiente: átomos y cartas para formar moléculas
([docs/arquitectura.md](docs/arquitectura.md)).

## Cómo funciona

- **Código**: `packages/ar-core` (la base de RA, reutilizable), `apps/web`
  (la PWA) e `infra/` (imagen, compose, bloque de Caddy y scripts de
  despliegue). Arrancar en local: [docs/desarrollo.md](docs/desarrollo.md).
- **Servidor**: la máquina de Oracle de Peer4U, detrás de su Caddy, en un
  contenedor propio con topes ([docs/servidor.md](docs/servidor.md)).
- **CI/CD**: push a `main` → la CI prueba la imagen y deja `ci-ok/<sha>` → la
  máquina despliega sola en ≤ 2 min ([docs/ci-cd.md](docs/ci-cd.md)).

Las reglas para agentes de IA están en [AGENTS.md](AGENTS.md).

## Últimos cambios

| Fecha | Qué cambió |
| --- | --- |
| 2026-11-04 | PWA con Vite + three.js, base `@webar/ar-core` (sesión, anclas, proveedor WebXR) y demo de esferas fijas en superficies |
| 2026-11-03 | Esqueleto: página de prueba de cámara, imagen con `/health`, CI con etiquetas `ci-ok`/`ci-ko` y despliegue continuo en `webar.peer4u.app` |
