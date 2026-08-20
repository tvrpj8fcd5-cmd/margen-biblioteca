import Coleccion from "./coleccion-vista";
import { leerLibrosONulo } from "../libros-servidor";

export const dynamic = "force-dynamic";

// `searchParams` se lee aquí, en el servidor, y baja como prop. Antes la vista tenía que
// montarse, mirar `window.location.search` y recolocarse: eso obliga a un render de más y
// deja ver la cuadrícula un instante antes de abrir el lector que el usuario pidió.
export default async function ColeccionPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const parametros=await searchParams;
  const pedido=parametros.libro;
  return <Coleccion
    librosIniciales={await leerLibrosONulo()}
    libroPedido={typeof pedido==="string"?pedido:null}/>;
}
