# WebAR

Realidad aumentada desde la propia web, sin instalar nada. Proyecto de
hackathon.

**En marcha:** https://webar.peer4u.app

## Estado

PWA instalable con los **118 elementos**: tabla periódica, ficha (protones,
neutrones, electrones, capas, configuración y radio) y el átomo animado en
**modelo de Bohr** o con sus **orbitales** (nubes de probabilidad). Se ven en
realidad aumentada sobre la mesa (WebXR, Android con Chrome) o en un visor 3D
en cualquier navegador. Lo siguiente: cartas de átomos para formar moléculas
([docs/arquitectura.md](docs/arquitectura.md)).

## Cómo funciona

- **Código**: `packages/ar-core` (la base de RA, reutilizable),
  `packages/chem` (elementos y átomos en 3D, reutilizable), `apps/web`
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
| 2026-11-04 | `@webar/chem`: los 118 elementos (PubChem + radios de Clementi), átomos con núcleo, modelo de Bohr y orbitales; tabla periódica, ficha y visor 3D sin cámara |
| 2026-11-04 | PWA con Vite + three.js, base `@webar/ar-core` (sesión, anclas, proveedor WebXR) y demo de esferas fijas en superficies |
| 2026-11-03 | Esqueleto: página de prueba de cámara, imagen con `/health`, CI con etiquetas `ci-ok`/`ci-ko` y despliegue continuo en `webar.peer4u.app` |
