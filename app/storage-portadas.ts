const BUCKET = "book-covers";

// Borra de Supabase Storage el objeto al que apunta un cover_key.
//
// Sin esto, eliminar un libro o cambiarle la portada dejaba la imagen anterior en el
// bucket para siempre, sin que ninguna fila la referenciara. No rompe nada, pero el
// almacenamiento crece sin freno y nada lo delata.
//
// Es deliberadamente best-effort: si el borrado en Storage falla, se registra y se sigue.
// Para cuando se llama a esta función, la operación que de verdad le importa al usuario
// —borrar el libro o guardar la nueva portada— ya se completó, y no tiene ningún sentido
// devolverle un error por una imagen que quedó suelta.
export async function borrarPortada(coverKey: string): Promise<void> {
  if (!coverKey) return;

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  // Solo se tocan objetos de este bucket y este proyecto. Un cover_key heredado de otro
  // proveedor, o apuntando a cualquier otro sitio, se deja intacto.
  const prefijo = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (!coverKey.startsWith(prefijo)) return;

  const ruta = coverKey.slice(prefijo.length);
  if (!ruta) return;

  try {
    const respuesta = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${ruta}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!respuesta.ok) {
      console.error("[borrarPortada] storage respondió", respuesta.status, await respuesta.text().catch(() => ""));
    }
  } catch (error) {
    console.error("[borrarPortada]", error);
  }
}
