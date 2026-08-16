import { Pool, type PoolConfig, type QueryResultRow } from "pg";

export type BookRow = { id:number; title:string; author:string; year:string; status:string; summary:string; ideas:string; quote:string; quotes:string; rating:number; color:string; category:string; coverKey:string; pdfKey:string; createdAt:string };

// Supabase es Postgres estándar, así que se usa `pg` en lugar del driver HTTP de Neon,
// que solo habla con endpoints de Neon. El objeto que devuelve db() conserva la misma
// interfaz `.query(texto, params) -> filas[]` que tenía el driver anterior, de modo que
// las rutas de la API no necesitan saber qué hay debajo.

const globalForPool = globalThis as unknown as { margenPool?: Pool };

// La cadena de conexión NO se pasa como `connectionString`.
//
// pg-connection-string trata `sslmode=require` como `verify-full`, y esa interpretación
// gana sobre cualquier opción `ssl` que se le pase al Pool. Como el pooler de Supabase
// presenta una cadena de certificados con raíz propia, la conexión moría con
// "self-signed certificate in certificate chain".
//
// Descomponiendo la URL en campos explícitos, el comportamiento TLS queda decidido aquí y
// en un único sitio, sin depender de qué parámetros lleve la cadena ni de cómo los
// interprete la versión de pg que haya instalada.
//
// La contraseña se prefiere desde DATABASE_PASSWORD, en crudo y fuera de la URL.
// Meterla dentro de la cadena obliga a percent-encoding y eso falla de dos formas, una
// de ellas silenciosa: "Ab%cd-12" se decodifica a "Abd-12" sin avisar de nada, y una
// contraseña con @, :, / o # directamente invalida la URL.
function construirConfig(connectionString:string):PoolConfig{
  const url=new URL(connectionString);
  const password=process.env.DATABASE_PASSWORD??decodeURIComponent(url.password);

  // Sin esta comprobación, una contraseña ausente no falla aquí sino mucho después, dentro
  // del driver, como "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
  // que no menciona ninguna variable de entorno y no dice dónde mirar. Pasó en el primer
  // despliegue a Vercel: DATABASE_PASSWORD no estaba definida en Production.
  if(!password)throw new Error("Falta la contraseña de la base de datos. Define DATABASE_PASSWORD en este entorno (en Vercel, con Production marcado), o inclúyela dentro de DATABASE_URL.");

  return {
    host:url.hostname,
    port:Number(url.port||5432),
    // El usuario sí viene percent-encoded dentro de la URL, así que se decodifica.
    user:decodeURIComponent(url.username),
    password,
    database:url.pathname.slice(1)||"postgres",
    // Cifra el tránsito sin validar la cadena de certificados. Para verificación completa,
    // descarga el certificado CA desde Supabase → Settings → Database y usa
    // { ca: readFileSync(ruta), rejectUnauthorized: true }.
    ssl:{rejectUnauthorized:false},
    // Cada instancia de función serverless mantiene su propio pool. Conviene que sea
    // pequeño: quien reparte de verdad es el pooler de Supabase (Supavisor).
    max:3,
    idleTimeoutMillis:10_000,
    connectionTimeoutMillis:10_000,
  };
}

function getPool(){
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)throw new Error("Falta DATABASE_URL. Copia la cadena de conexión desde Supabase → Connect y ponla en .env.local.");
  if(connectionString.includes("usuario:password@host"))throw new Error("DATABASE_URL todavía tiene el valor de ejemplo de .env.example. Sustitúyela por la cadena real de Supabase.");
  if(connectionString.includes("[YOUR-PASSWORD]")&&!process.env.DATABASE_PASSWORD)throw new Error("DATABASE_URL conserva el marcador [YOUR-PASSWORD]. Pon la contraseña en DATABASE_PASSWORD, o sustituye el marcador dentro de la URL.");

  // El pool se cachea en globalThis y no en un módulo suelto para que el hot reload de
  // `next dev` no abra un pool nuevo en cada recarga y agote las conexiones.
  if(!globalForPool.margenPool){
    let config:PoolConfig;
    try{
      config=construirConfig(connectionString);
    }catch{
      throw new Error("DATABASE_URL no es una URL válida. Si la contraseña lleva un \"%\", escríbelo como %25.");
    }
    globalForPool.margenPool=new Pool(config);
    globalForPool.margenPool.on("error",(error:Error)=>{console.error("[pool postgres]",error)});
  }
  return globalForPool.margenPool;
}

export function db(){
  return {
    async query(text:string,params:unknown[]=[]):Promise<QueryResultRow[]>{
      const result=await getPool().query(text,params);
      return result.rows;
    },
  };
}

export const selectColumns='id, title, author, year, status, summary, ideas, quote, quotes, rating, color, category, cover_key AS "coverKey", pdf_key AS "pdfKey", created_at AS "createdAt"';

export function present(row:BookRow){
  let ideas:string[]=[], quotes:string[]=[];
  try{ const value=JSON.parse(row.ideas); ideas=Array.isArray(value)?value:[]; }catch{ ideas=[]; }
  try{ const value=JSON.parse(row.quotes); quotes=Array.isArray(value)?value.filter(item=>typeof item==="string"&&item.trim()):[]; }catch{ quotes=[]; }
  if(!quotes.length&&row.quote.trim())quotes=[row.quote.trim()];
  return {...row,ideas,quotes};
}

// Sin esto, un fallo de la base devolvía un 500 genérico y /catalogo lo tapaba con sus
// datos mock, ocultando la caída. Devuelve el motivo real, quitando cualquier credencial
// que pudiera venir dentro del mensaje de error del driver.
export function fallo(contexto:string,error:unknown){
  const bruto=error instanceof Error?error.message:String(error);
  const mensaje=bruto.replace(/\/\/[^/@\s]+:[^/@\s]+@/g,"//***:***@");
  console.error(`[${contexto}]`,error);
  return Response.json({error:mensaje,contexto},{status:500});
}
