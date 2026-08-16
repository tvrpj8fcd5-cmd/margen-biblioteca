// Ruta de compatibilidad.
//
// Las portadas nuevas se guardan como URL pública absoluta de Supabase Storage y el
// cliente las usa directamente (ver app/cover-src.ts), así que esta ruta ya no interviene
// en el flujo normal. Se conserva para los cover_key antiguos que sigan apuntando a
// Vercel Blob, y para no romper enlaces ya compartidos.
const hostsPermitidos=[".blob.vercel-storage.com",".supabase.co"];

export async function GET(_request:Request,{params}:{params:Promise<{key:string}>}){
  const {key}=await params;
  let url:URL;
  try{url=new URL(key)}catch{return new Response("Portada no encontrada",{status:404})}
  if(url.protocol!=="https:")return new Response("Portada no encontrada",{status:404});
  if(!hostsPermitidos.some(host=>url.hostname.endsWith(host)))return new Response("Portada no encontrada",{status:404});
  return Response.redirect(url,307);
}
