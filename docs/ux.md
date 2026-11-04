# UX, accesibilidad e idiomas

Qué se ha aplicado en la interfaz y por qué. Referencias: las heurísticas de
Nielsen, WCAG 2.2 (nivel AA), las guías de interfaz de Apple y Material, y lo
que la investigación de gamificación dice que funciona con adolescentes
([investigacion-plataforma.md](investigacion-plataforma.md)).

## Principios

| Principio | Cómo se aplica |
| --- | --- |
| **Enseñar, no contar** (onboarding breve) | Introducción de 5 escenas animadas, una idea por escena y una frase. Se salta, se desliza y vuelve con «?». Solo sale la primera vez |
| **Lo importante, a mano** (ley de Fitts) | Navegación inferior al alcance del pulgar; el modo principal (tarjetas) es el primero y el más grande |
| **Estado siempre visible** | Cabecera con nivel, XP y racha; barra de carga mientras las tarjetas se juntan; «Descomponer» se llena mientras se mantiene; estado de la conexión (📴 / ⏳ / ☁️) |
| **Respuesta inmediata** | Destello, fuego o hielo, aviso con la ecuación, vibración (Android) y avisos de logro que se tocan para ver la historia |
| **Prevenir errores** | Elementos bloqueados visibles pero explicados; confirmación antes de borrar en el panel del profesorado; reenviar datos no duplica nada |
| **Revelar poco a poco** | Se empieza con 4 elementos; cada molécula desbloquea más y cuenta su historia. Las pistas del moleculario no destripan la respuesta |
| **Motivación sana** | Colección, metas de clase y racha **semanal** (no diaria); sin ranking individual público |

## Accesibilidad (WCAG 2.2)

| Criterio | Qué hay |
| --- | --- |
| 1.1.1 Contenido no textual | Emojis decorativos con `aria-hidden`; la tabla periódica y las insignias tienen etiqueta (con «bloqueado» / «pendiente») |
| 1.3.1 Información y relaciones | Pestañas con `role=tablist`/`tab`/`tabpanel`; tablas de datos con `th scope`; la gráfica tiene vista de tabla |
| 1.4.1 Uso del color | Exo/endo con icono (🔥/❄️) y texto, no solo con color; protones/neutrones/electrones con nombre en la leyenda |
| 1.4.3 / 1.4.11 Contraste | Tema oscuro con texto ≥ 4,5:1; **alto contraste** opcional (negro puro, blanco y bordes); el azul de la gráfica, validado ≥ 3:1 |
| 1.4.4 Cambiar el tamaño del texto | Todo en `rem`; ajuste Normal / Grande / Muy grande (hasta el 130 %) sin romper la maquetación |
| 2.1.1 Teclado | Pestañas con flechas; la introducción con flechas; todo lo interactivo es un botón o un enlace |
| 2.3.3 Animación por interacción | «Menos movimiento» (o el ajuste del sistema): sin animaciones de interfaz, sin temblores en las tarjetas y la introducción como estampas quietas |
| 2.4.7 Foco visible | Contorno amarillo de 3 px en todo lo enfocable |
| 2.5.1 Gestos del puntero | Arrastrar tarjetas tiene alternativa de **tocar una y luego otra**; deslizar la introducción tiene botones |
| 2.5.8 Tamaño del objetivo | Mínimo 44 × 44 px (más que los 24 px que pide AA) |
| 3.1.1 / 3.1.2 Idioma | `lang` del documento según el idioma elegido |
| 4.1.3 Mensajes de estado | Avisos de logro, reacciones y estados en regiones `aria-live` |

## Textos e idiomas

- **Todos los textos** están en `apps/web/src/i18n/es.json`: clave →
  `texto` + `descripcion` (qué es y dónde sale, para quien traduzca). Incluye
  los de `@webar/chem` (nombres de elementos, familias, sustancias, usos y
  reacciones), extraídos de sus datos.
- `en.json` traduce toda la interfaz y los nombres. Las **historias, los usos
  y las notas de las reacciones están pendientes** de traducir: mientras
  tanto salen en español (la tabla cae al español en lo que falte).
- Añadir un idioma: copiar `en.json` con las mismas claves, importarlo en
  `src/i18n/index.ts` y añadirlo al selector de `index.html` y a `LANGUAGES`
  de `src/settings.ts`.
- El idioma por defecto es el del navegador si está disponible; si no, español.

## Lo que queda

- Recorrido completo con lector de pantalla (TalkBack y VoiceOver) en móviles
  reales.
- Alternativa accesible a la escena 3D de la mesa (lista de tarjetas que se
  puedan juntar con el teclado).
- Traducir las historias y los usos al inglés.
