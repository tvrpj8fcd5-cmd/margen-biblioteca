-- Documento PDF asociado a cada libro. Mismo criterio que cover_key: TEXT NOT NULL con
-- cadena vacía como "sin documento", para no tener que distinguir entre '' y NULL en el
-- código, que ya trata todos los campos de texto de la misma forma.
alter table public.books add column if not exists pdf_key text not null default '';

comment on column public.books.pdf_key is 'URL publica del PDF en Supabase Storage, o cadena vacia si el libro no tiene documento.';

-- Bucket propio para los documentos, separado del de portadas: los límites de tamaño y
-- los tipos permitidos no tienen nada que ver entre una miniatura y un libro entero.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-documents','book-documents',true,26214400,array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
