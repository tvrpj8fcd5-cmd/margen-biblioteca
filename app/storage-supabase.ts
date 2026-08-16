// Acceso a Supabase Storage desde el servidor.
//
// Reúne aquí la subida y el borrado porque portadas y documentos hacen exactamente lo
// mismo con distinto bucket. Tener dos copias de esta lógica significaba, en la práctica,
// arreglar los errores en una y olvidarse de la otra.
//
// La clave de service_role omite RLS: este módulo NUNCA debe importarse desde un
// componente de cliente.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const RUTA_PUBLICA = "/storage/v1/object/public/";

export const BUCKET_PORTADAS = "book-covers";
export const BUCKET_DOCUMENTOS = "book-documents";

// Cliente con la clave secreta, solo para el servidor. Omite RLS por completo.
let admin: SupabaseClient | null = null;
function clienteAdmin(): SupabaseClient | null {
  if (admin) return admin;
  const { url, clave } = credenciales();
  if (!url || !clave) return null;
  admin = createClient(url, clave, { auth: { persistSession: false } });
  return admin;
}

// Emite un permiso de subida de un solo uso para una ruta concreta.
//
// Con esto el navegador sube DIRECTO a Storage y el archivo deja de atravesar la función
// serverless. Eso esquiva el límite de ~4,5 MB que Vercel impone al cuerpo de las
// peticiones, que con un PDF se alcanza enseguida, y de paso quita esa carga del servidor.
export async function firmarSubida(bucket: string, ruta: string): Promise<{ ok: true; ruta: string; token: string } | { ok: false; mensaje: string }> {
  const cliente = clienteAdmin();
  if (!cliente) return { ok: false, mensaje: "Storage no está configurado." };

  const { data, error } = await cliente.storage.from(bucket).createSignedUploadUrl(ruta);
  if (error || !data) return { ok: false, mensaje: error?.message ?? "no se pudo firmar la subida" };
  return { ok: true, ruta: data.path, token: data.token };
}

// Firma una lectura temporal de un objeto de un bucket privado.
export async function firmarLectura(bucket: string, ruta: string, segundos: number): Promise<{ ok: true; url: string } | { ok: false; mensaje: string }> {
  const cliente = clienteAdmin();
  if (!cliente) return { ok: false, mensaje: "Storage no está configurado." };

  const { data, error } = await cliente.storage.from(bucket).createSignedUrl(ruta, segundos);
  if (error || !data?.signedUrl) return { ok: false, mensaje: error?.message ?? "no se pudo firmar la lectura" };
  return { ok: true, url: data.signedUrl };
}

