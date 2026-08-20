import Catalogo from "./catalogo-vista";
import { leerLibrosONulo } from "../libros-servidor";

export const dynamic = "force-dynamic";

export default async function CatalogPage(){
  return <Catalogo librosIniciales={await leerLibrosONulo()}/>;
}
