// Gestão › Aprovações (P27, Fluxo de aprovação; 04, roteiro do ciclo 8): a lista de pedidos
// pendentes com uma caixa de marcar ao lado (marcou, aprovou, saiu da tela), a recusa com motivo, os
// pedidos de cada um e o histórico. Aprovado, o pedido é feito na hora, com os dados de quando foi
// feito; se algo mudou (outra operação, o inventário alterado), a ação não é feita e quem pediu vê
// o motivo. Quem pediu não aprova o próprio pedido, exceto o Master.
import { TIPOS_APROVACAO, type TipoAprovacao } from '@vinicycle/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { ErroAplicacao, ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { abrirRetificacao, type Tipo as TipoDeclaracao } from './declaracoes'
import { reabrirMes } from './fechamento'
import { efetivarInventario } from './producao/inventarios'
import { estornarOperacao } from './producao/operacoes'

const F = 'gestao.aprovacoes'

type Solicitacao = typeof s.solicitacaoAprovacao.$inferSelect

/** Faz a ação aprovada com os dados do pedido. */
const EXECUTORES: Record<
  TipoAprovacao,
  (ctx: ContextoEmpresa, p: Solicitacao) => Promise<unknown>
> = {
  inventario: (ctx, p) => {
    const d = p.dados as {
      inventarioId: string
      versao: number
      ajustes: string
      responsavelId: string | null
      cientes: string[]
    }
    return efetivarInventario(
      ctx,
      d.inventarioId,
      { responsavelId: d.responsavelId, cientes: d.cientes },
      { versao: d.versao, ajustes: d.ajustes },
    )
  },
  estorno: (ctx, p) => {
    const d = p.dados as { operacaoId: string; motivo: string }
    return estornarOperacao(ctx, d.operacaoId, d.motivo)
  },
  reabertura: (ctx, p) => {
    const d = p.dados as { ano: number; mes: number; motivo: string }
    return reabrirMes(ctx, p.estabelecimentoId, d.ano, d.mes, d.motivo, p.solicitadoPor)
  },
  retificacao: (ctx, p) => {
    const d = p.dados as { ano: number; tipo: TipoDeclaracao; motivo: string }
    return abrirRetificacao(ctx, p.estabelecimentoId, d.ano, d.tipo, d.motivo, p.solicitadoPor)
  },
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.solicitacaoAprovacao)
    .where(
      and(eq(s.solicitacaoAprovacao.id, id), eq(s.solicitacaoAprovacao.empresaId, ctx.empresaId)),
    )
    .for('update')
  if (!p || p.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Pedido não encontrado neste estabelecimento.')
  return p
}

