-- Tabla de la biblioteca Margen.
-- Los tipos replican exactamente el contrato que esperan db/database.ts y las rutas de
-- /api/books: `ideas` y `quotes` son JSON serializado en TEXT, y `created_at` es un ISO
-- string en TEXT, no un timestamptz.
create table if not exists public.books (
  id         serial  primary key,
  title      text    not null,
  author     text    not null,
  year       text    not null default '',
  status     text    not null default 'Por leer',
  summary    text    not null default '',
  ideas      text    not null default '[]',
  quote      text    not null default '',
  quotes     text    not null default '[]',
  rating     integer not null default 0,
  color      text    not null default 'ink',
  category   text    not null default 'Literatura',
  cover_key  text    not null default '',
  created_at text    not null
);

-- PostgREST expone por defecto todo lo que viva en `public`. Sin RLS, cualquiera con la
-- clave anon podría leer y escribir la biblioteca entera desde el navegador. Con RLS
-- activo y cero políticas la API de datos queda cerrada, mientras que la aplicación
-- conserva acceso completo: se conecta por Postgres con el rol propietario de la tabla,
-- que no está sujeto a RLS.
alter table public.books enable row level security;

comment on table public.books is 'Biblioteca personal de Margen. Acceso solo desde el servidor por conexion Postgres directa; RLS cierra la API de datos.';
