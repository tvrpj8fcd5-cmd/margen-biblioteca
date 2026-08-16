#!/usr/bin/env node
/**
 * Siembra los libros de ejemplo de Margen.
 *
 * Sembrar NO puede vivir dentro de GET /api/books: dos peticiones simultáneas leen
 * "la tabla está vacía" a la vez y las dos insertan, duplicando todo. Pasó de verdad,
 * con 11 semillas convertidas en 22 filas separadas por 10 ms. Aquí es una acción
 * deliberada, de una sola vez, y además protegida por un advisory lock de Postgres.
 *
 * Uso:
 *   npm run seed              # solo si la tabla está vacía
 *   npm run seed -- --forzar  # inserta aunque ya haya filas
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

for (const ruta of ['.env.local', '.env']) {
  const abs = resolve(process.cwd(), ruta);
  if (!existsSync(abs)) continue;
  for (const linea of readFileSync(abs, 'utf8').split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const clave = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(clave in process.env)) process.env[clave] = v;
  }
  break;
}

const seeds=[
  ["La biblioteca de la medianoche","Matt Haig","2020","Leído","Entre la vida y la muerte, Nora explora las vidas que pudo haber vivido y descubre qué hace que una vida merezca ser elegida.",["El arrepentimiento imagina certezas donde solo había posibilidades.","Una vida valiosa no tiene que ser perfecta; basta con que sea vivida."],"La vida comienza al otro lado de la desesperación.",4,"ink","Literatura"],
  ["El infinito en un junco","Irene Vallejo","2019","Leído","Un viaje por el origen de los libros y por las personas que, contra toda adversidad, los preservaron.",["Los libros son una tecnología frágil con una asombrosa capacidad de supervivencia.","Leer también es conversar con quienes vivieron antes que nosotros."],"Somos los únicos animales que fabulan, que ahuyentan la oscuridad con cuentos.",5,"clay","Literatura"],
  ["Hábitos atómicos","James Clear","2018","Leyendo","Una guía práctica para comprender cómo los cambios pequeños y consistentes producen resultados extraordinarios.",["Cada acción es un voto por la persona en la que quieres convertirte.","Diseñar el entorno suele ser más efectivo que depender de la fuerza de voluntad.","Conviene enamorarse del sistema, no solo de la meta."],"No te elevas al nivel de tus objetivos. Caes al nivel de tus sistemas.",4,"sand","Educativo"],
  ["Sapiens","Yuval Noah Harari","2011","Por leer","Una historia panorámica de la humanidad, desde las primeras especies humanas hasta el mundo contemporáneo.",[],"",0,"sage","Filosofía"],
  ["La ridícula idea de no volver a verte","Rosa Montero","2013","Leído","Un ensayo íntimo sobre el duelo, la memoria y la vida construido a partir del diario de Marie Curie.",["El duelo es una forma feroz del amor.","Contar el dolor lo vuelve compartible y, a veces, más habitable."],"La vida es tan tenaz, tan hermosa, que incluso desde el dolor seguimos celebrándola.",5,"wine","Literatura"],
  ["Pensar rápido, pensar despacio","Daniel Kahneman","2011","Leyendo","Una exploración de los dos sistemas que modelan nuestros juicios y decisiones.",["La intuición responde rápido, pero no siempre responde bien.","La confianza subjetiva no garantiza precisión."],"Nada en la vida es tan importante como pensamos mientras estamos pensando en ello.",4,"blue","Filosofía"],
  ["Cien años de soledad","Gabriel García Márquez","1967","Leído","La historia de la familia Buendía y del pueblo de Macondo a través de siete generaciones.",["La memoria familiar puede convertirse en destino.","Lo extraordinario también habita en la vida cotidiana."],"",5,"sage","Literatura"],
  ["Indigno de ser humano","Osamu Dazai","1948","Por leer","Una novela confesional sobre la alienación, la identidad y la dificultad de pertenecer.",["La máscara social también puede convertirse en una prisión."],"",0,"ink","Literatura"],
  ["Implementación de Modelos de Lenguaje Locales","Archivo técnico","2026","Leyendo","Guía práctica para ejecutar, evaluar y optimizar modelos de lenguaje en infraestructura local.",["El hardware disponible define la estrategia de cuantización.","La privacidad es una ventaja central de la inferencia local."],"",0,"blue","Educativo"],
  ["Detección de objetos con algoritmos YOLO","Archivo técnico","2026","Por leer","Fundamentos y práctica para entrenar modelos YOLO orientados a detección de objetos.",["La calidad del etiquetado condiciona el rendimiento del modelo."],"",0,"clay","Educativo"],
  ["Dune","Frank Herbert","1965","Por leer","Una epopeya de ciencia ficción sobre poder, ecología y destino en el planeta Arrakis.",["Controlar un recurso esencial transforma la política de todo un mundo."],"",0,"sand","Ciencia ficción"],
];

const forzar = process.argv.includes('--forzar');
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL.'); process.exit(1); }

const u = new URL(url);
const cliente = new pg.Client({
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: process.env.DATABASE_PASSWORD ?? decodeURIComponent(u.password),
  database: u.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
});

await cliente.connect();
try {
  await cliente.query('begin');
  // Serializa a cualquier otro proceso que intente sembrar a la vez. El lock se libera
  // solo al terminar la transacción, así que la comprobación y el insert son atómicos.
  await cliente.query('select pg_advisory_xact_lock(hashtext($1))', ['margen_seed_books']);

  const { rows: [{ total }] } = await cliente.query('select count(*)::int as total from books');
  if (total > 0 && !forzar) {
    console.log(`La tabla ya tiene ${total} fila(s). No se siembra nada. Usa --forzar para insertar igualmente.`);
    await cliente.query('rollback');
  } else {
    const ahora = new Date().toISOString();
    for (const s of seeds) {
      await cliente.query(
        `insert into books (title,author,year,status,summary,ideas,quote,quotes,rating,color,category,cover_key,created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [s[0], s[1], s[2], s[3], s[4], JSON.stringify(s[5]), s[6],
         JSON.stringify(s[6] ? [s[6]] : []), s[7], s[8], s[9], '', ahora],
      );
    }
    await cliente.query('commit');
    console.log(`Sembrados ${seeds.length} libros.`);
  }
} catch (e) {
  await cliente.query('rollback').catch(() => {});
  console.error('Fallo al sembrar:', e.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
