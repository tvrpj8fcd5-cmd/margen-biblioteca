"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useCapaModal } from "../usar-capa-modal";
import "./lector.css";

export type LibroLeible = { id:number; title:string; author:string; pdfKey:string; favorito:boolean };

export function Lector({libro,onCerrar,onFavorito}:{
  libro:LibroLeible;
  onCerrar:()=>void;
  onFavorito:(id:number,favorito:boolean)=>void;
}){
  const [tema,setTema]=useState<"claro"|"oscuro">("claro");
  const [guardando,setGuardando]=useState(false);
  const panelRef=useRef<HTMLDivElement|null>(null);

  useCapaModal(true,onCerrar,panelRef);

  async function alternarFavorito(){
    if(guardando)return;
    const siguiente=!libro.favorito;
    setGuardando(true);
    // Se avisa al padre antes de que responda el servidor: pulsar una estrella y esperar
    // medio segundo a que se encienda se siente roto. Si la petición falla, se revierte.
    onFavorito(libro.id,siguiente);
    try{
      const respuesta=await fetch(`/api/books/${libro.id}`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({favorito:siguiente}),
      });
      if(!respuesta.ok)throw new Error("no se pudo guardar");
    }catch{
      onFavorito(libro.id,!siguiente);
    }finally{ setGuardando(false); }
  }

  return <div className="capa" role="dialog" aria-modal="true" aria-labelledby="lector-titulo">
    <button type="button" className="capa-fondo" tabIndex={-1} aria-hidden="true" onClick={onCerrar}/>

    {/* data-tema cambia la superficie entera: las reglas de abajo no conocen ningún color
        literal, solo variables, así que basta con redefinirlas para el modo oscuro. */}
    <div className="panel lector" ref={panelRef} tabIndex={-1} data-tema={tema}>

      <header className="lector-cabecera">
        <div className="lector-identidad">
          <p className="lector-eyebrow">LECTOR</p>
          <h2 id="lector-titulo">{libro.title}</h2>
          <p className="lector-autor">{libro.author}</p>
        </div>

        <div className="lector-acciones">
          {/* El tema es del LECTOR, no de la aplicación: una superficie de lectura puede
              tener su propio tinte sin arrastrar consigo al resto de la interfaz. */}
          <button type="button" className="accion" onClick={()=>setTema(t=>t==="claro"?"oscuro":"claro")}
            aria-pressed={tema==="oscuro"}
            title={tema==="claro"?"Modo de lectura oscuro":"Modo de lectura claro"}
            aria-label="Cambiar el modo de lectura">{tema==="claro"?"☾":"☀"}</button>

          <button type="button" className={`accion${libro.favorito?" favorito":""}`}
            onClick={alternarFavorito} aria-pressed={libro.favorito} disabled={guardando}
            title={libro.favorito?"Quitar de favoritos":"Marcar como favorito"}
            aria-label={libro.favorito?"Quitar de favoritos":"Marcar como favorito"}>
            {libro.favorito?"★":"☆"}
          </button>

          <button type="button" className="boton-cristal" onClick={onCerrar}>Volver a la biblioteca</button>
        </div>
      </header>

      {libro.pdfKey
        ? <div className="lector-hoja">
            {/* El src apunta a nuestra propia ruta, no a Storage: allí se comprueba que el
                documento pertenece a un libro real y se firma una lectura de 30 minutos.
                Así la URL del visor es estable y la caducidad queda oculta.
                Sin sandbox a propósito: restringirlo rompe el visor de PDF integrado de
                varios navegadores. */}
            <iframe src={`/api/documentos/${libro.pdfKey}`} title={`Documento de ${libro.title}`}/>
          </div>
        : <div className="lector-vacio">
            <p>Esta obra todavía no tiene un PDF asociado.</p>
            <Link className="boton-cristal" href="/">Añadir el documento desde la biblioteca</Link>
          </div>}
    </div>
  </div>;
}
