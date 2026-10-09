// Gestão › Pessoas (P2; gestao.md, Pessoas): cadastro único com papéis. Quem é fornecedor e
// cliente fica cadastrado uma vez só; os campos de cada papel ficam em extensões.
import {
  CODIGOS_PAPEL,
  consultaListagem,
  type DadosPessoa,
  dadosPessoa,
  motivo,
} from '@vinicycle/shared'
import { and, asc, count, eq, notInArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../db/cliente'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoAutenticado, ErroNaoEncontrado } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { atualizarFicha, criarFicha, lerFicha, resumoFicha } from './fichas'

const F = 'gestao.pessoas'

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.pessoa)
    .where(and(eq(s.pessoa.id, id), eq(s.pessoa.empresaId, ctx.empresaId)))
  if (!p) throw new ErroNaoEncontrado('Pessoa não encontrada.')
  return p
}

/** Papéis, extensões e contatos, no formato do esquema de entrada. */
export async function lerComplementos(tx: Tx, pessoaId: string) {
  const papeis = await tx
    .select({ papel: s.pessoaPapel.papel })
    .from(s.pessoaPapel)
    .where(and(eq(s.pessoaPapel.pessoaId, pessoaId), eq(s.pessoaPapel.ativo, true)))
  const um = async <T>(q: Promise<T[]>) => (await q)[0]
  const sem = <T extends Record<string, unknown>>(r: T | undefined) => {
    if (!r) return undefined
    const { pessoaId: _p, empresaId: _e, ...resto } = r
    return resto
  }
  return {
    papeis: papeis.map((p) => p.papel as DadosPessoa['papeis'][number]),
    cliente: sem(
      await um(tx.select().from(s.pessoaCliente).where(eq(s.pessoaCliente.pessoaId, pessoaId))),
    ),
    fornecedor: sem(
      await um(
        tx.select().from(s.pessoaFornecedor).where(eq(s.pessoaFornecedor.pessoaId, pessoaId)),
      ),
    ),
    produtorUva: sem(
      await um(
        tx.select().from(s.pessoaProdutorUva).where(eq(s.pessoaProdutorUva.pessoaId, pessoaId)),
      ),
    ),
    funcionario: sem(
      await um(
        tx.select().from(s.pessoaFuncionario).where(eq(s.pessoaFuncionario.pessoaId, pessoaId)),
      ),
    ),
    laboratorio: sem(
      await um(
        tx.select().from(s.pessoaLaboratorio).where(eq(s.pessoaLaboratorio.pessoaId, pessoaId)),
      ),
    ),
    rt: sem(await um(tx.select().from(s.pessoaRt).where(eq(s.pessoaRt.pessoaId, pessoaId)))),
    fabricante: {
      marcas: (
        await tx
          .select({ marca: s.pessoaFabricanteMarca.marca })
          .from(s.pessoaFabricanteMarca)
          .where(eq(s.pessoaFabricanteMarca.pessoaId, pessoaId))
          .orderBy(asc(s.pessoaFabricanteMarca.marca))
      ).map((m) => m.marca),
    },
    transportador: {
      placas: (
        await tx
          .select({ placa: s.pessoaTransportadorPlaca.placa })
          .from(s.pessoaTransportadorPlaca)
          .where(eq(s.pessoaTransportadorPlaca.pessoaId, pessoaId))
          .orderBy(asc(s.pessoaTransportadorPlaca.placa))
      ).map((p) => p.placa),
    },
    contatos: (
      await tx
        .select()
        .from(s.pessoaContato)
        .where(eq(s.pessoaContato.pessoaId, pessoaId))
        .orderBy(asc(s.pessoaContato.nome))
    ).map(({ nome, cargo, emails, telefones }) => ({ nome, cargo, emails, telefones })),
  }
}

