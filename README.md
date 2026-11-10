# Planes de trabajo (6º de primaria)

Juegos de repaso con ranking. Cada dispositivo tiene un id oculto y un nombre
que se puede cambiar; al cambiarlo se actualiza en todos los rankings.

## Estructura
- `public/index.html` — portada con los planes.
- `public/comun/comun.js`, `comun.css` — perfil, sonido, logros, estrellas y ranking.
- `public/europa/index.html` — Ciencias Sociales: Europa.
- `public/mates/index.html` — Matemáticas: múltiplos, divisores y poliedros.
- `public/lengua/index.html` — Lengua: determinantes, diptongos, la v, polisémicas y homófonas.
- `public/tablas/index.html` — Repaso de las tablas de multiplicar.
- `public/naturales/index.html` — Ciencias Naturales: la nutrición.
- `public/ingles/index.html` — Inglés, Unit 2 At the dig (con los vídeos y juegos de la profesora en cada sección).
- `public/comun/quiz.js`, `quiz.css` — motor de preguntas que usan mates y lengua.
- `public/comun/logros.js` — catálogo de logros de todos los planes (lo usa también la portada).
- `netlify/functions/ranking.mjs` — API `/api/ranking` (datos en Netlify Blobs).

## Desplegar
    npm install
    netlify deploy --prod

## Variable de entorno
- `RANKING_ADMIN_KEY` — clave para borrar rankings.

## Borrar rankings (en Windows: curl.exe)
    # Un plan entero (tiempos, minutos y partidas)
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?juego=mates" -H "x-admin-key: TU_CLAVE"
    # Una sección
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?juego=europa&seccion=paises" -H "x-admin-key: TU_CLAVE"
    # Solo el ranking del examen (mates o lengua)
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?juego=mates&seccion=examen" -H "x-admin-key: TU_CLAVE"
    # Solo el ranking de problemas resueltos (mates)
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?juego=mates&seccion=problemas" -H "x-admin-key: TU_CLAVE"
    # Solo minutos y partidas de un plan
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?juego=europa&seccion=stats" -H "x-admin-key: TU_CLAVE"
    # Todos los rankings y la lista de últimos logros (los nombres se conservan)
    curl -X DELETE "https://TU-SITIO.netlify.app/api/ranking?todo=1" -H "x-admin-key: TU_CLAVE"

Europa tiene ranking de tiempos por sección. Mates y lengua tienen prácticas por sección
(solo suman minutos y partidas) y un examen de 10 preguntas con ranking por estrellas
(media estrella por acierto; a igualdad, gana el menor tiempo).

Planes y secciones:
- europa: paises, rios, mares, montanas, capitales
- mates: conceptos, multiplos, divisores, divisibilidad, mcd, mcm, poliedros_partes, poliedros_tipos, primos, redondos, problemas
- lengua: det_encontrar, det_clasificar, vocales, diptongo, letra_v, polisemicas, homofonas
- tablas: t2 … t10, mezcla
- ingles: vocab, spelling, tobe, regulares, irregulares, frases, ordenador, repaso1
- naturales: digestivo, digestion, circulatorio, circulacion, respiratorio, gases, excrecion, salud

## Últimos logros
La portada muestra los 30 últimos logros conseguidos por cualquier jugador (se guardan en
el blob `feed`; `ld/<plan>/<logro>/<id>` evita que el mismo logro salga dos veces).
Para añadir un logro nuevo, añádelo en `public/comun/logros.js`.

## Nombres
Cada dispositivo tiene un id oculto. Si en un dispositivo nuevo (o tras borrarse los datos
del navegador) alguien escribe un nombre que ya existe, la web pregunta «Soy X, entrar» y ese
dispositivo pasa a usar la identidad de X: mismos rankings, estrellas y logros (se guardan
también en el servidor, en `p/<plan>/<id>`).

## Añadir un plan nuevo
1. Crea `public/<plan>/index.html` cargando `../comun/comun.css` y `../comun/comun.js`
   y llamando a `Plan.init({juego:"<plan>", secciones:{...}, ach:[...]})`.
2. Añade el plan y sus secciones (con el tiempo mínimo creíble) en `JUEGOS`,
   al principio de `netlify/functions/ranking.mjs`.
3. Añade su tarjeta en `public/index.html`.
