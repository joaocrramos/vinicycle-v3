// EnoTrace › Vinhedos (cantina.md, Recepção, Origem): propriedades vitícolas e parcelas, próprias
// ou do produtor de uva. Cadastro mínimo em 2026; o resto fica para o VitiTrack. A parcela usada
// numa recepção não se apaga: inativa (P26).
import { consultaListagem, dadosPropriedade } from '@vinicycle/shared'
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { rotasInativacao } from '../../nucleo/inativacao'
import { buscaTexto, listar } from '../../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'

const F = 'enotrace.cadastros'

const nomeDono = sql<
  string | null
>`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = propriedade.dono_id)`

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.propriedade)
    .where(and(eq(s.propriedade.id, id), eq(s.propriedade.empresaId, ctx.empresaId)))
  if (!p) throw new ErroNaoEncontrado('Propriedade não encontrada.')
  return p
}

async function conferir(ctx: ContextoEmpresa, d: z.output<typeof dadosPropriedade>) {
  if (d.donoId) {
    const [p] = await ctx.tx
      .select({ id: s.pessoa.id })
      .from(s.pessoa)
      .where(and(eq(s.pessoa.id, d.donoId), eq(s.pessoa.empresaId, ctx.empresaId)))
    if (!p) throw new ErroRegra('Dono inválido.', 'dono')
  }
  const variedades = [...new Set(d.parcelas.flatMap((x) => (x.variedadeId ? [x.variedadeId] : [])))]
  if (variedades.length) {
    const ok = await ctx.tx
      .select({ id: s.variedade.id })
      .from(s.variedade)
      .where(
        and(
          inArray(s.variedade.id, variedades),
          or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
        ),
      )
    if (ok.length !== variedades.length) throw new ErroRegra('Variedade inválida.', 'variedade')
  }
  const nomes = d.parcelas.map((x) => x.nome.toLowerCase())
  if (new Set(nomes).size !== nomes.length)
    throw new ErroRegra('Há parcelas com o mesmo nome.', 'parcela_duplicada')
}

const valores = (d: z.output<typeof dadosPropriedade>) => ({
  nome: d.nome,
  donoId: d.donoId ?? null,
  numeroSivibe: d.numeroSivibe ?? null,
  municipio: d.municipio ?? null,
  uf: d.uf ?? null,
  codigoIbge: d.codigoIbge ?? null,
  observacoes: d.observacoes ?? null,
})

/** Parcelas pelo id: as que saem da lista são inativadas, nunca apagadas (P26). */
async function gravarParcelas(
  ctx: ContextoEmpresa,
  propriedadeId: string,
  parcelas: z.output<typeof dadosPropriedade>['parcelas'],
) {
  const atuais = await ctx.tx
    .select({ id: s.parcela.id })
    .from(s.parcela)
    .where(eq(s.parcela.propriedadeId, propriedadeId))
  const ficam = new Set(parcelas.flatMap((x) => (x.id ? [x.id] : [])))
  for (const a of atuais) {
    if (!ficam.has(a.id)) {
      await ctx.tx
        .update(s.parcela)
        .set({ ativo: false, inativadoEm: sql`now()`, inativadoPor: ctx.usuarioId })
        .where(eq(s.parcela.id, a.id))
    }
  }
  for (const x of parcelas) {
    const v = {
      nome: x.nome,
      variedadeId: x.variedadeId ?? null,
      areaHa: x.areaHa ?? null,
      ativo: x.ativo,
      inativadoEm: x.ativo ? null : sql`coalesce(inativado_em, now())`,
    }
    if (x.id && atuais.some((a) => a.id === x.id)) {
      await ctx.tx
        .update(s.parcela)
        .set({ ...v, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.parcela.id, x.id))
    } else {
      await ctx.tx.insert(s.parcela).values({
        ...v,
        inativadoEm: x.ativo ? null : sql`now()`,
        empresaId: ctx.empresaId,
        propriedadeId,
        criadoPor: ctx.usuarioId,
        atualizadoPor: ctx.usuarioId,
      })
    }
  }
}

function repetido(e: unknown): never {
  const c = (e as { cause?: { constraint?: string } }).cause?.constraint
  if (c === 'propriedade_nome')
    throw new ErroRegra('Já existe uma propriedade com este nome.', 'nome_duplicado')
  if (c === 'parcela_nome')
    throw new ErroRegra('Há parcelas com o mesmo nome.', 'parcela_duplicada')
  throw e
}

