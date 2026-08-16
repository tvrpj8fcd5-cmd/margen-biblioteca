import { db, fallo, present, selectColumns, type BookRow } from "../../../../db/database";
import { borrarDocumento, borrarPortada } from "../../../storage-supabase";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params; const input=await request.json() as Record<string,unknown>; const database=db();
    const bookId=Number(id);
    if(!Number.isInteger(bookId))return Response.json({error:"Identificador inválido"},{status:400});
    const currentRows=await database.query(`SELECT ${selectColumns} FROM books WHERE id = $1`,[bookId]) as BookRow[];
    const current=currentRows[0];
    if(!current)return Response.json({error:"Libro no encontrado"},{status:404});
    const value={...present(current),...input};
    const quotes=Array.isArray(value.quotes)?value.quotes.map(String).map(quote=>quote.trim()).filter(Boolean):[];
    const nuevaPortada=String(value.coverKey??"");
    const nuevoDocumento=String(value.pdfKey??"");
    const updatedRows=await database.query(`UPDATE books SET title=$1,author=$2,year=$3,status=$4,summary=$5,ideas=$6,quote=$7,quotes=$8,rating=$9,color=$10,category=$11,cover_key=$12,pdf_key=$13 WHERE id=$14 RETURNING ${selectColumns}`,[String(value.title),String(value.author),String(value.year),String(value.status),String(value.summary),JSON.stringify(Array.isArray(value.ideas)?value.ideas:[]),quotes[0]??"",JSON.stringify(quotes),Number(value.rating),String(value.color),String(value.category),nuevaPortada,nuevoDocumento,bookId]) as BookRow[];

    // Si el archivo cambió, el anterior ya no lo referencia nadie.
    if(current.coverKey&&current.coverKey!==nuevaPortada)await borrarPortada(current.coverKey);
    if(current.pdfKey&&current.pdfKey!==nuevoDocumento)await borrarDocumento(current.pdfKey);

    return Response.json(present(updatedRows[0]));
  }catch(error){ return fallo("PATCH /api/books/[id]",error); }
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const bookId=Number(id);
    if(!Number.isInteger(bookId))return Response.json({error:"Identificador inválido"},{status:400});

    // RETURNING da las dos claves en la misma consulta: leerlas antes con un SELECT
    // aparte dejaría hueco para que un cambio de archivo colara y se borrara el nuevo.
    const borradas=await db().query("DELETE FROM books WHERE id = $1 RETURNING cover_key, pdf_key",[bookId]) as Array<{cover_key:string;pdf_key:string}>;
    const fila=borradas[0];
    if(fila?.cover_key)await borrarPortada(fila.cover_key);
    if(fila?.pdf_key)await borrarDocumento(fila.pdf_key);

    return new Response(null,{status:204});
  }catch(error){ return fallo("DELETE /api/books/[id]",error); }
}
