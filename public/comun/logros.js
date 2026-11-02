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
    { id: "resolutor", icon: "🧩", name: "Resolutor", desc: "Resuelve 10 problemas a la primera." },
    { id: "genio", icon: "🦉", name: "Genio de los problemas", desc: "Resuelve 50 problemas a la primera." },
    ...LOGROS_EXAMEN],
  lengua: [...logrosBase({ pistas: false, tiempo: false, primero: "Primera palabra", pleno: "Académico de la lengua" }),
    { id: "cazador", icon: "🔎", name: "Cazador de determinantes", desc: "Termina Encontrar determinantes sin ningún fallo." },
    { id: "ortografo", icon: "✒️", name: "Ortógrafo", desc: "Termina La letra v sin ningún fallo." },
    { id: "diccionario", icon: "📚", name: "Diccionario andante", desc: "Consigue 3 estrellas en Polisémicas y en Homófonas." },
    ...LOGROS_EXAMEN],
};
const PLAN_NOMBRE = { europa: "Europa", mates: "Matemáticas", lengua: "Lengua" };
