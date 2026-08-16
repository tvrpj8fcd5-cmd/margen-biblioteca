"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useEffect } from "react";
import { coverSrc } from "../cover-src";
import { useCapaModal } from "../usar-capa-modal";
import "./coleccion.css";

// `pdfKey` es la URL pública del documento en Supabase Storage, o cadena vacía si el
// libro no tiene ninguno. Persiste en la base de datos, así que sobrevive a recargas,
// despliegues y cambios de dispositivo.
type Libro = { id:number; title:string; author:string; category:string; color:string; coverKey:string; pdfKey:string };

const MOCK:Libro[]=[
  {id:1,title:"Cien años de soledad",author:"Gabriel García Márquez",category:"Literatura",color:"sage",coverKey:"",pdfKey:""},
  {id:2,title:"Indigno de ser humano",author:"Osamu Dazai",category:"Literatura",color:"ink",coverKey:"",pdfKey:""},
  {id:3,title:"Arquitectura de Modelos de Visión Artificial",author:"Tech Press",category:"Educativo",color:"blue",coverKey:"",pdfKey:""},
];

export default function ColeccionPage(){
  const [libros,setLibros]=useState<Libro[]>(MOCK);
  // Una sola fuente de verdad en lugar de un booleano suelto más el id: con
  // `isReadingMode: true` y `libroActual: null` existiría un estado imposible.
  const [abierto,setAbierto]=useState<Libro|null>(null);

  const origenRef=useRef<HTMLButtonElement|null>(null);
  const lectorRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{void (async()=>{
    try{
      const respuesta=await fetch("/api/books");
      if(!respuesta.ok)return;
      const datos=await respuesta.json() as Libro[];
      if(datos.length)setLibros(datos);
    }catch{/* Se conservan los datos mock si la API no responde. */}
  })()},[]);

  const cerrarLector=useCallback(()=>{
    setAbierto(null);
    // El foco vuelve a la tarjeta desde la que se abrió, no al principio del documento.
    origenRef.current?.focus();
  },[]);

  useCapaModal(Boolean(abierto),cerrarLector,lectorRef);

  function abrirLector(libro:Libro,boton:HTMLButtonElement){
    origenRef.current=boton;
    setAbierto(libro);
  }

  return <main className="coleccion">
    <header className="topbar coleccion-topbar">
      {/* <Link> y no <a>: navega del lado del cliente, sin recargar el documento ni
          perder el estado de la aplicación. */}
      <Link className="brand" href="/" aria-label="Margen, inicio"><span>m</span></Link>
      <nav aria-label="Navegación principal">
        <Link className="nav-item" href="/">Mi biblioteca</Link>
        <span className="nav-item active" aria-current="page">Mi colección</span>
        <Link className="nav-item" href="/catalogo">Catálogo detallado</Link>
        <Link className="nav-item" href="/chat">Chat de la Obra</Link>
      </nav>
    </header>

    <div className="coleccion-encabezado">
      <div>
        <p className="coleccion-eyebrow">MI COLECCIÓN</p>
        <h1 id="coleccion-titulo">Área de lectura</h1>
        <p className="coleccion-entradilla">Elige una obra para abrirla en el lector, sin salir de la aplicación.</p>
      </div>
      {/* Los libros se dan de alta en un único sitio, el formulario de la portada, que es
          el que sube portada y documento y los guarda en la base. Duplicar aquí un
          segundo formulario obligaría a mantener dos caminos para lo mismo. */}
      <Link className="boton-cristal" href="/">+ Añadir libro</Link>
    </div>

    <ul className="coleccion-rejilla" aria-labelledby="coleccion-titulo">
      {libros.map(libro=>
        <li key={libro.id}>
          {/* Un <button> y no un <div onClick>: accesible con teclado, en el orden de
              tabulación y con su rol anunciado, sin añadir una línea de ARIA. */}
          <button type="button" className="libro-tarjeta"
            onClick={event=>abrirLector(libro,event.currentTarget)}
            aria-label={`Abrir “${libro.title}”, de ${libro.author}, en el lector`}>

            <span className={`libro-portada tone-${libro.color||"ink"}`}>
              <span className="libro-portada-titulo">{libro.title}</span>
              {/* alt vacío a propósito: el título ya lo anuncia el aria-label del botón. */}
              {libro.coverKey&&<img src={coverSrc(libro.coverKey)} alt="" onError={event=>{event.currentTarget.style.display="none"}}/>}
              {/* Señala de un vistazo cuáles tienen documento. Sin esto, todas las
                  tarjetas prometen lo mismo y la mayoría abre un aviso. */}
              {libro.pdfKey&&<span className="libro-insignia">PDF</span>}
            </span>

            <span className="libro-datos">
              <span className="libro-categoria">{libro.category}</span>
              <strong className="libro-titulo">{libro.title}</strong>
              <span className="libro-autor">{libro.author}</span>
            </span>
          </button>
        </li>,
      )}
    </ul>

    {/* La galería NO se desmonta: el lector es una capa por encima, no otra pantalla.
        Eso conserva el scroll, permite cerrar sin reconstruir nada y deja la puerta
        abierta a una transición donde el panel se expanda desde la tarjeta pulsada. */}
    {abierto&&
      <div className="capa" role="dialog" aria-modal="true" aria-labelledby="lector-titulo" tabIndex={-1} ref={lectorRef}>
        {/* El fondo es un botón real y no un div con onClick. Queda fuera del orden de
            tabulación y oculto a los lectores de pantalla a propósito: es una comodidad
            para el puntero, y con teclado ya están Escape y el botón de volver. */}
        <button type="button" className="capa-fondo" tabIndex={-1} aria-hidden="true" onClick={cerrarLector}/>

        <div className="panel panel-lector">
          <header className="panel-cabecera">
            <div>
              <p className="panel-eyebrow">LECTOR</p>
              <h2 id="lector-titulo">{abierto.title}</h2>
              <p className="panel-subtitulo">{abierto.author}</p>
            </div>
            <button type="button" className="boton-cristal" onClick={cerrarLector}>Volver a la biblioteca</button>
          </header>

          {abierto.pdfKey
            ? <div className="lector-lienzo lector-lienzo-pdf">
                {/* Sin sandbox a propósito: restringirlo rompe el visor de PDF integrado
                    de varios navegadores, y el documento sale de tu propio Storage. */}
                <iframe src={abierto.pdfKey} title={`Documento de ${abierto.title}`}/>
              </div>
            : <div className="lector-lienzo lector-lienzo-vacio">
                <p>Esta obra todavía no tiene un PDF asociado.</p>
                <Link className="boton-cristal" href="/">Añadir el documento desde la biblioteca</Link>
              </div>}
        </div>
      </div>}
  </main>;
}
