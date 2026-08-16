const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);
const BUCKET="book-covers";

// Se sube por la API REST de Supabase Storage con fetch, sin añadir @supabase/supabase-js:
// para una única subida el SDK no aporta nada sobre una petición directa.
//
// La clave de service_role omite RLS, así que NUNCA debe salir del servidor. Esta ruta se
// ejecuta solo en el servidor, y lo que devuelve al cliente es únicamente la URL pública.
export async function POST(request:Request){
  const supabaseUrl=process.env.SUPABASE_URL?.replace(/\/+$/,"");
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl)return Response.json({error:"Falta SUPABASE_URL. Configúrala en .env.local."},{status:503});
  if(!serviceKey)return Response.json({error:"Falta SUPABASE_SERVICE_ROLE_KEY. Cópiala desde Supabase → Project Settings → API keys."},{status:503});

  // Una clave copiada de una interfaz que la muestra recortada trae dentro un «…» (U+2026).
  // Las cabeceras HTTP solo admiten Latin-1, así que fetch falla con "Cannot convert argument
  // to a ByteString...", un mensaje que no menciona ni la clave ni de dónde salió. Pasó en el
  // primer despliegue a Vercel: la clave guardada allí estaba abreviada.
  if(/[^\x20-\x7e]/.test(serviceKey))return Response.json({error:"SUPABASE_SERVICE_ROLE_KEY contiene caracteres que no son ASCII imprimible (por ejemplo «…»). Parece una copia abreviada y no la clave completa: cópiala con el botón de copiar del dashboard de Supabase."},{status:503});

  try{
    const form=await request.formData();
    const file=form.get("cover");
    if(!(file instanceof File))return Response.json({error:"Selecciona una imagen"},{status:400});
    if(!allowedTypes.has(file.type))return Response.json({error:"Usa una imagen JPG, PNG o WebP"},{status:415});
    if(file.size>5*1024*1024)return Response.json({error:"La imagen no puede superar 5 MB"},{status:413});

    const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const ruta=`${crypto.randomUUID()}.${extension}`;

    const subida=await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${ruta}`,{
      method:"POST",
      headers:{
        authorization:`Bearer ${serviceKey}`,
        apikey:serviceKey,
        "content-type":file.type,
        "cache-control":"public, max-age=31536000, immutable",
      },
      body:file,
    });

    if(!subida.ok){
      const detalle=await subida.text().catch(()=>"");
      console.error("[POST /api/covers] storage respondió",subida.status,detalle);
      const pista=subida.status===400&&detalle.includes("Bucket not found")
        ? ` El bucket "${BUCKET}" no existe en este proyecto de Supabase.`
        : "";
      return Response.json({error:`No se pudo subir la portada (HTTP ${subida.status}).${pista}`},{status:502});
    }

    // El bucket es público, así que esta URL se sirve sin token y vale directamente
    // como `src` de un <img>.
    return Response.json({key:`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${ruta}`},{status:201});
  }catch(error){
    const mensaje=error instanceof Error?error.message:String(error);
    console.error("[POST /api/covers]",error);
    return Response.json({error:`No se pudo subir la portada: ${mensaje}`},{status:500});
  }
}
