# Estado del proyecto — Margen / Libroteca Virtual

Fecha del traspaso: 15 de agosto de 2026.

## 1. Resumen ejecutivo

Aplicación de biblioteca personal con tres vistas:

- `/`: biblioteca principal con tarjetas, búsqueda, filtros, ordenamiento y formulario CRUD.
- `/catalogo`: catálogo visual con cuadrícula de portadas y panel de detalle.
- `/chat`: conversación contextual sobre una obra mediante un modelo local de LM Studio.

El proyecto nació en OpenAI Sites usando vinext, Cloudflare D1 y R2. Para este traspaso se convirtió a **Next.js nativo para Vercel**, **Neon Postgres** para libros y **Vercel Blob** para portadas. La compilación `next build` pasa, pero antes de un despliegue funcional hay que conectar Neon y Vercel Blob y migrar los datos existentes.

## 2. Tecnologías y arquitectura

### Aplicación

- Next.js 16 App Router, React 19 y TypeScript estricto.
- Componentes interactivos marcados con `"use client"`.
- CSS propio por vista; Tailwind solo está cargado como base en `app/globals.css`.
- API Routes de Next.js con Web `Request`/`Response`.
- Neon mediante `@neondatabase/serverless` y `DATABASE_URL`.
- Vercel Blob mediante `@vercel/blob` y `BLOB_READ_WRITE_TOKEN`.
- LM Studio mediante una petición directa desde el navegador a `http://localhost:1234/v1/chat/completions`.

### Mapa de archivos

```text
app/
  page.tsx                    Biblioteca principal y CRUD
  globals.css                 Sistema visual Glassmorphism y responsive
  layout.tsx                  Fuentes y metadatos sociales
  catalogo/
    page.tsx                  Galería y panel de detalle
    catalogo.css              Tema claro minimalista del catálogo
  chat/
    page.tsx                  Interfaz y conexión con LM Studio
    chat.css                  Diseño de tres columnas del chat
  api/
    books/route.ts            GET y POST de libros
    books/[id]/route.ts       PATCH y DELETE
    covers/route.ts           Carga a Vercel Blob
    covers/[key]/route.ts     Redirección segura a la portada pública
db/database.ts                Cliente Neon, esquema y serialización
public/                       Favicon, imágenes sociales y assets
vercel.json                   Configuración del despliegue
.env.example                  Variables necesarias
```

### Modelo de datos

La tabla `books` contiene:

`id`, `title`, `author`, `year`, `status`, `summary`, `ideas` (JSON serializado), `quote` (compatibilidad), `quotes` (JSON serializado), `rating`, `color`, `category`, `cover_key` y `created_at`.

`ensureSchema()` crea la tabla y columnas faltantes. El primer GET inserta los libros de ejemplo ausentes comparando por título. Esto facilita un entorno nuevo, pero no sustituye una migración de los datos reales.

## 3. Implementación de la interfaz

### Biblioteca principal y Glassmorphism

La mayor parte del efecto está en `app/globals.css`:

- El lienzo es blanco, con luces ambientales muy suaves creadas mediante `body::before` y gradientes radiales desenfocados.
- La cabecera `.topbar` es fija y translúcida. Combina `background: rgba(...)`, `backdrop-filter: blur(...)`, borde blanco semitransparente y sombras amplias de baja opacidad.
- `.category-filter-panel` y `.library-toolbar` forman la capa flotante que contiene ordenamiento y categorías. Sus `z-index` altos impiden que el desplegable quede oculto detrás de los libros.
- `.sort-control`, `.sort-trigger`, `.sort-dropdown` y `.category-filters` reutilizan el mismo material: gradiente blanco semitransparente, desenfoque, borde fino brillante, `inset` blanco y sombra ambiental.
- El estado activo aumenta la opacidad, aclara el borde y añade un halo blanco con varias capas de `box-shadow`.
- `.book-card` utiliza fondo casi blanco, esquinas redondeadas y varias sombras. Su pseudo-elemento `::before` crea un resplandor azul/violeta desenfocado detrás de la tarjeta.
- Al hacer hover, la tarjeta se eleva con `translateY`, aumenta su sombra y amplifica el resplandor. Las portadas también se elevan y rotan ligeramente.
- Las portadas automáticas usan clases de tono (`tone-ink`, `tone-clay`, `tone-sage`, `tone-sand`, `tone-wine`, `tone-blue`). Una portada subida se coloca como imagen absoluta encima del fallback.
- En móvil, la cabecera pasa a una cuadrícula de logo, buscador y botón circular. Categorías y ordenamiento cambian a una disposición de ancho completo y las tarjetas se apilan.

### Catálogo detallado

`/catalogo` usa una estética deliberadamente distinta: fondo gris claro, paneles blancos y sin Glassmorphism. Tiene navegación lateral, galería CSS Grid y panel derecho fijo. El libro seleccionado vive en estado React y actualiza portada, autor, progreso, resumen y estrellas. El botón “Conversar sobre esta obra” abre `/chat?book=<id>`.

### Chat de la Obra

`/chat` tiene tres columnas: navegación, contexto del libro y conversación. Obtiene los libros desde `/api/books`, selecciona el indicado por query string o el primero en estado “Leyendo”, y calcula un progreso visual de 0/65/100 según el estado. Los mensajes del usuario están a la derecha y los de Bonsai a la izquierda. Incluye indicador animado de carga y error amigable.

