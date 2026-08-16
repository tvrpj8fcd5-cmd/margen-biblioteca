import { db, ensureSchema, present, selectColumns, type BookRow } from "../../../../db/database";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  await ensureSchema(); const {id}=await params; const input=await request.json() as Record<string,unknown>; const database=db();
  const currentRows=await database.query(`SELECT ${selectColumns} FROM books WHERE id = $1`,[Number(id)]) as BookRow[];
  const current=currentRows[0];
  if(!current)return Response.json({error:"Libro no encontrado"},{status:404});
  const value={...present(current),...input};
  const quotes=Array.isArray(value.quotes)?value.quotes.map(String).map(quote=>quote.trim()).filter(Boolean):[];
  const updatedRows=await database.query(`UPDATE books SET title=$1,author=$2,year=$3,status=$4,summary=$5,ideas=$6,quote=$7,quotes=$8,rating=$9,color=$10,category=$11,cover_key=$12 WHERE id=$13 RETURNING ${selectColumns}`,[String(value.title),String(value.author),String(value.year),String(value.status),String(value.summary),JSON.stringify(Array.isArray(value.ideas)?value.ideas:[]),quotes[0]??"",JSON.stringify(quotes),Number(value.rating),String(value.color),String(value.category),String(value.coverKey??""),Number(id)]) as BookRow[];
  return Response.json(present(updatedRows[0]));
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
  await ensureSchema(); const {id}=await params; await db().query("DELETE FROM books WHERE id = $1",[Number(id)]);
  return new Response(null,{status:204});
}
