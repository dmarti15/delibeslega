/* Catálogo de logros de todos los planes. Lo usan las páginas de cada plan y la portada. */
const LOGROS_EXAMEN = [
  { id: "aprobado", icon: "✅", name: "Aprobado", desc: "Saca 2,5 estrellas o más en el examen." },
  { id: "sobresaliente", icon: "🌟", name: "Sobresaliente", desc: "Saca 4,5 estrellas o más en el examen." },
  { id: "perfecto", icon: "💯", name: "Examen perfecto", desc: "Acierta las 10 preguntas del examen." },
];
const LOGROS = {
  europa: [...logrosBase({ primero: "Primer viaje", pleno: "Pleno europeo" }),
    { id: "diplomatico", icon: "🤝", name: "Diplomático", desc: "Une todas las capitales del temario sin fallos." },
    { id: "explorador", icon: "🔭", name: "Explorador", desc: "En modo estudio, toca todo lo que entra en el temario." },
    { id: "enciclopedia", icon: "🌍", name: "Enciclopedia", desc: "Termina una sección en modo Todo." }],
  mates: [...logrosBase({ pistas: false, tiempo: false, primero: "Primer cálculo", pleno: "Matemático total" }),
    { id: "detective", icon: "🔍", name: "Detective", desc: "Termina Divisibilidad sin ningún fallo." },
    { id: "calculadora", icon: "🧮", name: "Calculadora humana", desc: "Termina m.c.d. y m.c.m. sin fallos." },
    { id: "geometra", icon: "🧊", name: "Geómetra", desc: "Consigue 3 estrellas en las dos secciones de poliedros." },
    { id: "eratostenes", icon: "🏺", name: "Eratóstenes", desc: "Termina Primos sin ningún fallo." },
    { id: "resolutor", icon: "🧩", name: "Resolutor", desc: "Resuelve 10 problemas a la primera." },
    { id: "genio", icon: "🦉", name: "Genio de los problemas", desc: "Resuelve 50 problemas a la primera." },
    ...LOGROS_EXAMEN],
  lengua: [...logrosBase({ pistas: false, tiempo: false, primero: "Primera palabra", pleno: "Académico de la lengua" }),
    { id: "cazador", icon: "🔎", name: "Cazador de determinantes", desc: "Termina Encontrar determinantes sin ningún fallo." },
    { id: "ortografo", icon: "✒️", name: "Ortógrafo", desc: "Termina La letra v sin ningún fallo." },
    { id: "diccionario", icon: "📚", name: "Diccionario andante", desc: "Consigue 3 estrellas en Polisémicas y en Homófonas." },
    ...LOGROS_EXAMEN],
};
LOGROS.tablas = [...logrosBase({ pistas: false, tiempo: false, primero: "Primera tabla", pleno: "Maestro de las tablas" }),
  { id: "domador", icon: "🦁", name: "Domador del 7, 8 y 9", desc: "Consigue 3 estrellas en las tablas del 7, del 8 y del 9." },
  { id: "todas", icon: "🎲", name: "Todo mezclado", desc: "Termina Todas mezcladas sin ningún fallo." },
  ...LOGROS_EXAMEN];
LOGROS.ingles = [...logrosBase({ pistas: false, tiempo: false, primero: "First step", pleno: "English star" }),
  { id: "arqueologo", icon: "⛏️", name: "Arqueólogo", desc: "Termina Vocabulary sin ningún fallo." },
  { id: "irregular", icon: "👑", name: "Rey de los irregulares", desc: "Termina Irregular verbs sin ningún fallo." },
  { id: "viajero", icon: "⏳", name: "Viajero en el tiempo", desc: "Consigue 3 estrellas en Was / were, Regular verbs, Irregular verbs y Past simple." },
  ...LOGROS_EXAMEN];
LOGROS.naturales = [...logrosBase({ pistas: false, tiempo: false, primero: "Primer órgano", pleno: "Médico del futuro" }),
  { id: "corazon", icon: "❤️", name: "Corazón de campeón", desc: "Termina Corazón y sangre sin ningún fallo." },
  { id: "pulmones", icon: "🫁", name: "Pulmones de atleta", desc: "Termina Aparato respiratorio sin ningún fallo." },
  { id: "vidasana", icon: "🥗", name: "Vida sana", desc: "Termina Salud, dieta y ejercicio sin ningún fallo." },
  ...LOGROS_EXAMEN];
LOGROS.lengua2 = [...logrosBase({ pistas: false, tiempo: false, primero: "Primer adjetivo", pleno: "Maestro de la lengua" }),
  { id: "adjetivos", icon: "🎨", name: "Cazador de adjetivos", desc: "Termina Encontrar adjetivos sin ningún fallo." },
  { id: "tildes", icon: "✍️", name: "Tilde perfecta", desc: "Termina Tildes: diptongos e hiatos sin ningún fallo." },
  { id: "hache", icon: "🤫", name: "La hache muda", desc: "Termina La letra h sin ningún fallo." },
  ...LOGROS_EXAMEN];
LOGROS.fracciones = [...logrosBase({ pistas: false, tiempo: false, primero: "Primera fracción", pleno: "Maestro de las fracciones" }),
  { id: "pizzero", icon: "🍕", name: "Pizzero", desc: "Termina Leer y representar sin ningún fallo." },
  { id: "equivalente", icon: "⚖️", name: "Equilibrista", desc: "Termina Equivalentes sin ningún fallo." },
  { id: "operador", icon: "➗", name: "Calculadora de fracciones", desc: "Consigue 3 estrellas en las tres secciones de operaciones." },
  { id: "resolutor", icon: "🧩", name: "Resolutor", desc: "Resuelve 10 problemas a la primera." },
  { id: "genio", icon: "🦉", name: "Genio de los problemas", desc: "Resuelve 50 problemas a la primera." },
  ...LOGROS_EXAMEN];
const PLAN_NOMBRE = { europa: "Europa", mates: "Matemáticas", lengua: "Lengua", lengua2: "Lengua 2", tablas: "Tablas", ingles: "Inglés", naturales: "Naturales", fracciones: "Fracciones" };
