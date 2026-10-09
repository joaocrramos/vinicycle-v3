// Consulta da auditoria (P14): geral, por usuário, entidade, ação e período; e a aba Histórico
// de cada registro.
import { consultaListagem, filtroAuditoria } from '@vinicycle/shared'
import { and, count, eq, gte, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import * as s from '../db/schema'
import { entidade } from '../nucleo/entidades'
import { buscaTexto, listar } from '../nucleo/listagem'
import { naEmpresa, naPlataforma } from '../nucleo/requisicao'

const fichaUsuario = alias(s.ficha, 'ficha_usuario')

function selecionar() {
  return {
    id: s.auditoria.id,
    ocorridoEm: s.auditoria.ocorridoEm,
    usuarioId: s.auditoria.usuarioId,
    // Nome de quem agiu. Membros da equipe não aparecem como colegas: mostra "Suporte ViniCycle".
    usuario: sql<
      string | null
    >`coalesce(${fichaUsuario.nome}, case when ${s.auditoria.usuarioId} is not null then 'Suporte ViniCycle' end)`,
    personificadoId: s.auditoria.personificadoId,
    acao: s.auditoria.acao,
    entidade: s.auditoria.entidade,
    registroId: s.auditoria.registroId,
    diferenca: s.auditoria.diferenca,
    dados: s.auditoria.dados,
    motivo: s.auditoria.motivo,
    ip: s.auditoria.ip,
    estabelecimentoId: s.auditoria.estabelecimentoId,
  }
}

export async function rotasAuditoria(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/auditoria', async (req) =>
    naEmpresa(db, req, ['gestao.config.auditoria', 'visualizar'], async (ctx) => {
      const consulta = consultaListagem.extend(filtroAuditoria.shape).parse(req.query)
      const filtro = and(
        eq(s.auditoria.empresaId, ctx.empresaId),
        consulta.usuarioId ? eq(s.auditoria.usuarioId, consulta.usuarioId) : undefined,
        consulta.entidade ? eq(s.auditoria.entidade, consulta.entidade) : undefined,
        consulta.acao ? eq(s.auditoria.acao, consulta.acao) : undefined,
        consulta.de ? gte(s.auditoria.ocorridoEm, sql`${consulta.de}::date`) : undefined,
        consulta.ate ? lt(s.auditoria.ocorridoEm, sql`${consulta.ate}::date + 1`) : undefined,
        // Busca livre: ação, entidade, motivo, quem agiu e os valores alterados.
        buscaTexto(consulta.busca, [
          s.auditoria.acao,
          s.auditoria.entidade,
          s.auditoria.motivo,
          s.auditoria.diferenca,
          s.auditoria.dados,
          sql`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${s.auditoria.usuarioId})`,
        ]),
      )
      return listar({
        consulta,
        ordenaveis: {
          ocorridoEm: s.auditoria.ocorridoEm,
          acao: s.auditoria.acao,
          entidade: s.auditoria.entidade,
        },
        ordemPadrao: { campo: 'ocorridoEm', direcao: 'desc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.auditoria).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select(selecionar())
            .from(s.auditoria)
            .leftJoin(s.usuario, eq(s.usuario.id, s.auditoria.usuarioId))
            .leftJoin(fichaUsuario, eq(fichaUsuario.id, s.usuario.fichaId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  // Aba Histórico: quem vê o registro vê o histórico dele.
  app.get<{ Params: { entidade: string; id: string } }>(
    '/api/historico/:entidade/:id',
    async (req) =>
      naEmpresa(db, req, null, async (ctx) => {
        const nome = z
          .string()
          .regex(/^[a-z_]+$/)
          .parse(req.params.entidade)
        const id = z.uuid().parse(req.params.id)
        ctx.exigir(entidade(nome).funcionalidade, 'visualizar')
        return ctx.tx
          .select(selecionar())
          .from(s.auditoria)
          .leftJoin(s.usuario, eq(s.usuario.id, s.auditoria.usuarioId))
          .leftJoin(fichaUsuario, eq(fichaUsuario.id, s.usuario.fichaId))
          .where(
            and(
              eq(s.auditoria.empresaId, ctx.empresaId),
              eq(s.auditoria.entidade, nome),
              eq(s.auditoria.registroId, id),
            ),
          )
          .orderBy(sql`${s.auditoria.ocorridoEm} desc`)
          .limit(500)
      }),
  )

  // Exportação de listagem (P4): a planilha é montada na tela; o registro fica aqui (P14).
  app.post('/api/exportacoes', async (req) => {
    const d = z
      .object({
        tabela: z.string().regex(/^[a-z0-9_.-]{1,60}$/),
        registros: z.number().int().min(0),
      })
      .parse(req.body)
    const evento = { acao: 'exportar', entidade: 'listagem', dados: d }
    if (d.tabela.startsWith('plataforma.')) {
      return naPlataforma(db, req, null, async (ctx) => {
        await ctx.auditar(evento)
        return { ok: true }
      })
    }
    return naEmpresa(db, req, null, async (ctx) => {
      await ctx.auditar(evento)
      return { ok: true }
    })
  })
}