function credenciales() {
  return {
    url: process.env.SUPABASE_URL?.replace(/\/+$/, ""),
    clave: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

// Devuelve el motivo si la configuración no sirve, o null si todo está en orden.
// Se comprueba antes de tocar la red para que el error diga qué variable falta en lugar
// de morir dentro del SDK o del propio fetch.
export function revisarCredenciales(): string | null {
  const { url, clave } = credenciales();
  if (!url) return "Falta SUPABASE_URL. Configúrala en las variables del entorno.";
  if (!clave) return "Falta SUPABASE_SERVICE_ROLE_KEY. Cópiala desde Supabase → Settings → API Keys.";
  // Una clave copiada de una interfaz que la muestra recortada trae dentro un «…».
  // Las cabeceras HTTP solo admiten Latin-1, así que fetch fallaría con un error sobre
  // ByteString que no menciona ni la clave ni de dónde salió.
  if (/[^\x20-\x7e]/.test(clave)) {
    return "SUPABASE_SERVICE_ROLE_KEY contiene caracteres que no son ASCII imprimible (por ejemplo «…»). Parece una copia abreviada y no la clave completa: cópiala con el botón de copiar del dashboard.";
  }
  return null;
}

const PISTAS: Record<string, string> = {
  "Bucket not found": "El bucket no existe en este proyecto de Supabase.",
  "row-level security": "La clave no tiene permisos de escritura. ¿Pusiste la publishable/anon en vez de la secret?",
  "mime type": "El bucket no admite ese tipo de archivo.",
  "already exists": "Ya existe un objeto con ese nombre en el bucket.",
  "exceeded the maximum": "El archivo supera el límite de tamaño del bucket.",
};

export type ResultadoSubida =
  | { ok: true; url: string }
  | { ok: false; estado: number; mensaje: string };

// Node envuelve cualquier fallo de red en un escueto "fetch failed" y guarda el motivo
// de verdad en `error.cause`. Sin desenvolverlo, el mensaje no dice nada útil.
function describirFallo(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const causa = error.cause;
  if (!causa) return error.message;
  const detalle = causa instanceof Error
    ? `${causa.name}: ${causa.message}${"code" in causa ? ` [${String((causa as { code?: unknown }).code)}]` : ""}`
    : String(causa);
  return `${error.message} — ${detalle}`;
}

export async function subirObjeto(bucket: string, ruta: string, archivo: File): Promise<ResultadoSubida> {
  const { url, clave } = credenciales();
  if (!url || !clave) return { ok: false, estado: 503, mensaje: "Storage no está configurado." };

  // El archivo se materializa en un ArrayBuffer en lugar de pasar el File directamente.
  // Enviar un Blob deja que el cuerpo se transmita por streaming sin Content-Length
  // conocido, que es donde fallaba con documentos grandes; con un buffer la petición
  // lleva longitud fija y es un simple POST.
  let cuerpo: ArrayBuffer;
  try {
    cuerpo = await archivo.arrayBuffer();
  } catch (error) {
    return { ok: false, estado: 500, mensaje: `no se pudo leer el archivo: ${describirFallo(error)}` };
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(`${url}/storage/v1/object/${bucket}/${ruta}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${clave}`,
        apikey: clave,
        "content-type": archivo.type,
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: cuerpo,
      // Sin esto, una subida colgada dejaría la petición del usuario esperando
      // indefinidamente y sin explicación.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error(`[storage] fallo de red subiendo a ${bucket}`, error);
    const esTimeout = error instanceof DOMException && error.name === "TimeoutError";
    return {
      ok: false,
      estado: 502,
      mensaje: esTimeout
        ? `Storage no respondió en 60 segundos subiendo ${(cuerpo.byteLength / 1024 / 1024).toFixed(1)} MB.`
        : `no se pudo contactar con Storage: ${describirFallo(error)}`,
    };
  }

  if (respuesta.ok) return { ok: true, url: `${url}${RUTA_PUBLICA}${bucket}/${ruta}` };

  const detalle = await respuesta.text().catch(() => "");
  console.error(`[storage] ${bucket} respondió`, respuesta.status, detalle);

  // El cuerpo de error de Storage dice exactamente qué pasó y no lleva nada sensible,
  // así que se propaga: sin él habría que ir a los logs del servidor en cada fallo.
  let mensaje = "";
  try { mensaje = String((JSON.parse(detalle) as { message?: string }).message ?? ""); }
  catch { mensaje = detalle.slice(0, 200); }

  const pista = Object.entries(PISTAS).find(([clave]) => mensaje.includes(clave) || detalle.includes(clave))?.[1] ?? "";
  return { ok: false, estado: 502, mensaje: `${mensaje || "sin detalle"}. ${pista}`.trim() };
}

// Borrado best-effort: si falla, se registra y se sigue. Cuando se llama a esto, la
// operación que de verdad le importa al usuario —borrar el libro o guardar el archivo
// nuevo— ya se completó, y no tiene sentido devolverle un error por un objeto huérfano.
async function borrarObjeto(bucket: string, urlPublica: string): Promise<void> {
  if (!urlPublica) return;
  const { url, clave } = credenciales();
  if (!url || !clave) return;

  // Solo se tocan objetos de este bucket y este proyecto. Una URL heredada de otro
  // proveedor, o apuntando a cualquier otro sitio, se deja intacta.
  const prefijo = `${url}${RUTA_PUBLICA}${bucket}/`;
  if (!urlPublica.startsWith(prefijo)) return;
  const ruta = urlPublica.slice(prefijo.length);
  if (!ruta) return;

  try {
    const respuesta = await fetch(`${url}/storage/v1/object/${bucket}/${ruta}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${clave}`, apikey: clave },
    });
    if (!respuesta.ok) console.error(`[storage] no se pudo borrar ${bucket}/${ruta}`, respuesta.status);
  } catch (error) {
    console.error("[storage] borrado", error);
  }
}

// Las portadas viven en un bucket público y se guardan como URL absoluta, así que hay
// que extraer la ruta antes de borrar.
export const borrarPortada = (url: string) => borrarObjeto(BUCKET_PORTADAS, url);

// Los documentos viven en un bucket privado y en la base se guarda ya solo la ruta:
// no hay URL estable que recortar, porque cada lectura se firma en el momento.
export async function borrarDocumento(ruta: string): Promise<void> {
  if (!ruta || ruta.startsWith("http")) return;
  const cliente = clienteAdmin();
  if (!cliente) return;
  const { error } = await cliente.storage.from(BUCKET_DOCUMENTOS).remove([ruta]);
  if (error) console.error("[storage] no se pudo borrar el documento", ruta, error.message);
}
