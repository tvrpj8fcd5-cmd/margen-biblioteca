"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { describirFallo, esAborto, generarConModeloLocal, TIEMPO_PRIMER_TOKEN_MS, type MotivoCorte } from "./lm-studio";
import { useCapaModal } from "./usar-capa-modal";
import "./bibliotecario.css";

// Un mensaje puede existir solo para la interfaz (la bienvenida, los avisos de error) o
// solo para el modelo (la pregunta de apertura, que se envía pero no se pinta: en pantalla
// quedaría como si el usuario hubiera escrito algo que no escribió).
type Mensaje = {
  id: number;
  role: "user" | "assistant";
  content: string;
  soloInterfaz?: boolean;
  soloModelo?: boolean;
  /** Marca los avisos de fallo. Se borran solos en cuanto el modelo vuelve a responder. */
  esError?: boolean;
};

type LibroBiblioteca = { id:number; title:string; author:string; rating:number; status:string; category:string };

/** Lo que pide el enunciado: título y puntuación, tal cual. */
export type LibroPuntuado = { title:string; rating:number };

const APERTURA = "Salúdame en una frase y recomiéndame qué leer ahora.";

export type TrozoTexto = { tipo: "normal" | "fuerte" | "enfasis"; texto: string };

/**
 * Parte el texto del modelo en trozos según los asteriscos de Markdown.
 *
 * Los modelos escriben *cursivas* y **negritas** aunque no se les pida, y sin interpretarlo
 * los asteriscos aparecen en pantalla tal cual, como basura. El componente convierte estos
 * trozos en <strong> y <em> de React —nunca en HTML crudo—, así que no hay manera de que la
 * respuesta del modelo inyecte marcado.
 *
 * Los cierres exigen carácter no blanco pegado al asterisco, para que una multiplicación
 * escrita como `2 * 3 * 4` no se convierta en cursiva.
 */
export function partirEnfasis(texto: string): TrozoTexto[] {
  const piezas: TrozoTexto[] = [];
  for(const trozo of texto.split(/(\*\*(?!\s)[^*\n]+(?<!\s)\*\*|\*(?!\s)[^*\n]+(?<!\s)\*)/g)){
    if(!trozo) continue;
    if(trozo.startsWith("**") && trozo.endsWith("**") && trozo.length > 4) piezas.push({ tipo: "fuerte", texto: trozo.slice(2, -2) });
    else if(trozo.startsWith("*") && trozo.endsWith("*") && trozo.length > 2) piezas.push({ tipo: "enfasis", texto: trozo.slice(1, -1) });
    else piezas.push({ tipo: "normal", texto: trozo });
  }
  return piezas;
}

function pintarTexto(texto: string): ReactNode[] {
  return partirEnfasis(texto).map((trozo, indice) =>
    trozo.tipo === "fuerte" ? <strong key={indice}>{trozo.texto}</strong>
    : trozo.tipo === "enfasis" ? <em key={indice}>{trozo.texto}</em>
    : <span key={indice}>{trozo.texto}</span>);
}

/**
 * Construye el contexto que viaja al modelo.
 *
 * Se exporta aparte del componente para poder probarlo sin montar React: es la pieza de la
 * que depende que las recomendaciones tengan que ver con los gustos reales del usuario y
 * no con lo que el modelo se imagine.
 */
