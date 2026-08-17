-- Marcar un libro como favorito desde el visor. Booleano y no un rating, porque son dos
-- cosas distintas: `rating` puntúa la obra, `favorito` la señala para volver a ella.
alter table public.books add column if not exists favorito boolean not null default false;

comment on column public.books.favorito is 'Marcado por el usuario desde el visor de lectura.';
