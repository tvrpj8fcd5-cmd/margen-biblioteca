import { db, ensureSchema, present, selectColumns, type BookRow } from "../../../db/database";

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

export async function GET(){
  await ensureSchema(); const database=db();
  const existing=await database.query("SELECT title FROM books") as Array<{title:string}>;
  const titles=new Set(existing.map(book=>book.title));
  const missing=seeds.filter(item=>!titles.has(String(item[0])));
  if(missing.length){ const now=new Date().toISOString(); for(const item of missing)await database.query("INSERT INTO books (title,author,year,status,summary,ideas,quote,quotes,rating,color,category,cover_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",[item[0],item[1],item[2],item[3],item[4],JSON.stringify(item[5]),item[6],JSON.stringify(item[6]?[item[6]]:[]),item[7],item[8],item[9],"",now]); }
  const rows=await database.query(`SELECT ${selectColumns} FROM books ORDER BY id DESC`) as BookRow[];
  return Response.json(rows.map(present));
}

export async function POST(request:Request){
  await ensureSchema(); const input=await request.json() as Record<string,unknown>;
  const title=String(input.title??"").trim(), author=String(input.author??"").trim();
  if(!title||!author)return Response.json({error:"Título y autor son obligatorios"},{status:400});
  const database=db(), createdAt=new Date().toISOString();
  const quotes=Array.isArray(input.quotes)?input.quotes.map(String).map(value=>value.trim()).filter(Boolean):[];
  const rows=await database.query(`INSERT INTO books (title,author,year,status,summary,ideas,quote,quotes,rating,color,category,cover_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${selectColumns}`,[title,author,String(input.year??""),String(input.status??"Por leer"),String(input.summary??""),JSON.stringify(Array.isArray(input.ideas)?input.ideas:[]),quotes[0]??"",JSON.stringify(quotes),Number(input.rating??0),String(input.color??"ink"),String(input.category??"Literatura"),String(input.coverKey??""),createdAt]) as BookRow[];
  const row=rows[0];
  return Response.json(row?present(row):{error:"No se pudo guardar"},{status:row?201:500});
}
