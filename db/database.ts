import { neon } from "@neondatabase/serverless";

export type BookRow = { id:number; title:string; author:string; year:string; status:string; summary:string; ideas:string; quote:string; quotes:string; rating:number; color:string; category:string; coverKey:string; createdAt:string };

export function db(){
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)throw new Error("Falta DATABASE_URL. Conecta una base de datos Neon en Vercel o configúrala en .env.local.");
  return neon(connectionString);
}

export async function ensureSchema(){
  const database=db();
  await database.query(`CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    year TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Por leer',
    summary TEXT NOT NULL DEFAULT '',
    ideas TEXT NOT NULL DEFAULT '[]',
    quote TEXT NOT NULL DEFAULT '',
    quotes TEXT NOT NULL DEFAULT '[]',
    rating INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT 'ink',
    category TEXT NOT NULL DEFAULT 'Literatura',
    cover_key TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  await database.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Literatura'");
  await database.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS quotes TEXT NOT NULL DEFAULT '[]'");
  await database.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_key TEXT NOT NULL DEFAULT ''");
}

export const selectColumns='id, title, author, year, status, summary, ideas, quote, quotes, rating, color, category, cover_key AS "coverKey", created_at AS "createdAt"';
export function present(row:BookRow){
  let ideas:string[]=[], quotes:string[]=[];
  try{ const value=JSON.parse(row.ideas); ideas=Array.isArray(value)?value:[]; }catch{}
  try{ const value=JSON.parse(row.quotes); quotes=Array.isArray(value)?value.filter(item=>typeof item==="string"&&item.trim()):[]; }catch{}
  if(!quotes.length&&row.quote.trim())quotes=[row.quote.trim()];
  return {...row,ideas,quotes};
}
