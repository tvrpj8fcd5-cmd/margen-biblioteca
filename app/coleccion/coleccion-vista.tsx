"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useEffect } from "react";
import { coverSrc } from "../cover-src";
import { Lector } from "./lector";
import "./coleccion.css";

// `pdfKey` es la URL pública del documento en Supabase Storage, o cadena vacía si el
// libro no tiene ninguno. Persiste en la base de datos, así que sobrevive a recargas,
// despliegues y cambios de dispositivo.
type Libro = { id:number; title:string; author:string; category:string; color:string; coverKey:string; pdfKey:string; favorito:boolean };

const MOCK:Libro[]=[
  {id:1,title:"Cien años de soledad",author:"Gabriel García Márquez",category:"Literatura",color:"sage",coverKey:"",pdfKey:"",favorito:false},
  {id:2,title:"Indigno de ser humano",author:"Osamu Dazai",category:"Literatura",color:"ink",coverKey:"",pdfKey:"",favorito:false},
  {id:3,title:"Arquitectura de Modelos de Visión Artificial",author:"Tech Press",category:"Educativo",color:"blue",coverKey:"",pdfKey:"",favorito:false},
];

/**
 * La cuadrícula de lectura. `librosIniciales` llega ya resuelto del componente de servidor;
 * `null` significa que la base falló durante el render y esta vista los pide ella misma,
 * como hacía antes.
 */
export default function Coleccion({librosIniciales,libroPedido}:{librosIniciales:Libro[]|null;libroPedido:string|null}){
  const [libros,setLibros]=useState<Libro[]>(librosIniciales?.length?librosIniciales:MOCK);
  // Una sola fuente de verdad en lugar de un booleano suelto más el id: con
  // `isReadingMode: true` y `libroActual: null` existiría un estado imposible.
  // El libro pedido en la URL (/coleccion?libro=30) se resuelve al construir el estado, no
  // en un efecto. Quién viene en la URL lo sabe el servidor, así que llega ya como prop: no
  // hace falta esperar a montar, no hay parpadeo y no hay setState dentro de un efecto.
  const [abierto,setAbierto]=useState<Libro|null>(()=>
    libroPedido?libros.find(libro=>String(libro.id)===libroPedido)??null:null);

  const origenRef=useRef<HTMLButtonElement|null>(null);

  // Red de seguridad: si la base falló en el servidor, se pide desde aquí como antes.
  useEffect(()=>{
    if(librosIniciales!==null)return;
    let cancelado=false;
    void (async()=>{
      try{
        const respuesta=await fetch("/api/books");
        if(!respuesta.ok||cancelado)return;
        const datos=await respuesta.json() as Libro[];
        if(!datos.length||cancelado)return;
        setLibros(datos);
        // Por este camino el enlace directo tampoco se pierde.
        if(libroPedido){
          const encontrado=datos.find(libro=>String(libro.id)===libroPedido);
          if(encontrado)setAbierto(encontrado);
        }
      }catch{/* Se conservan los datos mock si la API tampoco responde. */}
    })();
    return ()=>{ cancelado=true };
  },[librosIniciales,libroPedido]);

  const cerrarLector=useCallback(()=>{
    setAbierto(null);
    // El foco vuelve a la tarjeta desde la que se abrió, no al principio del documento.
    origenRef.current?.focus();
  },[]);

  // Actualiza la lista y el libro abierto a la vez: el visor lee de `abierto`, así que
  // sin lo segundo la estrella no cambiaría hasta cerrar y volver a entrar.
  const marcarFavorito=useCallback((id:number,favorito:boolean)=>{
    setLibros(actuales=>actuales.map(item=>item.id===id?{...item,favorito}:item));
    setAbierto(actual=>actual&&actual.id===id?{...actual,favorito}:actual);
  },[]);

  function abrirLector(libro:Libro,boton:HTMLButtonElement){
    origenRef.current=boton;
    setAbierto(libro);
  }

  return <main className="coleccion">
    <header className="topbar coleccion-topbar">
      {/* <Link> y no <a>: navega del lado del cliente, sin recargar el documento ni
          perder el estado de la aplicación. */}
      {/* El <span> va vacio a proposito: la "m" la pone globals.css con
          `.brand span:after`. Con la letra escrita aqui salian dos. */}
      <Link className="brand" href="/" aria-label="Margen, inicio"><span/></Link>
      {/* Cada seccion lleva su rotulo y su icono. En movil el CSS esconde el rotulo, pero
          lo esconde *visualmente* (fuera de pantalla, no con display:none): asi el lector
          de pantalla sigue leyendo "Mi coleccion" y no un simbolo suelto sin nombre.
          Los iconos son los mismos de /catalogo y /chat, para que las tres coincidan. */}
      <nav aria-label="Navegación principal">
        <Link className="nav-item" href="/"><span className="nav-texto">Mi biblioteca</span><span className="nav-icono" aria-hidden="true">⌂</span></Link>
        <span className="nav-item active" aria-current="page"><span className="nav-texto">Mi colección</span><span className="nav-icono" aria-hidden="true">◫</span></span>
        <Link className="nav-item" href="/catalogo"><span className="nav-texto">Catálogo detallado</span><span className="nav-icono" aria-hidden="true">▦</span></Link>
        <Link className="nav-item" href="/chat"><span className="nav-texto">Chat de la Obra</span><span className="nav-icono" aria-hidden="true">◌</span></Link>
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
              {libro.favorito&&<span className="libro-favorito" aria-label="Favorito">★</span>}
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
        abierta a una transición donde el panel se expanda desde la tarjeta pulsada.
        El visor gestiona su propia capa, foco y Escape; aquí solo se decide cuándo vive. */}
    {abierto&&<Lector libro={abierto} onCerrar={cerrarLector} onFavorito={marcarFavorito}/>}
  </main>;
}
