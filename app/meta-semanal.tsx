"use client";

import Link from "next/link";
import { useState } from "react";
import { coverSrc } from "./cover-src";

// Solo lo que el banner necesita. Un tipo estrecho en vez de importar el `Book` completo:
// así el componente no se rompe cada vez que la biblioteca gane un campo.
type LibroSemanal = {
  id:number; title:string; author:string; status:string;
  color:string; coverKey:string; esSemanal:boolean; vecesLeido:number;
};

// La app no guarda la página por la que vas, así que el avance se deriva del estado con
// la misma regla que ya usa /chat. Es una estimación y el texto lo dice: inventar un
// "te faltan 120 páginas" que nadie ha medido sería mentir con precisión decimal.
const AVANCE:Record<string,number>={"Leído":100,"Leyendo":65,"Por leer":0};

// Genérico sobre el tipo que reciba: el banner solo exige los campos de LibroSemanal,
// pero la API devuelve el libro completo y el padre trabaja con `Book`. Con <T> el
// callback conserva ese tipo en lugar de estrecharlo por el camino, que obligaría al
// padre a ensanchar de nuevo con un cast.
export function MetaSemanal<T extends LibroSemanal>({libros,onActualizar}:{
  libros:T[];
  onActualizar:(libro:T)=>void;
}){
  const [ocupado,setOcupado]=useState(false);
  const semanal=libros.find(libro=>libro.esSemanal);

  async function terminar(){
    if(!semanal||ocupado)return;
    setOcupado(true);
    try{
      const respuesta=await fetch(`/api/books/${semanal.id}/semanal`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({accion:"terminar"}),
      });
      if(respuesta.ok)onActualizar(await respuesta.json() as T);
    }finally{ setOcupado(false); }
  }

  // Sin libro elegido el banner no desaparece: se queda como invitación. Si se ocultara,
  // no habría ninguna pista de que esta función existe.
  if(!semanal){
    return <section className="meta-semanal meta-vacia" aria-label="Meta semanal">
      <div className="meta-cuerpo">
        <p className="meta-etiqueta"><span aria-hidden="true">🎯</span> META SEMANAL</p>
        <h2>Aún no has elegido tu libro de la semana</h2>
        <p className="meta-autor">Abre cualquier libro de tu biblioteca y márcalo como la lectura de esta semana.</p>
      </div>
    </section>;
  }

  const avance=AVANCE[semanal.status]??0;

  return <section className="meta-semanal" aria-labelledby="meta-titulo">

    <div className={`meta-portada tone-${semanal.color||"ink"}`}>
      {semanal.coverKey
        ? <img src={coverSrc(semanal.coverKey)} alt="" onError={event=>{event.currentTarget.style.display="none"}}/>
        : <span className="meta-portada-titulo">{semanal.title}</span>}
    </div>

    <div className="meta-cuerpo">
      <p className="meta-etiqueta"><span aria-hidden="true">🎯</span> META SEMANAL</p>
      <h2 id="meta-titulo">{semanal.title}</h2>
      <p className="meta-autor">{semanal.author}</p>

      {/* Un div y no un <progress>: aquí solo se muestra el avance, no se manipula. Con
          role y los aria-value* se anuncia igual de bien y el estilo es enteramente
          nuestro, sin pelear con la apariencia nativa de cada navegador. */}
      <div className="meta-barra" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance}
        aria-valuetext={`${avance} por ciento, estado ${semanal.status}`}>
        <span style={{width:`${avance}%`}}/>
      </div>

      <p className="meta-cifras">
        <strong>{avance}%</strong> estimado · {semanal.status}
        {semanal.vecesLeido>0&&<> · leído {semanal.vecesLeido} {semanal.vecesLeido===1?"vez":"veces"}</>}
      </p>
    </div>

    <div className="meta-acciones">
      <Link className="meta-accion" href={`/coleccion?libro=${semanal.id}`}>Continuar leyendo</Link>
      {/* Terminar hace tres cosas de golpe: libera el hueco, suma una lectura y deja el
          libro como leído. El texto del botón lo resume; el título lo explica entero. */}
      <button type="button" className="meta-terminado" onClick={terminar} disabled={ocupado}
        title="Marca el libro como leído, suma una lectura al recuento y libera la meta de la semana">
        {ocupado?"Guardando…":"Terminado"}
      </button>
    </div>
  </section>;
}
