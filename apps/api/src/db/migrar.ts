// Aplica as migrações com o papel dono do esquema (P6).
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function migrar(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      // Em desenvolvimento, apps/api/drizzle; no pacote de produção, PASTA_MIGRACOES.
      migrationsFolder:
        process.env.PASTA_MIGRACOES ?? fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
