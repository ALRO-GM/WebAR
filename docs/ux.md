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
| **Revelar poco a poco** | Se empieza solo con el hidrógeno. Cada lección del camino presenta un elemento (enseña primero y pregunta después) y lo desbloquea; los laboratorios piden formar lo que ya se puede. Lo fallado vuelve al final de la lección y cada dos unidades hay un repaso (práctica espaciada) |
| **Hábito, no presión** | Racha **diaria** (lo pidió el cliente, al estilo de las apps de idiomas) suavizada con protectores que se ganan jugando, meta diaria elegible (10-50 XP) y misiones cortas. Sin vidas que se pierden ni muros de pago: todo se gana con quarks del juego, la app es gratis |
| **Competir sin exponer** | Ligas semanales: la de clase usa el alias de clase; la mundial es opcional y el apodo lo pone el servidor («Neutrón Veloz 427»), para que nadie use su nombre. Quien no juega una semana no baja |
| **Personajes y mascota** | 16 guías reales y diversos (sexo, origen, época) con frases escritas para la app (no citas inventadas). Schrödingato reacciona a lo que pasa y, si no lo miras, se vuelve nube de probabilidad; se puede quitar en ajustes |

## Cómo se organiza la app

Lo que imita a Duolingo no se toca: **Aprender** (el camino), la barra de
arriba (racha, quarks, XP), **Liga** (misiones y liga) y el **perfil**
(avatar y logros). El resto se ordena por lo que se hace en cada sitio:

| Pestaña | Qué hay | Por qué ahí |
| --- | --- | --- |
| Aprender | Camino de lecciones | (Duolingo) |
| Laboratorio | **Formar moléculas** (tarjetas en papel o en pantalla, imprimir), **Mirar de cerca** (explorar átomos: en 3D o en tu mesa) y **Retos** personales | Todo es experimentar; los retos se juegan aquí |
| Materia | Cristales, formas de agruparse, estados del agua | Contenido propio |
| Colección | Moléculas, tabla periódica, científicos | Lo conseguido |
| **Clase** | Actividades que lanza el profesorado (acertijo, Adivina), unirse, meta común, retos del profesorado, proyectar y «Soy profe» | Antes estaba escondido en el perfil y los retos de clase en la Liga |
| Liga | Misiones y liga | (Duolingo) |

Nombres revisados: «Tarjetas en papel» y «Tarjetas en pantalla» (antes
«Tarjetas con la cámara» y «Mesa virtual»: no se veía que eran lo mismo),
«Tabla periódica» en la colección. Acertijos y Adivina libres salen del
laboratorio: ahora los lanza el profesorado a su clase (Adivina sigue en el
camino).

## Instalar la app

Botón «⬇ Instalar» en la barra de arriba (en móviles estrechos, solo la
flecha) y otro en Ajustes (`src/install.ts`). Solo sale donde se puede:

- Chrome, Edge, Samsung Internet (Android y escritorio): cuando el navegador
  avisa (`beforeinstallprompt`), y abre su diálogo de instalación. El aviso se
  escucha nada más cargar el módulo: antes se escuchaba tras comprobar la
  cámara y a veces llegaba antes, y el botón no salía.
- iPhone y iPad: no hay aviso; el botón enseña los pasos (Compartir →
  «Añadir a pantalla de inicio»).
- Firefox de escritorio y similares: no instalan PWA, sin botón.
- Instalada (`appinstalled`, o abierta como app): desaparece.

## Accesibilidad (WCAG 2.2)

