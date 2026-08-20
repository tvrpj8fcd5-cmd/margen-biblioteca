// Cliente compartido de LM Studio.
//
// Vive aquí y no dentro de una pantalla porque hay dos que hablan con el mismo servidor:
// /chat (conversación sobre una obra concreta) y el bibliotecario flotante
// (recomendaciones a partir de tus puntuaciones). Cuando algo falla —y con un servidor
// local falla a menudo: no está abierto, el modelo se está cargando, falta CORS— el
// arreglo tiene que valer para los dos a la vez.
//
// DÓNDE CORRE ESTO: en el navegador, no en el servidor. `localhost:1234` solo significa
// "LM Studio" en la máquina de quien mira la página. Si esta petición saliera desde una
// función de Vercel, `localhost` sería la propia función, donde no hay ningún modelo.
// Por eso las variables llevan el prefijo NEXT_PUBLIC_ y la llamada se hace en cliente.
// La consecuencia es que el bibliotecario solo responde en el ordenador que tiene LM
// Studio abierto; desde el móvil no, salvo que apuntes NEXT_PUBLIC_LM_STUDIO_URL a la IP
// de ese ordenador en la red local.

export const LM_STUDIO_URL = process.env.NEXT_PUBLIC_LM_STUDIO_URL ?? "http://localhost:1234/v1/chat/completions";
// Debe coincidir con el identificador que LM Studio muestra en su panel de servidor.
export const LM_STUDIO_MODEL = process.env.NEXT_PUBLIC_LM_STUDIO_MODEL ?? "bonsai";

// El límite vigila el PRIMER token, no la respuesta completa. Un modelo local grande
// puede tardar minutos en terminar de escribir, y eso no es un fallo; lo que sí lo es es
// que no llegue nada. Una vez arranca el streaming se desactiva y manda el usuario, que
// siempre puede cancelar.
export const TIEMPO_PRIMER_TOKEN_MS = 90_000;

export type RolModelo = "system" | "user" | "assistant";
export type MensajeModelo = { role: RolModelo; content: string };
export type MotivoCorte = "timeout" | "cancelado" | "cambio";

// ---------------------------------------------------------------- lectura del streaming

/**
 * Devuelve una función que va recibiendo trozos de texto tal y como llegan por la red y
 * devuelve los fragmentos de respuesta que haya podido extraer de ellos.
 *
 * El endpoint responde con Server-Sent Events: líneas `data: {...}`, una por fragmento, y
 * un `data: [DONE]` al final. Los trozos que entrega la red NO respetan los límites de
 * línea —un objeto JSON puede llegar partido en dos lecturas—, así que lo que queda a
 * medias se guarda en un búfer y solo se interpretan las líneas completas.
 *
 * Está separado del `fetch` a propósito: siendo una función pura se puede probar con
 * troceados imposibles de reproducir contra un servidor real.
 */
export function crearLectorSSE(): (trozo: string) => string[] {
  let bufer = "";
  return function procesar(trozo: string): string[] {
    bufer += trozo;
    const lineas = bufer.split("\n");
    // La última puede estar a medias: se devuelve al búfer y se espera a que se complete.
    bufer = lineas.pop() ?? "";

    const fragmentos: string[] = [];
    for (const linea of lineas) {
      const limpia = linea.trim();
      if (!limpia.startsWith("data:")) continue;
      const dato = limpia.slice(5).trim();
      if (!dato || dato === "[DONE]") continue;

      let trama: { choices?: Array<{ delta?: { content?: string } }> };
      try { trama = JSON.parse(dato); } catch { continue; }
      const delta = trama.choices?.[0]?.delta?.content;
      if (delta) fragmentos.push(delta);
    }
    return fragmentos;
  };
}

// ---------------------------------------------------------------------------- generación

type OpcionesGeneracion = {
  mensajes: MensajeModelo[];
  senal: AbortSignal;
  /** Se llama con el texto acumulado cada vez que llega algo. `primero` marca el arranque. */
  alRecibir: (texto: string, primero: boolean) => void;
  temperatura?: number;
};

/**
 * Envía la conversación a LM Studio y va entregando la respuesta según se escribe.
 * Devuelve el texto completo. Lanza si el servidor responde mal o no devuelve nada.
 */
export async function generarConModeloLocal({ mensajes, senal, alRecibir, temperatura = 0.7 }: OpcionesGeneracion): Promise<string> {
  const respuesta = await fetch(LM_STUDIO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: senal,
    body: JSON.stringify({ model: LM_STUDIO_MODEL, stream: true, messages: mensajes, temperature: temperatura }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    throw new Error(`LM Studio respondió con el estado ${respuesta.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`);
  }
  if (!respuesta.body) throw new Error("La respuesta no trae un cuerpo legible");

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  const procesar = crearLectorSSE();
  let texto = "";

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    for (const fragmento of procesar(decodificador.decode(value, { stream: true }))) {
      const primero = texto === "";
      texto += fragmento;
      alRecibir(texto, primero);
    }
  }

  if (!texto.trim()) throw new Error("El modelo no devolvió texto");
  return texto;
}

// ------------------------------------------------------------------- aviso para el usuario

/**
 * Traduce un fallo a algo accionable. "Failed to fetch" no le dice nada a nadie: desde el
 * navegador, ese mensaje tapa por igual el servidor apagado, el puerto equivocado y el
 * CORS sin habilitar, así que el aviso los nombra los tres.
 */
export function describirFallo({ error, motivo, nombre }: { error: unknown; motivo: MotivoCorte | null; nombre: string }): string {
  const abortado = error instanceof DOMException && error.name === "AbortError";
  if (abortado) {
    return motivo === "timeout"
      ? `${nombre} no emitió ni una palabra en ${TIEMPO_PRIMER_TOKEN_MS / 1000} segundos. Suele significar que el modelo aún se está cargando en memoria, o que es demasiado grande para este equipo. Prueba con uno más pequeño.`
      : "Generación cancelada.";
  }
  const detalle = error instanceof Error ? error.message : "";
  return `No pude conectar con ${nombre}${detalle ? `: ${detalle}` : ""}. Comprueba que LM Studio esté abierto, que el servidor local esté iniciado en el puerto 1234 y que CORS esté habilitado.${avisoRedLocal()}`;
}

/**
 * Aviso extra cuando la página se sirve por HTTPS —es decir, en Vercel y no en `npm run
 * dev`— y el modelo vive en la máquina de quien mira.
 *
 * Desde Chrome 142 existe el permiso de «Acceso a la red local»: una web pública que llama
 * a localhost o a una IP privada necesita que el usuario lo autorice, y si el aviso se
 * rechaza o se ignora la petición se bloquea. El error que llega a JavaScript es el mismo
 * "Failed to fetch" que produce un servidor apagado, así que sin esta frase el usuario se
 * pasaría la tarde reiniciando LM Studio sin motivo.
 * (El bloqueo por contenido mixto NO aplica: localhost está exento.)
 */
function avisoRedLocal(): string {
  if (typeof window === "undefined" || window.location.protocol !== "https:") return "";
  return " Como esta página se sirve por HTTPS y el modelo está en tu propio equipo, el navegador además pide permiso de «Acceso a la red local»: búscalo en el candado de la barra de direcciones y permítelo.";
}

/** `true` si el fallo viene de que alguien abortó la petición a propósito. */
export function esAborto(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
