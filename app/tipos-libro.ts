// Tipos compartidos de un libro.
//
// Vivían dentro de la portada, que es un componente de cliente. Al empezar a leer la
// biblioteca desde el servidor hacían falta en los dos lados, y un archivo de servidor no
// debería tener que importar una pantalla entera solo para saber qué es un libro.

export type Status = "Leído" | "Leyendo" | "Por leer";
export type Category = "Literatura" | "Filosofía" | "Ciencia ficción" | "Educativo";

export const ESTADOS:Status[]=["Leído","Leyendo","Por leer"];
export const CATEGORIAS:Category[]=["Literatura","Filosofía","Ciencia ficción","Educativo"];

export type Book = {
  id:number; title:string; author:string; year:string; status:Status;
  summary:string; ideas:string[]; quotes:string[]; rating:number; color:string;
  category:Category; coverKey:string; pdfKey:string; favorito:boolean;
  esSemanal:boolean; vecesLeido:number; createdAt:string;
};

export function esEstado(valor:string):valor is Status{ return (ESTADOS as string[]).includes(valor); }
export function esCategoria(valor:string):valor is Category{ return (CATEGORIAS as string[]).includes(valor); }
