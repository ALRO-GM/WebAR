# Investigación para la plataforma educativa

Resumen de la investigación (noviembre de 2026) para la parte de clases,
retos y uso sin conexión. Fuentes enlazadas en cada punto.

## Sin conexión (requisito de accesibilidad)

- **Precache** con Workbox (ya hecho): toda la app funciona sin red.
- **Background Sync** solo existe en Chromium; Safari (iOS) y Firefox no lo
  tienen (https://caniuse.com/background-sync). La cola de envíos se vacía
  también desde la página: al abrir la app, con el evento `online` y con
  `visibilitychange`.
- **iOS**: hasta el 60 % del disco por origen en Safari; si falta espacio se
  borra el origen entero, y sin visitas en 7 días ITP borra lo guardado,
  salvo en las web apps instaladas en la pantalla de inicio
  (https://webkit.org/blog/14403/updates-to-storage-policy/). Por eso: pedir
  instalarla, `navigator.storage.persist()` y enseñar si está guardado.
- **Datos del alumno como registro de eventos** que solo crece («descubrí
  H₂O», «reto X superado»), cada uno con un UUID del cliente: subirlo dos veces
  no duplica nada. La colección es una unión de conjuntos y las puntuaciones,
  máximos; no hace falta un CRDT general
  (https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html).
- **Ejemplos**: Kolibri (Learning Equality) sincroniza por centro y de forma
  intermitente; PhET permite descargar cada simulación.
- **Servidor ligero**: Node + SQLite (WAL) en un volumen; `POST /sync`
  idempotente; < 100 MB de RAM.

## Currículo (LOMLOE, RD 217/2022 y RD 243/2022)

- **2.º y 3.º ESO**: estructura atómica, tabla periódica, «principales
  compuestos químicos», masa molecular, formulación de sustancias simples y
  binarias (IUPAC); reacciones, conservación de la masa.
- **4.º ESO**: configuración electrónica, compuestos binarios y ternarios,
  ajuste y estequiometría; combustión, neutralización; introducción a la
  química orgánica.
- **1.º Bachillerato**: enlace, nomenclatura inorgánica, estequiometría
  industrial, orgánica.
- La termoquímica (entalpía, Hess) se formaliza en Química de 2.º Bach; en la
  ESO, exotérmica/endotérmica de forma cualitativa.

| Curso | Sustancias (≤ 5 átomos) | Reacciones |
| --- | --- | --- |
| 2.º ESO | H₂, O₂, N₂, Cl₂, O₃, H₂O, CO₂, NaCl, CH₄ | Combustión del carbono y del metano |
| 3.º ESO | CO, SO₂, SO₃, NO, NO₂, N₂O, MgO, CaO, CuO, Fe₂O₃, Al₂O₃, HF, HCl, HBr, H₂S, NH₃, CaCl₂, H₂O₂ | 2H₂+O₂→2H₂O, Haber, H₂+Cl₂→2HCl, 2Mg+O₂→2MgO, 2Na+Cl₂→2NaCl, CH₄+2O₂ |
| 4.º ESO | NaOH, KOH, Ca(OH)₂, HNO₃, CaCO₃, C₂H₂, CH₂O | Neutralización, Zn+2HCl, CaO+CO₂ |
| 1.º Bach | HCN, SO₃, NH₃ (industria) | Método de contacto, Haber con rendimiento |

## Gamificación

- Metaanálisis: efecto positivo en el aprendizaje (Sailer y Homner, 2020,
  g ≈ 0,49); más efecto **sin** rankings (Huang et al., 2020).
- Competición pública: ansiedad en los alumnos con más dificultades; mejor por
  equipos o contra uno mismo.
- Lo que encaja con las tarjetas: **colección y descubrimiento** (como Little
  Alchemy o Elements 4D), metas cooperativas de clase, retos por equipos,
  rachas suaves (con margen), insignias ligadas a competencias.

## Privacidad de menores (RGPD y LOPDGDD)

- Menores de 14 años no consienten por sí mismos (art. 7 LOPDGDD).
- El centro es responsable del tratamiento; la app, encargada. El profesor
  necesita autorización del centro
  (https://www.aepd.es/guias/guia-centros-educativos.pdf).
- Del alumno, nada de correo, nombre real, foto ni ubicación: **alias** que
  pone el profesor y un PIN. Nada de analítica de terceros. La cámara se
  procesa solo en el dispositivo. Plazo de conservación: el curso.
