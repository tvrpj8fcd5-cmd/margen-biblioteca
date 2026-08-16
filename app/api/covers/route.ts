import { put } from "@vercel/blob";

const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);

export async function POST(request:Request){
  const form=await request.formData();
  const file=form.get("cover");
  if(!(file instanceof File))return Response.json({error:"Selecciona una imagen"},{status:400});
  if(!allowedTypes.has(file.type))return Response.json({error:"Usa una imagen JPG, PNG o WebP"},{status:415});
  if(file.size>5*1024*1024)return Response.json({error:"La imagen no puede superar 5 MB"},{status:413});
  const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const blob=await put(`book-covers/${crypto.randomUUID()}.${extension}`,file,{access:"public",contentType:file.type,addRandomSuffix:false});
  return Response.json({key:blob.url},{status:201});
}
