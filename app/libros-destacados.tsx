"use client";

import { coverSrc } from "./cover-src";

// Los cuatro son fijos y no salen de la base de datos. Los ids 101-104 NO existen en
// `books`: son marcadores de esta sección, no filas reales.
const librosDestacados = [
  { id:101, titulo:"Cien años de soledad",                 autor:"Gabriel García Márquez", portadaUrl:"" },
  { id:102, titulo:"El coronel no tiene quien le escriba", autor:"Gabriel García Márquez", portadaUrl:"" },
  { id:103, titulo:"Así habló Zaratustra",                 autor:"Friedrich Nietzsche",    portadaUrl:"" },
  { id:104, titulo:"Más allá del bien y del mal",          autor:"Friedrich Nietzsche",    portadaUrl:"" },
];

// Tonos que ya existen en globals.css. Se reparten por posición para que las cuatro
// tarjetas no salgan del mismo color cuando ninguna tiene portada.
const TONOS = ["sage","clay","ink","wine"];

// Solo los campos que esta sección necesita del libro real. Un tipo estrecho para que el
// componente no se rompa cada vez que la biblioteca gane un campo.
type LibroReal = { id:number; title:string; color:string; coverKey:string };

// Compara sin tildes ni mayúsculas. "Asi hablo Zaratustra" y "Así habló Zaratustra" son
// el mismo libro, y una tilde de más en la base de datos no debería romper el enlace.
function normalizar(texto:string){
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}

function monograma(titulo:string){
  return titulo.split(/\s+/).filter(Boolean).slice(0,2).map(palabra=>palabra[0]).join("").toUpperCase();
}

// Genérico sobre el tipo recibido: la página trabaja con `Book` completo y así el callback
// conserva ese tipo en lugar de estrecharlo por el camino.
export function LibrosDestacados<T extends LibroReal>({libros,onSeleccionar,onAnadir}:{
  libros:T[];
  onSeleccionar:(libro:T)=>void;
  onAnadir:(titulo:string,autor:string)=>void;
}){
  return <section className="destacados" aria-labelledby="destacados-titulo">
    <p className="section-label" id="destacados-titulo">LIBROS DESTACADOS</p>

    <div className="destacados-rejilla">
      {librosDestacados.map((destacado,indice)=>{
        // Las cuatro tarjetas son pulsables, pero no llevan al mismo sitio:
        //   · el libro ya está en tu biblioteca  -> abre su ficha
        //   · todavía no está                    -> abre el formulario con título y autor
        //                                           puestos, para añadirlo de una vez
        // En cuanto lo guardes, la tarjeta deja de ser un marcador y pasa a abrir la ficha
        // sin tocar nada más: la asociación es por título, no por id.
        const real=libros.find(libro=>normalizar(libro.title)===normalizar(destacado.titulo));
        const portada=destacado.portadaUrl||(real?.coverKey?coverSrc(real.coverKey):"");
        const tono=real?.color||TONOS[indice%TONOS.length];

        const contenido=<>
          {/* La misma anatomía que .book-card de la biblioteca: una escena y, flotando
              dentro, el libro en proporción de portada. Antes la portada iba a sangre y
              ocupaba todo el ancho de la tarjeta, y eso es lo que la hacía leerse como un
              banner apaisado en vez de como un libro. */}
          <span className="destacado-escena">
            <span className={`destacado-portada tone-${tono}`}>
              {portada
                ? <img src={portada} alt="" onError={event=>{event.currentTarget.style.display="none"}}/>
                : <span className="destacado-monograma" aria-hidden="true">{monograma(destacado.titulo)}</span>}
              {/* La estrella es decorativa: lo que significa ya lo dice el título de la sección. */}
              <span className="destacado-favorito" aria-hidden="true">⭐</span>
            </span>
          </span>
          <span className="destacado-cuerpo">
            <span className="destacado-titulo">{destacado.titulo}</span>
            <span className="destacado-autor">{destacado.autor}</span>
          </span>
        </>;

        return <button key={destacado.id} type="button" className="destacado"
          onClick={()=>real?onSeleccionar(real):onAnadir(destacado.titulo,destacado.autor)}
          title={real?undefined:"Todavía no está en tu biblioteca · pulsa para añadirlo"}
          aria-label={real
            ? `Abrir ${destacado.titulo}, de ${destacado.autor}`
            : `Añadir ${destacado.titulo}, de ${destacado.autor}, a tu biblioteca`}>{contenido}</button>;
      })}
    </div>
  </section>;
}
