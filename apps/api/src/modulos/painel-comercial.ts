// Vitrine "Conheça e contrate" (ambiente-cliente.md, Módulos), painel da plataforma
// (administracao.md, Visão geral), oportunidades e prazos da régua (Configurações da plataforma).
import {
  deCentavos,
  MESES_PERIODICIDADE,
  paraCentavos,
  type Periodicidade,
  somarMeses,
} from '@vinicycle/shared'
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../db/cliente'
import * as s from '../db/schema'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { naEmpresa, naPlataforma } from '../nucleo/requisicao'
import { type Assinatura, limitesEfetivos, proximaRenovacao, usoAtual } from './assinaturas'
import { estadoNaRenovacao } from './cobranca'
import { hoje, precoDoAdicional } from './planos'

/** Valor mensal de um conjunto plano + adicionais, com os descontos válidos na data (centavos). */
async function mensal(
  tx: Tx,
  empresaId: string,
  periodicidade: Periodicidade,
  recorrente: number,
  data: string,
): Promise<number> {
  const meses = MESES_PERIODICIDADE[periodicidade]
  const descontos = await tx
    .select()
    .from(s.desconto)
    .where(
      and(
        eq(s.desconto.empresaId, empresaId),
        eq(s.desconto.ativo, true),
        lte(s.desconto.inicio, data),
        or(isNull(s.desconto.fim), gte(s.desconto.fim, data)),
      ),
    )
  let valor = recorrente
  for (const d of descontos) {
    valor -=
      d.tipo === 'percentual'
        ? Math.round((recorrente * Number(d.valor)) / 100)
        : paraCentavos(d.valor)
  }
  return Math.max(0, Math.round(valor / meses))
}

/** Receita mensal da assinatura hoje e depois do que está agendado (para a previsão). */
async function receitaDaAssinatura(tx: Tx, a: Assinatura, data: string) {
  const atualEstado = await estadoNaRenovacao(tx, { ...a, cicloFim: null }, data)
  const recorrente = (e: {
    valorPlano: string
    itens: Array<{ quantidade: number; valorUnitario: string }>
  }) =>
    paraCentavos(e.valorPlano) +
    e.itens.reduce((t, i) => t + i.quantidade * paraCentavos(i.valorUnitario), 0)
  const atual = await mensal(
    tx,
    a.empresaId,
    a.periodicidade as Periodicidade,
    recorrente(atualEstado),
    data,
  )
  const renovacao = await proximaRenovacao(tx, a)
  const depoisEstado = await estadoNaRenovacao(tx, a, renovacao)
  const depois = depoisEstado.agendadas.length
    ? await mensal(tx, a.empresaId, depoisEstado.periodicidade, recorrente(depoisEstado), renovacao)
    : atual
  return { atual, depois, renovacao }
}

