import { BUCKET_DOCUMENTOS, firmarSubida, revisarCredenciales } from "../../../storage-supabase";

const TAMANO_MAXIMO=25*1024*1024;

// Emite un permiso de subida para UNA ruta concreta. El archivo no pasa por aquí: el
// navegador lo envía directo a Storage con este token. Por eso la validación de tipo y
// tamaño se hace sobre lo que declara el cliente y el bucket la repite por su cuenta,
// que es la comprobación que de verdad no se puede eludir.
export async function POST(request:Request){
  const problema=revisarCredenciales();
  if(problema)return Response.json({error:problema},{status:503});

  try{
    const cuerpo=await request.json() as {tipo?:string;tamano?:number};
    if(cuerpo.tipo!=="application/pdf")return Response.json({error:"El documento debe ser un PDF"},{status:415});

    const tamano=Number(cuerpo.tamano??0);
    if(!Number.isFinite(tamano)||tamano<=0)return Response.json({error:"Tamaño de archivo inválido"},{status:400});
    if(tamano>TAMANO_MAXIMO)return Response.json({error:`El PDF ocupa ${(tamano/1024/1024).toFixed(1)} MB y el límite son ${TAMANO_MAXIMO/1024/1024} MB`},{status:413});

    // La ruta la decide el servidor, nunca el cliente: aceptar un nombre de archivo de
    // fuera permitiría escribir sobre objetos ajenos o escaparse del prefijo.
    const resultado=await firmarSubida(BUCKET_DOCUMENTOS,`${crypto.randomUUID()}.pdf`);
    if(!resultado.ok)return Response.json({error:`No se pudo preparar la subida: ${resultado.mensaje}`},{status:502});

    return Response.json({ruta:resultado.ruta,token:resultado.token},{status:201});
  }catch(error){
    const mensaje=error instanceof Error?error.message:String(error);
    console.error("[POST /api/documentos/firma]",error);
    return Response.json({error:`No se pudo preparar la subida: ${mensaje}`},{status:500});
  }
}
