import { BUCKET_PORTADAS, revisarCredenciales, subirObjeto } from "../../storage-supabase";

const tiposPermitidos=new Set(["image/jpeg","image/png","image/webp"]);
// 4 MB y no 5: la portada sí sigue atravesando esta función, y Vercel corta los cuerpos
// de petición alrededor de 4,5 MB. Un límite por encima de eso fallaría en producción
// aunque en local funcionara. Si algún día hacen falta portadas mayores, el camino es el
// mismo que el de los documentos: firmar la subida y que el navegador vaya directo.
const TAMANO_MAXIMO=4*1024*1024;

export async function POST(request:Request){
  const problema=revisarCredenciales();
  if(problema)return Response.json({error:problema},{status:503});

  try{
    const formulario=await request.formData();
    const archivo=formulario.get("cover");
    if(!(archivo instanceof File))return Response.json({error:"Selecciona una imagen"},{status:400});
    if(!tiposPermitidos.has(archivo.type))return Response.json({error:"Usa una imagen JPG, PNG o WebP"},{status:415});
    if(archivo.size>TAMANO_MAXIMO)return Response.json({error:`La imagen no puede superar ${TAMANO_MAXIMO/1024/1024} MB`},{status:413});

    const extension=archivo.type==="image/png"?"png":archivo.type==="image/webp"?"webp":"jpg";
    const resultado=await subirObjeto(BUCKET_PORTADAS,`${crypto.randomUUID()}.${extension}`,archivo);
    if(!resultado.ok)return Response.json({error:`No se pudo subir la portada: ${resultado.mensaje}`},{status:resultado.estado});

    return Response.json({key:resultado.url},{status:201});
  }catch(error){
    const mensaje=error instanceof Error?error.message:String(error);
    console.error("[POST /api/covers]",error);
    return Response.json({error:`No se pudo subir la portada: ${mensaje}`},{status:500});
  }
}
