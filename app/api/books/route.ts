import { db, fallo, present, selectColumns, type BookRow } from "../../../db/database";

// Aquí ya no se siembra nada.
//
// La versión anterior insertaba los libros de ejemplo si la tabla estaba vacía, pero
// "comprobar que está vacía" y "insertar" son dos operaciones distintas: dos peticiones
// GET simultáneas —el doble montaje de React en desarrollo basta— leían count = 0 a la
// vez y las dos insertaban. Resultado real: las 11 semillas convertidas en 22 filas
// separadas por 10 ms.
//
// Sembrar es ahora una acción deliberada: `npm run seed`, con un advisory lock de
// Postgres que hace la comprobación y el insert atómicos.
export async function GET(){
  try{
    const rows=await db().query(`SELECT ${selectColumns} FROM books ORDER BY id DESC`) as BookRow[];
    return Response.json(rows.map(present));
  }catch(error){ return fallo("GET /api/books",error); }
}

export async function POST(request:Request){
  try{
  const input=await request.json() as Record<string,unknown>;
  const title=String(input.title??"").trim(), author=String(input.author??"").trim();
  if(!title||!author)return Response.json({error:"Título y autor son obligatorios"},{status:400});
  const database=db(), createdAt=new Date().toISOString();
  const quotes=Array.isArray(input.quotes)?input.quotes.map(String).map(value=>value.trim()).filter(Boolean):[];
  const rows=await database.query(`INSERT INTO books (title,author,year,status,summary,ideas,quote,quotes,rating,color,category,cover_key,pdf_key,favorito,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING ${selectColumns}`,[title,author,String(input.year??""),String(input.status??"Por leer"),String(input.summary??""),JSON.stringify(Array.isArray(input.ideas)?input.ideas:[]),quotes[0]??"",JSON.stringify(quotes),Number(input.rating??0),String(input.color??"ink"),String(input.category??"Literatura"),String(input.coverKey??""),String(input.pdfKey??""),Boolean(input.favorito),createdAt]) as BookRow[];
  const row=rows[0];
  return Response.json(row?present(row):{error:"No se pudo guardar"},{status:row?201:500});
  }catch(error){ return fallo("POST /api/books",error); }
}