/** Grava papéis, extensões e contatos. Papel retirado fica inativo; os dados dele são mantidos. */
async function gravarComplementos(
  tx: Tx,
  empresaId: string,
  pessoaId: string,
  d: DadosPessoa,
): Promise<void> {
  const base = { pessoaId, empresaId }
  await tx
    .update(s.pessoaPapel)
    .set({ ativo: false })
    .where(and(eq(s.pessoaPapel.pessoaId, pessoaId), notInArray(s.pessoaPapel.papel, d.papeis)))
  for (const papel of d.papeis) {
    await tx
      .insert(s.pessoaPapel)
      .values({ ...base, papel })
      .onConflictDoUpdate({
        target: [s.pessoaPapel.pessoaId, s.pessoaPapel.papel],
        set: { ativo: true },
      })
  }
  const tem = (p: DadosPessoa['papeis'][number]) => d.papeis.includes(p)
  const upsert = async <T extends Record<string, unknown>>(
    tabela: typeof s.pessoaCliente,
    valores: T | undefined,
  ) => {
    if (!valores) return
    await tx
      .insert(tabela)
      .values({ ...base, ...valores } as never)
      .onConflictDoUpdate({ target: tabela.pessoaId, set: valores as never })
  }
  if (tem('cliente')) await upsert(s.pessoaCliente, d.cliente)
  if (tem('fornecedor')) await upsert(s.pessoaFornecedor as never, d.fornecedor)
  if (tem('produtor_uva')) await upsert(s.pessoaProdutorUva as never, d.produtorUva)
  if (tem('funcionario')) await upsert(s.pessoaFuncionario as never, d.funcionario)
  if (tem('laboratorio')) await upsert(s.pessoaLaboratorio as never, d.laboratorio)
  if (tem('responsavel_tecnico')) await upsert(s.pessoaRt as never, d.rt)
  if (tem('fabricante') && d.fabricante) {
    await tx.delete(s.pessoaFabricanteMarca).where(eq(s.pessoaFabricanteMarca.pessoaId, pessoaId))
    // Repetidas (sem diferenciar maiúsculas): fica a primeira grafia.
    const marcas = d.fabricante.marcas.filter(
      (m, i, todas) => todas.findIndex((x) => x.toLowerCase() === m.toLowerCase()) === i,
    )
    if (marcas.length)
      await tx.insert(s.pessoaFabricanteMarca).values(marcas.map((marca) => ({ ...base, marca })))
  }
  if (tem('transportador') && d.transportador) {
    await tx
      .delete(s.pessoaTransportadorPlaca)
      .where(eq(s.pessoaTransportadorPlaca.pessoaId, pessoaId))
    const placas = [...new Set(d.transportador.placas)]
    if (placas.length)
      await tx
        .insert(s.pessoaTransportadorPlaca)
        .values(placas.map((placa) => ({ ...base, placa })))
  }
  await tx.delete(s.pessoaContato).where(eq(s.pessoaContato.pessoaId, pessoaId))
  if (d.contatos.length) {
    await tx.insert(s.pessoaContato).values(
      d.contatos.map((c) => ({
        ...base,
        nome: c.nome,
        cargo: c.cargo ?? null,
        emails: c.emails,
        telefones: c.telefones,
      })),
    )
  }
}

function resumoComplementos(d: Awaited<ReturnType<typeof lerComplementos>> | DadosPessoa) {
  const { papeis, contatos, ...extensoes } = d as DadosPessoa
  return { papeis: [...papeis].sort(), contatos, ...extensoes }
}

/** Cadastra a pessoa com a ficha (P2), os papéis e as extensões; também usada na importação de NF-e (P11). */
export async function criarPessoa(ctx: ContextoEmpresa, d: DadosPessoa): Promise<string> {
  const fichaId = await criarFicha(ctx.tx, d.ficha, 'pessoa', ctx.empresaId, ctx.usuarioId)
  const [p] = await ctx.tx
    .insert(s.pessoa)
    .values({
      empresaId: ctx.empresaId,
      fichaId,
      criadoPor: ctx.usuarioId,
      atualizadoPor: ctx.usuarioId,
    })
    .returning({ id: s.pessoa.id })
  await gravarComplementos(ctx.tx, ctx.empresaId, p!.id, d)
  await ctx.auditar({
    acao: 'criar',
    entidade: 'pessoa',
    registroId: p!.id,
    depois: { ...resumoFicha(d.ficha), ...resumoComplementos(d) },
  })
  return p!.id
}

