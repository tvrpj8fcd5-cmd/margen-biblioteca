-- Bucket público para las portadas. `public = true` hace que las URLs
-- /storage/v1/object/public/book-covers/<archivo> se sirvan sin token, que es lo que
-- necesita el <img> del navegador.
-- Los límites replican la validación de app/api/covers/route.ts, para que un archivo
-- inválido se rechace aunque alguien evite esa ruta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
