"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { coverSrc } from "./cover-src";

type Status = "Leído" | "Leyendo" | "Por leer";
type Category = "Literatura" | "Filosofía" | "Ciencia ficción" | "Educativo";
type SortOrder = "recent" | "oldest" | "favorite";
type Book = { id:number; title:string; author:string; year:string; status:Status; summary:string; ideas:string[]; quotes:string[]; rating:number; color:string; category:Category; coverKey:string; createdAt:string };
type BookDraft = Omit<Book, "id" | "createdAt" | "ideas"> & { ideas:string };

const emptyDraft: BookDraft = { title:"", author:"", year:String(new Date().getFullYear()), status:"Leyendo", summary:"", ideas:"", quotes:[""], rating:0, color:"ink", category:"Literatura", coverKey:"" };
const tones = ["ink","clay","sage","sand","wine","blue"];
const categories:Category[]=["Literatura","Filosofía","Ciencia ficción","Educativo"];
const sortLabels:Record<SortOrder,string>={recent:"Último agregado",oldest:"Más antiguo",favorite:"Favorito"};

function Cover({ book, large=false }: { book:Book; large?:boolean }) {
  const initials = book.title.split(/\s+/).filter(Boolean).slice(0,3).map(word=>word[0]).join("");
  return <div className={`cover tone-${book.color} ${large ? "large" : ""}`}>{book.coverKey&&<img className="cover-image" src={coverSrc(book.coverKey)} alt={`Portada de ${book.title}`} onError={event=>{event.currentTarget.style.display="none"}}/>}<small>{book.author}</small><strong>{book.title}</strong><span>{initials}</span></div>;
}

