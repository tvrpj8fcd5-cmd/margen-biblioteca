"use client";

import Link from "next/link";

import { FormEvent, useEffect, useRef, useState } from "react";
import { coverSrc } from "../cover-src";
import { describirFallo, esAborto, generarConModeloLocal, TIEMPO_PRIMER_TOKEN_MS } from "../lm-studio";
import "./chat.css";

type Role = "user" | "assistant";
// `synthetic` marca los mensajes que existen solo para la interfaz: la bienvenida y los
// avisos de error. Se pintan como cualquier otro, pero NO viajan al modelo.
type Message = { id:number; role:Role; content:string; synthetic?:boolean };
type LibraryBook = { id:number; title:string; author:string; summary:string; status:"Leído"|"Leyendo"|"Por leer"; color:string; coverKey:string };

// La dirección, el modelo, el temporizador, la lectura del streaming y los avisos de
// error viven en ../lm-studio, compartidos con el bibliotecario flotante. Aquí solo queda
// lo propio de esta pantalla: de qué habla el asistente.
const SYSTEM_PROMPT="Eres un asistente literario experto. Estás ayudando al usuario a analizar el libro actual de su biblioteca.";
const welcome:Message={id:1,role:"assistant",synthetic:true,content:"Hola. Podemos conversar sobre los temas, personajes e ideas de esta obra. ¿Qué te gustaría analizar primero?"};
const fallbackBook:LibraryBook={id:0,title:"Selecciona una obra",author:"Tu biblioteca personal",summary:"Elige un libro para darle contexto a la conversación.",status:"Por leer",color:"ink",coverKey:""};

/**
 * Qué obra queda seleccionada: la pedida en la URL, si no la que se esté leyendo, si no la
 * primera. Fuera del componente y sin tocar estado, para poder llamarla también desde el
 * inicializador de `useState` y no necesitar un efecto que recoloque después.
 */
function elegir(library:LibraryBook[],pedido:string|null):LibraryBook|undefined{
  if(!library.length)return undefined;
  return library.find(book=>String(book.id)===pedido)
    ??library.find(book=>book.status==="Leyendo")
    ??library[0];
}

function BookCover({book}:{book:LibraryBook}){
  return <div className={`chat-cover chat-tone-${book.color}`}>
    {book.coverKey&&<img src={coverSrc(book.coverKey)} alt={`Portada de ${book.title}`} onError={event=>{event.currentTarget.style.display="none"}}/>}
    <small>{book.author}</small><strong>{book.title}</strong>
  </div>;
}

/**
 * La conversación sobre una obra. `librosIniciales` llega del componente de servidor; con
 * `null` esta vista los pide ella misma, como antes.
 *
 * Cuál queda seleccionado depende de `?book=` en la URL, que es cosa del navegador, así que
 * esa parte sigue en un efecto: en el servidor no hay `window`.
 */
