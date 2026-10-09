// EnoTrace › Declarações (cantina.md, Declarações e fechamento; 04, roteiro do ciclo 7):
// - declaração anual de produção e estoques ao MAPA (Portaria MAPA 615/2023, arts. 4º e 5º): estoque
//   em 31/12 do ano anterior, produção do ano e estoque em 31/12, a granel (por titular, classe e
//   cor do projeto) e engarrafado (por titular, marca e produto), com o vinho de terceiros separado;
// - apoio ao SIVIBE (IN MAPA 59/2020; vindima = ano civil, Portaria MAPA 824/2025): uva própria por
//   parcela e cultivar, uva comprada por fornecedor e uva de terceiros;
// - entrega registrada com o protocolo (o instantâneo dos números fica guardado). A anual entregue
//   trava o ano do estabelecimento (nucleo/periodo.ts); mudanças só por retificação (P13).
import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { TIPOS_DECLARACAO } from '../db/schema/declaracoes'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { exigeAprovacao, pedirAprovacao } from '../nucleo/aprovacoes'
import { type Aviso, exigirCientes } from '../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'enotrace.declaracoes'

type Grupo = 'producao' | 'entradas' | 'engarrafado' | 'saidas' | 'perdas' | 'ajustes' | 'internos'

/**
 * Livro de volumes → colunas da declaração. Produção = o vinho elaborado no ano: a entrada do mosto
 * e a prensagem (na prensagem da massa, a saída e a entrada se anulam e sobra o ajuste ao medido).
 */
const GRUPO_GRANEL: Record<string, Grupo> = {
  entrada_mosto: 'producao',
  entrada_prensagem: 'producao',
  saida_prensagem: 'producao',
  ajuste_prensagem: 'producao',
  entrada_granel: 'entradas',
  abertura_saldo: 'entradas',
  engarrafamento: 'engarrafado',
  tiragem: 'engarrafado',
  saida_granel: 'saidas',
  perda: 'perdas',
  evaporacao: 'perdas',
  ajuste_inventario: 'ajustes',
}
/** Livro de estoque (produto acabado) → colunas. */
const GRUPO_ENGARRAFADO: Record<string, Grupo> = {
  producao: 'producao',
  entrada: 'entradas',
  entrada_nfe: 'entradas',
  carga_inicial: 'entradas',
  devolucao: 'entradas',
  saida: 'saidas',
  descarte: 'perdas',
  ajuste_inventario: 'ajustes',
}

const COLUNAS = ['producao', 'entradas', 'engarrafado', 'saidas', 'perdas', 'ajustes', 'internos']

async function limitesAno(ctx: ContextoEmpresa, estab: string, ano: number) {
  const [r] = (
    await ctx.tx.execute<{ inicio: string; fim: string; terminou: boolean }>(sql`
      select make_timestamptz(${ano}, 1, 1, 0, 0, 0, e.fuso)::text as inicio,
        make_timestamptz(${ano + 1}, 1, 1, 0, 0, 0, e.fuso)::text as fim,
        make_timestamptz(${ano + 1}, 1, 1, 0, 0, 0, e.fuso) <= now() as terminou
      from estabelecimento e where e.id = ${estab}`)
  ).rows
  return r!
}

const centavos = (v: string | number | null) => Math.round(Number(v ?? 0) * 100)
const litros = (c: number) => (c / 100).toFixed(2)