export default function Home() {
  const [books,setBooks] = useState<Book[]>([]);
  const [loading,setLoading] = useState(true);
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState<"Todos"|Status>("Todos");
  const [categoryFilter,setCategoryFilter] = useState<Category|null>(null);
  const [sortOrder,setSortOrder] = useState<SortOrder>("recent");
  const [selected,setSelected] = useState<Book|null>(null);
  const [showForm,setShowForm] = useState(false);
  const [draft,setDraft] = useState<BookDraft>(emptyDraft);
  const [editingId,setEditingId] = useState<number|null>(null);
  const [saving,setSaving] = useState(false);
  const [coverFile,setCoverFile] = useState<File|null>(null);
  const [coverPreview,setCoverPreview] = useState("");
  const [formError,setFormError] = useState("");
  const [sortOpen,setSortOpen] = useState(false);
  const sortMenuRef=useRef<HTMLDivElement>(null);

  async function loadBooks(){
    const response=await fetch("/api/books");
    if(response.ok) setBooks(await response.json());
    setLoading(false);
  }
  useEffect(()=>{ loadBooks(); },[]);
  useEffect(()=>()=>{if(coverPreview.startsWith("blob:"))URL.revokeObjectURL(coverPreview)},[coverPreview]);
  useEffect(()=>{const close=(event:PointerEvent)=>{if(!sortMenuRef.current?.contains(event.target as Node))setSortOpen(false)};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[]);

  function openNewBook(){
    setDraft(emptyDraft);setEditingId(null);setCoverFile(null);setCoverPreview("");setFormError("");setShowForm(true);
  }

  function chooseCover(file:File|null){
    setFormError("");setCoverFile(file);
    setCoverPreview(file?URL.createObjectURL(file):(draft.coverKey?coverSrc(draft.coverKey):""));
  }

  const visible=useMemo(()=>{
    const filtered=books.filter(book=>{
      const matchFilter=filter==="Todos"||book.status===filter;
      const matchCategory=!categoryFilter||book.category===categoryFilter;
      const haystack=`${book.title} ${book.author} ${book.summary} ${book.ideas.join(" ")} ${book.quotes.join(" ")}`.toLowerCase();
      return matchFilter&&matchCategory&&haystack.includes(query.trim().toLowerCase());
    });
    return [...filtered].sort((a,b)=>{
      if(sortOrder==="favorite") return b.rating-a.rating||new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime();
      const dateDifference=new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime();
      return sortOrder==="oldest"?dateDifference:-dateDifference;
    });
  },[books,filter,categoryFilter,query,sortOrder]);

  async function addBook(event:FormEvent){
    event.preventDefault();setSaving(true);setFormError("");
    try{
      let coverKey=draft.coverKey;
      if(coverFile){
        const formData=new FormData();formData.append("cover",coverFile);
        const upload=await fetch("/api/covers",{method:"POST",body:formData});
        const uploadResult=await upload.json() as {key?:string;error?:string};
        if(!upload.ok||!uploadResult.key)throw new Error(uploadResult.error||"No se pudo subir la portada");
        coverKey=uploadResult.key;
      }
      const payload={...draft,coverKey,ideas:draft.ideas.split("\n").map(x=>x.trim()).filter(Boolean),quotes:draft.quotes.map(quote=>quote.trim()).filter(Boolean)};
      const response=await fetch(editingId?`/api/books/${editingId}`:"/api/books",{method:editingId?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error("No se pudo guardar el libro");
      const book=await response.json();setBooks(current=>editingId?current.map(item=>item.id===book.id?book:item):[book,...current]);setDraft(emptyDraft);setEditingId(null);setCoverFile(null);setCoverPreview("");setShowForm(false);setSelected(book);
    }catch(error){setFormError(error instanceof Error?error.message:"No se pudo guardar el libro");}
    finally{setSaving(false);}
  }

  async function cycleStatus(book:Book){
    const order:Status[]=["Por leer","Leyendo","Leído"];
    const status=order[(order.indexOf(book.status)+1)%order.length];
    const response=await fetch(`/api/books/${book.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    if(response.ok){ const updated=await response.json(); setBooks(items=>items.map(item=>item.id===updated.id?updated:item)); if(selected?.id===updated.id)setSelected(updated); }
  }

  async function deleteBook(book:Book){
    if(!confirm(`¿Quitar “${book.title}” de tu biblioteca?`))return;
    const response=await fetch(`/api/books/${book.id}`,{method:"DELETE"});
    if(response.ok){setBooks(items=>items.filter(item=>item.id!==book.id));setSelected(null);}
  }

  return <main>
    <header className="topbar">
      <button className="brand" onClick={()=>{setFilter("Todos");setQuery("")}} aria-label="Margen, inicio"><span>m</span></button>
      <nav aria-label="Navegación principal">
        <button onClick={()=>setFilter("Todos")} className="nav-item active">Mi biblioteca</button>
        <a className="nav-item catalog-nav-link" href="/catalogo">Catálogo detallado</a>
        <a className="nav-item catalog-nav-link" href="/chat">Chat de la Obra</a>
      </nav>
      <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="Buscar libros" placeholder="Buscar en tus notas..." /></label>
      <button className="add-button" onClick={openNewBook}><span aria-hidden="true">+</span> Añadir libro</button>
    </header>

    <section className="intro">
      <div className="intro-main"><p className="eyebrow">TU ARCHIVO DE LECTURA</p><h1>Ideas que merecen<br/>quedarse contigo.</h1></div>
      <div className="intro-side"><p>Un lugar para reunir lo que lees, guardar lo esencial y volver a esas ideas que cambiaron algo en ti.</p><span>{books.length} libros · {books.filter(b=>b.status==="Leído").length} terminados</span></div>
    </section>

    <section className="category-filter-panel" aria-label="Categorías de la biblioteca">
      <div className="library-toolbar">
        <div className="sort-control" ref={sortMenuRef}>
          <span>Ordenar</span>
          <button className="sort-trigger" type="button" aria-haspopup="menu" aria-expanded={sortOpen} onClick={()=>setSortOpen(open=>!open)}>
            <b>{filter==="Todos"?sortLabels[sortOrder]:filter}</b><i aria-hidden="true">⌄</i>
          </button>
          {sortOpen&&<div className="sort-dropdown" role="menu" aria-label="Ordenar y filtrar libros">
            <p className="sort-dropdown-label">Ordenar por</p>
            {(["recent","oldest","favorite"] as SortOrder[]).map(order=><button key={order} type="button" role="menuitemradio" aria-checked={sortOrder===order} className={filter==="Todos"&&sortOrder===order?"selected":""} onClick={()=>{setSortOrder(order);setFilter("Todos");setSortOpen(false)}}>{sortLabels[order]}{filter==="Todos"&&sortOrder===order&&<span aria-hidden="true">✓</span>}</button>)}
            <div className="sort-dropdown-divider" aria-hidden="true"/>
            <p className="sort-dropdown-label">Estado de lectura</p>
            {(["Todos","Leyendo","Por leer","Leído"] as const).map(status=><button key={status} type="button" role="menuitemradio" aria-checked={filter===status} className={filter===status?"selected":""} onClick={()=>{setFilter(status);setSortOpen(false)}}>{status==="Todos"?"Todos los libros":status}{filter===status&&<span aria-hidden="true">✓</span>}</button>)}
          </div>}
        </div>
        <div className="category-filters" aria-label="Filtrar por categoría">{categories.map(category=><button key={category} type="button" aria-pressed={categoryFilter===category} className={categoryFilter===category?"selected":""} onClick={()=>setCategoryFilter(current=>current===category?null:category)}>{category}</button>)}</div>
      </div>
    </section>

    {loading ? <div className="empty"><span className="loader"/>Abriendo tu biblioteca…</div> : visible.length ?
      <section className="library" aria-label="Libros de tu biblioteca">{visible.map(book=><article className="book-card filter-entry" key={`${categoryFilter??"Todos"}-${book.id}`}>
        <button className="card-stage" onClick={()=>setSelected(book)} aria-label={`Abrir notas de ${book.title}`}>
          <span className="stage-orbit" aria-hidden="true"/>
          <Cover book={book}/>
        </button>
        <div className="card-info">
          <span className={`author-avatar tone-${book.color}`} aria-hidden="true">{book.author.split(/\s+/).map(part=>part[0]).slice(0,2).join("")}</span>
          <button className="book-meta" onClick={()=>setSelected(book)}>
            <strong>{book.author}</strong>
            <span>{book.title} · {book.year}</span>
          </button>
          <button className={`status status-${book.status.replace(" ","").toLowerCase()}`} onClick={()=>cycleStatus(book)} title="Cambiar estado"><i/>{book.status}</button>
        </div>
      </article>)}</section>
      : <div className="empty"><strong>No hay libros por aquí.</strong><span>{query?"Prueba otra búsqueda.":"Añade tu próxima lectura y empieza a guardar ideas."}</span>{!query&&<button onClick={openNewBook}>Añadir un libro</button>}</div>}

    {selected&&<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="detail" role="dialog" aria-modal="true" aria-label={`Notas de ${selected.title}`}>
      <button className="close" onClick={()=>setSelected(null)} aria-label="Cerrar">×</button>
      <div className="detail-hero"><Cover book={selected} large/><div><p className="eyebrow">{selected.category} · {selected.status} · {selected.year}</p><h2>{selected.title}</h2><p className="author">{selected.author}</p>{selected.rating>0&&<div className="rating" aria-label={`${selected.rating} de 5 estrellas`}>{"●".repeat(selected.rating)}<span>{"●".repeat(5-selected.rating)}</span></div>}<button className="subtle" onClick={()=>cycleStatus(selected)}>Cambiar estado</button></div></div>
      <div className="notes"><section><p className="section-label">EN POCAS PALABRAS</p><p className="summary">{selected.summary||"Aún no has escrito un resumen para este libro."}</p></section>
      <section><p className="section-label">IDEAS QUE ME LLEVO</p>{selected.ideas.length?<ol>{selected.ideas.map((idea,index)=><li key={index}><span>{String(index+1).padStart(2,"0")}</span><p>{idea}</p></li>)}</ol>:<p className="placeholder">Aquí aparecerán tus ideas principales.</p>}</section>
      {selected.quotes.length>0&&<section className="saved-quotes"><p className="section-label">CITAS PARA RECORDAR</p>{selected.quotes.map((quote,index)=><blockquote key={index}>“{quote}”<cite>— {selected.author}</cite></blockquote>)}</section>}</div>
      <div className="detail-actions"><button className="danger" onClick={()=>deleteBook(selected)}>Eliminar</button><button className="primary" onClick={()=>{setDraft({...selected,ideas:selected.ideas.join("\n"),quotes:selected.quotes.length?selected.quotes:[""]});setEditingId(selected.id);setCoverFile(null);setCoverPreview(selected.coverKey?coverSrc(selected.coverKey):"");setFormError("");setSelected(null);setShowForm(true)}}>Editar notas</button></div>
    </aside></div>}

    {showForm&&<div className="overlay form-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><form className="book-form" onSubmit={addBook}>
      <div className="form-head"><div><p className="eyebrow">{editingId?"ACTUALIZAR ENTRADA":"NUEVA ENTRADA"}</p><h2>{editingId?"Editar lectura":"Añadir a la biblioteca"}</h2></div><button type="button" className="close" onClick={()=>setShowForm(false)} aria-label="Cerrar">×</button></div>
      <div className="form-grid"><label><span>Título</span><input required autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="El nombre del libro"/></label><label><span>Autor</span><input required value={draft.author} onChange={e=>setDraft({...draft,author:e.target.value})} placeholder="Nombre del autor"/></label><label><span>Año</span><input value={draft.year} onChange={e=>setDraft({...draft,year:e.target.value})}/></label><label><span>Estado</span><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Status})}><option>Por leer</option><option>Leyendo</option><option>Leído</option></select></label><label><span>Categoría</span><select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as Category})}>{categories.map(category=><option key={category}>{category}</option>)}</select></label></div>
      <fieldset className="cover-upload"><legend>Imagen de portada <small>Opcional</small></legend><div className="cover-upload-content">{coverPreview?<img src={coverPreview} alt="Vista previa de la portada"/>:<div className={`cover-upload-placeholder tone-${draft.color}`}><small>PORTADA AUTOMÁTICA</small><strong>{draft.title||"Tu libro"}</strong></div>}<div className="cover-upload-actions"><label htmlFor="cover-file">{coverFile||draft.coverKey?"Cambiar imagen":"Elegir imagen"}</label><input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>chooseCover(event.target.files?.[0]??null)}/><p>JPG, PNG o WebP · Máximo 5 MB. Si no eliges una imagen, usaremos la portada automática.</p>{(coverFile||draft.coverKey)&&<button type="button" onClick={()=>{setCoverFile(null);setCoverPreview("");setDraft({...draft,coverKey:""})}}>Usar portada automática</button>}</div></div></fieldset>
      <label><span>Resumen personal</span><textarea rows={4} value={draft.summary} onChange={e=>setDraft({...draft,summary:e.target.value})} placeholder="¿De qué trata? Escríbelo con tus propias palabras."/></label>
      <label><span>Ideas principales <small>Una por línea</small></span><textarea rows={5} value={draft.ideas} onChange={e=>setDraft({...draft,ideas:e.target.value})} placeholder={"Lo pequeño, repetido, transforma.\nEl entorno moldea nuestras decisiones."}/></label>
      <fieldset className="quotes-editor"><div className="quotes-head"><legend>Citas para recordar <small>Opcional</small></legend><button type="button" onClick={()=>setDraft({...draft,quotes:[...draft.quotes,""]})}>＋ Añadir cita</button></div>{draft.quotes.map((quote,index)=><div className="quote-input" key={index}><textarea rows={2} value={quote} onChange={event=>setDraft({...draft,quotes:draft.quotes.map((item,itemIndex)=>itemIndex===index?event.target.value:item)})} aria-label={`Cita ${index+1}`} placeholder={index===0?"Una frase que quieras conservar.":"Otra cita memorable..."}/>{draft.quotes.length>1&&<button type="button" onClick={()=>setDraft({...draft,quotes:draft.quotes.filter((_,itemIndex)=>itemIndex!==index)})} aria-label={`Eliminar cita ${index+1}`}>×</button>}</div>)}</fieldset>
      <div className="form-row"><fieldset><legend>Color de portada</legend><div className="swatches">{tones.map(tone=><button type="button" key={tone} className={`swatch tone-${tone} ${draft.color===tone?"chosen":""}`} onClick={()=>setDraft({...draft,color:tone})} aria-label={`Color ${tone}`}/>)}</div></fieldset><label className="rating-input"><span>Valoración</span><select value={draft.rating} onChange={e=>setDraft({...draft,rating:Number(e.target.value)})}><option value="0">Sin valorar</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label></div>
      {formError&&<p className="form-error" role="alert">{formError}</p>}<button className="submit" disabled={saving}>{saving?"Guardando…":"Guardar en mi biblioteca"}</button>
    </form></div>}
  </main>;
}
