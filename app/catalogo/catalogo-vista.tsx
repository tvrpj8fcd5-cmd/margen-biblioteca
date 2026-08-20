"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  {id:1,titulo:"El coronel no tiene quien le escriba",autor:"Gabriel García Márquez",portada_url:"https://covers.openlibrary.org/b/isbn/9780307387264-L.jpg",resumen:"Un coronel retirado espera durante años la carta que confirme su pensión mientras él y su esposa sobreviven con dignidad, esperanza y un gallo heredado de su hijo.",estado_leido:true,calificacion:5,progreso:100,tono:"sand"},
  {id:2,titulo:"Indigno de ser humano",autor:"Osamu Dazai",portada_url:"https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg",resumen:"La confesión de un hombre que se siente incapaz de comprender las reglas de la sociedad y utiliza el humor como máscara frente a una profunda sensación de alienación.",estado_leido:false,calificacion:4,progreso:65,tono:"ink"},
  // Los dos títulos técnicos van sin autor real a propósito: son tus apuntes, no libros
  // publicados, y ponerles una firma inventada sería ensuciar el catálogo con datos falsos.
  {id:3,titulo:"Modelos de lenguaje locales",autor:"Cuaderno técnico",portada_url:"",resumen:"Notas sobre ejecutar modelos de lenguaje en tu propia máquina: cuantización, memoria disponible, servidores compatibles con la API de OpenAI y cuándo un modelo pequeño basta.",estado_leido:false,calificacion:4,progreso:45,tono:"green"},
  {id:4,titulo:"YOLO: detección en tiempo real",autor:"Cuaderno técnico",portada_url:"",resumen:"Cómo funciona una red que mira la imagen una sola vez: rejilla de celdas, cajas por celda, supresión de no máximos y el compromiso permanente entre velocidad y precisión.",estado_leido:false,calificacion:5,progreso:20,tono:"clay"},
  {id:5,titulo:"Cien años de soledad",autor:"Gabriel García Márquez",portada_url:"https://covers.openlibrary.org/b/isbn/9780307474728-L.jpg",resumen:"La historia de la familia Buendía y de Macondo a través de siete generaciones, donde la memoria, la soledad y lo extraordinario forman parte de la vida cotidiana.",estado_leido:true,calificacion:5,progreso:100,tono:"wine"},
  {id:6,titulo:"Sapiens",autor:"Yuval Noah Harari",portada_url:"https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg",resumen:"Un recorrido por las revoluciones cognitivas, agrícolas y científicas que transformaron a Homo sapiens y dieron forma a las sociedades contemporáneas.",estado_leido:false,calificacion:4,progreso:38,tono:"cream"},
  {id:7,titulo:"Dune",autor:"Frank Herbert",portada_url:"https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg",resumen:"En el planeta desértico Arrakis, Paul Atreides queda atrapado en una lucha por el poder, la ecología y el recurso más valioso del universo.",estado_leido:false,calificacion:5,progreso:72,tono:"blue"},
  {id:8,titulo:"Hábitos atómicos",autor:"James Clear",portada_url:"https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg",resumen:"Un método práctico para construir buenos hábitos, abandonar los perjudiciales y lograr cambios notables mediante mejoras pequeñas y constantes.",estado_leido:true,calificacion:4,progreso:100,tono:"ochre"},
];

// Esta pantalla ES el catálogo detallado, así que es el catálogo lo que va marcado como
// página actual. Antes se marcaba "Mi Biblioteca", que además ni siquiera es esta ruta:
// era un botón inerte y encima señalaba a otro sitio.
// "Ajustes" se retiró: no hay ninguna pantalla de ajustes detrás, y un botón que no hace
// nada al pulsarlo es peor que no tenerlo.
const navItems=[
  {label:"Mi biblioteca",icon:"⌂",href:"/"},
  {label:"Mi colección",icon:"◫",href:"/coleccion"},
  {label:"Catálogo detallado",icon:"▦",active:true},
  {label:"Chat de la Obra",icon:"◌",href:"/chat"},
];

function BookCover({book,large=false}:{book:CatalogBook;large?:boolean}){
  return <span className={`catalog-cover cover-${book.tono} ${large?"catalog-cover-large":""}`}>
    <span className="catalog-cover-fallback"><small>{book.autor}</small><strong>{book.titulo}</strong></span>
    {book.portada_url&&<img src={book.portada_url} alt={`Portada de ${book.titulo}`} onError={event=>{event.currentTarget.style.display="none"}}/>}
  </span>;
}

/** Convierte un libro de la base a la forma que pinta esta pantalla. */
function aLibroDeCatalogo(libro:LibroCrudo):CatalogBook{
  return {
    id:libro.id, titulo:libro.title, autor:libro.author,
    portada_url:libro.coverKey?coverSrc(libro.coverKey):"",
    resumen:libro.summary||"Aún no has añadido un resumen para este libro.",
    estado_leido:libro.status==="Leído", calificacion:libro.rating,
    progreso:libro.status==="Leído"?100:libro.status==="Leyendo"?65:0,
    tono:libro.color,
  };
}

type LibroCrudo={id:number;title:string;author:string;summary:string;status:string;rating:number;color:string;coverKey:string};

/**
 * El catálogo. `librosIniciales` llega del componente de servidor; si viene `null` o vacío
 * se queda con los libros de ejemplo, igual que antes.
 */
