// Central de alertas (P20; 04, roteiro do ciclo 6): os alertas são calculados a partir dos dados e
// sincronizados com a tabela, um aberto por chave; o que perdeu a causa se resolve sozinho. A
// varredura roda quando alguém abre a central ou o sino, no máximo a cada poucos minutos por
// empresa. Cada alerta aponta para o registro e só aparece para quem vê a tela de origem (P27).
import type { Acao } from '@vinicycle/shared'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { entradasSemComunicacao } from './alcool'
import { situacaoControles } from './autocontrole'
import { contasDosClientes } from './conta-cliente'
import { pendenciasDoContrato } from './contratos'
import { pode } from '../nucleo/permissoes'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { lerParametro } from './parametros'

type Gravidade = (typeof s.GRAVIDADES_ALERTA)[number]

export interface AlertaCalculado {
  chave: string
  tipo: string
  gravidade: Gravidade
  funcionalidade: string
  estabelecimentoId: string | null
  mensagem: string
  link: string | null
  venceEm: string | null
}

export const TIPOS_ALERTA: Record<string, string> = {
  documento: 'Documento',
  validade: 'Validade de lote',
  estoque_minimo: 'Estoque mínimo',
  saldo_negativo: 'Saldo negativo',
  laudo_atrasado: 'Laudo atrasado',
  higienizacao: 'Higienização vencida',
  granel_glt: 'Granel sem GLT',
  fermentacao: 'Fim de fermentação',
  etapa_plano: 'Etapa do plano atrasada',
  declaracao: 'Declaração anual',
  autocontrole: 'Autocontrole',
  aprovacao: 'Aprovações',
  alcool: 'Álcool etílico',
  contrato: 'Contrato de terceirização',
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** Calcula os alertas que deveriam estar abertos agora, em todos os estabelecimentos. */
export async function calcularAlertas(ctx: ContextoEmpresa): Promise<AlertaCalculado[]> {
  const e = ctx.empresaId
  const lista: AlertaCalculado[] = []
  const add = (a: AlertaCalculado) => lista.push(a)

  // Documentos vencidos e vencendo (gestao.md, Documentos; antecedência pelo tipo).
  const docs = await ctx.tx.execute<{
    id: string
    titulo: string
    estab: string | null
    vencimento: string
    vencido: boolean
  }>(sql`
    select d.id, d.titulo, d.estabelecimento_id as estab, v.vencimento::text as vencimento,
      v.vencimento < current_date as vencido
    from documento d join tipo_documento t on t.id = d.tipo_documento_id
      join documento_versao v on v.documento_id = d.id and v.situacao = 'vigente'
    where d.empresa_id = ${e} and d.ativo and v.vencimento is not null
      and v.vencimento <= current_date + coalesce((select max(a) from unnest(t.avisos_dias) a), 60)`)
  for (const d of docs.rows)
    add({
      chave: `documento:${d.id}:${d.vencido ? 'vencido' : 'vencendo'}`,
      tipo: 'documento',
      gravidade: d.vencido ? 'critico' : 'atencao',
      funcionalidade: 'gestao.documentos',
      estabelecimentoId: d.estab,
      mensagem: d.vencido
        ? `${d.titulo} venceu em ${dataBr(d.vencimento)}.`
        : `${d.titulo} vence em ${dataBr(d.vencimento)}.`,
      link: `/gestao/documentos/${d.id}`,
      venceEm: d.vencimento,
    })

  // Contratos de terceirização vencidos e vencendo em 60 dias, enquanto ativos (cantina.md, Regras
  // da vinificação por terceiros; IN MAPA 72/2018, art. 27). Encerrado, inativa-se o contrato.
  const contratos = await ctx.tx.execute<{
    id: string
    contraparte: string
    estab: string | null
    fim: string
    vencido: boolean
  }>(sql`
    select c.id, f.nome as contraparte, c.estabelecimento_id as estab, c.vigencia_fim::text as fim,
      c.vigencia_fim < current_date as vencido
    from contrato_terceirizacao c join pessoa p on p.id = c.contraparte_id join ficha f on f.id = p.ficha_id
    where c.empresa_id = ${e} and c.ativo and c.vigencia_fim is not null
      and c.vigencia_fim <= current_date + 60`)
  for (const c of contratos.rows)
    add({
      chave: `contrato:${c.id}:${c.vencido ? 'vencido' : 'vencendo'}`,
      tipo: 'contrato',
      gravidade: c.vencido ? 'critico' : 'atencao',
      funcionalidade: 'enotrace.cadastros',
      estabelecimentoId: c.estab,
      mensagem: c.vencido
        ? `Contrato de terceirização com ${c.contraparte} venceu em ${dataBr(c.fim)}. Renove ou inative.`
        : `Contrato de terceirização com ${c.contraparte} vence em ${dataBr(c.fim)}.`,
      link: `/enotrace/contratos/${c.id}`,
      venceEm: c.fim,
    })
  // Registro MAPA da contraparte vencendo (60 dias) ou vencido (IN MAPA 72/2018, art. 25).
  const registros = await ctx.tx.execute<{
    id: string
    contraparte: string
    estab: string
    validade: string
    vencido: boolean
  }>(sql`
    select c.id, f.nome as contraparte, c.estabelecimento_id as estab,
      c.registro_mapa_contraparte_validade::text as validade,
      c.registro_mapa_contraparte_validade < current_date as vencido
    from contrato_terceirizacao c join pessoa p on p.id = c.contraparte_id join ficha f on f.id = p.ficha_id
    where c.empresa_id = ${e} and c.ativo and (c.vigencia_fim is null or c.vigencia_fim >= current_date)
      and c.registro_mapa_contraparte_validade <= current_date + 60`)
  for (const r of registros.rows)
    add({
      chave: `contrato_registro:${r.id}:${r.vencido ? 'vencido' : 'vencendo'}`,
      tipo: 'contrato',
      gravidade: r.vencido ? 'critico' : 'atencao',
      funcionalidade: 'enotrace.cadastros',
      estabelecimentoId: r.estab,
      mensagem: r.vencido
        ? `Registro no MAPA de ${r.contraparte} venceu em ${dataBr(r.validade)} (contrato de terceirização).`
        : `Registro no MAPA de ${r.contraparte} vence em ${dataBr(r.validade)} (contrato de terceirização).`,
      link: `/enotrace/contratos/${r.id}`,
      venceEm: r.validade,
    })
  // Perdas acima da tolerada no contrato, por cliente e safra (04, roteiro do ciclo 10, bloco 3).
  const comTolerancia = await ctx.tx
    .select({
      id: s.contratoTerceirizacao.id,
      titularId: s.contratoTerceirizacao.contraparteId,
      estab: s.contratoTerceirizacao.estabelecimentoId,
    })
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.empresaId, e),
        eq(s.contratoTerceirizacao.ativo, true),
        eq(s.contratoTerceirizacao.sentido, 'prestamos'),
        sql`${s.contratoTerceirizacao.perdaToleradaTipo} is not null`,
      ),
    )
  for (const c of comTolerancia)
    for (const conta of await contasDosClientes(ctx, { titularId: c.titularId }))
      for (const sf of conta.safras)
        if (sf.foraDaTolerancia && conta.contrato?.id === c.id)
          add({
            chave: `perda_tolerada:${c.id}:${sf.safra ?? 'sem'}`,
            tipo: 'contrato',
            gravidade: 'atencao',
            funcionalidade: 'enotrace.relatorios',
            estabelecimentoId: c.estab,
            mensagem: `${conta.titular}, safra ${sf.safra ?? 'sem safra'}: ${sf.foraDaTolerancia}`,
            link: `/enotrace/terceiros/contas?titular=${c.titularId}`,
            venceEm: null,
          })
  // Pendências legais dos contratos ativos (IN MAPA 72/2018, arts. 25, §6º, e 27).
  const ativos = await ctx.tx
    .select()
    .from(s.contratoTerceirizacao)
    .where(and(eq(s.contratoTerceirizacao.empresaId, e), eq(s.contratoTerceirizacao.ativo, true)))
  for (const c of ativos) {
    const [nome] = await ctx.tx
      .select({ nome: s.ficha.nome })
      .from(s.pessoa)
      .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
      .where(eq(s.pessoa.id, c.contraparteId))
    for (const pend of await pendenciasDoContrato(ctx, c))
      add({
        chave: `contrato:${c.id}:${pend.codigo}`,
        tipo: 'contrato',
        gravidade: 'atencao',
        funcionalidade: 'enotrace.cadastros',
        estabelecimentoId: c.estabelecimentoId,
        mensagem: `Contrato com ${nome?.nome ?? ''}: ${pend.mensagem}`,
        link: `/enotrace/contratos/${c.id}`,
        venceEm: null,
      })
  }

  // Lotes de estoque vencidos e vencendo, com saldo (ambiente-cliente.md, Validade).
  const { dias } = await lerParametro(ctx, 'avisos_validade')
  const janela = Math.max(...dias)
  const lotes = await ctx.tx.execute<{
    id: string
    codigo: string
    item_id: string
    item: string
    estab: string
    validade: string
    vencido: boolean
  }>(sql`
    select l.id, l.codigo, l.item_id, i.nome as item, l.estabelecimento_id as estab,
      l.validade::text as validade, l.validade < current_date as vencido
    from lote_item l join item_estoque i on i.id = l.item_id
    where l.empresa_id = ${e} and l.validade is not null and l.validade <= current_date + ${janela}::int
      and (select coalesce(sum(m.quantidade), 0) from movimento_estoque m where m.lote_item_id = l.id) > 0`)
  for (const l of lotes.rows)
    add({
      chave: `lote_item:${l.id}:${l.vencido ? 'vencido' : 'vencendo'}`,
      tipo: 'validade',
      gravidade: l.vencido ? 'critico' : 'atencao',
      funcionalidade: 'enotrace.estoque',
      estabelecimentoId: l.estab,
      mensagem: `${l.item}, lote ${l.codigo}: ${l.vencido ? 'venceu' : 'vence'} em ${dataBr(l.validade)}.`,
      link: `/enotrace/estoque/${l.item_id}`,
      venceEm: l.validade,
    })

  // Estoque mínimo por estabelecimento (P20).
  const minimos = await ctx.tx.execute<{
    item_id: string
    item: string
    unidade: string
    estab: string
    saldo: string
    minimo: string
  }>(sql`
    select i.id as item_id, i.nome as item, i.unidade_base as unidade, es.id as estab,
      coalesce((select sum(m.quantidade) from movimento_estoque m left join lote_item l on l.id = m.lote_item_id where m.item_id = i.id and m.estabelecimento_id = es.id and l.titular_id is null), 0)::text as saldo,
      i.estoque_minimo::text as minimo
    from item_estoque i cross join estabelecimento es
    where i.empresa_id = ${e} and es.empresa_id = ${e} and i.ativo and i.estoque_minimo is not null
      and coalesce((select sum(m.quantidade) from movimento_estoque m left join lote_item l on l.id = m.lote_item_id where m.item_id = i.id and m.estabelecimento_id = es.id and l.titular_id is null), 0) < i.estoque_minimo
      and exists (select 1 from movimento_estoque m where m.item_id = i.id and m.estabelecimento_id = es.id)`)
  for (const m of minimos.rows)
    add({
      chave: `estoque_minimo:${m.item_id}:${m.estab}`,
      tipo: 'estoque_minimo',
      gravidade: 'atencao',
      funcionalidade: 'enotrace.estoque',
      estabelecimentoId: m.estab,
      mensagem: `${m.item} abaixo do mínimo: ${Number(m.saldo).toLocaleString('pt-BR')} ${m.unidade} (mínimo ${Number(m.minimo).toLocaleString('pt-BR')}).`,
      link: `/enotrace/estoque/${m.item_id}`,
      venceEm: null,
    })

  // Saldo negativo de insumo ou embalagem: a pendência aberta (2.4).
  const pend = await ctx.tx.execute<{
    id: string
    item_id: string
    item: string
    local: string
    estab: string
    saldo: string
  }>(sql`
    select p.id, p.item_id, i.nome as item, lo.nome as local, p.estabelecimento_id as estab,
      p.saldo_apurado::text as saldo
    from pendencia_estoque p join item_estoque i on i.id = p.item_id join local lo on lo.id = p.local_id
    where p.empresa_id = ${e} and p.situacao = 'aberta'`)
  for (const p of pend.rows)
    add({
      chave: `pendencia_estoque:${p.id}`,
      tipo: 'saldo_negativo',
      gravidade: 'critico',
      funcionalidade: 'enotrace.estoque',
      estabelecimentoId: p.estab,
      mensagem: `${p.item} com saldo negativo em ${p.local} (${Number(p.saldo).toLocaleString('pt-BR')}). Resolva pela nota ou por ajuste antes de fechar o mês.`,
      link: `/enotrace/estoque/${p.item_id}`,
      venceEm: null,
    })

  // Laudo atrasado: amostra enviada ou coletada além do prazo (cantina.md, Laboratório).
  const amostras = await ctx.tx.execute<{
    id: string
    codigo: string
    lote: string
    estab: string
    prazo: string
  }>(sql`
    select a.id, a.codigo, l.codigo as lote, a.estabelecimento_id as estab, a.prazo::text as prazo
    from amostra a join lote l on l.id = a.lote_id
    where a.empresa_id = ${e} and a.situacao in ('coletada', 'enviada') and a.prazo < current_date`)
  for (const a of amostras.rows)
    add({
      chave: `amostra:${a.id}`,
      tipo: 'laudo_atrasado',
      gravidade: 'atencao',
      funcionalidade: 'enotrace.laboratorio',
      estabelecimentoId: a.estab,
      mensagem: `Laudo da amostra ${a.codigo} (lote ${a.lote}) atrasado: o prazo era ${dataBr(a.prazo)}.`,
      link: '/enotrace/laboratorio/pedidos',
      venceEm: a.prazo,
    })

  // Higienização vencida: recipiente vazio cuja última higienização passou do intervalo do tipo.
  const hig = await ctx.tx.execute<{
    id: string
    codigo: string
    estab: string
    ultima: string
  }>(sql`
    select r.id, r.codigo, r.estabelecimento_id as estab, h.ultima::text as ultima
    from recipiente r
      join periodicidade_higienizacao p on p.empresa_id = r.empresa_id and p.tipo_recipiente_id = r.tipo_recipiente_id
      join lateral (
        select max(o.executado_em) as ultima from operacao_higienizacao x
          join operacao o on o.id = x.operacao_id and o.situacao = 'confirmada'
        where x.recipiente_id = r.id and x.tipo = 'higienizacao') h on true
    where r.empresa_id = ${e} and r.situacao <> 'inativo' and h.ultima is not null
      and h.ultima < now() - make_interval(days => p.intervalo_dias)
      and coalesce((select sum(m.litros) from movimento_volume m where m.recipiente_id = r.id), 0) = 0`)
  for (const r of hig.rows)
    add({
      chave: `higienizacao:${r.id}`,
      tipo: 'higienizacao',
      gravidade: 'atencao',
      funcionalidade: 'enotrace.painel',
      estabelecimentoId: r.estab,
      mensagem: `${r.codigo}: higienização vencida (última em ${dataBr(r.ultima)}).`,
      link: `/enotrace/operacoes/higienizacao?recipiente=${r.id}`,
      venceEm: null,
    })

  // Saída a granel sem GLT (Decreto 12.709/2025, art. 203, IV): some quando a GLT é informada.
  const glt = await ctx.tx.execute<{ id: string; codigo: string; estab: string; em: string }>(sql`
    select o.id, o.codigo, o.estabelecimento_id as estab, o.executado_em::text as em
    from operacao_granel g join operacao o on o.id = g.operacao_id
    where g.empresa_id = ${e} and g.sentido = 'saida' and g.glt is null and o.situacao = 'confirmada'`)
  for (const o of glt.rows)
    add({
      chave: `granel_glt:${o.id}`,
      tipo: 'granel_glt',
      gravidade: 'critico',
      funcionalidade: 'enotrace.operacoes',
      estabelecimentoId: o.estab,
      mensagem: `Saída de granel ${o.codigo} sem GLT informada (Decreto 12.709/2025, art. 203, IV).`,
      link: `/enotrace/operacoes/${o.id}`,
      venceEm: null,
    })

  // Fim de fermentação provável: leituras estáveis (cantina.md, Fermentações).
  const ferm = await ctx.tx.execute<{ id: string; lote: string; estab: string; tipo: string }>(sql`
    select f.id, l.codigo as lote, f.estabelecimento_id as estab, f.tipo
    from fermentacao f join lote l on l.id = f.lote_id
      join operacao o on o.id = f.operacao_inicio_id and o.situacao = 'confirmada'
    where f.empresa_id = ${e} and f.operacao_fim_id is null and f.fim_sugerido_em is not null`)
  for (const f of ferm.rows)
    add({
      chave: `fermentacao:${f.id}`,
      tipo: 'fermentacao',
      gravidade: 'info',
      funcionalidade: 'enotrace.operacoes',
      estabelecimentoId: f.estab,
      mensagem: `Fermentação ${f.tipo === 'malolatica' ? 'malolática' : 'alcoólica'} do lote ${f.lote} com leituras estáveis: fim provável.`,
      link: `/enotrace/fermentacoes/${f.id}`,
      venceEm: null,
    })

  // Etapa do plano atrasada (cantina.md, Previsto × executado).
  const etapas = await ctx.tx.execute<{
    id: string
    projeto_id: string
    projeto: string
    estab: string
    tipo: string
    prevista: string
  }>(sql`
    select e.id, p.id as projeto_id, p.codigo || ' · ' || p.nome as projeto, p.estabelecimento_id as estab,
      e.tipo_operacao as tipo, e.data_prevista::text as prevista
    from plano_etapa e join projeto p on p.id = e.projeto_id
    where e.empresa_id = ${e} and e.data_prevista < current_date
      and p.situacao not in ('encerrado', 'cancelado', 'engarrafado')
      and not exists (select 1 from operacao o where o.plano_etapa_id = e.id and o.situacao = 'confirmada')`)
  for (const x of etapas.rows)
    add({
      chave: `etapa:${x.id}`,
      tipo: 'etapa_plano',
      gravidade: 'info',
      funcionalidade: 'enotrace.projetos',
      estabelecimentoId: x.estab,
      mensagem: `${x.projeto}: etapa de ${x.tipo.replace(/_/g, ' ')} prevista para ${dataBr(x.prevista)} ainda não feita.`,
      link: `/enotrace/projetos/${x.projeto_id}`,
      venceEm: x.prevista,
    })

  // Prazo da declaração anual: de 1º a 10 de janeiro (Portaria MAPA 615/2023); aviso desde 15/12,
  // por estabelecimento, até a declaração do ano ser marcada como entregue.
  const [hoje] = (await ctx.tx.execute<{ d: string }>(sql`select current_date::text as d`)).rows
  const [ano, mes, dia] = hoje!.d.split('-').map(Number) as [number, number, number]
  const anoDeclarado = mes === 12 ? ano : ano - 1
  if ((mes === 12 && dia >= 15) || (mes === 1 && dia <= 10)) {
    const pendentes = await ctx.tx.execute<{ id: string }>(sql`
      select es.id from estabelecimento es
      where es.empresa_id = ${e} and es.ativo
        and not exists (select 1 from declaracao d where d.estabelecimento_id = es.id
          and d.tipo = 'anual_mapa' and d.ano = ${anoDeclarado} and d.situacao in ('declarada', 'retificada'))`)
    for (const x of pendentes.rows)
      add({
        chave: `declaracao_anual:${anoDeclarado}:${x.id}`,
        tipo: 'declaracao',
        gravidade: mes === 1 && dia >= 5 ? 'critico' : 'atencao',
        funcionalidade: 'enotrace.declaracoes',
        estabelecimentoId: x.id,
        mensagem: `Declaração anual de ${anoDeclarado} ao MAPA: prazo de 1º a 10 de janeiro de ${anoDeclarado + 1} (Portaria MAPA 615/2023).`,
        link: `/enotrace/declaracoes?ano=${anoDeclarado}`,
        venceEm: `${anoDeclarado + 1}-01-10`,
      })
  }
  // Autocontrole: controle com o prazo vencido (gestao.md, Autocontrole; Decreto 12.709/2025, arts.
  // 117 a 120).
  for (const c of await situacaoControles(ctx, { ativos: true }))
    if (c.situacao === 'atrasado')
      add({
        chave: `autocontrole:${c.id}`,
        tipo: 'autocontrole',
        gravidade: 'atencao',
        funcionalidade: 'gestao.autocontrole',
        estabelecimentoId: c.estabelecimentoId,
        mensagem: `Autocontrole: ${c.nome} atrasado desde ${dataBr(c.proxima!)}.`,
        link: `/gestao/autocontrole/${c.id}`,
        venceEm: c.proxima,
      })
  // Aprovações (P27): pedidos pendentes, para quem aprova; recusados ou não feitos, até quem pediu
  // marcar como visto.
  const pedidos = await ctx.tx.execute<{
    estab: string
    n: number
  }>(sql`
    select estabelecimento_id as estab, count(*)::int as n from solicitacao_aprovacao
    where empresa_id = ${e} and situacao = 'pendente' group by 1`)
  for (const x of pedidos.rows)
    add({
      chave: `aprovacoes:${x.estab}`,
      tipo: 'aprovacao',
      gravidade: 'atencao',
      funcionalidade: 'gestao.aprovacoes:aprovar',
      estabelecimentoId: x.estab,
      mensagem: x.n === 1 ? '1 pedido esperando aprovação.' : `${x.n} pedidos esperando aprovação.`,
      link: '/gestao/aprovacoes',
      venceEm: null,
    })
  const respostas = await ctx.tx.execute<{
    id: string
    estab: string
    situacao: string
    resumo: string
    quem: string | null
    motivo: string | null
    erro: string | null
  }>(sql`
    select s.id, s.estabelecimento_id as estab, s.situacao, s.resumo, s.motivo, s.erro,
      (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = s.solicitado_por) as quem
    from solicitacao_aprovacao s
    where s.empresa_id = ${e} and s.situacao in ('recusada', 'falhou') and s.visto_em is null`)
  for (const x of respostas.rows)
    add({
      chave: `aprovacao:${x.id}`,
      tipo: 'aprovacao',
      gravidade: 'atencao',
      funcionalidade: 'gestao.aprovacoes',
      estabelecimentoId: x.estab,
      mensagem:
        x.situacao === 'recusada'
          ? `Pedido recusado (${x.quem ?? '—'}): ${x.resumo}. Motivo: ${x.motivo}.`
          : `Pedido aprovado, mas não foi feito (${x.quem ?? '—'}): ${x.resumo}. ${x.erro}`,
      link: '/gestao/aprovacoes',
      venceEm: null,
    })
  // Entrada de álcool etílico a comunicar ao MAPA (Lei 7.678/1988, art. 29, §3º).
  for (const x of await entradasSemComunicacao(ctx))
    add({
      chave: `alcool:${x.id}`,
      tipo: 'alcool',
      gravidade: 'atencao',
      funcionalidade: 'enotrace.estoque',
      estabelecimentoId: x.estab,
      mensagem: `Entrada de ${Number(x.quantidade).toLocaleString('pt-BR')} ${x.unidade} de ${x.item} em ${dataBr(x.data)}: comunicar ao MAPA (Lei 7.678/1988, art. 29, §3º).`,
      link: '/enotrace/alcool',
      venceEm: null,
    })
  // Retificação aberta: o ano declarado fica destravado até ser concluída.
  const retificando = await ctx.tx.execute<{ id: string; ano: number; estab: string }>(sql`
    select d.id, d.ano, d.estabelecimento_id as estab from declaracao d
    where d.empresa_id = ${e} and d.situacao = 'em_retificacao'`)
  for (const x of retificando.rows)
    add({
      chave: `declaracao_retificacao:${x.id}`,
      tipo: 'declaracao',
      gravidade: 'atencao',
      funcionalidade: 'enotrace.declaracoes',
      estabelecimentoId: x.estab,
      mensagem: `Retificação da declaração de ${x.ano} aberta: o ano fica destravado até ela ser concluída com o novo protocolo.`,
      link: `/enotrace/declaracoes?ano=${x.ano}`,
      venceEm: null,
    })
  return lista
}