/** Números da declaração anual do estabelecimento no ano. */
export async function declaracaoAnual(ctx: ContextoEmpresa, estab: string, ano: number) {
  const { inicio, fim } = await limitesAno(ctx, estab, ano)

  // Granel: o estorno conta no tipo do movimento que ele desfaz.
  const vol = await ctx.tx.execute<{
    titular_id: string | null
    titular: string | null
    classe: string | null
    classe_ordem: number | null
    cor: string | null
    tipo: string
    antes: string
    durante: string
  }>(sql`
    select l.titular_id,
      (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = l.titular_id) as titular,
      c.nome as classe, c.ordem as classe_ordem,
      (select o.nome from opcao_lista o where o.lista = 'cor_vinho' and o.codigo = p.cor order by o.empresa_id nulls last limit 1) as cor,
      coalesce(orig.tipo, m.tipo) as tipo,
      coalesce(sum(m.litros) filter (where m.executado_em < ${inicio}::timestamptz), 0)::text as antes,
      coalesce(sum(m.litros) filter (where m.executado_em >= ${inicio}::timestamptz), 0)::text as durante
    from movimento_volume m join lote l on l.id = m.lote_id join projeto p on p.id = l.projeto_id
      left join classe_produto c on c.id = p.classe_produto_id
      left join movimento_volume orig on orig.id = m.estorno_de_id
    where m.estabelecimento_id = ${estab} and m.executado_em < ${fim}::timestamptz
    group by 1, 2, 3, 4, 5, 6`)
  const granel = new Map<
    string,
    {
      titularId: string | null
      titular: string | null
      classe: string | null
      ordem: number
      cor: string | null
      c: Record<string, number>
    }
  >()
  for (const r of vol.rows) {
    const chave = `${r.titular_id}|${r.classe}|${r.cor}`
    const g = granel.get(chave) ?? {
      titularId: r.titular_id,
      titular: r.titular,
      classe: r.classe,
      ordem: r.classe_ordem ?? 999,
      cor: r.cor,
      c: Object.fromEntries(['inicial', ...COLUNAS].map((k) => [k, 0])),
    }
    g.c.inicial! += centavos(r.antes)
    g.c[GRUPO_GRANEL[r.tipo] ?? 'internos']! += centavos(r.durante)
    granel.set(chave, g)
  }
  const linhasGranel = [...granel.values()]
    .map((g) => {
      const cols = { ...g.c, final: Object.values(g.c).reduce((t, v) => t + v, 0) }
      return {
        titularId: g.titularId,
        titular: g.titular,
        classe: g.classe,
        cor: g.cor,
        ordem: g.ordem,
        litros: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, litros(v)])),
        vazio: Object.values(cols).every((v) => v === 0),
      }
    })
    .filter((g) => !g.vazio)
    .sort(
      (a, b) =>
        Number(!!a.titularId) - Number(!!b.titularId) ||
        (a.titular ?? '').localeCompare(b.titular ?? '') ||
        a.ordem - b.ordem ||
        (a.cor ?? '').localeCompare(b.cor ?? ''),
    )
    .map(({ ordem: _o, vazio: _v, ...g }) => g)

  // Engarrafado: produto acabado por produto e formato; o titular é o do lote ou o do produto.
  const est = await ctx.tx.execute<{
    titular_id: string | null
    titular: string | null
    produto_id: string | null
    produto: string | null
    item: string
    marca: string | null
    classe: string | null
    registro_mapa: string | null
    volume_ml: number | null
    tipo: string
    antes: string
    durante: string
  }>(sql`
    select coalesce(li.titular_id, p.titular_id) as titular_id,
      (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = coalesce(li.titular_id, p.titular_id)) as titular,
      p.id as produto_id, p.nome as produto, i.nome as item, ma.nome as marca, c.nome as classe,
      p.registro_mapa, f.volume_ml, coalesce(orig.tipo, m.tipo) as tipo,
      coalesce(sum(m.quantidade) filter (where m.executado_em < ${inicio}::timestamptz), 0)::text as antes,
      coalesce(sum(m.quantidade) filter (where m.executado_em >= ${inicio}::timestamptz), 0)::text as durante
    from movimento_estoque m join item_estoque i on i.id = m.item_id
      left join lote_item li on li.id = m.lote_item_id
      left join produto_formato f on f.item_estoque_id = i.id
      left join produto p on p.id = f.produto_id
      left join marca ma on ma.id = p.marca_id
      left join classe_produto c on c.id = p.classe_produto_id
      left join movimento_estoque orig on orig.id = m.estorno_de_id
    where m.estabelecimento_id = ${estab} and i.tipo = 'produto_acabado' and m.executado_em < ${fim}::timestamptz
    group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10`)
  const garrafas = new Map<
    string,
    {
      titularId: string | null
      titular: string | null
      produtoId: string | null
      produto: string
      marca: string | null
      classe: string | null
      registroMapa: string | null
      volumeMl: number | null
      c: Record<string, number>
    }
  >()
  for (const r of est.rows) {
    const chave = `${r.titular_id}|${r.produto_id ?? r.item}|${r.volume_ml}`
    const g = garrafas.get(chave) ?? {
      titularId: r.titular_id,
      titular: r.titular,
      produtoId: r.produto_id,
      produto: r.produto ?? r.item,
      marca: r.marca,
      classe: r.classe,
      registroMapa: r.registro_mapa,
      volumeMl: r.volume_ml,
      c: Object.fromEntries(['inicial', ...COLUNAS].map((k) => [k, 0])),
    }
    g.c.inicial! += Math.round(Number(r.antes))
    g.c[GRUPO_ENGARRAFADO[r.tipo] ?? 'internos']! += Math.round(Number(r.durante))
    garrafas.set(chave, g)
  }
  const linhasEngarrafado = [...garrafas.values()]
    .map((g) => {
      const final = Object.values(g.c).reduce((t, v) => t + v, 0)
      const emLitros = (n: number) => (g.volumeMl ? ((n * g.volumeMl) / 1000).toFixed(2) : null)
      const cols = { ...g.c, final }
      return {
        titularId: g.titularId,
        titular: g.titular,
        produtoId: g.produtoId,
        produto: g.produto,
        marca: g.marca,
        classe: g.classe,
        registroMapa: g.registroMapa,
        volumeMl: g.volumeMl,
        garrafas: cols,
        litros: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, emLitros(v)])),
      }
    })
    .filter((g) => Object.values(g.garrafas).some((v) => v !== 0))
    .sort(
      (a, b) =>
        Number(!!a.titularId) - Number(!!b.titularId) ||
        (a.titular ?? '').localeCompare(b.titular ?? '') ||
        (a.marca ?? '').localeCompare(b.marca ?? '') ||
        a.produto.localeCompare(b.produto) ||
        (a.volumeMl ?? 0) - (b.volumeMl ?? 0),
    )

  // Totais em litros por titular (própria primeiro).
  const titulares = new Map<string, { titularId: string | null; titular: string | null }>()
  for (const x of [...linhasGranel, ...linhasEngarrafado])
    titulares.set(`${x.titularId}`, { titularId: x.titularId, titular: x.titular })
  const totais = [...titulares.values()].map((t) => {
    const soma = (lista: Array<Record<string, unknown>>, campo: string, sub?: string) =>
      litros(
        lista
          .filter((x) => x.titularId === t.titularId)
          .reduce(
            (s2, x) =>
              s2 +
              centavos(
                (sub ? (x[sub] as Record<string, string | null>)[campo] : x[campo]) as string,
              ),
            0,
          ),
      )
    return {
      ...t,
      granel: {
        inicial: soma(linhasGranel, 'inicial', 'litros'),
        producao: soma(linhasGranel, 'producao', 'litros'),
        final: soma(linhasGranel, 'final', 'litros'),
      },
      engarrafado: {
        inicial: soma(linhasEngarrafado, 'inicial', 'litros'),
        producao: soma(linhasEngarrafado, 'producao', 'litros'),
        final: soma(linhasEngarrafado, 'final', 'litros'),
      },
    }
  })

  // Avisos: o sistema informa (P29); para marcar a entrega, cada um pede "ciente".
  const avisos: Aviso[] = []
  const [meses] = (
    await ctx.tx.execute<{ abertos: number[] | null }>(sql`
      select array_agg(m order by m) as abertos from generate_series(1, 12) m
      where not exists (select 1 from fechamento_mensal f where f.estabelecimento_id = ${estab}
        and f.ano = ${ano} and f.mes = m and f.situacao = 'fechado')`)
  ).rows
  if (meses?.abertos?.length)
    avisos.push({
      codigo: 'declaracao:meses_abertos',
      mensagem: `Meses de ${ano} não fechados: ${meses.abertos.map((m) => String(m).padStart(2, '0')).join(', ')}. Feche-os antes, para os números não mudarem depois da entrega.`,
    })
  const semClasse = linhasGranel.filter((g) => !g.classe).length
  if (semClasse)
    avisos.push({
      codigo: 'declaracao:sem_classe',
      mensagem: 'Há vinho a granel de projeto sem classe: informe a classe no projeto.',
    })
  const semRegistro = linhasEngarrafado.filter((g) => g.produtoId && !g.registroMapa)
  if (semRegistro.length)
    avisos.push({
      codigo: 'declaracao:sem_registro',
      mensagem: `Produto sem registro no MAPA: ${[...new Set(semRegistro.map((g) => g.produto))].join(', ')}.`,
    })
  const [semCodigo] = (
    await ctx.tx.execute<{ nomes: string[] | null }>(sql`
      select array_agg(distinct v.nome order by v.nome) as nomes from variedade v
      where v.codigo_oficial is null and v.equivale_a is null and (
        exists (select 1 from romaneio_item ri join romaneio r on r.id = ri.romaneio_id
          where ri.variedade_id = v.id and r.estabelecimento_id = ${estab} and r.situacao = 'confirmado'
            and r.chegada_em >= ${inicio}::timestamptz and r.chegada_em < ${fim}::timestamptz)
        or exists (select 1 from composicao_parte_item ci join (
            select distinct on (cp.lote_id, cp.recipiente_id) cp.id, cp.volume_litros from composicao_parte cp
            join lote l on l.id = cp.lote_id
            where l.estabelecimento_id = ${estab} and cp.vigente_desde < ${fim}::timestamptz
            order by cp.lote_id, cp.recipiente_id, cp.vigente_desde desc, cp.lancada_em desc
          ) ult on ult.id = ci.parte_id
          where ci.variedade_id = v.id and ult.volume_litros > 0))`)
  ).rows
  if (semCodigo?.nomes?.length)
    avisos.push({
      codigo: 'declaracao:variedade_sem_codigo',
      mensagem: `Variedade sem código oficial na uva recebida ou no vinho em estoque: ${semCodigo.nomes.join(', ')}. Confira como declarar.`,
    })

  // Espumante em elaboração: garrafas em processo (tiragem até a finalização), em litros.
  const [ep] = (
    await ctx.tx.execute<{
      inicial: string
      tiragens: string
      perdas: string
      finalizadas: string
      final: string
    }>(sql`
      with l as (
        select l.*, e2.fuso from espumante_lote l join estabelecimento e2 on e2.id = l.estabelecimento_id
        where l.estabelecimento_id = ${estab} and l.situacao <> 'cancelado'
      ),
      g as (
        select l.id, l.volume_ml, l.tiragem_em, l.finalizado_em, l.garrafas_iniciais,
          coalesce((select sum(e.perdas) from espumante_evento e where e.lote_id = l.id and e.anulado_em is null
            and e.executado_em < ${inicio}::timestamptz), 0) as perdas_antes,
          coalesce((select sum(e.perdas) from espumante_evento e where e.lote_id = l.id and e.anulado_em is null
            and e.executado_em >= ${inicio}::timestamptz and e.executado_em < ${fim}::timestamptz), 0) as perdas_ano
        from l
      )
      select
        coalesce(sum(case when tiragem_em < ${inicio}::timestamptz and (finalizado_em is null or finalizado_em >= ${inicio}::timestamptz)
          then (garrafas_iniciais - perdas_antes) * volume_ml end), 0)::numeric / 1000 as inicial,
        coalesce(sum(case when tiragem_em >= ${inicio}::timestamptz and tiragem_em < ${fim}::timestamptz
          then garrafas_iniciais * volume_ml end), 0)::numeric / 1000 as tiragens,
        coalesce(sum(perdas_ano * volume_ml), 0)::numeric / 1000 as perdas,
        coalesce(sum(case when finalizado_em >= ${inicio}::timestamptz and finalizado_em < ${fim}::timestamptz
          then (garrafas_iniciais - perdas_antes - perdas_ano) * volume_ml end), 0)::numeric / 1000 as finalizadas,
        coalesce(sum(case when tiragem_em < ${fim}::timestamptz and (finalizado_em is null or finalizado_em >= ${fim}::timestamptz)
          then (garrafas_iniciais - perdas_antes - perdas_ano) * volume_ml end), 0)::numeric / 1000 as final
      from g`)
  ).rows
  const L2 = (v: string | undefined) => Number(v ?? 0).toFixed(2)
  const emProcesso = {
    inicial: L2(ep?.inicial),
    tiragens: L2(ep?.tiragens),
    perdas: L2(ep?.perdas),
    finalizadas: L2(ep?.finalizadas),
    final: L2(ep?.final),
  }

  // Vinho que voltou da cantina contratada ("vinho cigano"): já está nas entradas; a linha mostra
  // quanto delas é retorno de terceiro (perguntas-externas.md, ponto 2 em aberto).
  const [ret] = (
    await ctx.tx.execute<{ granel: string; engarrafado: string; garrafas: string }>(sql`
      select coalesce(sum(y.litros) filter (where y.tipo = 'granel'), 0)::text as granel,
        coalesce(sum(y.litros) filter (where y.tipo = 'engarrafado'), 0)::text as engarrafado,
        coalesce(sum(y.garrafas) filter (where y.tipo = 'engarrafado'), 0)::text as garrafas
      from retorno_terceiro t join retorno_terceiro_item y on y.retorno_id = t.id
      where t.estabelecimento_id = ${estab} and t.situacao = 'lancada'
        and t.executado_em >= ${inicio}::timestamptz and t.executado_em < ${fim}::timestamptz`)
  ).rows
  const retornosTerceiro = {
    granelLitros: L2(ret?.granel),
    engarrafadoLitros: L2(ret?.engarrafado),
    garrafas: Math.round(Number(ret?.garrafas ?? 0)),
  }

  return {
    ano,
    granel: linhasGranel,
    retornosTerceiro,
    emProcesso,
    engarrafado: linhasEngarrafado,
    totais,
    avisos,
    calculadoEm: new Date().toISOString(),
  }
}

