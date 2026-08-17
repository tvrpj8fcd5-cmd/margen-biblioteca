// Sin "use client": no hay estado, ni efectos, ni manejadores. Se renderiza en el servidor
// y no añade nada al bundle que descarga el navegador.

// Fija a propósito. Cuando quieras rotarla, lo natural es tirar de `quotes` de tus libros
// —ya tienes 5 con citas guardadas— en vez de mantener este literal a mano.
const FRASE = {
  texto:
    "Me di cuenta, a pesar de todo, que en medio del invierno había dentro de mí un verano invencible. " +
    "Y eso me hace feliz. Porque no importa lo duro que el mundo empuje en mi contra, dentro de mí hay algo mejor empujando de vuelta.",
  autor: "Albert Camus",
};

export function FrasesDestacadas(){
  // <figure> + <blockquote> + <figcaption> es el patrón que recomienda la especificación
  // para una cita con su atribución: un lector de pantalla anuncia la frase como cita y el
  // autor como su pie, en vez de leer dos párrafos sueltos sin relación.
  return <section className="frases" aria-labelledby="frases-titulo">
    <p className="section-label" id="frases-titulo">FRASES DESTACADAS</p>

    <figure className="frase-tarjeta">
      {/* Decorativa y enorme. aria-hidden porque un lector de pantalla leería «comillas
          de apertura» justo antes de una cita que ya se anuncia como cita. */}
      <span className="frase-comillas" aria-hidden="true">&ldquo;</span>
      <blockquote className="frase-texto">{FRASE.texto}</blockquote>
      <figcaption className="frase-autor">— {FRASE.autor}</figcaption>
    </figure>
  </section>;
}