/** Abre os alertas novos, atualiza os que mudaram e resolve os que perderam a causa. */
export async function sincronizarAlertas(ctx: ContextoEmpresa, calculados: AlertaCalculado[]) {
  const abertos = await ctx.tx
    .select()
    .from(s.alerta)
    .where(and(eq(s.alerta.empresaId, ctx.empresaId), eq(s.alerta.situacao, 'aberto')))
  const porChave = new Map(calculados.map((a) => [a.chave, a]))
  const resolver = abertos.filter((a) => !porChave.has(a.chave)).map((a) => a.id)
  if (resolver.length)
    await ctx.tx
      .update(s.alerta)
      .set({ situacao: 'resolvido', resolvidoEm: sql`now()` })
      .where(inArray(s.alerta.id, resolver))
  for (const a of abertos) {
    const c = porChave.get(a.chave)
    if (c && (c.mensagem !== a.mensagem || c.gravidade !== a.gravidade || c.link !== a.link))
      await ctx.tx
        .update(s.alerta)
        .set({ mensagem: c.mensagem, gravidade: c.gravidade, link: c.link, venceEm: c.venceEm })
        .where(eq(s.alerta.id, a.id))
  }
  const existentes = new Set(abertos.map((a) => a.chave))
  const novos = calculados.filter((c) => !existentes.has(c.chave))
  if (novos.length)
    await ctx.tx.insert(s.alerta).values(novos.map((c) => ({ ...c, empresaId: ctx.empresaId })))
}

