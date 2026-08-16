#!/usr/bin/env node
/**
 * Diagnóstico de conexión — Margen / Libroteca Virtual (Supabase)
 *
 * Comprueba, de forma aislada del resto de la app:
 *   1. Que DATABASE_URL conecta con el Postgres de Supabase y que `books` es usable.
 *   2. Que SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY permiten subir al bucket book-covers,
 *      leerlo públicamente sin token y borrarlo.
 *
 * Uso:
 *   node scripts/check-conexion.mjs                 # lee .env.local y luego .env
 *   node scripts/check-conexion.mjs --env .env.production.local
 *   node scripts/check-conexion.mjs --solo-db
 *   node scripts/check-conexion.mjs --solo-storage
 *   node scripts/check-conexion.mjs --escribir      # INSERT/DELETE de prueba en books
 *
 * Sin --escribir no se modifica la base de datos. En Storage siempre sube y borra un
 * objeto de prueba diminuto bajo el prefijo `diagnostico/`.
 *
 * Requiere `npm install` previo: usa el mismo driver `pg` que la aplicación.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------- utilidades

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[36m',
};
const ok = (m) => console.log(`${C.green}  ✓${C.reset} ${m}`);
const bad = (m) => { fallos++; console.log(`${C.red}  ✗${C.reset} ${m}`); };
const warn = (m) => { avisos++; console.log(`${C.yellow}  !${C.reset} ${m}`); };
const info = (m) => console.log(`${C.dim}    ${m}${C.reset}`);
const titulo = (m) => console.log(`\n${C.bold}${C.blue}${m}${C.reset}`);
const pista = (m) => console.log(`${C.yellow}    → ${m}${C.reset}`);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const soloDb = flag('--solo-db');
const soloStorage = flag('--solo-storage');
const permitirEscritura = flag('--escribir');

let fallos = 0;
let avisos = 0;

function cargarEnv(rutas) {
  for (const ruta of rutas) {
    const abs = resolve(process.cwd(), ruta);
    if (!existsSync(abs)) continue;
    let cargadas = 0;
    for (const linea of readFileSync(abs, 'utf8').split('\n')) {
      const l = linea.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i === -1) continue;
      const clave = l.slice(0, i).trim().replace(/^export\s+/, '');
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(clave in process.env)) { process.env[clave] = v; cargadas++; }
    }
    info(`${ruta}: ${cargadas} variable(s) cargada(s)`);
    return abs;
  }
  return null;
}

const ocultar = (s, n = 8) => (!s ? '(vacío)' : s.length <= n * 2 ? '***' : `${s.slice(0, n)}…${s.slice(-4)} (${s.length} car.)`);

const COLUMNAS_ESPERADAS = ['id', 'title', 'author', 'year', 'status', 'summary', 'ideas',
  'quote', 'quotes', 'rating', 'color', 'category', 'cover_key', 'created_at'];
const BUCKET = 'book-covers';

// --------------------------------------------------------------- Postgres

async function revisarPostgres() {
  titulo('1. Supabase Postgres');

  const url = process.env.DATABASE_URL;
  if (!url) {
    bad('DATABASE_URL no está definida.');
    pista('Supabase → botón Connect → Transaction pooler. Cópiala a .env.local.');
    return;
  }
  if (url.includes('usuario:password@host')) {
    bad('DATABASE_URL sigue teniendo el valor de ejemplo de .env.example.');
    return;
  }
  if (url.includes('[YOUR-PASSWORD]') && !process.env.DATABASE_PASSWORD) {
    bad('DATABASE_URL conserva el marcador [YOUR-PASSWORD] y no hay DATABASE_PASSWORD.');
    pista('Lo más seguro: deja el marcador y pon la contraseña en crudo en DATABASE_PASSWORD.');
    return;
  }

  let u;
  try { u = new URL(url); } catch {
    bad('DATABASE_URL no es una URL válida.');
    return;
  }
  ok(`Host: ${u.hostname}:${u.port || 5432}`);
  info(`Base: ${u.pathname.slice(1) || '(no especificada)'} · usuario: ${u.username || '(ninguno)'}`);

  if (u.hostname.includes('pooler.supabase.com')) {
    if (u.port === '6543') ok('Usa el transaction pooler (puerto 6543), lo correcto para funciones serverless.');
    else if (u.port === '5432') warn('Usa el session pooler (5432). Funciona, pero el transaction pooler (6543) aguanta mejor el serverless.');
  } else if (u.hostname.startsWith('db.') && u.hostname.endsWith('.supabase.co')) {
    warn('Es la conexión directa, no el pooler. En Vercel se agotan las conexiones rápido.');
    pista('Usa la cadena "Transaction pooler" del botón Connect.');
  } else {
    warn('El host no parece de Supabase. Confirma que es la cadena correcta.');
  }

  const passwordSuelta = process.env.DATABASE_PASSWORD;
  if (passwordSuelta) {
    ok(`Contraseña tomada de DATABASE_PASSWORD, en crudo (${passwordSuelta.length} caracteres). Sin percent-encoding de por medio.`);
  }

  // Un "%" sin codificar en la contraseña hace que pg lance "URI malformed" antes de
  // intentar conectar siquiera: en una URL, % inicia una secuencia de escape. Y si va
  // seguido de dos dígitos hexadecimales, es peor: no da error, decodifica a otro
  // carácter y la contraseña llega mal en silencio.
  const userinfo = url.slice(url.indexOf('://') + 3, url.lastIndexOf('@'));
  const passBruta = userinfo.slice(userinfo.indexOf(':') + 1);
  if (!passwordSuelta && passBruta.includes('%')) {
    let decodificada = null;
    try { decodificada = decodeURIComponent(passBruta); } catch { /* malformada */ }
    if (decodificada === null) {
      bad('La contraseña contiene un "%" que no forma una secuencia de escape válida.');
      pista('pg fallará con "URI malformed". Escribe cada % literal de la contraseña como %25.');
      return;
    }
    if (decodificada !== passBruta) {
      info(`La contraseña lleva secuencias %XX; se decodificarán a ${decodificada.length} caracteres. Correcto si tu contraseña real contiene esos símbolos.`);
    }
  }

  let Client;
  try {
    const pg = await import('pg');
    // `pg` es CommonJS: según el interop puede exponer Client como named export o dentro
    // de `default`. Se cubren los dos casos.
    Client = pg.Client ?? pg.default?.Client;
  } catch { bad('No se pudo importar `pg`. Ejecuta `npm install`.'); return; }
  if (!Client) { bad('`pg` se importó pero no expone Client. Reinstala las dependencias.'); return; }

  // La construcción va dentro del try: pg parsea la cadena aquí y puede lanzar antes
  // de que exista ninguna conexión.
  let cliente;
  const t0 = Date.now();
  try {
    // No se pasa `connectionString`: pg-connection-string interpreta sslmode=require como
    // verify-full, y eso gana sobre la opción `ssl`, lo que rompe contra la cadena de
    // certificados del pooler de Supabase. Con campos explícitos, TLS se decide aquí.
    cliente = new Client({
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: passwordSuelta ?? decodeURIComponent(u.password),
      database: u.pathname.slice(1) || 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    await cliente.connect();
    const { rows } = await cliente.query('select version() as version, current_database() as db, current_user as rol, now() as ahora');
    ok(`Conexión establecida en ${Date.now() - t0} ms`);
    info(String(rows[0].version).split(',')[0]);
    info(`Base: ${rows[0].db} · rol: ${rows[0].rol} · hora: ${rows[0].ahora.toISOString?.() ?? rows[0].ahora}`);
  } catch (e) {
    bad(`Fallo al conectar: ${e.message}`);
    diagnosticarPostgres(e);
    await cliente?.end().catch(() => {});
    return;
  }

  try {
    const { rows: cols } = await cliente.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'books'
      order by ordinal_position`);

    if (!cols.length) {
      bad('La tabla public.books no existe.');
      pista('Aplica supabase/migrations/20260816000001_crear_tabla_books.sql.');
      await cliente.end().catch(() => {});
      return;
    }
    ok(`books tiene ${cols.length} columna(s)`);
    for (const c of cols) info(`${c.column_name.padEnd(12)} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`);

    const presentes = cols.map((c) => c.column_name);
    const faltan = COLUMNAS_ESPERADAS.filter((c) => !presentes.includes(c));
    if (faltan.length) bad(`Faltan columnas que usan las rutas de /api/books: ${faltan.join(', ')}`);
    else ok('Todas las columnas de selectColumns están presentes.');

    const { rows: [seguridad] } = await cliente.query(`
      select c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p
               where p.schemaname='public' and p.tablename='books') as politicas
      from pg_class c where c.oid = 'public.books'::regclass`);
    if (seguridad.rls && seguridad.politicas === 0) {
      ok('RLS activo con 0 políticas: la API de datos queda cerrada y la app conserva acceso.');
    } else if (!seguridad.rls) {
      warn('RLS desactivado: cualquiera con la clave anon podría leer y escribir books por PostgREST.');
      pista('alter table public.books enable row level security;');
    } else {
      info(`RLS activo con ${seguridad.politicas} política(s). Revisa que sean las que esperas.`);
    }

    const { rows: [{ total }] } = await cliente.query('select count(*)::int as total from books');
    ok(`Filas en books: ${total}`);
    if (total > 0) {
      const { rows: muestra } = await cliente.query('select id, title, author, status, cover_key from books order by id desc limit 5');
      for (const b of muestra) {
        info(`· [${b.id}] ${b.title} — ${b.author} (${b.status})${b.cover_key ? ` · portada: ${String(b.cover_key).slice(0, 55)}…` : ' · sin portada'}`);
      }
      const { rows: [portadas] } = await cliente.query(`
        select count(*) filter (where cover_key <> '')::int as con_portada,
               count(*) filter (where cover_key <> '' and cover_key not like 'https://%')::int as heredadas
        from books`);
      info(`Con portada: ${portadas.con_portada} · con cover_key heredado no-URL: ${portadas.heredadas}`);
      if (portadas.heredadas > 0) warn('Esos cover_key no son URLs absolutas: /api/covers/[key] los rechaza con 404.');
    }

    if (permitirEscritura) {
      const { rows: [creada] } = await cliente.query(
        `insert into books (title, author, year, status, summary, ideas, quote, quotes,
                            rating, color, category, cover_key, created_at)
         values ($1,'script','','Por leer','','[]','','[]',0,'ink','Literatura','',$2)
         returning id`,
        [`__diagnostico__ ${Date.now()}`, new Date().toISOString()],
      );
      ok(`INSERT correcto (id ${creada.id}).`);
      const { rowCount } = await cliente.query('delete from books where id = $1', [creada.id]);
      if (rowCount === 1) ok('DELETE correcto. La base es escribible y el rol tiene permisos.');
      else bad(`El INSERT funcionó pero la fila id ${creada.id} no se borró. Bórrala a mano.`);
    } else {
      info('Escritura no probada. Añade --escribir para un INSERT/DELETE de prueba.');
    }
  } catch (e) {
    bad(`Fallo inspeccionando el esquema: ${e.message}`);
    diagnosticarPostgres(e);
  } finally {
    await cliente.end().catch(() => {});
  }
}

function diagnosticarPostgres(e) {
  const m = `${e.message} ${e.code ?? ''}`.toLowerCase();
  if (m.includes('uri malformed')) {
    pista('La contraseña de DATABASE_URL tiene un "%" sin codificar. Escríbelo como %25.');
  } else if (m.includes('tenant or user not found')) {
    pista('Error típico del pooler: el usuario o el host no corresponden a este proyecto.');
    pista('Copia la cadena completa desde Supabase → Connect → Transaction pooler, sin editarla a mano.');
  } else if (m.includes('password authentication') || m.includes('28p01')) {
    pista('Contraseña incorrecta. Ponla en crudo en DATABASE_PASSWORD, sin tocar la URL.');
    pista('Si no la recuerdas: Supabase → Settings → Database → Reset database password.');
  } else if (m.includes('enotfound') || m.includes('eai_again')) {
    pista('No se resuelve el host. Revisa typos y que el proyecto no esté pausado.');
  } else if (m.includes('etimedout') || m.includes('timeout')) {
    pista('Timeout. Si el proyecto estaba pausado, tarda un par de minutos en levantar.');
  } else if (m.includes('econnrefused')) {
    pista('Conexión rechazada: el proyecto puede seguir arrancando o restaurándose.');
  } else if (m.includes('self-signed') || m.includes('certificate')) {
    pista('TLS: la cadena de certificados del pooler no se pudo validar.');
    pista('Suele ser sslmode=require en la URL, que pg interpreta como verify-full e ignora rejectUnauthorized:false.');
    pista('Este script ya descompone la URL en campos explícitos para evitarlo. Si persiste, revisa si hay un proxy TLS en medio.');
  } else if (m.includes('does not exist') && m.includes('relation')) {
    pista('Falta la tabla. Aplica las migraciones de supabase/migrations/.');
  }
}

// ---------------------------------------------------------------- Storage

async function revisarStorage() {
  titulo('2. Supabase Storage');

  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) { bad('SUPABASE_URL no está definida.'); return; }
  if (!key) {
    bad('SUPABASE_SERVICE_ROLE_KEY no está definida.');
    pista('Supabase → Project Settings → API keys → service_role. No la subas al repositorio.');
    return;
  }
  ok(`URL del proyecto: ${base}`);
  ok(`Clave service_role: ${ocultar(key)}`);
  if (key.includes('xxxx')) { bad('La clave sigue siendo el marcador de .env.example.'); return; }

  const auth = { authorization: `Bearer ${key}`, apikey: key };

  // Estado del bucket.
  try {
    const r = await fetch(`${base}/storage/v1/bucket/${BUCKET}`, { headers: auth });
    if (r.status === 404) {
      bad(`El bucket "${BUCKET}" no existe en este proyecto.`);
      pista('Aplica supabase/migrations/20260816000002_crear_bucket_book_covers.sql.');
      return;
    }
    if (!r.ok) {
      bad(`No se pudo leer el bucket (HTTP ${r.status}).`);
      if (r.status === 401 || r.status === 403) pista('La clave service_role no es válida para este proyecto.');
      return;
    }
    const b = await r.json();
    ok(`Bucket "${BUCKET}" encontrado.`);
    if (b.public) ok('Es público: las portadas se sirven sin token.');
    else { bad('El bucket NO es público. Las portadas darán 400 en el navegador.'); }
    info(`Límite: ${b.file_size_limit ? `${Math.round(b.file_size_limit / 1024 / 1024)} MB` : 'sin límite'} · tipos: ${(b.allowed_mime_types ?? ['todos']).join(', ')}`);
  } catch (e) {
    bad(`No se pudo consultar el bucket: ${e.message}`);
    return;
  }

  // Subida, lectura pública y borrado, replicando lo que hace /api/covers.
  const ruta = `diagnostico/prueba-${Date.now()}.png`;
  // PNG real de 1x1 px: el bucket restringe los tipos MIME, así que no serviría texto plano.
  const contenido = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  try {
    const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${ruta}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'image/png' },
      body: contenido,
    });
    if (!r.ok) {
      bad(`Fallo al subir (HTTP ${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`);
      if (r.status === 401 || r.status === 403) pista('La clave service_role no autoriza escritura. ¿Copiaste la anon por error?');
      return;
    }
    ok('Subida correcta.');
  } catch (e) { bad(`No se pudo subir: ${e.message}`); return; }

  const urlPublica = `${base}/storage/v1/object/public/${BUCKET}/${ruta}`;
  try {
    const r = await fetch(urlPublica, { cache: 'no-store' });
    if (!r.ok) {
      bad(`Lectura pública sin token: HTTP ${r.status}.`);
      pista('Sin esto las portadas no cargan en el navegador.');
    } else {
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.equals(contenido)) ok('Lectura pública sin token correcta y contenido íntegro.');
      else bad('La lectura pública devolvió un contenido distinto al subido.');
      info(`URL pública: ${urlPublica}`);
    }
  } catch (e) { bad(`No se pudo leer la URL pública: ${e.message}`); }

  try {
    const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'DELETE', headers: auth });
    if (r.ok) ok('Borrado del objeto de prueba correcto.');
    else { warn(`No se pudo borrar (HTTP ${r.status}).`); pista(`Bórralo a mano: ${BUCKET}/${ruta}`); }
  } catch (e) { warn(`No se pudo borrar: ${e.message}`); }
}

// -------------------------------------------------------------------- main

console.log(`${C.bold}Diagnóstico de conexión — Margen / Libroteca Virtual (Supabase)${C.reset}`);
if (!existsSync(resolve(process.cwd(), 'node_modules'))) warn('No hay node_modules. Ejecuta `npm install` antes de este script.');
if (!cargarEnv([valor('--env'), '.env.local', '.env'].filter(Boolean))) {
  warn('No se encontró .env.local ni .env. Se usarán solo las variables del entorno.');
}

if (!soloStorage) await revisarPostgres();
if (!soloDb) await revisarStorage();

titulo('Resultado');
console.log(fallos === 0 && avisos === 0
  ? `${C.green}Todo correcto. Supabase responde como espera la aplicación.${C.reset}`
  : `${fallos} fallo(s) · ${avisos} aviso(s)`);
process.exit(fallos > 0 ? 1 : 0);
