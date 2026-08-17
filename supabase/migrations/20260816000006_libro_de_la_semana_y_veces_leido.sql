-- Libro de la semana y recuento de lecturas.
alter table public.books add column if not exists es_semanal  boolean not null default false;
alter table public.books add column if not exists veces_leido integer not null default 0;

-- "Solo uno por semana" lo garantiza la BASE DE DATOS, no la interfaz.
-- El índice es parcial: solo entran las filas con es_semanal = true, y como ahí el valor
-- es siempre el mismo, un índice único sobre esa columna admite como mucho una fila.
-- Si algún día un bug intentara marcar dos, la segunda escritura falla en lugar de dejar
-- la aplicación en un estado que la interfaz no sabe representar.
create unique index if not exists books_un_solo_semanal
  on public.books (es_semanal) where es_semanal;

-- Nunca negativo: un recuento de lecturas por debajo de cero no significa nada.
alter table public.books drop constraint if exists books_veces_leido_no_negativo;
alter table public.books add constraint books_veces_leido_no_negativo check (veces_leido >= 0);

comment on column public.books.es_semanal  is 'Libro de la semana. Un indice unico parcial impide que haya mas de uno.';
comment on column public.books.veces_leido is 'Cuantas veces se ha terminado el libro.';
