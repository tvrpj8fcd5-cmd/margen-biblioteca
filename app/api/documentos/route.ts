import { BUCKET_DOCUMENTOS, revisarCredenciales, subirObjeto } from "../../storage-supabase";

const TAMANO_MAXIMO=25*1024*1024;

export async function POST(request:Request){
  const problema=revisarCredenciales();
  if(problema)return Response.json({error:problema},{status:503});

  try{
    const formulario=await request.formData();
    const archivo=formulario.get("documento");
    if(!(archivo instanceof File))return Response.json({error:"Selecciona un archivo PDF"},{status:400});

    // El atributo accept del input solo filtra el diálogo del sistema. La comprobación
    // de verdad va aquí, y el bucket la repite por su cuenta como última defensa.
    if(archivo.type!=="application/pdf")return Response.json({error:"El documento debe ser un PDF"},{status:415});
    if(archivo.size>TAMANO_MAXIMO)return Response.json({error:`El PDF ocupa ${(archivo.size/1024/1024).toFixed(1)} MB y el límite es ${TAMANO_MAXIMO/1024/1024} MB`},{status:413});

    console.log(`[POST /api/documentos] subiendo ${archivo.name} · ${(archivo.size/1024/1024).toFixed(2)} MB · ${archivo.type}`);

    const resultado=await subirObjeto(BUCKET_DOCUMENTOS,`${crypto.randomUUID()}.pdf`,archivo);
    if(!resultado.ok)return Response.json({error:`No se pudo subir el documento: ${resultado.mensaje}`},{status:resultado.estado});

    return Response.json({key:resultado.url},{status:201});
  }catch(error){
    // `error.cause` es donde Node esconde el motivo real detrás de un "fetch failed".
    const causa=error instanceof Error&&error.cause?` — ${String((error.cause as {message?:string}).message??error.cause)}`:"";
    const mensaje=error instanceof Error?error.message:String(error);
    console.error("[POST /api/documentos]",error);
    return Response.json({error:`No se pudo subir el documento: ${mensaje}${causa}`},{status:500});
  }
}
