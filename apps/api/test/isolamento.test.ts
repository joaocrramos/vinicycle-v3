// Isolamento entre empresas no próprio banco (02-arquitetura.md, Princípio 1; P8, aceite):
// mesmo uma consulta mal escrita não vê nem altera dados de outra empresa.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emContexto } from '../src/db/cliente';
import * as s from '../src/db/schema';
import { montar } from './apoio';

let t: Awaited<ReturnType<typeof montar>>;

/** Mensagem do PostgreSQL (o Drizzle embrulha o erro original em `cause`). */
async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const x = e as { cause?: { message?: string }; message?: string };
    return x.cause?.message ?? x.message ?? String(e);
  }
  return 'sem erro';
}
let a: { empresaId: string; estab: string; usuarioId: string };
let b: { empresaId: string; estab: string; usuarioId: string };

async function preparar() {
  const { master, empresaId } = await t.empresaComMaster();
  const estab = await t.criarEstabelecimento(master);
  const sessao = await master.get('/api/auth/sessao');
  return { empresaId, estab, usuarioId: sessao.corpo.usuario.id as string };
}

beforeAll(async () => {
  t = await montar();
  a = await preparar();
  b = await preparar();
});
afterAll(async () => {
  await t.fechar();
});

describe('RLS', () => {
  it('sem contexto, o papel da API não vê nada da empresa', async () => {
    const linhas = await emContexto(t.db, {}, (tx) => tx.select().from(s.estabelecimento));
    expect(linhas).toEqual([]);
    const empresas = await emContexto(t.db, {}, (tx) => tx.select().from(s.empresa));
    expect(empresas).toEqual([]);
  });

  it('a empresa A não vê os registros da B, nem filtrando pelo id', async () => {
    const r = await emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
      tx.select().from(s.estabelecimento).where(eq(s.estabelecimento.id, b.estab)),
    );
    expect(r).toEqual([]);
    const todos = await emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
      tx.select({ empresaId: s.estabelecimento.empresaId }).from(s.estabelecimento),
    );
    expect(new Set(todos.map((x) => x.empresaId))).toEqual(new Set([a.empresaId]));
  });

  it('a empresa A não grava na B', async () => {
    expect(
      await erroDe(
        emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
          tx.insert(s.local).values({
            empresaId: b.empresaId,
            estabelecimentoId: b.estab,
            nome: 'Invasão',
            uso: 'recipientes',
          }),
        ),
      ),
    ).toMatch(/row-level security/);
    const alterados = await emContexto(
      t.db,
      { usuarioId: a.usuarioId, empresaId: a.empresaId },
      (tx) =>
        tx
          .update(s.estabelecimento)
          .set({ registroMapa: 'X' })
          .where(eq(s.estabelecimento.id, b.estab))
          .returning(),
    );
    expect(alterados).toEqual([]);
  });

  it('a referência entre tabelas fica dentro da mesma empresa', async () => {
    // Mesmo com a política aberta (contexto da plataforma), a chave estrangeira composta impede o
    // local da empresa A apontar para o estabelecimento da B.
    expect(
      await erroDe(
        emContexto(t.db, { plataforma: true }, (tx) =>
          tx.insert(s.local).values({
            empresaId: a.empresaId,
            estabelecimentoId: b.estab,
            nome: 'Cruzado',
            uso: 'recipientes',
          }),
        ),
      ),
    ).toMatch(/foreign key/);
  });

  it('o usuário de A não vê o usuário de B', async () => {
    const r = await emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
      tx.select().from(s.usuario).where(eq(s.usuario.id, b.usuarioId)),
    );
    expect(r).toEqual([]);
  });

  it('a auditoria é somente inclusão para a API (P14)', async () => {
    expect(
      await erroDe(
        emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
          tx
            .update(s.auditoria)
            .set({ acao: 'adulterada' })
            .where(eq(s.auditoria.empresaId, a.empresaId)),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await erroDe(
        emContexto(t.db, { usuarioId: a.usuarioId, empresaId: a.empresaId }, (tx) =>
          tx.delete(s.auditoria).where(eq(s.auditoria.empresaId, a.empresaId)),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it('o papel da API não ignora o RLS nem é dono das tabelas', async () => {
    const r = await t.db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    expect(r.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const donas = await t.db.execute(
      sql`select tablename from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(donas.rows).toEqual([]);
    const semRls = await t.db.execute(
      sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(semRls.rows).toEqual([]);
  });

  it('a empresa não vê perfis-modelo nem perfis da plataforma (P27)', async () => {
    const perfis = await emContexto(
      t.db,
      { usuarioId: a.usuarioId, empresaId: a.empresaId },
      (tx) => tx.select({ escopo: s.perfil.escopo, empresaId: s.perfil.empresaId }).from(s.perfil),
    );
    expect(perfis.every((p) => p.escopo === 'empresa' && p.empresaId === a.empresaId)).toBe(true);
  });

  it('um só Master ativo por empresa, garantido no banco', async () => {
    const [m] = await t.dbDono.select().from(s.vinculo).where(eq(s.vinculo.empresaId, a.empresaId));
    expect(
      await erroDe(
        t.dbDono.insert(s.vinculo).values({
          empresaId: a.empresaId,
          usuarioId: b.usuarioId,
          perfilId: m!.perfilId,
          eMaster: true,
        }),
      ),
    ).toMatch(/vinculo_master|duplicate key/);
  });
});
