export async function GET(_request:Request,{params}:{params:Promise<{key:string}>}){
  const {key}=await params;
  let url:URL;
  try{url=new URL(key)}catch{return new Response("Portada no encontrada",{status:404})}
  if(url.protocol!=="https:"||!url.hostname.endsWith(".blob.vercel-storage.com"))return new Response("Portada no encontrada",{status:404});
  return Response.redirect(url,307);
}