/** Relatórios de apoio à declaração de uvas no SIVIBE: vindima = colheita no ano civil. */
export async function apoioSivibe(ctx: ContextoEmpresa, estab: string, ano: number) {
  const base = sql`
    from romaneio_item ri join romaneio r on r.id = ri.romaneio_id
      join variedade v on v.id = ri.variedade_id
      left join parcela pa on pa.id = ri.parcela_id
      left join propriedade pr on pr.id = pa.propriedade_id
    where r.estabelecimento_id = ${estab} and r.situacao = 'confirmado'
      and ri.data_colheita >= make_date(${ano}, 1, 1) and ri.data_colheita < make_date(${ano + 1}, 1, 1)`
  const kg = sql`coalesce(sum((select sum(p.bruto_kg - p.tara_kg) from pesagem p where p.item_id = ri.id)), 0)::text`
  const propria = await ctx.tx.execute<{
    propriedade: string | null
    numero_sivibe: string | null
    municipio: string | null
    uf: string | null
    parcela: string | null
    area_ha: string | null
    variedade: string
    codigo_oficial: string | null
    ciclo: string | null
    kg: string
    romaneios: number
  }>(sql`
    select pr.nome as propriedade, pr.numero_sivibe, pr.municipio, pr.uf, pa.nome as parcela,
      pa.area_ha::text as area_ha, v.nome as variedade, v.codigo_oficial, ri.ciclo,
      ${kg} as kg, count(distinct r.id)::int as romaneios
    ${base} and r.origem = 'vinhedo_proprio' and r.dono_uva_id is null
    group by pr.nome, pr.numero_sivibe, pr.municipio, pr.uf, pa.nome, pa.area_ha, v.nome, v.codigo_oficial, ri.ciclo
    order by pr.nome nulls last, pa.nome nulls last, v.nome, ri.ciclo nulls first`)
  const pessoaSql = (coluna: ReturnType<typeof sql>) => sql`
    (select f.nome from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = ${coluna}) as nome,
    (select f.documento from pessoa pe join ficha f on f.id = pe.ficha_id where pe.id = ${coluna}) as documento,
    (select u.numero_sivibe from pessoa_produtor_uva u where u.pessoa_id = ${coluna}) as sivibe_pessoa,
    (select u.situacao_cadastro from pessoa_produtor_uva u where u.pessoa_id = ${coluna}) as situacao_cadastro,
    (select u.declaracao_ano_anterior from pessoa_produtor_uva u where u.pessoa_id = ${coluna}) as declaracao_ano_anterior`
  type LinhaPessoa = {
    pessoa_id: string | null
    nome: string | null
    documento: string | null
    sivibe_pessoa: string | null
    situacao_cadastro: string | null
    declaracao_ano_anterior: boolean | null
    propriedade: string | null
    numero_sivibe: string | null
    variedade: string
    codigo_oficial: string | null
    kg: string
    notas: string[] | null
  }
  const porPessoa = (coluna: ReturnType<typeof sql>, filtro: ReturnType<typeof sql>) =>
    ctx.tx.execute<LinhaPessoa>(sql`
      select ${coluna} as pessoa_id, ${pessoaSql(coluna)}, pr.nome as propriedade, pr.numero_sivibe,
        v.nome as variedade, v.codigo_oficial, ${kg} as kg,
        array_agg(distinct r.nf_numero) filter (where r.nf_numero is not null) as notas
      ${base} and ${filtro}
      group by ${coluna}, pr.nome, pr.numero_sivibe, v.nome, v.codigo_oficial
      order by 2, pr.nome nulls last, v.nome`)
  const compradas = await porPessoa(
    sql`r.fornecedor_id`,
    sql`r.origem = 'fornecedor' and r.dono_uva_id is null`,
  )
  const terceiros = await porPessoa(sql`r.dono_uva_id`, sql`r.dono_uva_id is not null`)
  const mapear = (l: LinhaPessoa) => ({
    pessoaId: l.pessoa_id,
    nome: l.nome,
    documento: l.documento,
    numeroSivibe: l.numero_sivibe ?? l.sivibe_pessoa,
    situacaoCadastro: l.situacao_cadastro,
    declaracaoAnoAnterior: l.declaracao_ano_anterior,
    propriedade: l.propriedade,
    variedade: l.variedade,
    codigoOficial: l.codigo_oficial,
    kg: Number(l.kg).toFixed(1),
    notas: l.notas ?? [],
  })
  // Uva enviada para processamento por terceiros ("vinho cigano", entrega simples): pela data da
  // remessa no ano civil (04, roteiro do ciclo 10, bloco 5).
  const { inicio: iniAno, fim: fimAno } = await limitesAno(ctx, estab, ano)
  const enviadas = await ctx.tx.execute<{
    cantina: string
    documento: string | null
    variedade: string
    codigo_oficial: string | null
    origem: string
    kg: string
    notas: string[] | null
  }>(sql`
    select f.nome as cantina, f.documento, v.nome as variedade, v.codigo_oficial, x.origem_uva as origem,
      sum(x.kg)::text as kg, array_agg(distinct r.nf_numero) filter (where r.nf_numero is not null) as notas
    from remessa_terceiro_item x join remessa_terceiro r on r.id = x.remessa_id
      join variedade v on v.id = x.variedade_id
      join pessoa pe on pe.id = r.cantina_id join ficha f on f.id = pe.ficha_id
    where r.estabelecimento_id = ${estab} and r.situacao = 'lancada' and x.tipo = 'uva'
      and r.executado_em >= ${iniAno}::timestamptz and r.executado_em < ${fimAno}::timestamptz
    group by f.nome, f.documento, v.nome, v.codigo_oficial, x.origem_uva
    order by f.nome, v.nome`)
  const avisos: Aviso[] = []
  const irregulares = new Set(
    [...compradas.rows, ...terceiros.rows]
      .filter(
        (l) =>
          !(l.numero_sivibe ?? l.sivibe_pessoa) ||
          l.situacao_cadastro !== 'regular' ||
          l.declaracao_ano_anterior === false,
      )
      .map((l) => l.nome ?? '—'),
  )
  if (irregulares.size)
    avisos.push({
      codigo: 'sivibe:produtor',
      mensagem: `Uva de produtor sem número no SIVIBE, com cadastro não regular ou sem a declaração do ano anterior: ${[...irregulares].join(', ')} (IN MAPA 59/2020, art. 13; Decreto 12.709/2025, art. 203, V e VI).`,
    })
  const propriaSemSivibe = propria.rows.filter((l) => l.propriedade && !l.numero_sivibe)
  if (propriaSemSivibe.length)
    avisos.push({
      codigo: 'sivibe:propriedade',
      mensagem: `Propriedade própria sem número no SIVIBE: ${[...new Set(propriaSemSivibe.map((l) => l.propriedade))].join(', ')}.`,
    })
  const semParcela = propria.rows.filter((l) => !l.propriedade).length
  if (semParcela)
    avisos.push({
      codigo: 'sivibe:parcela',
      mensagem:
        'Uva própria recebida sem a parcela de origem: o SIVIBE pede a quantidade por parreiral.',
    })
  return {
    ano,
    propria: propria.rows.map((l) => ({
      propriedade: l.propriedade,
      numeroSivibe: l.numero_sivibe,
      municipio: l.municipio,
      uf: l.uf,
      parcela: l.parcela,
      areaHa: l.area_ha,
      variedade: l.variedade,
      codigoOficial: l.codigo_oficial,
      ciclo: l.ciclo,
      kg: Number(l.kg).toFixed(1),
      romaneios: l.romaneios,
    })),
    compradas: compradas.rows.map(mapear),
    terceiros: terceiros.rows.map(mapear),
    enviadas: enviadas.rows.map((l) => ({
      cantina: l.cantina,
      documento: l.documento,
      variedade: l.variedade,
      codigoOficial: l.codigo_oficial,
      origem: l.origem,
      kg: Number(l.kg).toFixed(1),
      notas: l.notas ?? [],
    })),
    avisos,
    calculadoEm: new Date().toISOString(),
  }
}

