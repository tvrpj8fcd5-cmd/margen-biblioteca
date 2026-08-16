"use client";

import { useEffect, useState } from "react";
import { coverSrc } from "../cover-src";
import "./catalogo.css";

type CatalogBook = {
  id:number;
  titulo:string;
  autor:string;
  portada_url:string;
  resumen:string;
  estado_leido:boolean;
  calificacion:number;
  progreso:number;
  tono:string;
};

const mockBooks:CatalogBook[]=[
  {id:1,titulo:"El coronel no tiene quien le escriba",autor:"Gabriel García Márquez",portada_url:"https://covers.openlibrary.org/b/isbn/9780307387264-L.jpg",resumen:"Un coronel retirado espera durante años la carta que confirme su pensión mientras él y su esposa sobreviven con dignidad, esperanza y un gallo heredado de su hijo.",estado_leido:true,calificacion:5,progreso:100,tono:"ochre"},
  {id:2,titulo:"Indigno de ser humano",autor:"Osamu Dazai",portada_url:"https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg",resumen:"La confesión de un hombre que se siente incapaz de comprender las reglas de la sociedad y utiliza el humor como máscara frente a una profunda sensación de alienación.",estado_leido:false,calificacion:4,progreso:65,tono:"ink"},
  {id:3,titulo:"Cien años de soledad",autor:"Gabriel García Márquez",portada_url:"https://covers.openlibrary.org/b/isbn/9780307474728-L.jpg",resumen:"La historia de la familia Buendía y de Macondo a través de siete generaciones, donde la memoria, la soledad y lo extraordinario forman parte de la vida cotidiana.",estado_leido:true,calificacion:5,progreso:100,tono:"green"},
  {id:4,titulo:"Sapiens",autor:"Yuval Noah Harari",portada_url:"https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg",resumen:"Un recorrido por las revoluciones cognitivas, agrícolas y científicas que transformaron a Homo sapiens y dieron forma a las sociedades contemporáneas.",estado_leido:false,calificacion:4,progreso:38,tono:"cream"},
  {id:5,titulo:"Dune",autor:"Frank Herbert",portada_url:"https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg",resumen:"En el planeta desértico Arrakis, Paul Atreides queda atrapado en una lucha por el poder, la ecología y el recurso más valioso del universo.",estado_leido:false,calificacion:5,progreso:72,tono:"sand"},
  {id:6,titulo:"Hábitos atómicos",autor:"James Clear",portada_url:"https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg",resumen:"Un método práctico para construir buenos hábitos, abandonar los perjudiciales y lograr cambios notables mediante mejoras pequeñas y constantes.",estado_leido:true,calificacion:4,progreso:100,tono:"blue"},
];

const navItems=[
  {label:"Inicio",icon:"⌂",href:"/"},
  {label:"Mi Biblioteca",icon:"▦",active:true},
  {label:"Chat de la Obra",icon:"◌",href:"/chat"},
  {label:"Ajustes",icon:"⚙"},
];

function BookCover({book,large=false}:{book:CatalogBook;large?:boolean}){
  return <span className={`catalog-cover cover-${book.tono} ${large?"catalog-cover-large":""}`}>
    <span className="catalog-cover-fallback"><small>{book.autor}</small><strong>{book.titulo}</strong></span>
    {book.portada_url&&<img src={book.portada_url} alt={`Portada de ${book.titulo}`} onError={event=>{event.currentTarget.style.display="none"}}/>}
  </span>;
}

export default function CatalogPage(){
  const [catalogBooks,setCatalogBooks]=useState<CatalogBook[]>(mockBooks);
  const [selected,setSelected]=useState<CatalogBook>(mockBooks[0]);

  useEffect(()=>{void (async()=>{
    const response=await fetch("/api/books");
    if(!response.ok)return;
    const stored=await response.json() as Array<{id:number;title:string;author:string;summary:string;status:string;rating:number;color:string;coverKey:string}>;
    if(!stored.length)return;
    const mapped=stored.map(book=>({id:book.id,titulo:book.title,autor:book.author,portada_url:book.coverKey?coverSrc(book.coverKey):"",resumen:book.summary||"Aún no has añadido un resumen para este libro.",estado_leido:book.status==="Leído",calificacion:book.rating,progreso:book.status==="Leído"?100:book.status==="Leyendo"?65:0,tono:book.color}));
    setCatalogBooks(mapped);setSelected(mapped[0]);
  })()},[]);

  return <main className="catalog-page">
    <aside className="catalog-nav" aria-label="Navegación del catálogo">
      <a className="catalog-mark" href="/" aria-label="Volver a Margen">m</a>
      <nav>
        {navItems.map(item=>item.href?<a key={item.label} href={item.href} aria-label={item.label} title={item.label}>{item.icon}</a>:<button key={item.label} className={item.active?"active":""} aria-current={item.active?"page":undefined} aria-label={item.label} title={item.label}>{item.icon}</button>)}
      </nav>
      <button className="catalog-profile" aria-label="Perfil" title="Perfil">CR</button>
    </aside>

    <section className="catalog-gallery" aria-labelledby="catalog-title">
      <header><div><p>MI BIBLIOTECA</p><h1 id="catalog-title">Catálogo detallado</h1></div><span>{catalogBooks.length} libros</span></header>
      <div className="catalog-grid">
        {catalogBooks.map(book=><button key={book.id} className={`catalog-book ${selected.id===book.id?"selected":""}`} onClick={()=>setSelected(book)} aria-label={`Ver detalles de ${book.titulo}`} aria-pressed={selected.id===book.id}><BookCover book={book}/></button>)}
      </div>
    </section>

    <aside className="catalog-detail" aria-live="polite">
      <div className="detail-cover-wrap"><BookCover book={selected} large/></div>
      <div className="catalog-detail-copy">
        <p className="detail-kicker">LIBRO SELECCIONADO</p>
        <h2>{selected.titulo}</h2>
        <p className="catalog-author">{selected.autor}</p>
        <div className="progress-heading"><span>Progreso de lectura</span><strong>{selected.progreso}%</strong></div>
        <div className="catalog-progress" role="progressbar" aria-label="Progreso de lectura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selected.progreso}><span style={{width:`${selected.progreso}%`}}/></div>
        <section className="catalog-summary"><h3>Resumen</h3><p>{selected.resumen}</p></section>
        <a className="catalog-chat-link" href={`/chat?book=${selected.id}`}>Conversar sobre esta obra <span aria-hidden="true">↗</span></a>
      </div>
      <footer><span className={selected.estado_leido?"read":"unread"}><i/>{selected.estado_leido?"Leído":"No leído"}</span><span className="catalog-stars" aria-label={`${selected.calificacion} de 5 estrellas`}>{[1,2,3,4,5].map(star=><i key={star} className={star<=selected.calificacion?"filled":""}>★</i>)}</span></footer>
    </aside>
  </main>;
}
