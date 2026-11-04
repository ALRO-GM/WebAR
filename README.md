# WebAR

Realidad aumentada desde la propia web, sin instalar nada. Proyecto de
hackathon.

**En marcha:** https://webar.peer4u.app

## Estado

PWA instalable para aprender química con **tarjetas de átomos en realidad
aumentada**: se imprimen ([/cartas.html](https://webar.peer4u.app/cartas.html)),
se apuntan con la cámara (Android o iPhone) y cada una muestra su átomo
flotando encima. Al juntar las que reaccionan durante 3 s se forma la molécula
(agua, CO₂, metano, amoniaco, sal… 50 sustancias y 38 reacciones de libro),
con fuego o hielo según sea exotérmica o endotérmica. También hay una mesa
virtual (sin imprimir nada) y un explorador de los 118 elementos con el modelo
de Bohr y los orbitales. En los **acertijos**, la sustancia da pistas en
primera persona («soy el gas más abundante del aire…») y hay que formarla con
las tarjetas; pedir pistas o equivocarse resta puntos y, al acertar, se
explica cada pista (H₂, O₂, N₂ y H₂O de momento).

Para clase: el progreso funciona **sin conexión** (moleculario, tabla periódica
que se desbloquea, historias, retos, insignias) y, si el alumno se une a una
clase con un código, se sincroniza con el **panel del profesorado**
([/profesor.html](https://webar.peer4u.app/profesor.html)): retos, estadísticas
y la meta común de la clase. Accesible (alto contraste, texto grande, menos
movimiento, alternativas a los gestos) y traducible: todos los textos están en
una tabla (español e inglés). Detalles en [docs/arquitectura.md](docs/arquitectura.md)
y [docs/ux.md](docs/ux.md).

## Cómo funciona

- **Código**: `packages/ar-core` (la base de RA, reutilizable: WebXR,
  marcadores, visor), `packages/chem` (elementos, sustancias, reacciones y
  su 3D, reutilizable), `apps/web` (la PWA, el juego de tarjetas y la
  plataforma de clase) y `server` (Node + SQLite: la PWA y la API) e `infra/` (imagen, compose, bloque de Caddy y scripts de
  despliegue). Arrancar en local: [docs/desarrollo.md](docs/desarrollo.md).
- **Servidor**: la máquina de Oracle de Peer4U, detrás de su Caddy, en un
  contenedor propio con topes y un volumen para la base de datos ([docs/servidor.md](docs/servidor.md)).
- **CI/CD**: push a `main` → la CI prueba la imagen y deja `ci-ok/<sha>` → la
  máquina despliega sola en ≤ 2 min ([docs/ci-cd.md](docs/ci-cd.md)).

Las reglas para agentes de IA están en [AGENTS.md](AGENTS.md).

## Últimos cambios

| Fecha | Qué cambió |
| --- | --- |
| 2026-11-04 | Acertijos con tarjetas: pistas que restan puntos, fallos que también, y explicación de cada pista al acertar (H₂, O₂, N₂, H₂O) |
| 2026-11-04 | UX y accesibilidad: navegación inferior, introducción animada, ajustes (idioma, tamaño de texto, alto contraste, menos movimiento, vibración), tocar para juntar en la mesa; todos los textos en una tabla traducible, con inglés |
| 2026-11-04 | Plataforma educativa: progreso sin conexión (moleculario, tabla que se desbloquea, historias, retos, insignias, racha semanal), clases con código y QR, panel del profesorado con estadísticas y retos, servidor Node + SQLite y tabla de textos traducible |
| 2026-11-04 | Tarjetas de átomos con marcadores ArUco: reacciones al juntarlas (50 sustancias, 38 reacciones, ΔH), fuego/hielo, descomponer, mesa virtual e impresión de tarjetas |
| 2026-11-04 | `@webar/chem`: los 118 elementos (PubChem + radios de Clementi), átomos con núcleo, modelo de Bohr y orbitales; tabla periódica, ficha y visor 3D sin cámara |
| 2026-11-04 | PWA con Vite + three.js, base `@webar/ar-core` (sesión, anclas, proveedor WebXR) y demo de esferas fijas en superficies |
| 2026-11-03 | Esqueleto: página de prueba de cámara, imagen con `/health`, CI con etiquetas `ci-ok`/`ci-ko` y despliegue continuo en `webar.peer4u.app` |