export function construirContexto(libros: LibroBiblioteca[]): { sistema: string; puntuados: LibroPuntuado[] } {
  const puntuados = libros.filter(libro => libro.rating > 0).sort((a, b) => b.rating - a.rating);
  const pendientes = libros.filter(libro => libro.status === "Por leer");
  const arrayPuntuaciones: LibroPuntuado[] = puntuados.map(({ title, rating }) => ({ title, rating }));

  const detalle = puntuados.length
    ? puntuados.map(l => `- «${l.title}» — ${l.author} · ${l.category} · ${l.status} · ${l.rating}/5`).join("\n")
    : "(Todavía no ha puntuado ningún libro.)";
  const enCasa = pendientes.length
    ? pendientes.map(l => `- «${l.title}» — ${l.author} · ${l.category}`).join("\n")
    : "(No tiene nada pendiente en la estantería.)";

  const sistema = [
    "Eres el bibliotecario personal del usuario dentro de «Margen», su biblioteca virtual.",
    "Recomiendas a partir de sus puntuaciones reales, no de gustos genéricos.",
    "",
    "Libros que ha leído y la nota que les puso, del 1 al 5, en JSON:",
    JSON.stringify(arrayPuntuaciones),
    "",
    "Los mismos con autor, categoría y estado:",
    detalle,
    "",
    "Libros que YA TIENE en su biblioteca y aún no ha leído:",
    enCasa,
    "",
    "Formato de la respuesta. SIEMPRE los dos bloques, nunca uno solo:",
    "",
    "**En tu estantería**",
    "Uno o dos libros de la lista de arriba que ya tiene y aún no ha leído. Si esa lista estuviera vacía, dilo en una línea y pasa al segundo bloque.",
    "",
    "**Para buscar fuera**",
    "Dos o tres libros que NO aparecen en ninguna de las listas de arriba, con su autor. Este bloque es obligatorio: es donde descubre cosas nuevas.",
    "",
    "Reglas:",
    "1. Un libro que ya esté en cualquiera de las listas de arriba NO puede aparecer en «Para buscar fuera». Compruébalo título a título antes de escribirlo.",
    "2. Justifica cada recomendación citando un libro concreto de su lista y la nota que le puso.",
    "3. No inventes títulos ni autores. En «Para buscar fuera» menciona solo obras publicadas que conozcas con certeza; si dudas de que un libro exista o de quién lo escribió, elige otro.",
    "4. Dos o tres frases por libro. Sin listas numeradas ni viñetas: prosa.",
    "5. Responde en español, con el tono de un librero que conoce a su cliente.",
  ].join("\n");

  return { sistema, puntuados: arrayPuntuaciones };
}