export type Tipo = (typeof TIPOS_DECLARACAO)[number]
const calcular = (ctx: ContextoEmpresa, estab: string, ano: number, tipo: Tipo) =>
  tipo === 'anual_mapa' ? declaracaoAnual(ctx, estab, ano) : apoioSivibe(ctx, estab, ano)

export async function rotasDeclaracoes(app: FastifyInstance): Promise<void> {
  const { db } = app.deps
  const params = z.object({
    ano: z.coerce.number().int().min(2000).max(2200),
    tipo: z.enum(TIPOS_DECLARACAO),
  })

  async function registro(ctx: ContextoEmpresa, estab: string, ano: number, tipo: Tipo) {
    const [d] = await ctx.tx
      .select()
      .from(s.declaracao)
      .where(
        and(
          eq(s.declaracao.estabelecimentoId, estab),
          eq(s.declaracao.tipo, tipo),
          eq(s.declaracao.ano, ano),
        ),
      )
      .for('update')
    return d
  }

  /** Anos com declaração registrada, para o histórico. */
  app.get('/api/declaracoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({
          id: s.declaracao.id,
          tipo: s.declaracao.tipo,
          ano: s.declaracao.ano,
          situacao: s.declaracao.situacao,
          protocolo: s.declaracao.protocolo,
          declaradaEm: s.declaracao.declaradaEm,
        })
        .from(s.declaracao)
        .where(eq(s.declaracao.estabelecimentoId, estab))
        .orderBy(desc(s.declaracao.ano), s.declaracao.tipo)
    }),
  )

  /** A declaração do ano: entregue mostra o instantâneo; senão, os números de agora. */
  app.get<{ Params: { ano: string; tipo: string } }>('/api/declaracoes/:ano/:tipo', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      const { ano, tipo } = params.parse(req.params)
      const { terminou } = await limitesAno(ctx, estab, ano)
      const [d] = await ctx.tx
        .select({
          id: s.declaracao.id,
          situacao: s.declaracao.situacao,
          numeros: s.declaracao.numeros,
          protocolo: s.declaracao.protocolo,
          declaradaEm: s.declaracao.declaradaEm,
          declaradaPor: sql<string>`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${s.declaracao.declaradaPor})`,
        })
        .from(s.declaracao)
        .where(
          and(
            eq(s.declaracao.estabelecimentoId, estab),
            eq(s.declaracao.tipo, tipo),
            eq(s.declaracao.ano, ano),
          ),
        )
      const retificacoes = d
        ? await ctx.tx
            .select({
              id: s.declaracaoRetificacao.id,
              motivo: s.declaracaoRetificacao.motivo,
              abertaEm: s.declaracaoRetificacao.abertaEm,
              abertaPor: sql<string>`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${s.declaracaoRetificacao.abertaPor})`,
              protocoloAnterior: s.declaracaoRetificacao.protocoloAnterior,
              concluidaEm: s.declaracaoRetificacao.concluidaEm,
              protocolo: s.declaracaoRetificacao.protocolo,
            })
            .from(s.declaracaoRetificacao)
            .where(eq(s.declaracaoRetificacao.declaracaoId, d.id))
            .orderBy(desc(s.declaracaoRetificacao.abertaEm))
        : []
      const entregue = d && d.situacao !== 'em_retificacao'
      return {
        ano,
        tipo,
        terminou,
        registro: d ? { ...d, numeros: undefined } : null,
        retificacoes,
        numeros: entregue ? d.numeros : await calcular(ctx, estab, ano, tipo),
        instantaneo: !!entregue,
      }
    }),
  )

  /** Marca como entregue: guarda os números de agora e o protocolo; a anual trava o ano. */
  app.post<{ Params: { ano: string; tipo: string } }>(
    '/api/declaracoes/:ano/:tipo/declarar',
    async (req) =>
      naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
        const estab = ctx.exigirEstabelecimento()
        const { ano, tipo } = params.parse(req.params)
        const { protocolo, cientes } = z
          .object({
            protocolo: z.string().trim().min(1, 'Informe o protocolo').max(100),
            cientes: z.array(z.string().max(100)).max(50).default([]),
          })
          .parse(req.body)
        const { terminou } = await limitesAno(ctx, estab, ano)
        if (tipo === 'anual_mapa' && !terminou)
          throw new ErroRegra(
            `O ano de ${ano} ainda não terminou: a declaração é de 1º a 10 de janeiro de ${ano + 1}.`,
            'ano_aberto',
          )
        if (await registro(ctx, estab, ano, tipo))
          throw new ErroRegra(
            'Esta declaração já foi marcada como entregue: para mudar, abra uma retificação.',
            'declarada',
          )
        const numeros = await calcular(ctx, estab, ano, tipo)
        const avisos = numeros.avisos
        exigirCientes(avisos, cientes)
        const [d] = await ctx.tx
          .insert(s.declaracao)
          .values({
            empresaId: ctx.empresaId,
            estabelecimentoId: estab,
            tipo,
            ano,
            situacao: 'declarada',
            numeros,
            protocolo,
            declaradaEm: new Date(),
            declaradaPor: ctx.usuarioId,
          })
          .returning({ id: s.declaracao.id })
        await ctx.auditar({
          acao: 'declarar',
          entidade: 'declaracao',
          registroId: d!.id,
          dados: { tipo, ano, protocolo, avisos: avisos.map((a) => a.mensagem) },
        })
        return { id: d!.id }
      }),
  )

  /** Abre a retificação: pede a permissão de reabrir período e o motivo; destrava o ano. */
  app.post<{ Params: { ano: string; tipo: string } }>(
    '/api/declaracoes/:ano/:tipo/retificacao',
    async (req) =>
      naEmpresa(db, req, ['enotrace.reabrir_periodo', 'reabrir_periodo'], async (ctx) => {
        const estab = ctx.exigirEstabelecimento()
        const { ano, tipo } = params.parse(req.params)
        const { motivo } = z
          .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
          .parse(req.body)
        const d = await paraRetificar(ctx, estab, ano, tipo)
        if (await exigeAprovacao(ctx, 'retificacao'))
          return pedirAprovacao(ctx, {
            tipo: 'retificacao',
            estabelecimentoId: estab,
            entidade: 'declaracao',
            registroId: d.id,
            resumo: `Retificar a declaração ${tipo === 'anual_mapa' ? 'anual' : 'de uvas'} de ${ano}: ${motivo}`,
            dados: { ano, tipo, motivo },
          })
        return abrirRetificacao(ctx, estab, ano, tipo, motivo, ctx.usuarioId)
      }),
  )

  /** Conclui a retificação: novo protocolo e os números de agora; a anual volta a travar o ano. */
  app.post<{ Params: { ano: string; tipo: string } }>(
    '/api/declaracoes/:ano/:tipo/retificacao/concluir',
    async (req) =>
      naEmpresa(db, req, [F, 'confirmar'], async (ctx) => {
        const estab = ctx.exigirEstabelecimento()
        const { ano, tipo } = params.parse(req.params)
        const { protocolo, cientes } = z
          .object({
            protocolo: z.string().trim().min(1, 'Informe o protocolo').max(100),
            cientes: z.array(z.string().max(100)).max(50).default([]),
          })
          .parse(req.body)
        const d = await registro(ctx, estab, ano, tipo)
        if (d?.situacao !== 'em_retificacao')
          throw new ErroRegra('Não há retificação aberta.', 'sem_retificacao')
        const numeros = await calcular(ctx, estab, ano, tipo)
        const avisos = numeros.avisos
        exigirCientes(avisos, cientes)
        const agora = new Date()
        await ctx.tx
          .update(s.declaracaoRetificacao)
          .set({ concluidaEm: agora, concluidaPor: ctx.usuarioId, protocolo })
          .where(
            and(
              eq(s.declaracaoRetificacao.declaracaoId, d.id),
              sql`${s.declaracaoRetificacao.concluidaEm} is null`,
            ),
          )
        await ctx.tx
          .update(s.declaracao)
          .set({
            situacao: 'retificada',
            numeros,
            protocolo,
            declaradaEm: agora,
            declaradaPor: ctx.usuarioId,
          })
          .where(eq(s.declaracao.id, d.id))
        await ctx.auditar({
          acao: 'concluir_retificacao',
          entidade: 'declaracao',
          registroId: d.id,
          dados: { tipo, ano, protocolo, avisos: avisos.map((a) => a.mensagem) },
        })
        return { ok: true }
      }),
  )
}

