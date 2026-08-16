"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import "./chat.css";

type Role = "user" | "assistant";
type Message = { id:number; role:Role; content:string };
type LibraryBook = { id:number; title:string; author:string; summary:string; status:"Leído"|"Leyendo"|"Por leer"; color:string; coverKey:string };

const LM_STUDIO_URL="http://localhost:1234/v1/chat/completions";
const SYSTEM_PROMPT="Eres un asistente literario experto. Estás ayudando al usuario a analizar el libro actual de su biblioteca.";
const welcome:Message={id:1,role:"assistant",content:"Hola. Podemos conversar sobre los temas, personajes e ideas de esta obra. ¿Qué te gustaría analizar primero?"};
const fallbackBook:LibraryBook={id:0,title:"Selecciona una obra",author:"Tu biblioteca personal",summary:"Elige un libro para darle contexto a la conversación.",status:"Por leer",color:"ink",coverKey:""};

function BookCover({book}:{book:LibraryBook}){
  return <div className={`chat-cover chat-tone-${book.color}`}>
    {book.coverKey&&<img src={`/api/covers/${encodeURIComponent(book.coverKey)}`} alt={`Portada de ${book.title}`} onError={event=>{event.currentTarget.style.display="none"}}/>}
    <small>{book.author}</small><strong>{book.title}</strong>
  </div>;
}

export default function ChatPage(){
  const [books,setBooks]=useState<LibraryBook[]>([]);
  const [selected,setSelected]=useState<LibraryBook>(fallbackBook);
  const [messages,setMessages]=useState<Message[]>([welcome]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const messagesEnd=useRef<HTMLDivElement>(null);

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

  function selectBook(id:number){
    const book=books.find(item=>item.id===id);
    if(!book)return;
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
    try{
      const response=await fetch(LM_STUDIO_URL,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"bonsai",messages:[
          {role:"system",content:SYSTEM_PROMPT},
          {role:"system",content:`Libro actual: “${selected.title}”, de ${selected.author}. Resumen guardado por el usuario: ${selected.summary||"Sin resumen todavía."}`},
          ...conversation.map(message=>({role:message.role,content:message.content})),
        ],temperature:.7}),
      });
      if(!response.ok)throw new Error(`LM Studio respondió con el estado ${response.status}`);
      const data=await response.json() as {choices?:Array<{message?:{content?:string}}>};
      const answer=data.choices?.[0]?.message?.content?.trim();
      if(!answer)throw new Error("El modelo no devolvió una respuesta");
      setMessages(current=>[...current,{id:Date.now()+1,role:"assistant",content:answer}]);
    }catch{
      setMessages(current=>[...current,{id:Date.now()+1,role:"assistant",content:"No pude conectar con Bonsai. Comprueba que LM Studio esté abierto, que el servidor local esté iniciado en el puerto 1234 y que CORS esté habilitado."}]);
    }finally{setLoading(false)}
  }

  const progress=selected.status==="Leído"?100:selected.status==="Leyendo"?65:0;

  return <main className="chat-page">
    <aside className="chat-nav" aria-label="Navegación de Chat de la Obra">
      <a className="chat-mark" href="/" aria-label="Margen, inicio">m</a>
      <nav><a href="/" title="Inicio" aria-label="Inicio">⌂</a><a href="/catalogo" title="Mi Biblioteca" aria-label="Mi Biblioteca">▦</a><a href="/chat" className="active" aria-current="page" title="Chat" aria-label="Chat">◌</a><button title="Ajustes" aria-label="Ajustes">⚙</button></nav>
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
        {loading&&<article className="message assistant loading-message" aria-label="Bonsai está escribiendo"><span className="message-author">Bonsai</span><p><i/><i/><i/></p></article>}<div ref={messagesEnd}/>
      </div>
      <form className="chat-composer" onSubmit={sendMessage}><label><span className="sr-only">Escribe tu mensaje</span><textarea rows={1} value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}} placeholder="Pregunta sobre personajes, temas o ideas…" disabled={loading}/></label><button type="submit" disabled={loading||!input.trim()} aria-label="Enviar mensaje">↗</button></form>
      <p className="chat-note">Las respuestas se generan localmente mediante LM Studio.</p>
    </section>
  </main>;
}
