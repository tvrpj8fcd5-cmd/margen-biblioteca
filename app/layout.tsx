import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Bibliotecario from "./bibliotecario";

// Aqui se cargaban Geist y Geist Mono con next/font/google. Se han quitado: NADIE las
// usaba. Sus variables --font-geist-sans y --font-geist-mono no aparecen en ninguna hoja
// de estilos; toda la aplicacion pinta con Arial/Helvetica y Georgia. next/font descarga
// las familias en el build y ademas las precarga con <link rel="preload">, asi que el
// navegador se traia 286 KB de woff2 con prioridad alta, compitiendo con el CSS y el JS
// que si hacen falta, para no dibujar con ellas ni una letra.
// Si algun dia quieres usarlas de verdad: vuelve a importarlas y añade la variable a
// body{font-family:var(--font-geist-sans),...} en globals.css.

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-glass.png`;
  const title = "Margen — Tu biblioteca personal";
  const description = "Guarda tus lecturas, resúmenes e ideas esenciales.";
  return {
    title, description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, images: [{ url:image, width:1744, height:908, alt:"Margen, ideas que merecen quedarse contigo" }] },
    twitter: { card:"summary_large_image", title, description, images:[image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        {/* Vive en el layout y no en la portada para estar disponible en todas las vistas.
            Es un componente de cliente: se excluye a sí mismo de /chat, donde ya hay una
            conversación a pantalla completa contra el mismo modelo. */}
        <Bibliotecario/>
      </body>
    </html>
  );
}
