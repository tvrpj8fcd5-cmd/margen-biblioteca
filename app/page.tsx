import Biblioteca from "./biblioteca";
import { leerLibrosONulo } from "./libros-servidor";

// Sin esto, Next intentaría prerenderizar esta página en el build y dejaría congelada la
// biblioteca tal y como estuviera ese día: al añadir un libro, la portada seguiría
// enseñando la lista vieja hasta el siguiente despliegue.
export const dynamic = "force-dynamic";

export default async function Home(){
  return <Biblioteca librosIniciales={await leerLibrosONulo()}/>;
}
