import Chat from "./chat-vista";
import { leerLibrosONulo } from "../libros-servidor";

export const dynamic = "force-dynamic";

export default async function ChatPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const parametros=await searchParams;
  const pedido=parametros.book;
  return <Chat
    librosIniciales={await leerLibrosONulo()}
    libroPedido={typeof pedido==="string"?pedido:null}/>;
}