export default function Chat({librosIniciales,libroPedido}:{librosIniciales:LibraryBook[]|null;libroPedido:string|null}){
  const [books,setBooks]=useState<LibraryBook[]>(librosIniciales??[]);
  const [selected,setSelected]=useState<LibraryBook>(()=>elegir(librosIniciales??[],libroPedido)??fallbackBook);
  const [messages,setMessages]=useState<Message[]>([welcome]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [escribiendo,setEscribiendo]=useState(false);
  const messagesEnd=useRef<HTMLDivElement>(null);
  const abortRef=useRef<AbortController|null>(null);
  const motivoRef=useRef<"timeout"|"cancelado"|"cambio"|null>(null);

  // Red de seguridad: solo si la lectura del servidor falló.
  useEffect(()=>{
    if(librosIniciales!==null)return;
    let cancelado=false;
    void (async()=>{
      try{
        const response=await fetch("/api/books");
        if(!response.ok||cancelado)return;
        const library=await response.json() as LibraryBook[];
        if(cancelado)return;
        setBooks(library);
        const elegido=elegir(library,libroPedido);
        if(elegido)setSelected(elegido);
      }catch{/* Conserva el contexto vacío si la biblioteca tampoco responde. */}
    })();
    return ()=>{ cancelado=true };
  },[librosIniciales,libroPedido]);

  useEffect(()=>{messagesEnd.current?.scrollIntoView({behavior:"smooth"})},[messages,loading]);

  // Si se abandona la página con una generación en curso, se corta la petición en lugar
  // de dejarla colgando contra LM Studio.
  useEffect(()=>()=>{abortRef.current?.abort()},[]);

  function detener(motivo:"timeout"|"cancelado"|"cambio"){
    if(!abortRef.current)return;
    motivoRef.current=motivo;
    abortRef.current.abort();
    abortRef.current=null;
  }

  function selectBook(id:number){
    const book=books.find(item=>item.id===id);
    if(!book)return;
    // Cambiar de obra con una respuesta en vuelo dejaría caer esa respuesta —escrita para
    // el libro anterior— dentro de la conversación nueva.
    detener("cambio");
    setSelected(book);
    setMessages([{...welcome,id:Date.now(),content:`Ya tengo el contexto de “${book.title}”. ¿Qué aspecto de la obra quieres explorar?`}]);
  }

  async function sendMessage(event:FormEvent){
    event.preventDefault();
    const content=input.trim();
    if(!content||loading)return;
    const userMessage:Message={id:Date.now(),role:"user",content};
    const conversation=[...messages,userMessage];
    setMessages(conversation);setInput("");setLoading(true);

    const controller=new AbortController();
    abortRef.current=controller;
    motivoRef.current=null;
    let temporizador:ReturnType<typeof setTimeout>|undefined=setTimeout(()=>detener("timeout"),TIEMPO_PRIMER_TOKEN_MS);
    const idRespuesta=Date.now()+1;
    let texto="";

    try{
      await generarConModeloLocal({
        senal:controller.signal,
        mensajes:[
          {role:"system",content:SYSTEM_PROMPT},
          {role:"system",content:`Libro actual: “${selected.title}”, de ${selected.author}. Resumen guardado por el usuario: ${selected.summary||"Sin resumen todavía."}`},
          // Se excluyen los mensajes sintéticos. La plantilla de bonsai-27b rechazaba la
          // conversación con "No user query found in messages" porque el saludo de
          // bienvenida llegaba como un turno de `assistant` anterior a la primera pregunta
          // del usuario. Filtrar aquí también evita que los avisos de error acaben
          // contaminando el contexto de los mensajes siguientes.
          ...conversation.filter(message=>!message.synthetic).map(message=>({role:message.role,content:message.content})),
        ],
        alRecibir:(acumulado,primero)=>{
          texto=acumulado;
          if(primero){
            // Llegó el primer token: el modelo está vivo, el temporizador ya no aplica.
            clearTimeout(temporizador); temporizador=undefined;
            setEscribiendo(true);
            setMessages(current=>[...current,{id:idRespuesta,role:"assistant",content:acumulado}]);
          }else{
            setMessages(current=>current.map(message=>message.id===idRespuesta?{...message,content:acumulado}:message));
          }
        },
      });
    }catch(error){
      const abortado=esAborto(error);
      // Al cambiar de libro ya se reinició la conversación: escribir el aviso ahí solo
      // ensuciaría un hilo que no tiene nada que ver.
      if(abortado&&motivoRef.current==="cambio")return;

      // Si ya había texto en pantalla, se conserva: media respuesta es mejor que ninguna,
      // y añadir un aviso encima solo taparía lo que sí llegó.
      if(abortado&&texto)return;

      const aviso=describirFallo({error,motivo:motivoRef.current,nombre:"Bonsai"});
      setMessages(current=>[...current,{id:Date.now()+1,role:"assistant",content:aviso,synthetic:true}]);
    }finally{
      clearTimeout(temporizador);
      abortRef.current=null;
      setLoading(false);
      setEscribiendo(false);
    }
  }

  const progress=selected.status==="Leído"?100:selected.status==="Leyendo"?65:0;

  return <main className="chat-page">
    <aside className="chat-nav" aria-label="Navegación de Chat de la Obra">
      <Link className="chat-mark" href="/" aria-label="Margen, inicio">m</Link>
      {/* <Link> en vez de <a>: con <a> saltar de sección recargaba la aplicación entera.
          El enlace a /catalogo se llamaba "Mi Biblioteca", que es el nombre de la portada:
          apuntaba a un sitio y decía el nombre de otro. Y "Ajustes" no llevaba a ninguna
          parte, así que se retira. */}
      <nav>
        <Link href="/" title="Mi biblioteca" aria-label="Mi biblioteca">⌂</Link>
        <Link href="/coleccion" title="Mi colección" aria-label="Mi colección">◫</Link>
        <Link href="/catalogo" title="Catálogo detallado" aria-label="Catálogo detallado">▦</Link>
        <Link href="/chat" className="active" aria-current="page" title="Chat de la Obra" aria-label="Chat de la Obra">◌</Link>
      </nav>
      {/* Sin autenticación no hay perfil al que ir: distintivo, no botón. */}
      <span className="chat-profile" aria-hidden="true">CR</span>
    </aside>

    <aside className="book-context" aria-labelledby="context-title">
      <div className="context-heading"><p>CONTEXTO ACTIVO</p><span aria-hidden="true">•••</span></div>
      <BookCover book={selected}/>
      <div className="context-copy"><h1 id="context-title">{selected.title}</h1><p>{selected.author}</p>
        {books.length>1&&<label className="book-picker"><span>Cambiar obra</span><select value={selected.id} onChange={event=>selectBook(Number(event.target.value))}>{books.map(book=><option key={book.id} value={book.id}>{book.title}</option>)}</select></label>}
        <div className="context-progress-title"><span>Progreso</span><strong>{progress}%</strong></div>
        <div className="context-progress" role="progressbar" aria-label="Progreso de lectura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:`${progress}%`}}/></div>
        <p className="context-summary">{selected.summary}</p>
      </div>
    </aside>

    <section className="chat-shell" aria-labelledby="chat-title">
      <header className="chat-header"><div><p>CHAT DE LA OBRA</p><h2 id="chat-title">Conversación con Asistente</h2></div><span className="local-badge"><i/>Modo Local · Bonsai</span></header>
      <div className="message-list" aria-live="polite"><div className="chat-day">HOY</div>
        {messages.map(message=><article key={message.id} className={`message ${message.role}`}><span className="message-author">{message.role==="assistant"?"Bonsai":"Tú"}</span><p>{message.content}</p></article>)}
        {loading&&!escribiendo&&<article className="message assistant loading-message" aria-label="Bonsai está escribiendo"><span className="message-author">Bonsai</span><p><i/><i/><i/></p></article>}<div ref={messagesEnd}/>
      </div>
      <form className="chat-composer" onSubmit={sendMessage}><label><span className="sr-only">Escribe tu mensaje</span><textarea rows={1} value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}} placeholder="Pregunta sobre personajes, temas o ideas…" disabled={loading}/></label>
        {loading
          ? <button type="button" className="cancelar" onClick={()=>detener("cancelado")} title="Cancelar la generación" aria-label="Cancelar la generación">✕</button>
          : <button type="submit" disabled={!input.trim()} aria-label="Enviar mensaje">↗</button>}
      </form>
      <p className="chat-note">Las respuestas se generan localmente mediante LM Studio.</p>
    </section>
  </main>;
}
