# WebAR

Realidad aumentada desde la propia web, sin instalar nada. Proyecto de
hackathon.

**En marcha:** https://webar.peer4u.app

## Estado

PWA instalable para aprender química con **tarjetas de átomos en realidad
aumentada**: se imprimen ([/cartas.html](https://webar.peer4u.app/cartas.html)),
se apuntan con la cámara (Android o iPhone) y cada una muestra su átomo
flotando encima. Al juntar las que reaccionan durante 3 s se forma la molécula
(agua, CO₂, metano, amoniaco, sal… 35 sustancias y 38 reacciones de libro),
con fuego o hielo según sea exotérmica o endotérmica. También hay una mesa
virtual (sin imprimir nada) y un explorador de los 118 elementos con el modelo
de Bohr y los orbitales. Detalles en [docs/arquitectura.md](docs/arquitectura.md).

## Cómo funciona

- **Código**: `packages/ar-core` (la base de RA, reutilizable: WebXR,
  marcadores, visor), `packages/chem` (elementos, sustancias, reacciones y
  su 3D, reutilizable), `apps/web` (la PWA y el juego de tarjetas) e `infra/` (imagen, compose, bloque de Caddy y scripts de
  despliegue). Arrancar en local: [docs/desarrollo.md](docs/desarrollo.md).
- **Servidor**: la máquina de Oracle de Peer4U, detrás de su Caddy, en un
  contenedor propio con topes ([docs/servidor.md](docs/servidor.md)).
- **CI/CD**: push a `main` → la CI prueba la imagen y deja `ci-ok/<sha>` → la
  máquina despliega sola en ≤ 2 min ([docs/ci-cd.md](docs/ci-cd.md)).

Las reglas para agentes de IA están en [AGENTS.md](AGENTS.md).

## Últimos cambios

| Fecha | Qué cambió |
| --- | --- |
| 2026-11-04 | Tarjetas de átomos con marcadores ArUco: reacciones al juntarlas (35 sustancias, 38 reacciones, ΔH), fuego/hielo, descomponer, mesa virtual e impresión de tarjetas |
| 2026-11-04 | `@webar/chem`: los 118 elementos (PubChem + radios de Clementi), átomos con núcleo, modelo de Bohr y orbitales; tabla periódica, ficha y visor 3D sin cámara |
| 2026-11-04 | PWA con Vite + three.js, base `@webar/ar-core` (sesión, anclas, proveedor WebXR) y demo de esferas fijas en superficies |
| 2026-11-03 | Esqueleto: página de prueba de cámara, imagen con `/health`, CI con etiquetas `ci-ok`/`ci-ko` y despliegue continuo en `webar.peer4u.app` |