## 4. Lógica de filtros y ordenamiento

La biblioteca principal guarda estos estados:

- `query`: búsqueda libre.
- `filter`: `Todos`, `Leyendo`, `Por leer` o `Leído`.
- `categoryFilter`: categoría seleccionada o `null`.
- `sortOrder`: `recent`, `oldest` o `favorite`.

`visible` se calcula con `useMemo`:

1. Verifica el estado de lectura.
2. Verifica la categoría.
3. Construye un texto de búsqueda con título, autor, resumen, ideas y citas.
4. Ordena una copia del resultado por `createdAt` o por `rating`.

Todos los criterios se combinan; por ejemplo, “Educativo” + “Leyendo” + “Favorito”. Al elegir una categoría ya seleccionada se vuelve a `null`. El menú “Ordenar” también contiene los estados de lectura y el desplegable personalizado evita las limitaciones visuales de un `<select>` nativo.

Categorías actuales: `Literatura`, `Filosofía`, `Ciencia ficción` y `Educativo`.

## 5. Estado de la migración a Vercel

### Terminado

- `vercel.json` usa el preset `nextjs`, `npm ci` y `npm run build`.
- Scripts: `next dev`, `next build` y `next start`.
- Base de datos adaptada de D1/SQLite a Neon/Postgres.
- Portadas adaptadas de R2 a Vercel Blob público.
- Dependencias de producción sin vulnerabilidades conocidas según `npm audit --omit=dev` en la fecha del traspaso.
- Compilación de producción completada correctamente.

### Configuración requerida en Vercel

1. Crear o conectar Neon desde Vercel Marketplace.
2. Confirmar que Vercel agregó `DATABASE_URL` en Production, Preview y Development.
3. Crear un Blob Store público y conectarlo al proyecto.
4. Confirmar `BLOB_READ_WRITE_TOKEN` en los tres entornos.
5. Desplegar. El primer GET a `/api/books` crea la tabla y agrega los datos de ejemplo.

## 6. Pendientes y bugs exactos

### Bloqueantes antes de producción

1. **Datos no migrados:** los libros reales siguen en D1 de OpenAI Sites. El código de Vercel arranca con Neon vacío y semillas. Hay que exportar D1 e importar a Neon.
2. **Portadas no migradas:** los objetos existentes de R2 no están en Vercel Blob. Los antiguos `cover_key` no son URLs de Blob y devolverán 404. Hay que descargar cada objeto, subirlo a Blob y actualizar `cover_key`.
3. **Chat rechazado por la plantilla de Bonsai:** el mensaje de bienvenida sintético se agrega al estado `messages` y luego se envía como un mensaje `assistant` anterior a la primera pregunta. La plantilla de `prism-ml/bonsai-27b` devuelve `No user query found in messages`. Solución recomendada: marcar los mensajes de interfaz como `synthetic` y excluirlos del payload, o enviar `conversation.slice(1)` mientras el mensaje de bienvenida siga siendo siempre el primero.

### Limitaciones importantes

4. El chat depende del LM Studio del dispositivo del usuario. Una función de Vercel no puede alcanzar `localhost:1234` del usuario; la petición debe seguir siendo cliente-a-local.
5. LM Studio necesita CORS activo. Algunos navegadores también pueden exigir permisos de acceso a red privada al conectar una página HTTPS pública con `localhost`.
6. No existe timeout ni botón “Cancelar” para una generación lenta; `loading` puede durar demasiado.
7. El historial de chat no se persiste y se reinicia al cambiar de libro o recargar.
8. No hay autenticación ni separación por usuario. Todos los visitantes comparten la misma tabla de libros y el mismo Blob Store.
9. `ensureSchema()` ejecuta DDL en cada llamada. Conviene sustituirlo por migraciones de Postgres antes de escalar.
10. El catálogo conserva datos mock como fallback si `/api/books` falla, lo que puede ocultar una caída de Neon.
11. El progreso no es un campo real: se deriva como 0%, 65% o 100% según el estado.
12. Ajustes y Perfil son botones visuales sin funcionalidad.
13. Las categorías son un union type fijo; todavía no pueden administrarse dinámicamente.
14. La valoración del formulario acepta enteros de 0 a 5, no decimales.
15. No hay suite de pruebas automatizadas funcionales; `npm test` solo valida la compilación.
16. `npm audit` reportó tres vulnerabilidades solo en dependencias de desarrollo en la fecha del traspaso; producción reportó cero.

## 7. Próximos pasos recomendados

1. Provisionar Neon y Blob y hacer un primer Preview Deployment.
2. Migrar datos D1/R2 y verificar CRUD y portadas.
3. Corregir el historial sintético del chat y añadir timeout con `AbortController`.
4. Añadir autenticación y `user_id` a `books` antes de compartir la aplicación.
5. Reemplazar `ensureSchema()` por migraciones versionadas.
6. Añadir pruebas de API, filtros y chat.

## 8. Comandos locales

```bash
cp .env.example .env.local
npm ci
npm run dev
npm run build
npm start
```

No se debe subir `.env.local` ni ningún token al repositorio.
