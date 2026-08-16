// Resuelve la URL de una portada.
//
// Vercel Blob devuelve URLs públicas absolutas, así que se usan directamente. Meterlas
// dentro de un segmento dinámico de Next (`/api/covers/[key]`) obliga a codificar "/" y ":"
// como %2F y %3A, y los slashes codificados son frágiles: según cómo normalice la ruta el
// proxy que tenga delante, la ruta puede dejar de coincidir con el segmento y devolver 404.
//
// /api/covers/[key] se conserva solo como compatibilidad para los cover_key heredados de R2,
// que no son URLs absolutas.
export function coverSrc(coverKey: string): string {
  if (!coverKey) return "";
  return coverKey.startsWith("https://") ? coverKey : `/api/covers/${encodeURIComponent(coverKey)}`;
}
