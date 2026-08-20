import { db, present, selectColumns, type BookRow } from "../db/database";
import { esCategoria, esEstado, type Book } from "./tipos-libro";

// Lectura de la biblioteca desde el SERVIDOR.
//
// Antes, las cuatro pantallas eran componentes de cliente y pedían /api/books desde el
// navegador nada más montarse. Eso encadena cuatro esperas en fila: HTML → descargar el
// JavaScript → hidratar → recién entonces empezar a pedir los libros. El usuario ve la
// pantalla vacía durante toda esa cadena, y la cadena entera se repite CADA vez que se
// cambia de sección.
//
// Leyendo aquí, en el servidor, los libros ya viajan dentro del HTML: se ahorra una ida y
// vuelta completa al servidor y el contenido se ve en la primera pintada.
//
// La consulta es la misma que sirve GET /api/books, y a propósito: la ruta de la API sigue
// existiendo porque el cliente la necesita después (crear, editar, borrar) y porque es la
// red de seguridad si esta lectura falla.
export async function leerLibros():Promise<Book[]>{
  const filas=await db().query(`SELECT ${selectColumns} FROM books ORDER BY id DESC`) as BookRow[];
  return filas.map(present).map(aLibro);
}

/**
 * Pasa una fila de la base al tipo que usa la interfaz.
 *
 * `status` y `category` son texto libre en Postgres, así que nada impide que ahí haya un
 * valor que la aplicación no contempla —una migración a medias, una edición a mano—. Antes
 * esto no se veía: el cliente hacía `setBooks(await response.json())` y se tragaba lo que
 * viniera sin mirar. Aquí se comprueba y, si el valor no es de los conocidos, se cae a uno
 * seguro en vez de dejar un libro con un estado que ningún filtro reconoce.
 *
 * Los campos van uno a uno, sin `...fila` ni conversiones forzadas, para que TypeScript
 * avise si algún día se añade una columna y se olvida aquí.
 */
function aLibro(fila:ReturnType<typeof present>):Book{
  return {
    id:fila.id, title:fila.title, author:fila.author, year:fila.year,
    status:esEstado(fila.status)?fila.status:"Por leer",
    summary:fila.summary, ideas:fila.ideas, quotes:fila.quotes,
    rating:fila.rating, color:fila.color,
    category:esCategoria(fila.category)?fila.category:"Literatura",
    coverKey:fila.coverKey, pdfKey:fila.pdfKey, favorito:fila.favorito,
    esSemanal:fila.esSemanal, vecesLeido:fila.vecesLeido, createdAt:fila.createdAt,
  };
}

/**
 * Igual que `leerLibros`, pero devuelve `null` en vez de reventar.
 *
 * Si la base no contesta durante el render, la página entera daría un 500 y el usuario se
 * quedaría sin nada. Con `null`, la vista de cliente se da cuenta y vuelve al camino de
 * antes —pedir /api/books ella misma—, que además enseña su propio aviso de error. Peor
 * que instantáneo, pero mucho mejor que una pantalla de fallo.
 */
export async function leerLibrosONulo(){
  try{ return await leerLibros(); }
  catch(error){
    console.error("No se pudo precargar la biblioteca en el servidor:",error);
    return null;
  }
}
