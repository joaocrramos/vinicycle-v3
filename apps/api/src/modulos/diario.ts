// Gestão › Diário (ambiente-cliente.md, Diário; 04, roteiro do ciclo 8): notas datadas por
// estabelecimento, com autor, anexos e vínculo opcional a projeto, recipiente ou parcela. As notas
// aparecem também na ficha do que foi vinculado. Alterar e inativar ficam na auditoria (P14).
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'gestao.diario'

const esquemaNota = z.object({
  data: z.iso.date('Informe a data'),
  texto: z.string().trim().min(2, 'Escreva a nota').max(5000),
  projetoId: z.uuid().nullable().optional(),
  recipienteId: z.uuid().nullable().optional(),
  parcelaId: z.uuid().nullable().optional(),
})

/** Os vínculos têm de ser da empresa (e o projeto e o recipiente, do estabelecimento). */
async function conferirVinculos(
  ctx: ContextoEmpresa,
  estab: string,
  d: z.infer<typeof esquemaNota>,
) {
  const confere = async (ok: boolean, nome: string) => {
    if (!ok) throw new ErroRegra(`${nome} não encontrado neste estabelecimento.`, 'vinculo')
  }
  if (d.projetoId) {
    const [p] = await ctx.tx
      .select({ e: s.projeto.estabelecimentoId })
      .from(s.projeto)
      .where(and(eq(s.projeto.id, d.projetoId), eq(s.projeto.empresaId, ctx.empresaId)))
    await confere(p?.e === estab, 'Projeto')
  }
  if (d.recipienteId) {
    const [r] = await ctx.tx
      .select({ e: s.recipiente.estabelecimentoId })
      .from(s.recipiente)
      .where(and(eq(s.recipiente.id, d.recipienteId), eq(s.recipiente.empresaId, ctx.empresaId)))
    await confere(r?.e === estab, 'Recipiente')
  }
  if (d.parcelaId) {
    const [p] = await ctx.tx
      .select({ id: s.parcela.id })
      .from(s.parcela)
      .where(and(eq(s.parcela.id, d.parcelaId), eq(s.parcela.empresaId, ctx.empresaId)))
    await confere(!!p, 'Parcela')
  }
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [n] = await ctx.tx
    .select()
    .from(s.diarioNota)
    .where(and(eq(s.diarioNota.id, id), eq(s.diarioNota.empresaId, ctx.empresaId)))
    .for('update')
  if (!n || n.estabelecimentoId !== ctx.exigirEstabelecimento() || !n.ativo)
    throw new ErroNaoEncontrado('Nota não encontrada.')
  return n
}