/** Última varredura por empresa; a central refaz no máximo a cada 5 minutos (ou quando pedido). */
const ultimaVarredura = new Map<string, number>()
const INTERVALO_MS = 5 * 60_000

export async function varrerAlertas(ctx: ContextoEmpresa, forcar = false): Promise<void> {
  const ultima = ultimaVarredura.get(ctx.empresaId) ?? 0
  if (!forcar && Date.now() - ultima < INTERVALO_MS) return
  await sincronizarAlertas(ctx, await calcularAlertas(ctx))
  ultimaVarredura.set(ctx.empresaId, Date.now())
}

/** Alertas que o usuário vê: dos estabelecimentos permitidos (ou da empresa) e das telas que vê. */
export async function visiveis(ctx: ContextoEmpresa, situacao: 'aberto' | 'resolvido') {
  const estabs = await ctx.estabelecimentosPermitidos()
  const linhas = await ctx.tx
    .select({
      id: s.alerta.id,
      tipo: s.alerta.tipo,
      gravidade: s.alerta.gravidade,
      funcionalidade: s.alerta.funcionalidade,
      estabelecimentoId: s.alerta.estabelecimentoId,
      estabelecimento: sql<
        string | null
      >`(select coalesce(f.nome_fantasia, f.nome) from estabelecimento es join ficha f on f.id = es.ficha_id where es.id = alerta.estabelecimento_id)`,
      mensagem: s.alerta.mensagem,
      link: s.alerta.link,
      venceEm: s.alerta.venceEm,
      abertoEm: s.alerta.abertoEm,
      resolvidoEm: s.alerta.resolvidoEm,
      lido: sql<boolean>`exists (select 1 from alerta_leitura x where x.alerta_id = alerta.id and x.usuario_id = ${ctx.usuarioId})`,
    })
    .from(s.alerta)
    .where(
      and(
        eq(s.alerta.empresaId, ctx.empresaId),
        eq(s.alerta.situacao, situacao),
        estabs.length
          ? or(isNull(s.alerta.estabelecimentoId), inArray(s.alerta.estabelecimentoId, estabs))
          : isNull(s.alerta.estabelecimentoId),
      ),
    )
    .orderBy(
      sql`case ${s.alerta.gravidade} when 'critico' then 0 when 'atencao' then 1 else 2 end`,
      desc(s.alerta.abertoEm),
    )
    .limit(500)
  // "funcionalidade:acao" restringe o alerta a uma ação (ex.: só quem aprova vê os pedidos).
  return linhas.filter((a) => {
    const [f, acao] = a.funcionalidade.split(':') as [string, Acao | undefined]
    return pode(ctx.acesso, f, acao ?? 'visualizar')
  })
}

