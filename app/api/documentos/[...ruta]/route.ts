import { db, fallo } from "../../../../db/database";
import { BUCKET_DOCUMENTOS, firmarLectura, revisarCredenciales } from "../../../storage-supabase";

// Una firma de lectura vive poco a propósito: si alguien copia la URL del visor, deja de
// servir en minutos. Lo bastante para leer un rato sin recargar, poco para compartirla.
const VALIDEZ_SEGUNDOS=60*30;

// El <iframe> apunta a esta ruta y no a Storage. Así la URL del visor es estable, la
// caducidad de la firma queda oculta al cliente y no hay que refrescar nada desde React.
export async function GET(_request:Request,{params}:{params:Promise<{ruta:string[]}>}){
  const problema=revisarCredenciales();
  if(problema)return new Response(problema,{status:503});

  try{
    const {ruta}=await params;
    const camino=ruta.join("/");
    // Sin autenticación, esta ruta firmaría cualquier objeto que alguien acertara a pedir.
    // Comprobando contra pdf_key se limita a los documentos que algún libro referencia de
    // verdad, lo que impide enumerar el bucket a base de probar rutas.
    const filas=await db().query("SELECT 1 FROM books WHERE pdf_key = $1 LIMIT 1",[camino]);
    if(!filas.length)return new Response("Documento no encontrado",{status:404});

    const firmada=await firmarLectura(BUCKET_DOCUMENTOS,camino,VALIDEZ_SEGUNDOS);
    if(!firmada.ok)return new Response(`No se pudo abrir el documento: ${firmada.mensaje}`,{status:502});

    return Response.redirect(firmada.url,307);
  }catch(error){ return fallo("GET /api/documentos/[...ruta]",error); }
}
