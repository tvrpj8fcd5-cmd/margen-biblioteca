"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { coverSrc } from "../cover-src";
import "./chat.css";

type Role = "user" | "assistant";
// `synthetic` marca los mensajes que existen solo para la interfaz: la bienvenida y los
// avisos de error. Se pintan como cualquier otro, pero NO viajan al modelo.
type Message = { id:number; role:Role; content:string; synthetic?:boolean };
type LibraryBook = { id:number; title:string; author:string; summary:string; status:"Leído"|"Leyendo"|"Por leer"; color:string; coverKey:string };

// Configurables sin tocar código, por si cambias de modelo o de puerto. Al ser un
// componente de cliente, las variables tienen que llevar el prefijo NEXT_PUBLIC_.
// El identificador debe coincidir con el que LM Studio muestra en su panel de servidor.
const LM_STUDIO_URL=process.env.NEXT_PUBLIC_LM_STUDIO_URL??"http://localhost:1234/v1/chat/completions";
const LM_STUDIO_MODEL=process.env.NEXT_PUBLIC_LM_STUDIO_MODEL??"bonsai";
const SYSTEM_PROMPT="Eres un asistente literario experto. Estás ayudando al usuario a analizar el libro actual de su biblioteca.";
// El límite vigila el PRIMER token, no la respuesta completa. Un modelo local grande
// puede tardar minutos en terminar de escribir, y eso no es un fallo; lo que sí lo es
// es que no llegue nada. Una vez arranca el streaming se desactiva el temporizador y
// manda el usuario, que siempre puede cancelar.
const TIEMPO_PRIMER_TOKEN_MS=90_000;
const welcome:Message={id:1,role:"assistant",synthetic:true,content:"Hola. Podemos conversar sobre los temas, personajes e ideas de esta obra. ¿Qué te gustaría analizar primero?"};
const fallbackBook:LibraryBook={id:0,title:"Selecciona una obra",author:"Tu biblioteca personal",summary:"Elige un libro para darle contexto a la conversación.",status:"Por leer",color:"ink",coverKey:""};

function BookCover({book}:{book:LibraryBook}){
  return <div className={`chat-cover chat-tone-${book.color}`}>
    {book.coverKey&&<img src={coverSrc(book.coverKey)} alt={`Portada de ${book.title}`} onError={event=>{event.currentTarget.style.display="none"}}/>}
    <small>{book.author}</small><strong>{book.title}</strong>
  </div>;
}