export async function rotasVinhedos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/propriedades', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({ situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos') })
        .parse(req.query)
      const filtro = and(
        eq(s.propriedade.empresaId, ctx.empresaId),
        q.situacao === 'todos' ? undefined : eq(s.propriedade.ativo, q.situacao === 'ativos'),
        buscaTexto(q.busca, [
          s.propriedade.nome,
          s.propriedade.numeroSivibe,
          s.propriedade.municipio,
          nomeDono,
        ]),
      )
      return listar({
        consulta: q,
        ordenaveis: { nome: s.propriedade.nome, municipio: s.propriedade.municipio },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.propriedade).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.propriedade.id,
              nome: s.propriedade.nome,
              dono: nomeDono,
              numeroSivibe: s.propriedade.numeroSivibe,
              municipio: s.propriedade.municipio,
              uf: s.propriedade.uf,
              parcelas: sql<number>`(select count(*)::int from parcela x where x.propriedade_id = propriedade.id and x.ativo)`,
              areaHa: sql<
                string | null
              >`(select sum(x.area_ha) from parcela x where x.propriedade_id = propriedade.id and x.ativo)`,
              ativo: s.propriedade.ativo,
            })
            .from(s.propriedade)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  /** Para a recepção: propriedades ativas de um dono (vazio = as da própria empresa), com parcelas. */
  app.get('/api/propriedades/opcoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const { donoId } = z.object({ donoId: z.uuid().optional() }).parse(req.query)
      const props = await ctx.tx
        .select({
          id: s.propriedade.id,
          nome: s.propriedade.nome,
          numeroSivibe: s.propriedade.numeroSivibe,
        })
        .from(s.propriedade)
        .where(
          and(
            eq(s.propriedade.empresaId, ctx.empresaId),
            eq(s.propriedade.ativo, true),
            donoId ? eq(s.propriedade.donoId, donoId) : isNull(s.propriedade.donoId),
          ),
        )
        .orderBy(asc(s.propriedade.nome))
      const parcelas = props.length
        ? await ctx.tx
            .select({
              id: s.parcela.id,
              propriedadeId: s.parcela.propriedadeId,
              nome: s.parcela.nome,
              variedadeId: s.parcela.variedadeId,
            })
            .from(s.parcela)
            .where(
              and(
                inArray(
                  s.parcela.propriedadeId,
                  props.map((p) => p.id),
                ),
                eq(s.parcela.ativo, true),
              ),
            )
            .orderBy(asc(s.parcela.nome))
        : []
      return props.map((p) => ({
        ...p,
        parcelas: parcelas.filter((x) => x.propriedadeId === p.id),
      }))
    }),
  )

  app.get<{ Params: { id: string } }>('/api/propriedades/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      const parcelas = await ctx.tx
        .select({
          id: s.parcela.id,
          nome: s.parcela.nome,
          variedadeId: s.parcela.variedadeId,
          areaHa: s.parcela.areaHa,
          ativo: s.parcela.ativo,
        })
        .from(s.parcela)
        .where(eq(s.parcela.propriedadeId, p.id))
        .orderBy(asc(s.parcela.nome))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = p
      return { ...resto, parcelas }
    }),
  )

  app.post('/api/propriedades', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosPropriedade.parse(req.body)
      await conferir(ctx, d)
      const [p] = await ctx.tx
        .insert(s.propriedade)
        .values({
          ...valores(d),
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.propriedade.id })
        .catch(repetido)
      await gravarParcelas(ctx, p!.id, d.parcelas).catch(repetido)
      await ctx.auditar({ acao: 'criar', entidade: 'propriedade', registroId: p!.id, depois: d })
      return { id: p!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/propriedades/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosPropriedade.parse(req.body)
      const atual = await carregar(ctx, id)
      conferirVersao(atual.versao, d.versao)
      await conferir(ctx, d)
      await ctx.tx
        .update(s.propriedade)
        .set({
          ...valores(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.propriedade.versao} + 1`,
        })
        .where(eq(s.propriedade.id, id))
        .catch(repetido)
      await gravarParcelas(ctx, id, d.parcelas).catch(repetido)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'propriedade',
        registroId: id,
        antes: valores({ ...atual, parcelas: [] } as never),
        depois: d,
      })
      return { ok: true }
    }),
  )

  rotasInativacao(app, {
    url: '/api/propriedades',
    tabela: s.propriedade,
    entidade: 'propriedade',
    funcionalidade: F,
  })
}
