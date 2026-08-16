-- 1. El bucket de documentos pasa a privado.
--    Un PDF completo no es una miniatura: con el bucket público, cualquiera con la URL
--    podía descargar el libro entero sin autenticarse. A partir de aquí solo se sirve
--    mediante URLs firmadas de caducidad corta.
update storage.buckets set public = false where id = 'book-documents';

-- 2. pdf_key pasa de guardar la URL pública completa a guardar solo la ruta del objeto.
--    Con un bucket privado la URL ya no es estable —cada lectura necesita una firma
--    nueva—, así que almacenar una URL concreta dejaría de tener sentido: lo permanente
--    es la ruta, y la firma se genera en el momento de leer.
update public.books
set pdf_key = regexp_replace(pdf_key, '^.*/storage/v1/object/public/book-documents/', '')
where pdf_key like '%/storage/v1/object/public/book-documents/%';

comment on column public.books.pdf_key is 'Ruta del objeto dentro del bucket privado book-documents (no una URL). Se firma en cada lectura.';