export default function ChatPage(){
  const [books,setBooks]=useState<LibraryBook[]>([]);
  const [selected,setSelected]=useState<LibraryBook>(fallbackBook);
  const [messages,setMessages]=useState<Message[]>([welcome]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [escribiendo,setEscribiendo]=useState(false);
  const messagesEnd=useRef<HTMLDivElement>(null);
  const abortRef=useRef<AbortController|null>(null);
  const motivoRef=useRef<"timeout"|"cancelado"|"cambio"|null>(null);

  useEffect(()=>{void (async()=>{
    try{
      const response=await fetch("/api/books");
      if(!response.ok)return;
      const library=await response.json() as LibraryBook[];
      setBooks(library);
      if(library.length){
        const requested=new URLSearchParams(window.location.search).get("book");
        setSelected(library.find(book=>String(book.id)===requested)??library.find(book=>book.status==="Leyendo")??library[0]);
      }
    }catch{/* Conserva el contexto vacío si la biblioteca no responde. */}
  })()},[]);

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
      const response=await fetch(LM_STUDIO_URL,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify({model:LM_STUDIO_MODEL,stream:true,messages:[
          {role:"system",content:SYSTEM_PROMPT},
          {role:"system",content:`Libro actual: “${selected.title}”, de ${selected.author}. Resumen guardado por el usuario: ${selected.summary||"Sin resumen todavía."}`},
          // Se excluyen los mensajes sintéticos. La plantilla de bonsai-27b rechazaba la
          // conversación con "No user query found in messages" porque el saludo de
          // bienvenida llegaba como un turno de `assistant` anterior a la primera pregunta
          // del usuario. Filtrar aquí también evita que los avisos de error acaben
          // contaminando el contexto de los mensajes siguientes.
          ...conversation.filter(message=>!message.synthetic).map(message=>({role:message.role,content:message.content})),
        ],temperature:.7}),
      });
      if(!response.ok){
        const detalle=await response.text().catch(()=>"");
        throw new Error(`LM Studio respondió con el estado ${response.status}${detalle?`: ${detalle.slice(0,200)}`:""}`);
      }
      if(!response.body)throw new Error("La respuesta no trae un cuerpo legible");

      // El endpoint devuelve Server-Sent Events: líneas "data: {...}", una por fragmento,
      // y un "data: [DONE]" al final. Los trozos que llegan por red no respetan los límites
      // de línea, así que se acumulan en un búfer y solo se procesan las líneas completas.
      const lector=response.body.getReader();
      const decodificador=new TextDecoder();
      let bufer="";

      for(;;){
        const {done,value}=await lector.read();
        if(done)break;
        bufer+=decodificador.decode(value,{stream:true});
        const lineas=bufer.split("\n");
        bufer=lineas.pop()??"";

        for(const linea of lineas){
          const limpia=linea.trim();
          if(!limpia.startsWith("data:"))continue;
          const dato=limpia.slice(5).trim();
          if(!dato||dato==="[DONE]")continue;

          let fragmento:{choices?:Array<{delta?:{content?:string}}>};
          try{ fragmento=JSON.parse(dato); }catch{ continue; }
          const delta=fragmento.choices?.[0]?.delta?.content;
          if(!delta)continue;

          if(!texto){
            // Llegó el primer token: el modelo está vivo, el temporizador ya no aplica.
            clearTimeout(temporizador); temporizador=undefined;
            setEscribiendo(true);
            texto=delta;
            setMessages(current=>[...current,{id:idRespuesta,role:"assistant",content:texto}]);
          }else{
            texto+=delta;
            setMessages(current=>current.map(message=>message.id===idRespuesta?{...message,content:texto}:message));
          }
        }
      }

      if(!texto.trim())throw new Error("El modelo no devolvió texto");
    }catch(error){
      const abortado=error instanceof DOMException&&error.name==="AbortError";
      // Al cambiar de libro ya se reinició la conversación: escribir el aviso ahí solo
      // ensuciaría un hilo que no tiene nada que ver.
      if(abortado&&motivoRef.current==="cambio")return;

      // Si ya había texto en pantalla, se conserva: media respuesta es mejor que ninguna,
      // y añadir un aviso encima solo taparía lo que sí llegó.
      if(abortado&&texto)return;

      const detalle=error instanceof Error?error.message:"";
      const aviso=abortado
        ? motivoRef.current==="timeout"
          ? `Bonsai no emitió ni una palabra en ${TIEMPO_PRIMER_TOKEN_MS/1000} segundos. Suele significar que el modelo aún se está cargando en memoria, o que es demasiado grande para este equipo. Prueba con uno más pequeño.`
          : "Generación cancelada."
        : `No pude conectar con Bonsai${detalle?`: ${detalle}`:""}. Comprueba que LM Studio esté abierto, que el servidor local esté iniciado en el puerto 1234 y que CORS esté habilitado.`;
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
      <a className="chat-mark" href="/" aria-label="Margen, inicio">m</a>
      <nav><a href="/" title="Inicio" aria-label="Inicio">⌂</a><a href="/catalogo" title="Mi Biblioteca" aria-label="Mi Biblioteca">▦</a><a href="/coleccion" title="Mi colección" aria-label="Mi colección">◫</a><a href="/chat" className="active" aria-current="page" title="Chat" aria-label="Chat">◌</a><button title="Ajustes" aria-label="Ajustes">⚙</button></nav>
      <button className="chat-profile" title="Perfil" aria-label="Perfil">CR</button>
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