export async function rotasAlertas(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/alertas', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const q = z
        .object({
          situacao: z.enum(['aberto', 'resolvido']).default('aberto'),
          atualizar: z.enum(['sim', 'nao']).default('nao'),
        })
        .parse(req.query)
      await varrerAlertas(ctx, q.atualizar === 'sim')
      return (await visiveis(ctx, q.situacao)).map((a) => ({
        ...a,
        nomeTipo: TIPOS_ALERTA[a.tipo] ?? a.tipo,
      }))
    }),
  )

  /** Contador do sino: alertas abertos não lidos. */
  app.get('/api/alertas/resumo', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      await varrerAlertas(ctx)
      const v = await visiveis(ctx, 'aberto')
      return {
        abertos: v.length,
        naoLidos: v.filter((a) => !a.lido).length,
        criticos: v.filter((a) => a.gravidade === 'critico' && !a.lido).length,
      }
    }),
  )

  app.post('/api/alertas/lidos', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const { ids } = z.object({ ids: z.array(z.uuid()).max(500) }).parse(req.body)
      const alvo = ids.length
        ? ids
        : (await visiveis(ctx, 'aberto')).filter((a) => !a.lido).map((a) => a.id)
      if (alvo.length)
        await ctx.tx
          .insert(s.alertaLeitura)
          .values(
            alvo.map((alertaId) => ({
              alertaId,
              usuarioId: ctx.usuarioId,
              empresaId: ctx.empresaId,
            })),
          )
          .onConflictDoNothing()
      return { ok: true, lidos: alvo.length }
    }),
  )
}