async function paraRetificar(ctx: ContextoEmpresa, estab: string, ano: number, tipo: Tipo) {
  const [d] = await ctx.tx
    .select()
    .from(s.declaracao)
    .where(
      and(
        eq(s.declaracao.estabelecimentoId, estab),
        eq(s.declaracao.tipo, tipo),
        eq(s.declaracao.ano, ano),
      ),
    )
    .for('update')
  if (!d) throw new ErroNaoEncontrado('Declaração não entregue: não há o que retificar.')
  if (d.situacao === 'em_retificacao')
    throw new ErroRegra('Já há uma retificação aberta.', 'em_retificacao')
  return d
}

/** Abre a retificação (direto ou na aprovação do pedido; "por" é quem pediu). */
export async function abrirRetificacao(
  ctx: ContextoEmpresa,
  estab: string,
  ano: number,
  tipo: Tipo,
  motivo: string,
  por: string,
) {
  const d = await paraRetificar(ctx, estab, ano, tipo)
  const [r] = await ctx.tx
    .insert(s.declaracaoRetificacao)
    .values({
      empresaId: ctx.empresaId,
      declaracaoId: d.id,
      motivo,
      abertaEm: new Date(),
      abertaPor: por,
      numerosAnteriores: d.numeros,
      protocoloAnterior: d.protocolo,
    })
    .returning({ id: s.declaracaoRetificacao.id })
  await ctx.tx
    .update(s.declaracao)
    .set({ situacao: 'em_retificacao' })
    .where(eq(s.declaracao.id, d.id))
  await ctx.auditar({
    acao: 'abrir_retificacao',
    entidade: 'declaracao',
    registroId: d.id,
    dados: { tipo, ano, motivo },
  })
  return { id: r!.id }
}
