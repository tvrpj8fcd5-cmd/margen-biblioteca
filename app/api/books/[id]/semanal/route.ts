import { db, fallo, present, selectColumns, type BookRow } from "../../../../../db/database";

// Acciones sobre el libro de la semana. Viven en su propia ruta y no en el PATCH general
// porque no son "editar campos": son transiciones con reglas propias, y mezclarlas con el
// formulario permitiría marcar un libro como semanal sin pasar por ellas.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const bookId=Number(id);
    if(!Number.isInteger(bookId))return Response.json({error:"Identificador inválido"},{status:400});

    const {accion}=await request.json() as {accion?:string};
    const database=db();

    if(accion==="marcar"){
      // Dos sentencias y no una: un único UPDATE que apaga uno y enciende otro puede
      // chocar consigo mismo contra el índice único según el orden en que Postgres
      // procese las filas. Limpiando primero, no hay instante con dos marcados.
      await database.query("UPDATE books SET es_semanal = false WHERE es_semanal AND id <> $1",[bookId]);
      const filas=await database.query(`UPDATE books SET es_semanal = true WHERE id = $1 RETURNING ${selectColumns}`,[bookId]) as BookRow[];
      if(!filas[0])return Response.json({error:"Libro no encontrado"},{status:404});
      return Response.json(present(filas[0]));
    }

    if(accion==="terminar"){
      // Terminar la meta hace tres cosas a la vez, y por eso van en una sola sentencia:
      // libera el hueco, suma una lectura y deja el libro como leído. Si se hicieran por
      // separado, un fallo a mitad dejaría el recuento sin cuadrar.
      const filas=await database.query(
        `UPDATE books SET es_semanal = false, veces_leido = veces_leido + 1, status = 'Leído'
         WHERE id = $1 RETURNING ${selectColumns}`,[bookId]) as BookRow[];
      if(!filas[0])return Response.json({error:"Libro no encontrado"},{status:404});
      return Response.json(present(filas[0]));
    }

    if(accion==="quitar"){
      const filas=await database.query(`UPDATE books SET es_semanal = false WHERE id = $1 RETURNING ${selectColumns}`,[bookId]) as BookRow[];
      if(!filas[0])return Response.json({error:"Libro no encontrado"},{status:404});
      return Response.json(present(filas[0]));
    }

    return Response.json({error:'Acción no reconocida. Usa "marcar", "terminar" o "quitar".'},{status:400});
  }catch(error){ return fallo("POST /api/books/[id]/semanal",error); }
}