export async function rotasPessoas(app: FastifyInstance): Promise<void> {
  const { db, consultas } = app.deps

  app.get('/api/pessoas', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          papel: z.enum(CODIGOS_PAPEL).optional(),
        })
        .parse(req.query)
      const filtro = and(
        eq(s.pessoa.empresaId, ctx.empresaId),
        q.situacao === 'todos' ? undefined : eq(s.pessoa.ativo, q.situacao === 'ativos'),
        q.papel
          ? sql`exists (select 1 from pessoa_papel pp where pp.pessoa_id = ${s.pessoa.id} and pp.papel = ${q.papel} and pp.ativo)`
          : undefined,
        buscaTexto(q.busca, [s.ficha.nome, s.ficha.nomeFantasia, s.ficha.documento]),
      )
      return listar({
        consulta: q,
        ordenaveis: { nome: s.ficha.nome, documento: s.ficha.documento },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.pessoa)
              .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.pessoa.id,
              nome: s.ficha.nome,
              nomeFantasia: s.ficha.nomeFantasia,
              tipoPessoa: s.ficha.tipoPessoa,
              documento: s.ficha.documento,
              ativo: s.pessoa.ativo,
              papeis: sql<
                string[]
              >`coalesce((select array_agg(pp.papel order by pp.papel) from pessoa_papel pp where pp.pessoa_id = ${s.pessoa.id} and pp.ativo), '{}')`,
              municipio: sql<
                string | null
              >`(select e.municipio || '/' || e.uf from ficha_endereco e where e.ficha_id = ${s.ficha.id} and e.principal limit 1)`,
              email: sql<
                string | null
              >`(select c.valor from ficha_contato c where c.ficha_id = ${s.ficha.id} and c.tipo = 'email' order by c.principal desc limit 1)`,
              telefone: sql<
                string | null
              >`(select c.valor from ficha_contato c where c.ficha_id = ${s.ficha.id} and c.tipo = 'telefone' limit 1)`,
            })
            .from(s.pessoa)
            .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  /** Lista curta para os campos de escolha (ex.: responsável técnico, fabricante). */
  app.get('/api/pessoas/opcoes', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      // Sem papel: todas as pessoas ativas (ex.: remetente e destinatário do granel).
      const { papel } = z.object({ papel: z.enum(CODIGOS_PAPEL).optional() }).parse(req.query)
      return ctx.tx
        .select({
          id: s.pessoa.id,
          nome: s.ficha.nome,
          nomeFantasia: s.ficha.nomeFantasia,
          documento: s.ficha.documento,
        })
        .from(s.pessoa)
        .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
        .where(
          and(
            eq(s.pessoa.empresaId, ctx.empresaId),
            eq(s.pessoa.ativo, true),
            papel
              ? sql`exists (select 1 from pessoa_papel pp where pp.pessoa_id = pessoa.id and pp.papel = ${papel} and pp.ativo)`
              : undefined,
          ),
        )
        .orderBy(asc(s.ficha.nome))
        .limit(1000)
    }),
  )

  app.get<{ Params: { id: string } }>('/api/pessoas/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      return {
        id: p.id,
        ativo: p.ativo,
        versao: p.versao,
        motivoInativacao: p.motivoInativacao,
        ficha: await lerFicha(ctx.tx, p.fichaId),
        ...(await lerComplementos(ctx.tx, p.id)),
      }
    }),
  )

  app.post('/api/pessoas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosPessoa.parse(req.body)
      return { id: await criarPessoa(ctx, d) }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/pessoas/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosPessoa.parse(req.body)
      const p = await carregar(ctx, id)
      conferirVersao(p.versao, d.versao)
      const fichaAntes = await lerFicha(ctx.tx, p.fichaId)
      const antes = await lerComplementos(ctx.tx, id)
      await atualizarFicha(ctx.tx, p.fichaId, d.ficha, ctx.usuarioId)
      await gravarComplementos(ctx.tx, ctx.empresaId, id, d)
      await ctx.tx
        .update(s.pessoa)
        .set({
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.pessoa.versao} + 1`,
        })
        .where(eq(s.pessoa.id, id))
      const depois = await lerComplementos(ctx.tx, id)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'pessoa',
        registroId: id,
        antes: { ...resumoFicha(fichaAntes), ...resumoComplementos(antes) },
        depois: { ...resumoFicha(d.ficha), ...resumoComplementos(depois) },
      })
      return { ok: true }
    }),
  )

  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { id: string } }>(`/api/pessoas/:id/${acao}`, async (req) =>
      naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id)
        const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null
        await carregar(ctx, id)
        await ctx.tx
          .update(s.pessoa)
          .set(
            acao === 'inativar'
              ? {
                  ativo: false,
                  inativadoEm: sql`now()`,
                  inativadoPor: ctx.usuarioId,
                  motivoInativacao: m,
                }
              : { ativo: true, inativadoEm: null, inativadoPor: null, motivoInativacao: null },
          )
          .where(eq(s.pessoa.id, id))
        await ctx.auditar({ acao, entidade: 'pessoa', registroId: id, motivo: m })
        return { ok: true }
      }),
    )
  }

  // Busca de CEP e CNPJ (P2): só pré-preenche; o usuário confere.
  const limite = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
  app.get<{ Params: { cep: string } }>('/api/consultas/cep/:cep', limite, async (req) => {
    if (!req.sessao) throw new ErroNaoAutenticado()
    const r = await consultas.cep(req.params.cep)
    return r ? { encontrado: true, ...r } : { encontrado: false }
  })
  app.get<{ Params: { cnpj: string } }>('/api/consultas/cnpj/:cnpj', limite, async (req) => {
    if (!req.sessao) throw new ErroNaoAutenticado()
    const r = await consultas.cnpj(req.params.cnpj)
    return r ? { encontrado: true, ...r } : { encontrado: false }
  })
}
