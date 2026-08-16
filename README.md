# Margen — Biblioteca personal

Aplicación de biblioteca virtual construida con Next.js para Vercel. Permite guardar libros, resúmenes, ideas, citas, portadas y estados de lectura; también incluye un catálogo detallado y un chat literario conectado a LM Studio.

Lee [`ESTADO_DEL_PROYECTO.md`](./ESTADO_DEL_PROYECTO.md) antes de continuar el desarrollo. Allí se documentan la arquitectura, el diseño Glassmorphism, la migración desde OpenAI Sites y todos los pendientes conocidos.

## Desarrollo local

Requisitos: Node.js 22 o superior, una base de datos Neon y un Vercel Blob Store.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Variables necesarias:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`

## Validación

```bash
npm run build
npm test
```

## Despliegue

Importa el repositorio desde el panel de Vercel, conecta Neon y Vercel Blob, y deja que Vercel use la configuración de `vercel.json`.