export default function Bibliotecario(){
  const ruta = usePathname();

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [libros, setLibros] = useState<LibroBiblioteca[] | null>(null);
  // Separa "he pedido" de "ya está escribiendo": los puntos suspensivos solo tienen
  // sentido mientras no haya llegado ni un token.
  const [escribiendo, setEscribiendo] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const motivoRef = useRef<MotivoCorte | null>(null);
  const arrancadoRef = useRef(false);
  const ultimoIntentoRef = useRef<{ conversacion: Mensaje[]; catalogo: LibroBiblioteca[] } | null>(null);
  // Cada petición lleva número. Al escribir mientras el modelo responde se cancela la
  // anterior y arranca otra, y sin esto la que muere llegaría tarde a apagar el "cargando"
  // o a limpiar `abortRef` —que ya pertenece a la nueva— dejando el botón de detener
  // muerto y la respuesta en curso sin forma de pararse.
  const peticionRef = useRef(0);
  // Los identificadores venían de Date.now(). Dos envíos dentro del mismo milisegundo
  // —ahora posible, porque ya no hay que esperar a que termine la anterior— compartirían
  // id: React avisaría de claves repetidas y el texto entrante se escribiría en el mensaje
  // equivocado. Un contador no puede empatar.
  const siguienteIdRef = useRef(1);
  const nuevoId = () => siguienteIdRef.current++;

  // Estable a propósito: `useCapaModal` lo lleva en las dependencias de su efecto, y una
  // identidad nueva en cada render volvería a mover el foco al panel mientras escribes.
  // Por eso el corte se hace aquí con las referencias en vez de llamar a `detener`.
  const cerrar = useCallback(() => {
    // Cerrar con una respuesta a medias dejaría la petición viva contra LM Studio y el
    // modelo escribiendo para nadie.
    if(abortRef.current){
      motivoRef.current = "cancelado";
      abortRef.current.abort();
      abortRef.current = null;
    }
    setAbierto(false);
  }, []);

  useCapaModal(abierto, cerrar, panelRef);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes, cargando]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function detener(motivo: MotivoCorte){
    if(!abortRef.current) return;
    motivoRef.current = motivo;
    abortRef.current.abort();
    abortRef.current = null;
  }

  /** Envía la conversación al modelo local y va pintando la respuesta según llega. */
  async function pedir(conversacion: Mensaje[], catalogo: LibroBiblioteca[]){
    // Se guarda el intento para poder repetirlo desde el botón del aviso. Con un modelo
    // local el primer fallo suele ser el modelo cargándose en memoria, y obligar a cerrar
    // y reabrir la ventana para volver a intentarlo es hostil.
    ultimoIntentoRef.current = { conversacion, catalogo };
    const miNumero = ++peticionRef.current;
    const esLaVigente = () => peticionRef.current === miNumero;

    setCargando(true);
    setEscribiendo(false);
    const controlador = new AbortController();
    abortRef.current = controlador;
    motivoRef.current = null;

    let temporizador: ReturnType<typeof setTimeout> | undefined = setTimeout(() => detener("timeout"), TIEMPO_PRIMER_TOKEN_MS);
    const idRespuesta = nuevoId();
    let texto = "";

    try{
      const { sistema } = construirContexto(catalogo);
      await generarConModeloLocal({
        senal: controlador.signal,
        mensajes: [
          { role: "system", content: sistema },
          // Igual que en /chat: los mensajes que solo existen para la interfaz no viajan.
          // Un aviso de error metido en el contexto se convierte en tema de conversación.
          ...conversacion.filter(m => !m.soloInterfaz).map(m => ({ role: m.role, content: m.content })),
        ],
        alRecibir: (acumulado, primero) => {
          if(!esLaVigente()) return;
          texto = acumulado;
          if(primero){
            clearTimeout(temporizador); temporizador = undefined;
            setEscribiendo(true);
            // El modelo acaba de hablar, así que cualquier aviso de "no pude conectar" que
            // quedara de un intento anterior ya no describe la realidad. Dejarlo en pantalla
            // hace creer que sigue roto justo mientras funciona.
            setMensajes(actuales => [...actuales.filter(m => !m.esError), { id: idRespuesta, role: "assistant", content: acumulado }]);
          }else{
            setMensajes(actuales => actuales.map(m => m.id === idRespuesta ? { ...m, content: acumulado } : m));
          }
        },
      });
    }catch(error){
      // Media respuesta es mejor que ninguna: si ya había texto, no se tapa con un aviso.
      if(esAborto(error) && texto) return;
      // Si esta petición ya fue reemplazada, su fallo no le interesa a nadie: la canceló el
      // propio usuario al escribir otra cosa.
      if(!esLaVigente()) return;
      const aviso = describirFallo({ error, motivo: motivoRef.current, nombre: "el bibliotecario" });
      setMensajes(actuales => [...actuales, { id: nuevoId(), role: "assistant", content: aviso, soloInterfaz: true, esError: true }]);
    }finally{
      clearTimeout(temporizador);
      // Solo la petición vigente apaga las luces. La reemplazada llega aquí DESPUÉS de que
      // la nueva haya arrancado; sin esta guarda la dejaría sin controlador y sin estado de
      // "cargando", y el botón de detener quedaría muerto.
      if(esLaVigente()){
        abortRef.current = null;
        setCargando(false);
        setEscribiendo(false);
      }
    }
  }

  /**
   * Al abrir por primera vez: se lee la biblioteca y se pide la recomendación de entrada.
   * Va en el manejador del clic y no en un efecto porque es la consecuencia directa de una
   * acción del usuario, no una sincronización con el estado.
   */
  async function abrir(){
    setAbierto(true);
    if(arrancadoRef.current) return;
    await arrancar();
  }

  /** Lee la biblioteca y pide la recomendación de entrada. Separada para poder repetirla. */
  async function arrancar(){
    arrancadoRef.current = true;

    let catalogo: LibroBiblioteca[] = [];
    try{
      const respuesta = await fetch("/api/books");
      if(!respuesta.ok) throw new Error(`la biblioteca respondió ${respuesta.status}`);
      catalogo = await respuesta.json() as LibroBiblioteca[];
    }catch(error){
      const detalle = error instanceof Error ? error.message : "";
      // `esError` no es decorativo: es lo que le pone el botón de reintentar al aviso y lo
      // que hace que desaparezca solo cuando algo vuelve a funcionar.
      ultimoIntentoRef.current = null;
      arrancadoRef.current = false;
      setMensajes([{ id: nuevoId(), role: "assistant", soloInterfaz: true, esError: true,
        content: `No pude leer tu biblioteca${detalle ? ` (${detalle})` : ""}, así que no tengo tus puntuaciones para recomendarte nada.` }]);
      return;
    }
    setLibros(catalogo);

    if(!catalogo.some(libro => libro.rating > 0)){
      setMensajes([{ id: nuevoId(), role: "assistant", soloInterfaz: true,
        content: "Todavía no has puntuado ningún libro, así que no tengo de dónde deducir tus gustos. Pon estrellas a un par de lecturas y vuelve: entonces sí puedo recomendarte con criterio." }]);
      return;
    }

    const apertura: Mensaje = { id: nuevoId(), role: "user", content: APERTURA, soloModelo: true };
    setMensajes([apertura]);
    await pedir([apertura], catalogo);
  }

  async function reintentar(){
    if(cargando) return;
    setMensajes(actuales => actuales.filter(m => !m.esError));
    const intento = ultimoIntentoRef.current;
    // Sin intento guardado, el fallo fue al leer la biblioteca: se empieza de cero.
    if(intento) await pedir(intento.conversacion, intento.catalogo);
    else await arrancar();
  }

  async function enviar(evento: FormEvent){
    evento.preventDefault();
    const contenido = entrada.trim();
    if(!contenido) return;

    // Antes aquí había un `|| cargando`, y era un error de diseño: al abrir la ventana se
    // lanza sola la recomendación de entrada, así que durante esos segundos el botón de
    // enviar estaba muerto y había que pulsar «detener» para poder preguntar algo. Ahora
    // escribir manda: se corta lo que estuviera llegando y va la pregunta del usuario. Lo
    // que ya se hubiera escrito se conserva, porque `pedir` no borra el texto parcial
    // cuando el corte es voluntario.
    if(cargando) detener("cancelado");
    const mio: Mensaje = { id: nuevoId(), role: "user", content: contenido };
    const conversacion = [...mensajes, mio];
    setMensajes(conversacion);
    setEntrada("");
    await pedir(conversacion, libros ?? []);
  }

  // En /chat ya hay una conversación a pantalla completa con el mismo modelo: un segundo
  // chat flotante encima solo competiría consigo mismo.
  if(ruta?.startsWith("/chat")) return null;

  const visibles = mensajes.filter(m => !m.soloModelo);

  return <>
    <button type="button" className="bibliotecario-boton" onClick={abrir}
      aria-haspopup="dialog" aria-expanded={abierto} aria-label="Abrir el bibliotecario, recomendaciones según tus puntuaciones">
      <span className="bibliotecario-icono" aria-hidden="true">✦</span>
      <span className="bibliotecario-rotulo">Recomiéndame</span>
    </button>

    {abierto && <div className="bibliotecario-capa">
      {/* El fondo cierra al pulsarlo. Es un <button> y no un <div onClick> para que exista
          también para el teclado y para quien navega con lector de pantalla. */}
      <button type="button" className="bibliotecario-fondo" onClick={cerrar} aria-label="Cerrar el bibliotecario"/>

      <div className="bibliotecario-panel" role="dialog" aria-modal="true" aria-labelledby="bibliotecario-titulo"
        ref={panelRef} tabIndex={-1}>
        <header className="bibliotecario-cabecera">
          <div>
            <p className="bibliotecario-eyebrow">BIBLIOTECARIO</p>
            <h2 id="bibliotecario-titulo">Qué leer ahora</h2>
          </div>
          <span className="bibliotecario-insignia"><i aria-hidden="true"/>Modelo local</span>
          <button type="button" className="bibliotecario-cerrar" onClick={cerrar} aria-label="Cerrar">×</button>
        </header>

        <div className="bibliotecario-mensajes">
          {visibles.length === 0 && !cargando &&
            <p className="bibliotecario-vacio">Leyendo tus puntuaciones…</p>}

          {visibles.map(mensaje =>
            <article key={mensaje.id} className={`bibliotecario-mensaje ${mensaje.role}${mensaje.soloInterfaz ? " aviso" : ""}`}>
              {pintarTexto(mensaje.content)}
              {mensaje.esError && !cargando && mensaje.id === visibles.at(-1)?.id &&
                <button type="button" className="bibliotecario-reintentar" onClick={reintentar}>Reintentar</button>}
            </article>)}

          {cargando && !escribiendo &&
            <p className="bibliotecario-pensando" aria-live="polite"><i/><i/><i/></p>}

          <div ref={finRef}/>
        </div>

        <form className="bibliotecario-compositor" onSubmit={enviar}>
          <input value={entrada} onChange={evento => setEntrada(evento.target.value)}
            placeholder="Pregúntale por un género, un autor, un ánimo…" aria-label="Mensaje para el bibliotecario"/>
          {/* «Detener» solo mientras no haya nada escrito. En cuanto el usuario teclea, el
              botón vuelve a ser el de enviar: lo que quiere es preguntar, no parar. */}
          {cargando && !entrada.trim()
            ? <button type="button" onClick={() => detener("cancelado")} aria-label="Detener la respuesta">■</button>
            : <button type="submit" disabled={!entrada.trim()} aria-label="Enviar">↑</button>}
        </form>
        <p className="bibliotecario-nota">Las recomendaciones se generan en tu ordenador con LM Studio.</p>
      </div>
    </div>}
  </>;
}
