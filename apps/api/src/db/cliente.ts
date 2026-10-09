// Conexão da API e contexto de cada transação (RLS; drizzle/0001_seguranca.sql).
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// Datas puras ("date") chegam como texto "AAAA-MM-DD", sem conversão de fuso (P18).
pg.types.setTypeParser(1082, (v) => v)

export function criarBanco(url: string, max = 10): { pool: pg.Pool; db: Db } {
  const pool = new pg.Pool({ connectionString: url, max })
  return { pool, db: drizzle(pool, { schema }) }
}

export interface ContextoBanco {
  usuarioId?: string | null
  empresaId?: string | null
  plataforma?: boolean
  autenticacao?: boolean
  sistema?: boolean
}

/** Abre uma transação com o contexto que as políticas de RLS conferem. */
export function emContexto<T>(db: Db, ctx: ContextoBanco, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await definirContexto(tx, ctx)
    return fn(tx)
  })
}

export async function definirContexto(tx: Tx, ctx: ContextoBanco): Promise<void> {
  await tx.execute(sql`select
    set_config('app.usuario_id', ${ctx.usuarioId ?? ''}, true),
    set_config('app.empresa_id', ${ctx.empresaId ?? ''}, true),
    set_config('app.plataforma', ${ctx.plataforma ? 'on' : ''}, true),
    set_config('app.autenticacao', ${ctx.autenticacao ? 'on' : ''}, true),
    set_config('app.sistema', ${ctx.sistema ? 'on' : ''}, true)`)
}