export async function rotasAprovacoes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  /**
   * pendentes: os do estabelecimento (quem aprova vê todos; os demais, os seus);
   * minhas: os pedidos do usuário; historico: os decididos.
   */
  app.get('/api/aprovacoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { escopo } = z
        .object({ escopo: z.enum(['pendentes', 'minhas', 'historico']).default('pendentes') })
        .parse(req.query)
      const aprova = ctx.acesso.eMaster || ctx.acesso.permissoes.has(`${F}:aprovar`)
      const filtro =
        escopo === 'pendentes'
          ? sql`s.situacao = 'pendente' ${aprova ? sql`` : sql`and s.solicitado_por = ${ctx.usuarioId}`}`
          : escopo === 'minhas'
            ? sql`s.solicitado_por = ${ctx.usuarioId}`
            : sql`s.situacao <> 'pendente' ${aprova ? sql`` : sql`and s.solicitado_por = ${ctx.usuarioId}`}`
      const r = await ctx.tx.execute<{
        id: string
        tipo: TipoAprovacao
        resumo: string
        situacao: string
        solicitado_por: string
        solicitante: string | null
        solicitado_em: string
        decisor: string | null
        decidido_em: string | null
        motivo: string | null
        erro: string | null
        visto_em: string | null
        entidade: string
        registro_id: string
      }>(sql`
        select s.id, s.tipo, s.resumo, s.situacao, s.solicitado_por, s.solicitado_em::text as solicitado_em,
          s.decidido_em::text as decidido_em, s.motivo, s.erro, s.visto_em::text as visto_em, s.entidade, s.registro_id,
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = s.solicitado_por) as solicitante,
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = s.decidido_por) as decisor
        from solicitacao_aprovacao s
        where s.estabelecimento_id = ${estab} and ${filtro}
        order by s.solicitado_em desc limit 200`)
      return {
        podeAprovar: aprova,
        itens: r.rows.map((x) => ({
          id: x.id,
          tipo: x.tipo,
          nomeTipo: TIPOS_APROVACAO[x.tipo],
          resumo: x.resumo,
          situacao: x.situacao,
          solicitante: x.solicitante,
          solicitadoEm: x.solicitado_em,
          meu: x.solicitado_por === ctx.usuarioId,
          // O Master aprova até o próprio pedido (empresa de um usuário só).
          podeDecidir:
            x.situacao === 'pendente' &&
            aprova &&
            (x.solicitado_por !== ctx.usuarioId || ctx.acesso.eMaster),
          decisor: x.decisor,
          decididoEm: x.decidido_em,
          motivo: x.motivo,
          erro: x.erro,
          visto: !!x.visto_em,
          link:
            x.entidade === 'operacao'
              ? `/enotrace/operacoes/${x.registro_id}`
              : x.entidade === 'inventario_cantina'
                ? `/enotrace/inventarios/${x.registro_id}`
                : x.entidade === 'fechamento_mensal'
                  ? '/enotrace/fechamento'
                  : '/enotrace/declaracoes',
        })),
      }
    }),
  )

  /** Aprovar = fazer a ação agora. Se ela não puder ser feita, o pedido fica "não feito", com o motivo. */
  app.post<{ Params: { id: string } }>('/api/aprovacoes/:id/aprovar', async (req) =>
    naEmpresa(db, req, [F, 'aprovar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      if (p.situacao !== 'pendente') throw new ErroRegra('O pedido já foi decidido.', 'decidido')
      if (p.solicitadoPor === ctx.usuarioId && !ctx.acesso.eMaster)
        throw new ErroRegra('Quem pediu não aprova o próprio pedido.', 'proprio')
      // Ponto de retorno: se a ação falhar, desfaz só ela e registra a falha no pedido.
      await ctx.tx.execute(sql`savepoint aprovacao`)
      let erro: string | null = null
      try {
        await EXECUTORES[p.tipo](ctx, p)
        await ctx.tx.execute(sql`release savepoint aprovacao`)
      } catch (e) {
        if (!(e instanceof ErroAplicacao)) throw e
        await ctx.tx.execute(sql`rollback to savepoint aprovacao`)
        erro = e.message
      }
      await ctx.tx
        .update(s.solicitacaoAprovacao)
        .set({
          situacao: erro ? 'falhou' : 'aprovada',
          decididoPor: ctx.usuarioId,
          decididoEm: new Date(),
          erro,
        })
        .where(eq(s.solicitacaoAprovacao.id, p.id))
      await ctx.auditar({
        acao: 'aprovar',
        entidade: 'solicitacao_aprovacao',
        registroId: p.id,
        dados: { tipo: p.tipo, resumo: p.resumo, feito: !erro, erro },
      })
      return { situacao: erro ? 'falhou' : 'aprovada', erro }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/aprovacoes/:id/recusar', async (req) =>
    naEmpresa(db, req, [F, 'aprovar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body)
      if (p.situacao !== 'pendente') throw new ErroRegra('O pedido já foi decidido.', 'decidido')
      if (p.solicitadoPor === ctx.usuarioId && !ctx.acesso.eMaster)
        throw new ErroRegra('Para desistir do próprio pedido, cancele-o.', 'proprio')
      await ctx.tx
        .update(s.solicitacaoAprovacao)
        .set({ situacao: 'recusada', decididoPor: ctx.usuarioId, decididoEm: new Date(), motivo })
        .where(eq(s.solicitacaoAprovacao.id, p.id))
      await ctx.auditar({
        acao: 'recusar',
        entidade: 'solicitacao_aprovacao',
        registroId: p.id,
        motivo,
        dados: { tipo: p.tipo, resumo: p.resumo },
      })
      return { ok: true }
    }),
  )

  /** Quem pediu desiste do pedido pendente. */
  app.post<{ Params: { id: string } }>('/api/aprovacoes/:id/cancelar', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      if (p.solicitadoPor !== ctx.usuarioId)
        throw new ErroRegra('Só quem pediu cancela o pedido.', 'proprio')
      if (p.situacao !== 'pendente') throw new ErroRegra('O pedido já foi decidido.', 'decidido')
      await ctx.tx
        .update(s.solicitacaoAprovacao)
        .set({
          situacao: 'cancelada',
          decididoPor: ctx.usuarioId,
          decididoEm: new Date(),
          motivo: 'Cancelado por quem pediu.',
        })
        .where(eq(s.solicitacaoAprovacao.id, p.id))
      await ctx.auditar({
        acao: 'cancelar',
        entidade: 'solicitacao_aprovacao',
        registroId: p.id,
        dados: { tipo: p.tipo, resumo: p.resumo },
      })
      return { ok: true }
    }),
  )

  /** Quem pediu viu a recusa ou a falha: o alerta some. */
  app.post<{ Params: { id: string } }>('/api/aprovacoes/:id/visto', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      if (p.solicitadoPor !== ctx.usuarioId)
        throw new ErroRegra('Só quem pediu marca como visto.', 'proprio')
      await ctx.tx
        .update(s.solicitacaoAprovacao)
        .set({ vistoEm: new Date() })
        .where(eq(s.solicitacaoAprovacao.id, p.id))
      return { ok: true }
    }),
  )

  /** Contagem para o menu: pendentes que o usuário pode decidir. */
  app.get('/api/aprovacoes/resumo', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      if (!ctx.estabelecimentoId) return { pendentes: 0 }
      const aprova = ctx.acesso.eMaster || ctx.acesso.permissoes.has(`${F}:aprovar`)
      if (!aprova) return { pendentes: 0 }
      const [r] = await ctx.tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.solicitacaoAprovacao)
        .where(
          and(
            eq(s.solicitacaoAprovacao.estabelecimentoId, ctx.estabelecimentoId),
            eq(s.solicitacaoAprovacao.situacao, 'pendente'),
          ),
        )
      return { pendentes: r!.n }
    }),
  )
}
