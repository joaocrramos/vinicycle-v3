// Carrega os dados de referência (P6). Idempotente.
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { carregarReferencia } from '../db/referencia';
import * as s from '../db/schema';

const url = process.env.DATABASE_URL_DONO;
if (!url) throw new Error('Defina DATABASE_URL_DONO');
const pool = new pg.Pool({ connectionString: url, max: 1 });
await carregarReferencia(drizzle(pool, { schema: s }));
await pool.end();
console.log('Dados de referência carregados.');