| Criterio | Qué hay |
| --- | --- |
| 1.1.1 Contenido no textual | Emojis decorativos con `aria-hidden`; la tabla periódica y las insignias tienen etiqueta (con «bloqueado» / «pendiente») |
| 1.3.1 Información y relaciones | Pestañas con `role=tablist`/`tab`/`tabpanel`; tablas de datos con `th scope`; la gráfica tiene vista de tabla |
| 1.4.1 Uso del color | Exo/endo con icono (🔥/❄️) y texto, no solo con color; protones/neutrones/electrones con nombre en la leyenda |
| 1.4.3 / 1.4.11 Contraste | Tema claro (y oscuro opcional) con texto ≥ 4,5:1; **alto contraste** opcional (negro puro, blanco y bordes); el azul de la gráfica, validado ≥ 3:1 |
| 1.4.4 Cambiar el tamaño del texto | Todo en `rem`; ajuste Normal / Grande / Muy grande (hasta el 130 %) sin romper la maquetación |
| 2.1.1 Teclado | Pestañas con flechas; la introducción con flechas; todo lo interactivo es un botón o un enlace |
| 2.3.3 Animación por interacción | «Menos movimiento» (o el ajuste del sistema): sin animaciones de interfaz, sin temblores en las tarjetas y la introducción como estampas quietas |
| 2.4.7 Foco visible | Contorno azul de 3 px en todo lo enfocable |
| 2.5.1 Gestos del puntero | Arrastrar tarjetas tiene alternativa de **tocar una y luego otra**; deslizar la introducción tiene botones |
| 2.5.8 Tamaño del objetivo | Mínimo 44 × 44 px (más que los 24 px que pide AA) |
| 3.1.1 / 3.1.2 Idioma | `lang` del documento según el idioma elegido |
| 4.1.3 Mensajes de estado | Avisos de logro, reacciones y estados en regiones `aria-live` |

## Textos e idiomas

- **Todos los textos** están en `apps/web/src/i18n/es/*.json` (un fichero por
  sección: `ui`, `app`, `personajes`, `elementos-*`, `sustancias`, `objetos`,
  `materia`, `acertijos`, `tarjetas`…): clave →
  `texto` + `descripcion` (qué es y dónde sale, para quien traduzca). Incluye
  los de `@webar/chem` (nombres de elementos, familias, sustancias, usos y
  reacciones), extraídos de sus datos.
- `en/*.json` traduce la interfaz y los nombres. **Pendiente de traducir**:
  las fichas de los elementos y sustancias, los personajes, los objetos, la
  sección Materia y las historias; mientras tanto salen en español (la tabla
  cae al español en lo que falte).
- Añadir un idioma: una carpeta `src/i18n/<idioma>/` con las mismas claves,
  registrarla en `src/i18n/index.ts` y añadirla al selector de `index.html` y
  a `LANGUAGES` de `src/settings.ts`.
- El idioma por defecto es el del navegador si está disponible; si no, español.
- **Cantidades en cifra** (1 protón, 2 átomos, 8 electrones), nunca con letras:
  se leen mejor, se traducen sin errores y evitan líos de concordancia.
- **Plurales**: un texto con `{n}` puede tener su forma singular en
  `<clave>_1`, que se usa cuando n = 1 («1 lección» / «{n} lecciones»). Si no,
  mejor redactarlo para que valga con cualquier número («Alumnado: {n}»).
- **Nombres dentro de una frase en minúscula** («¿Cuántos protones tiene un
  átomo de hidrógeno?»): el código los pasa a minúscula al insertarlos.
- **Lenguaje respetuoso e inclusivo**: términos actuales y neutros (personal de
  la casa, personas esclavizadas, personas con lepra, pueblos indígenas,
  alumnado, cuenta docente); las científicas, por su nombre; guerras, armas y
  venenos con tono informativo; el gato bromea sin burlarse de nadie.

## Lo que queda

- Recorrido completo con lector de pantalla (TalkBack y VoiceOver) en móviles
  reales.
- Alternativa accesible a la escena 3D de la mesa (lista de tarjetas que se
  puedan juntar con el teclado).
- Traducir al inglés las fichas, los personajes, los objetos y Materia.
- Probar en móviles reales el pellizco dentro de WebXR (Materia) y la foto con
  la cámara frontal en iPhone.