export default function Catalogo({librosIniciales}:{librosIniciales:LibroCrudo[]|null}){
  const inicio=librosIniciales?.length?librosIniciales.map(aLibroDeCatalogo):mockBooks;
  const [catalogBooks,setCatalogBooks]=useState<CatalogBook[]>(inicio);
  const [selected,setSelected]=useState<CatalogBook>(inicio[0]);
  const rejillaRef=useRef<HTMLDivElement>(null);
  const [columnas,setColumnas]=useState(4);

  // Para que cada fila pueda tener su propia repisa hay que saber donde rompen las filas,
  // y eso el CSS no lo sabe: con `auto-fill` el numero de columnas lo decide el navegador
  // y no lo expone. Asi que se cuenta aqui.
  //
  // El ancho minimo del libro, la separacion y el tope de columnas NO se repiten en este
  // archivo: se leen del estilo calculado, donde ya viven con sus media queries. Si
  // manana cambias un breakpoint en el CSS, el recuento se ajusta solo y no hay dos
  // fuentes de verdad que puedan discrepar.
  useEffect(()=>{
    const nodo=rejillaRef.current;
    if(!nodo)return;
    const medir=()=>{
      const estilo=getComputedStyle(nodo);
      const hueco=parseFloat(estilo.getPropertyValue("--hueco-columna"))||0;
      const minimo=parseFloat(estilo.getPropertyValue("--ancho-libro"))||145;
      const tope=parseFloat(estilo.getPropertyValue("--columnas-max"))||Infinity;
      const ancho=nodo.clientWidth-parseFloat(estilo.paddingLeft)-parseFloat(estilo.paddingRight);
      // +hueco a los dos lados: n columnas llevan n-1 separaciones, no n.
      setColumnas(Math.min(tope,Math.max(1,Math.floor((ancho+hueco)/(minimo+hueco)))));
    };
    medir();
    const observador=new ResizeObserver(medir);
    observador.observe(nodo);
    return ()=>{observador.disconnect()};
  },[]);

  // Trocear en filas es barato, pero se memoriza para no rehacer los arrays en cada
  // render: si no, cada fila seria un objeto nuevo y React remontaria toda la estanteria.
  const filas=useMemo(()=>{
    const salida:CatalogBook[][]=[];
    for(let i=0;i<catalogBooks.length;i+=columnas)salida.push(catalogBooks.slice(i,i+columnas));
    return salida;
  },[catalogBooks,columnas]);

  // Red de seguridad: solo si la lectura del servidor falló.
  useEffect(()=>{
    if(librosIniciales!==null)return;
    let cancelado=false;
    void (async()=>{
      try{
        const response=await fetch("/api/books");
        if(!response.ok||cancelado)return;
        const stored=await response.json() as LibroCrudo[];
        if(!stored.length||cancelado)return;
        const mapped=stored.map(aLibroDeCatalogo);
        setCatalogBooks(mapped); setSelected(mapped[0]);
      }catch{/* Se conservan los libros de ejemplo. */}
    })();
    return ()=>{ cancelado=true };
  },[librosIniciales]);

  return <main className="catalog-page">
    <aside className="catalog-nav" aria-label="Navegación del catálogo">
      <Link className="catalog-mark" href="/" aria-label="Volver a Margen">m</Link>
      <nav>
        {/* La página actual es un <span>, no un <button>: no es una acción que se pueda
            pulsar, es un rótulo de dónde estás. Como <button> quedaba en el orden de
            tabulación prometiendo algo que no ocurría. */}
        {navItems.map(item=>item.href
          ? <Link key={item.label} href={item.href} aria-label={item.label} title={item.label}>{item.icon}</Link>
          : <span key={item.label} className="active" aria-current="page" title={item.label}>{item.icon}</span>)}
      </nav>
      {/* Sin autenticación no hay perfil al que ir. Se queda como distintivo, no como
          botón: antes era pulsable y no ocurría nada. */}
      <span className="catalog-profile" aria-hidden="true">CR</span>
    </aside>

    <section className="catalog-gallery" aria-labelledby="catalog-title">
      <header><div><p>MI BIBLIOTECA</p><h1 id="catalog-title">Catálogo detallado</h1></div><span>{catalogBooks.length} libros</span></header>
      {/* Cada fila: los libros arriba, el bloque de cristal debajo. Son hermanos, no un
          fondo decorado, asi que la repisa es un objeto con su propia caja y su propio
          apilado. El div de la repisa va vacio y sin rol: no aporta nada que leer. */}
      <div className="catalog-shelves" ref={rejillaRef} style={{"--columnas":columnas} as CSSProperties}>
        {filas.map((fila,indice)=><div className="catalog-row" key={fila[0]?.id??indice}>
          <div className="catalog-row-books">
            {fila.map(book=><button key={book.id} className={`catalog-book ${selected.id===book.id?"selected":""}`} onClick={()=>setSelected(book)} aria-label={`Ver detalles de ${book.titulo}`} aria-pressed={selected.id===book.id}><BookCover book={book}/></button>)}
          </div>
          <div className="catalog-shelf"/>
        </div>)}
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
        <Link className="catalog-chat-link" href={`/chat?book=${selected.id}`}>Conversar sobre esta obra <span aria-hidden="true">↗</span></Link>
      </div>
      <footer><span className={selected.estado_leido?"read":"unread"}><i/>{selected.estado_leido?"Leído":"No leído"}</span><span className="catalog-stars" aria-label={`${selected.calificacion} de 5 estrellas`}>{[1,2,3,4,5].map(star=><i key={star} className={star<=selected.calificacion?"filled":""}>★</i>)}</span></footer>
    </aside>
  </main>;
}