export async function rotasDiario(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/diario', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const q = z
        .object({
          projeto: z.uuid().optional(),
          recipiente: z.uuid().optional(),
          parcela: z.uuid().optional(),
          propriedade: z.uuid().optional(),
          de: z.iso.date().optional(),
          ate: z.iso.date().optional(),
          busca: z.string().trim().max(100).optional(),
        })
        .parse(req.query)
      const r = await ctx.tx.execute<{
        id: string
        data: string
        texto: string
        autor: string | null
        criado_por: string
        criado_em: string
        editada: boolean
        projeto_id: string | null
        projeto: string | null
        recipiente_id: string | null
        recipiente: string | null
        parcela_id: string | null
        parcela: string | null
        anexos: number
      }>(sql`
        select n.id, n.data::text as data, n.texto, n.criado_por, n.criado_em::text as criado_em,
          n.atualizado_em <> n.criado_em as editada, n.projeto_id, n.recipiente_id, n.parcela_id,
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = n.criado_por) as autor,
          (select p.codigo || ' · ' || p.nome from projeto p where p.id = n.projeto_id) as projeto,
          (select r.codigo from recipiente r where r.id = n.recipiente_id) as recipiente,
          (select pr.nome || ' · ' || pa.nome from parcela pa join propriedade pr on pr.id = pa.propriedade_id
            where pa.id = n.parcela_id) as parcela,
          (select count(*)::int from anexo a where a.entidade = 'diario_nota' and a.registro_id = n.id and a.ativo) as anexos
        from diario_nota n
        where n.estabelecimento_id = ${estab} and n.ativo
          ${q.projeto ? sql`and n.projeto_id = ${q.projeto}` : sql``}
          ${q.recipiente ? sql`and n.recipiente_id = ${q.recipiente}` : sql``}
          ${q.parcela ? sql`and n.parcela_id = ${q.parcela}` : sql``}
          ${q.propriedade ? sql`and n.parcela_id in (select id from parcela where propriedade_id = ${q.propriedade})` : sql``}
          ${q.de ? sql`and n.data >= ${q.de}::date` : sql``}
          ${q.ate ? sql`and n.data <= ${q.ate}::date` : sql``}
          ${q.busca ? sql`and n.texto ilike ${`%${q.busca.replace(/[%_\\]/g, '\\$&')}%`}` : sql``}
        order by n.data desc, n.criado_em desc limit 300`)
      return r.rows.map((n) => ({
        id: n.id,
        data: n.data,
        texto: n.texto,
        autor: n.autor,
        meu: n.criado_por === ctx.usuarioId,
        criadoEm: n.criado_em,
        editada: n.editada,
        projeto: n.projeto_id ? { id: n.projeto_id, nome: n.projeto } : null,
        recipiente: n.recipiente_id ? { id: n.recipiente_id, codigo: n.recipiente } : null,
        parcela: n.parcela_id ? { id: n.parcela_id, nome: n.parcela } : null,
        anexos: n.anexos,
      }))
    }),
  )

  app.post('/api/diario', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const d = esquemaNota.parse(req.body)
      await conferirVinculos(ctx, estab, d)
      const [n] = await ctx.tx
        .insert(s.diarioNota)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          data: d.data,
          texto: d.texto,
          projetoId: d.projetoId ?? null,
          recipienteId: d.recipienteId ?? null,
          parcelaId: d.parcelaId ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.diarioNota.id })
      await ctx.auditar({ acao: 'criar', entidade: 'diario_nota', registroId: n!.id, dados: d })
      return { id: n!.id }
    }),
  )

  /** O autor altera a própria nota; os demais precisam da ação "editar". */
  app.put<{ Params: { id: string } }>('/api/diario/:id', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const n = await carregar(ctx, z.uuid().parse(req.params.id))
      if (n.criadoPor !== ctx.usuarioId) ctx.exigir(F, 'editar')
      const d = esquemaNota.parse(req.body)
      await conferirVinculos(ctx, n.estabelecimentoId, d)
      const novo = {
        data: d.data,
        texto: d.texto,
        projetoId: d.projetoId ?? null,
        recipienteId: d.recipienteId ?? null,
        parcelaId: d.parcelaId ?? null,
      }
      await ctx.tx
        .update(s.diarioNota)
        .set({ ...novo, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.diarioNota.id, n.id))
      await ctx.auditar({
        acao: 'editar',
        entidade: 'diario_nota',
        registroId: n.id,
        dados: {
          antes: {
            data: n.data,
            texto: n.texto,
            projetoId: n.projetoId,
            recipienteId: n.recipienteId,
            parcelaId: n.parcelaId,
          },
          depois: novo,
        },
      })
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/diario/:id/inativar', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const n = await carregar(ctx, z.uuid().parse(req.params.id))
      if (n.criadoPor !== ctx.usuarioId) ctx.exigir(F, 'inativar')
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body)
      await ctx.tx
        .update(s.diarioNota)
        .set({
          ativo: false,
          inativadoEm: new Date(),
          inativadoPor: ctx.usuarioId,
          motivoInativacao: motivo,
        })
        .where(eq(s.diarioNota.id, n.id))
      await ctx.auditar({
        acao: 'inativar',
        entidade: 'diario_nota',
        registroId: n.id,
        motivo,
        dados: {},
      })
      return { ok: true }
    }),
  )
}
