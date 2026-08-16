import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase para el navegador.
//
// Usa la clave publishable, que está pensada para ser pública: no da acceso a nada por
// sí sola. Lo único que hace aquí es subir a una URL firmada que el servidor emitió
// tras validar el archivo, y ese token autoriza esa subida concreta y nada más.
//
// El cliente se cachea porque createClient abre estructuras internas que no tiene
// sentido recrear en cada subida.
let cache: SupabaseClient | null = null;

export function clienteNavegador(): SupabaseClient {
  if (cache) return cache;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno.");
  }

  // Sin sesión: la aplicación todavía no tiene autenticación y no hay nada que persistir.
  cache = createClient(url, clave, { auth: { persistSession: false } });
  return cache;
}

// Sube el PDF directamente a Storage usando el permiso que emitió el servidor.
// El nombre del bucket y el uso del SDK se quedan aquí para no importar desde el
// navegador el módulo del servidor, que maneja la clave secreta.
export async function subirDocumentoFirmado(ruta: string, token: string, archivo: File): Promise<void> {
  const { error } = await clienteNavegador()
    .storage.from("book-documents")
    .uploadToSignedUrl(ruta, token, archivo, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
}
