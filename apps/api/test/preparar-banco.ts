// Recria o banco de testes do zero a cada execução: migrações e dados de referência (P6, P24).
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { migrar } from '../src/db/migrar';
import { carregarReferencia } from '../src/db/referencia';
import * as schema from '../src/db/schema';

export async function setup(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Sem .env (ex.: verificação no GitHub): as variáveis vêm do ambiente.
  }
  const url = process.env.DATABASE_URL_DONO_TESTE;
  if (!url) throw new Error('Defina DATABASE_URL_DONO_TESTE (veja .env.example)');
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  await pool.query(
    'drop schema if exists drizzle cascade; drop schema public cascade; create schema public;',
  );
  await pool.query('revoke create on schema public from public');
  await pool.end();
  await migrar(url);
  const p2 = new pg.Pool({ connectionString: url, max: 1 });
  await carregarReferencia(drizzle(p2, { schema }));
  // Os testes criam clientes no plano inicial: ele precisa de preço (os da produção são da
  // Administração).
  await p2.query(`insert into plano_preco (plano_id, periodicidade, valor, vigente_desde)
    select id, p, v, '2026-01-01' from plano,
      (values ('mensal', 300), ('trimestral', 850), ('semestral', 1650), ('anual', 3000)) x(p, v)
    where nome = 'Completo'`);
  await p2.end();
}