export async function rotasPainelComercial(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  // ---- Vitrine (cliente) ----

  app.get('/api/vitrine', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const [a] = await ctx.tx
        .select()
        .from(s.assinatura)
        .where(and(eq(s.assinatura.empresaId, ctx.empresaId), eq(s.assinatura.situacao, 'vigente')))
      const modulos = await ctx.tx.select().from(s.modulo).orderBy(asc(s.modulo.ordem))
      const avulsos = await ctx.tx
        .select({ id: s.adicional.id, moduloId: s.adicional.moduloId, nome: s.adicional.nome })
        .from(s.adicional)
        .where(and(eq(s.adicional.tipo, 'modulo'), eq(s.adicional.ativo, true)))
      const interesses = await ctx.tx
        .select({ moduloId: s.interesseModulo.moduloId })
        .from(s.interesseModulo)
        .where(
          and(eq(s.interesseModulo.empresaId, ctx.empresaId), isNull(s.interesseModulo.atendidoEm)),
        )
      const r = []
      for (const m of modulos) {
        if (ctx.acesso.modulos.has(m.codigo)) continue
        const avulso = avulsos.find((x) => x.moduloId === m.id)
        const preco =
          avulso && a
            ? await precoDoAdicional(ctx.tx, avulso.id, a.periodicidade as Periodicidade, hoje())
            : null
        r.push({
          codigo: m.codigo,
          nome: m.nome,
          funcao: m.funcao,
          situacao: m.situacao,
          avulso:
            avulso && preco !== null && m.situacao === 'disponivel'
              ? { id: avulso.id, preco }
              : null,
          periodicidade: a?.periodicidade ?? null,
          interesse: interesses.some((i) => i.moduloId === m.id),
        })
      }
      return r
    }),
  )

  app.post<{ Params: { codigo: string } }>('/api/vitrine/:codigo/interesse', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const { observacao } = z
        .object({ observacao: z.string().trim().max(500).optional() })
        .parse(req.body ?? {})
      const [m] = await ctx.tx.select().from(s.modulo).where(eq(s.modulo.codigo, req.params.codigo))
      if (!m) throw new ErroNaoEncontrado('Módulo não encontrado.')
      if (ctx.acesso.modulos.has(m.codigo)) {
        throw new ErroRegra('A empresa já tem esse módulo.', 'modulo_contratado')
      }
      const r = await ctx.tx
        .insert(s.interesseModulo)
        .values({
          empresaId: ctx.empresaId,
          moduloId: m.id,
          usuarioId: ctx.usuarioId,
          observacao: observacao || null,
          criadoPor: ctx.usuarioId,
        })
        .onConflictDoNothing()
        .returning({ id: s.interesseModulo.id })
      if (r.length) {
        await ctx.auditar({
          acao: 'registrar_interesse',
          entidade: 'modulo',
          registroId: m.id,
          dados: { modulo: m.codigo, observacao },
        })
      }
      return { ok: true }
    }),
  )

  // ---- Painel da plataforma ----

  app.get('/api/plataforma/painel', async (req) =>
    naPlataforma(db, req, ['plataforma.painel', 'visualizar'], async ({ tx }) => {
      const data = hoje()
      const inicioMes = `${data.slice(0, 8)}01`
      const situacoes = await tx
        .select({ situacao: s.empresa.situacao, n: sql<number>`count(*)::int` })
        .from(s.empresa)
        .groupBy(s.empresa.situacao)
      const [novos] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.empresa)
        .where(sql`${s.empresa.criadoEm} >= ${inicioMes}::date`)
      const [usuarios] = (
        await tx.execute<{ ativos: number; recentes: number }>(sql`
          select
            (select count(distinct usuario_id) from vinculo where ativo)::int as ativos,
            (select count(*) from usuario u where u.ultimo_acesso_em > now() - interval '30 days'
              and exists (select 1 from vinculo v where v.usuario_id = u.id and v.ativo))::int as recentes`)
      ).rows
      const faturas = (
        await tx.execute<{ situacao: string; n: number; saldo: string }>(sql`
          select f.situacao, count(*)::int as n,
            sum(f.total - coalesce((select sum(r.valor) from recebimento r
              where r.fatura_id = f.id and r.estornado_em is null), 0))::text as saldo
          from fatura f where f.situacao in ('aberta', 'parcial', 'vencida') group by f.situacao`)
      ).rows

      const assinaturas = await tx
        .select({
          a: s.assinatura,
          nome: s.ficha.nome,
          fantasia: s.ficha.nomeFantasia,
          situacao: s.empresa.situacao,
        })
        .from(s.assinatura)
        .innerJoin(s.empresa, eq(s.empresa.id, s.assinatura.empresaId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
        .where(and(eq(s.assinatura.situacao, 'vigente'), eq(s.assinatura.emTeste, false)))
      const meses = Array.from({ length: 6 }, (_, k) => somarMeses(inicioMes, k + 1))
      const previsao = meses.map((m) => ({ mes: m, valor: 0 }))
      const receitas: Array<{ empresaId: string; cliente: string; mensal: number }> = []
      let mrr = 0
      for (const l of assinaturas) {
        if (l.situacao === 'inativo') continue
        const r = await receitaDaAssinatura(tx, l.a, data)
        mrr += r.atual
        receitas.push({ empresaId: l.a.empresaId, cliente: l.fantasia || l.nome, mensal: r.atual })
        previsao.forEach((p) => {
          p.valor += p.mes >= r.renovacao ? r.depois : r.atual
        })
      }

      // Perto dos limites: 80% ou mais de algum limite da assinatura.
      const perto: Array<{
        empresaId: string
        cliente: string
        item: string
        uso: string
        limite: string
      }> = []
      for (const l of assinaturas) {
        if (!['ativo', 'somente_leitura'].includes(l.situacao)) continue
        const lim = await limitesEfetivos(tx, l.a.empresaId, data)
        if (!lim) continue
        const uso = await usoAtual(tx, l.a.empresaId)
        const cliente = l.fantasia || l.nome
        const conferir = (
          item: string,
          u: number,
          max: number | null,
          formato = (x: number) => String(x),
        ) => {
          if (max !== null && max > 0 && u >= max * 0.8) {
            perto.push({
              empresaId: l.a.empresaId,
              cliente,
              item,
              uso: formato(u),
              limite: formato(max),
            })
          }
        }
        conferir('Estabelecimentos', uso.estabelecimentos, lim.estabelecimentos)
        conferir('Usuários', uso.usuarios, lim.usuarios)
        conferir(
          'Anexos',
          uso.armazenamentoBytes / 1024 ** 3,
          lim.armazenamentoGb,
          (x) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`,
        )
      }

      const emTeste = await tx
        .select({
          empresaId: s.assinatura.empresaId,
          cliente: sql<string>`coalesce(nullif(${s.ficha.nomeFantasia}, ''), ${s.ficha.nome})`,
          fimTeste: s.assinatura.fimTeste,
        })
        .from(s.assinatura)
        .innerJoin(s.empresa, eq(s.empresa.id, s.assinatura.empresaId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
        .where(and(eq(s.assinatura.situacao, 'vigente'), eq(s.assinatura.emTeste, true)))
        .orderBy(asc(s.assinatura.fimTeste))
      const [oportunidades] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.interesseModulo)
        .where(isNull(s.interesseModulo.atendidoEm))

      return {
        clientes: {
          porSituacao: Object.fromEntries(situacoes.map((x) => [x.situacao, x.n])),
          novosNoMes: novos?.n ?? 0,
        },
        usuarios: { ativos: usuarios?.ativos ?? 0, ultimos30Dias: usuarios?.recentes ?? 0 },
        receitaMensal: deCentavos(mrr),
        faturas: Object.fromEntries(
          faturas.map((f) => [f.situacao, { quantidade: f.n, saldo: f.saldo }]),
        ),
        previsao: previsao.map((p) => ({ mes: p.mes.slice(0, 7), valor: deCentavos(p.valor) })),
        maiores: receitas
          .sort((x, y) => y.mensal - x.mensal)
          .slice(0, 5)
          .map((x) => ({ ...x, mensal: deCentavos(x.mensal) })),
        pertoDosLimites: perto,
        emTeste,
        oportunidades: oportunidades?.n ?? 0,
      }
    }),
  )

  app.get('/api/plataforma/interesses', async (req) =>
    naPlataforma(db, req, ['plataforma.painel', 'visualizar'], async ({ tx }) => {
      const { todos } = z.object({ todos: z.literal('1').optional() }).parse(req.query)
      return tx
        .select({
          id: s.interesseModulo.id,
          empresaId: s.interesseModulo.empresaId,
          cliente: sql<string>`(select coalesce(nullif(f.nome_fantasia, ''), f.nome)
            from empresa e join ficha f on f.id = e.ficha_id where e.id = interesse_modulo.empresa_id)`,
          modulo: s.modulo.nome,
          funcao: s.modulo.funcao,
          usuario: s.usuario.email,
          observacao: s.interesseModulo.observacao,
          criadoEm: s.interesseModulo.criadoEm,
          atendidoEm: s.interesseModulo.atendidoEm,
        })
        .from(s.interesseModulo)
        .innerJoin(s.modulo, eq(s.modulo.id, s.interesseModulo.moduloId))
        .innerJoin(s.usuario, eq(s.usuario.id, s.interesseModulo.usuarioId))
        .where(todos ? undefined : isNull(s.interesseModulo.atendidoEm))
        .orderBy(desc(s.interesseModulo.criadoEm))
        .limit(200)
    }),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/interesses/:id/atender', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'editar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const r = await tx
        .update(s.interesseModulo)
        .set({ atendidoEm: sql`now()`, atendidoPor: usuarioId })
        .where(and(eq(s.interesseModulo.id, id), isNull(s.interesseModulo.atendidoEm)))
        .returning()
      if (!r.length) throw new ErroNaoEncontrado('Oportunidade não encontrada.')
      await auditar({
        acao: 'atender_interesse',
        entidade: 'interesse_modulo',
        registroId: id,
        empresaId: r[0]!.empresaId,
      })
      return { ok: true }
    }),
  )

  // ---- Prazos da régua (Configurações da plataforma) ----

  const prazos = z.object({
    testeDias: z.number().int().min(1).max(90),
    avisosTesteDias: z.array(z.number().int().min(0).max(90)).max(5),
    toleranciaDias: z.number().int().min(0).max(60),
    somenteLeituraDias: z.number().int().min(0).max(90),
    faturaAntecedenciaDias: z.number().int().min(0).max(60),
    avisosVencimentoDias: z.array(z.number().int().min(0).max(60)).max(5),
    chamadoCategorias: z.array(z.string().trim().min(2).max(60)).min(1).max(30),
  })

  app.get('/api/plataforma/configuracoes', async (req) =>
    naPlataforma(db, req, ['plataforma.configuracoes', 'visualizar'], async ({ tx }) => {
      const [c] = await tx.select().from(s.configPlataforma)
      return prazos.parse({
        testeDias: c!.testeDias,
        avisosTesteDias: c!.avisosTesteDias,
        toleranciaDias: c!.toleranciaDias,
        somenteLeituraDias: c!.somenteLeituraDias,
        faturaAntecedenciaDias: c!.faturaAntecedenciaDias,
        avisosVencimentoDias: c!.avisosVencimentoDias,
        chamadoCategorias: c!.chamadoCategorias,
      })
    }),
  )

  app.put('/api/plataforma/configuracoes', async (req) =>
    naPlataforma(
      db,
      req,
      ['plataforma.configuracoes', 'editar'],
      async ({ tx, usuarioId, auditar }) => {
        const d = prazos.parse(req.body)
        const [antes] = await tx.select().from(s.configPlataforma)
        await tx
          .update(s.configPlataforma)
          .set({
            ...d,
            atualizadoEm: sql`now()`,
            atualizadoPor: usuarioId,
            versao: sql`${s.configPlataforma.versao} + 1`,
          })
          .where(eq(s.configPlataforma.id, true))
        await auditar({
          acao: 'editar',
          entidade: 'config_plataforma',
          antes: antes ?? null,
          depois: d,
        })
        return { ok: true }
      },
    ),
  )
}
