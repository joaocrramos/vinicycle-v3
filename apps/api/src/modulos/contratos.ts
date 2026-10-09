// EnoTrace › Terceiros › Contratos de terceirização (cantina.md, Vinificação para terceiros e em
// terceiros; 03-modelo-de-dados.md, 2.5; IN MAPA 72/2018, art. 27; 04, roteiro do ciclo 10, bloco
// 1). Dois sentidos: prestamos o serviço (a contraparte é cliente de vinificação e dona das marcas)
// ou contratamos (a contraparte é a cantina; as marcas são da própria empresa). O contrato monta o
// texto do rótulo "Produzido por… para…" e é sugerido na recepção e na entrada de granel do titular.
import {
  consultaListagem,
  contratoVigente,
  type DadosContrato,
  dadosContrato,
  type ParteRotulo,
  type SentidoContrato,
  textoRotuloTerceirizacao,
} from '@vinicycle/shared'
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { rotasInativacao } from '../nucleo/inativacao'
import { buscaTexto, listar } from '../nucleo/listagem'
import type { Aviso } from '../nucleo/regras'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'
import { transferidoNoContrato } from './titularidade'

const F = 'enotrace.cadastros'

/** Papel exigido da contraparte em cada sentido. */
const PAPEL_CONTRAPARTE: Record<SentidoContrato, { papel: string; nome: string }> = {
  prestamos: { papel: 'cliente_vinificacao', nome: 'cliente de vinificação' },
  contratamos: { papel: 'cantina_prestadora', nome: 'cantina prestadora de serviço' },
}

const nomePessoa = (coluna: unknown) =>
  sql<string>`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = ${coluna})`

type Contrato = typeof s.contratoTerceirizacao.$inferSelect

async function conferir(ctx: ContextoEmpresa, d: DadosContrato) {
  const exigido = PAPEL_CONTRAPARTE[d.sentido]
  const [papel] = await ctx.tx
    .select({ id: s.pessoaPapel.id })
    .from(s.pessoaPapel)
    .where(
      and(
        eq(s.pessoaPapel.pessoaId, d.contraparteId),
        eq(s.pessoaPapel.empresaId, ctx.empresaId),
        eq(s.pessoaPapel.papel, exigido.papel),
        eq(s.pessoaPapel.ativo, true),
      ),
    )
  if (!papel)
    throw new ErroRegra(
      `A contraparte precisa ter o papel de ${exigido.nome} (Gestão › Pessoas).`,
      'contraparteId',
    )
  {
    const [e] = await ctx.tx
      .select({ id: s.estabelecimento.id })
      .from(s.estabelecimento)
      .where(
        and(
          eq(s.estabelecimento.id, d.estabelecimentoId),
          eq(s.estabelecimento.empresaId, ctx.empresaId),
        ),
      )
    if (!e) throw new ErroRegra('Estabelecimento não encontrado.', 'estabelecimentoId')
  }
  if (d.documentoId) {
    const [doc] = await ctx.tx
      .select({ id: s.documento.id })
      .from(s.documento)
      .where(and(eq(s.documento.id, d.documentoId), eq(s.documento.empresaId, ctx.empresaId)))
    if (!doc) throw new ErroRegra('Documento não encontrado.', 'documentoId')
  }
  // Dono das marcas e dos produtos: a contraparte quando prestamos; a própria empresa quando
  // contratamos (cantina.md, Quem registra o produto).
  const dono = d.sentido === 'prestamos' ? d.contraparteId : null
  const doDono = (donoId: string | null) => donoId === dono
  const quem = d.sentido === 'prestamos' ? 'da contraparte' : 'da própria empresa'
  if (d.marcas.length) {
    const marcas = await ctx.tx
      .select({ id: s.marca.id, nome: s.marca.nome, donoId: s.marca.donoId })
      .from(s.marca)
      .where(and(inArray(s.marca.id, d.marcas), eq(s.marca.empresaId, ctx.empresaId)))
    if (marcas.length !== new Set(d.marcas).size)
      throw new ErroRegra('Marca não encontrada.', 'marcas')
    const fora = marcas.filter((m) => !doDono(m.donoId))
    if (fora.length)
      throw new ErroRegra(
        `As marcas do contrato precisam ser ${quem}: ${fora.map((m) => m.nome).join(', ')}.`,
        'marcas',
      )
  }
  if (d.produtos.length) {
    const produtos = await ctx.tx
      .select({ id: s.produto.id, nome: s.produto.nome, donoId: s.marca.donoId })
      .from(s.produto)
      .innerJoin(s.marca, eq(s.marca.id, s.produto.marcaId))
      .where(and(inArray(s.produto.id, d.produtos), eq(s.produto.empresaId, ctx.empresaId)))
    if (produtos.length !== new Set(d.produtos).size)
      throw new ErroRegra('Produto não encontrado.', 'produtos')
    const fora = produtos.filter((p) => !doDono(p.donoId))
    if (fora.length)
      throw new ErroRegra(
        `Os produtos do contrato precisam ser de marcas ${quem}: ${fora.map((p) => p.nome).join(', ')}.`,
        'produtos',
      )
  }
}

async function gravarLigacoes(ctx: ContextoEmpresa, contratoId: string, d: DadosContrato) {
  await ctx.tx
    .delete(s.contratoTerceirizacaoMarca)
    .where(eq(s.contratoTerceirizacaoMarca.contratoId, contratoId))
  await ctx.tx
    .delete(s.contratoTerceirizacaoProduto)
    .where(eq(s.contratoTerceirizacaoProduto.contratoId, contratoId))
  await ctx.tx
    .delete(s.contratoTerceirizacaoPreco)
    .where(eq(s.contratoTerceirizacaoPreco.contratoId, contratoId))
  if (d.precos.length)
    await ctx.tx
      .insert(s.contratoTerceirizacaoPreco)
      .values(
        d.precos.map((p, i) => ({ empresaId: ctx.empresaId, contratoId, ordem: i + 1, ...p })),
      )
  const marcas = [...new Set(d.marcas)]
  const produtos = [...new Set(d.produtos)]
  if (marcas.length)
    await ctx.tx
      .insert(s.contratoTerceirizacaoMarca)
      .values(marcas.map((marcaId) => ({ empresaId: ctx.empresaId, contratoId, marcaId })))
  if (produtos.length)
    await ctx.tx
      .insert(s.contratoTerceirizacaoProduto)
      .values(produtos.map((produtoId) => ({ empresaId: ctx.empresaId, contratoId, produtoId })))
}

const valores = (d: DadosContrato) => ({
  sentido: d.sentido,
  numero: d.numero,
  atividades: [...new Set(d.atividades)],
  contraparteId: d.contraparteId,
  estabelecimentoId: d.estabelecimentoId,
  registroMapaContraparte: d.registroMapaContraparte,
  registroMapaContraparteValidade: d.registroMapaContraparteValidade,
  registroProduto: d.registroProduto,
  vigenciaInicio: d.vigenciaInicio,
  vigenciaFim: d.vigenciaFim,
  insumosCantina: d.insumosCantina,
  insumosCliente: d.insumosCliente,
  perdaToleradaTipo: d.perdaToleradaTipo,
  perdaToleradaValor: d.perdaToleradaValor,
  pagamentoDinheiro: d.pagamentoDinheiro,
  pagamentoProdutoValor: d.pagamentoProdutoValor,
  pagamentoProdutoUnidade: d.pagamentoProdutoUnidade,
  prefixoLote: d.prefixoLote,
  formaTexto: d.formaTexto,
  textoRotulo: d.textoRotulo,
  comunicadoSipeagroEm: d.comunicadoSipeagroEm,
  protocoloSipeagro: d.protocoloSipeagro,
  documentoId: d.documentoId ?? null,
  observacoes: d.observacoes,
})

/** O que muda o que foi comunicado no SIPEAGRO (IN 72, art. 27, §1º). */
const CAMPOS_COMUNICADOS = [
  'contraparteId',
  'atividades',
  'registroMapaContraparte',
  'registroProduto',
  'vigenciaInicio',
  'vigenciaFim',
  'estabelecimentoId',
] as const

async function parteDaFicha(ctx: ContextoEmpresa, fichaId: string): Promise<ParteRotulo> {
  const [f] = await ctx.tx
    .select({
      nome: s.ficha.nome,
      tipoDocumento: s.ficha.tipoDocumento,
      documento: s.ficha.documento,
      endereco: sql<
        string | null
      >`(select e.logradouro || ', ' || e.numero || coalesce(', ' || nullif(e.bairro, ''), '') || ', ' || e.municipio || '/' || e.uf from ficha_endereco e where e.ficha_id = ficha.id order by e.principal desc limit 1)`,
    })
    .from(s.ficha)
    .where(eq(s.ficha.id, fichaId))
  return f ?? { nome: '', tipoDocumento: null, documento: null, endereco: null }
}

/**
 * Texto do rótulo montado pelo sistema, na forma escolhida (cantina.md, Rótulo; IN 72, art. 28).
 * A cantina é quem produz; a unidade central é quem tem o registro do produto.
 */
export async function textoMontado(
  ctx: ContextoEmpresa,
  c: Pick<
    Contrato,
    'sentido' | 'contraparteId' | 'estabelecimentoId' | 'registroProduto' | 'formaTexto'
  >,
): Promise<string> {
  const [p] = await ctx.tx
    .select({ fichaId: s.pessoa.fichaId })
    .from(s.pessoa)
    .where(eq(s.pessoa.id, c.contraparteId))
  const [nos] = await ctx.tx
    .select({ fichaId: s.estabelecimento.fichaId })
    .from(s.estabelecimento)
    .where(eq(s.estabelecimento.id, c.estabelecimentoId))
  const contraparte = await parteDaFicha(ctx, p!.fichaId)
  const empresa = await parteDaFicha(ctx, nos!.fichaId)
  const cantina = c.sentido === 'prestamos' ? empresa : contraparte
  const cliente = c.sentido === 'prestamos' ? contraparte : empresa
  const unidadeCentral = c.registroProduto === 'contratante' ? cliente : cantina
  return textoRotuloTerceirizacao(c.formaTexto, { cantina, cliente, unidadeCentral })
}

/** Texto do rótulo do contrato: o editado ou, sem ele, o montado. */
export async function textoDoContrato(ctx: ContextoEmpresa, c: Contrato): Promise<string> {
  return c.textoRotulo ?? (await textoMontado(ctx, c))
}

/** Contratos ativos com a contraparte, no sentido, vigentes na data (ISO), do mais recente. */
export async function contratosVigentes(
  ctx: ContextoEmpresa,
  o: { contraparteId: string; sentido: SentidoContrato; data: string },
) {
  return ctx.tx
    .select({
      id: s.contratoTerceirizacao.id,
      numero: s.contratoTerceirizacao.numero,
      vigenciaInicio: s.contratoTerceirizacao.vigenciaInicio,
      vigenciaFim: s.contratoTerceirizacao.vigenciaFim,
    })
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
        eq(s.contratoTerceirizacao.contraparteId, o.contraparteId),
        eq(s.contratoTerceirizacao.sentido, o.sentido),
        eq(s.contratoTerceirizacao.ativo, true),
        sql`${s.contratoTerceirizacao.vigenciaInicio} <= ${o.data}::date`,
        sql`(${s.contratoTerceirizacao.vigenciaFim} is null or ${s.contratoTerceirizacao.vigenciaFim} >= ${o.data}::date)`,
      ),
    )
    .orderBy(sql`${s.contratoTerceirizacao.vigenciaInicio} desc`)
}

/**
 * Aviso "sem contrato vigente" para o vinho ou a uva de um titular (P29: o contrato não é
 * obrigatório). Com o contrato escolhido, confere que é do titular e avisa se não está vigente.
 */
export async function avisoContrato(
  ctx: ContextoEmpresa,
  o: { titularId: string | null; contratoId?: string | null; data: string },
): Promise<Aviso | null> {
  if (!o.titularId) return null
  const fonte = 'IN MAPA 72/2018, art. 27'
  if (o.contratoId) {
    const [c] = await ctx.tx
      .select()
      .from(s.contratoTerceirizacao)
      .where(
        and(
          eq(s.contratoTerceirizacao.id, o.contratoId),
          eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
        ),
      )
    if (!c || c.sentido !== 'prestamos' || c.contraparteId !== o.titularId)
      throw new ErroRegra('O contrato escolhido não é com o dono da uva.', 'contratoId')
    if (c.ativo && contratoVigente(c, o.data)) return null
    return {
      codigo: `contrato_fora_vigencia:${c.id}`,
      mensagem: c.ativo
        ? 'O contrato de terceirização escolhido não está vigente na data.'
        : 'O contrato de terceirização escolhido está inativo.',
      fonte,
    }
  }
  if (
    (
      await contratosVigentes(ctx, {
        contraparteId: o.titularId,
        sentido: 'prestamos',
        data: o.data,
      })
    ).length
  )
    return null
  const [p] = await ctx.tx
    .select({ nome: s.ficha.nome })
    .from(s.pessoa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
    .where(eq(s.pessoa.id, o.titularId))
  return {
    codigo: `sem_contrato:${o.titularId}`,
    mensagem: `Sem contrato de terceirização vigente com ${p?.nome ?? 'o titular'} na data.`,
    fonte,
  }
}

/**
 * Pendências legais do contrato, também usadas pela central de alertas (IN MAPA 72/2018, arts.
 * 25, §6º, e 27). Só para contratos ativos e não vencidos (o vencido já tem o próprio alerta).
 */
export async function pendenciasDoContrato(
  ctx: ContextoEmpresa,
  c: Contrato,
): Promise<Array<{ codigo: string; mensagem: string; fonte: string }>> {
  const lista: Array<{ codigo: string; mensagem: string; fonte: string }> = []
  const hoje = new Date().toISOString().slice(0, 10)
  if (!c.ativo || (c.vigenciaFim && c.vigenciaFim < hoje)) return lista
  const anexos = await ctx.tx
    .select({ categoria: s.anexo.categoria })
    .from(s.anexo)
    .where(
      and(
        eq(s.anexo.empresaId, ctx.empresaId),
        eq(s.anexo.entidade, 'contrato_terceirizacao'),
        eq(s.anexo.registroId, c.id),
        eq(s.anexo.ativo, true),
      ),
    )
  const tem = (cat: string) => anexos.some((a) => a.categoria === cat)
  // Quem presta o serviço guarda a via do contrato e a cópia do certificado do produto da unidade
  // central; a falta é embaraço à fiscalização (art. 27, §§2º e 3º).
  if (c.sentido === 'prestamos') {
    if (!tem('contrato') && !c.documentoId)
      lista.push({
        codigo: 'sem_via_contrato',
        mensagem: 'Anexe a via do contrato (categoria "Contrato") ou ligue o documento da Gestão.',
        fonte: 'IN MAPA 72/2018, art. 27, §§2º e 3º',
      })
    if (c.registroProduto === 'contratante' && !tem('certificado'))
      lista.push({
        codigo: 'sem_certificado_produto',
        mensagem:
          'Anexe a cópia do certificado de registro do produto do contratante (categoria "Certificado").',
        fonte: 'IN MAPA 72/2018, art. 27, §§2º e 3º',
      })
  }
  // A unidade central comunica a terceirização no SIPEAGRO (art. 27, caput e §1º).
  const somosUnidadeCentral =
    (c.sentido === 'contratamos' && c.registroProduto === 'contratante') ||
    (c.sentido === 'prestamos' && c.registroProduto === 'cantina')
  if (c.sentido === 'contratamos' && c.registroProduto === 'contratante' && !c.comunicadoSipeagroEm)
    lista.push({
      codigo: 'sem_comunicacao_sipeagro',
      mensagem: 'Registre a comunicação da terceirização no SIPEAGRO (data e protocolo).',
      fonte: 'IN MAPA 72/2018, art. 27',
    })
  if (somosUnidadeCentral && c.comunicadoSipeagroEm && c.alteradoAposComunicacao)
    lista.push({
      codigo: 'comunicacao_desatualizada',
      mensagem: 'O contrato mudou depois da comunicação no SIPEAGRO: comunique de novo e registre.',
      fonte: 'IN MAPA 72/2018, art. 27, §1º',
    })
  // O padronizador só pode terceirizar o envasilhamento (art. 25, §6º).
  if (
    c.sentido === 'contratamos' &&
    c.atividades.some((a) => a === 'elaboracao' || a === 'padronizacao')
  ) {
    const [e] = await ctx.tx
      .select({ atividades: s.estabelecimento.atividadesMapa })
      .from(s.estabelecimento)
      .where(eq(s.estabelecimento.id, c.estabelecimentoId))
    if (e && e.atividades.includes('padronizador') && !e.atividades.includes('produtor'))
      lista.push({
        codigo: 'padronizador_alem_envase',
        mensagem: 'O estabelecimento é padronizador e o contrato terceiriza mais que o envase.',
        fonte: 'IN MAPA 72/2018, art. 25, §6º',
      })
  }
  return lista
}

/** Situação do contrato hoje: vigente, a vencer em até 60 dias, vencido ou futuro. */
const situacaoSql = sql<string>`case
  when ${s.contratoTerceirizacao.vigenciaInicio} > current_date then 'futuro'
  when ${s.contratoTerceirizacao.vigenciaFim} < current_date then 'vencido'
  when ${s.contratoTerceirizacao.vigenciaFim} <= current_date + 60 then 'vencendo'
  else 'vigente' end`

export async function rotasContratos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/contratos-terceirizacao', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          sentido: z.enum(['prestamos', 'contratamos']).optional(),
          contraparteId: z.uuid().optional(),
        })
        .parse(req.query)
      const c = s.contratoTerceirizacao
      const filtro = and(
        eq(c.empresaId, ctx.empresaId),
        q.situacao === 'todos' ? undefined : eq(c.ativo, q.situacao === 'ativos'),
        q.sentido ? eq(c.sentido, q.sentido) : undefined,
        q.contraparteId ? eq(c.contraparteId, q.contraparteId) : undefined,
        buscaTexto(q.busca, [
          c.numero,
          nomePessoa(sql.raw('contrato_terceirizacao.contraparte_id')),
        ]),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          contraparte: nomePessoa(sql.raw('contrato_terceirizacao.contraparte_id')),
          vigenciaInicio: c.vigenciaInicio,
          vigenciaFim: c.vigenciaFim,
        },
        ordemPadrao: { campo: 'vigenciaInicio', direcao: 'desc' },
        contar: async () => (await ctx.tx.select({ n: count() }).from(c).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: c.id,
              sentido: c.sentido,
              numero: c.numero,
              contraparteId: c.contraparteId,
              contraparte: nomePessoa(sql.raw('contrato_terceirizacao.contraparte_id')),
              vigenciaInicio: c.vigenciaInicio,
              vigenciaFim: c.vigenciaFim,
              situacaoVigencia: situacaoSql,
              marcas: sql<
                string[]
              >`coalesce((select array_agg(m.nome order by m.nome) from contrato_terceirizacao_marca cm join marca m on m.id = cm.marca_id where cm.contrato_id = contrato_terceirizacao.id), '{}')`,
              ativo: c.ativo,
            })
            .from(c)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  // Contratos vigentes com uma contraparte numa data: a sugestão da recepção e do granel.
  app.get('/api/contratos-terceirizacao/vigentes', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const q = z
        .object({
          contraparteId: z.uuid(),
          sentido: z.enum(['prestamos', 'contratamos']).default('prestamos'),
          data: z.iso.date(),
        })
        .parse(req.query)
      return contratosVigentes(ctx, q)
    }),
  )

  app.get<{ Params: { id: string } }>('/api/contratos-terceirizacao/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const c = s.contratoTerceirizacao
      const [r] = await ctx.tx
        .select({
          contrato: c,
          contraparte: nomePessoa(sql.raw('contrato_terceirizacao.contraparte_id')),
          situacaoVigencia: situacaoSql,
          documento: sql<
            string | null
          >`(select d.titulo from documento d where d.id = ${c.documentoId})`,
        })
        .from(c)
        .where(and(eq(c.id, id), eq(c.empresaId, ctx.empresaId)))
      if (!r) throw new ErroNaoEncontrado('Contrato não encontrado.')
      const marcas = await ctx.tx
        .select({ id: s.marca.id, nome: s.marca.nome })
        .from(s.contratoTerceirizacaoMarca)
        .innerJoin(s.marca, eq(s.marca.id, s.contratoTerceirizacaoMarca.marcaId))
        .where(eq(s.contratoTerceirizacaoMarca.contratoId, id))
        .orderBy(asc(s.marca.nome))
      const produtos = await ctx.tx
        .select({ id: s.produto.id, nome: s.produto.nome, marca: s.marca.nome })
        .from(s.contratoTerceirizacaoProduto)
        .innerJoin(s.produto, eq(s.produto.id, s.contratoTerceirizacaoProduto.produtoId))
        .innerJoin(s.marca, eq(s.marca.id, s.produto.marcaId))
        .where(eq(s.contratoTerceirizacaoProduto.contratoId, id))
        .orderBy(asc(s.produto.nome))
      const [estab] = await ctx.tx
        .select({
          registro: s.estabelecimento.registroMapa,
          atividades: s.estabelecimento.atividadesMapa,
        })
        .from(s.estabelecimento)
        .where(eq(s.estabelecimento.id, r.contrato.estabelecimentoId))
      const precos = await ctx.tx
        .select({
          descricao: s.contratoTerceirizacaoPreco.descricao,
          valor: s.contratoTerceirizacaoPreco.valor,
          unidade: s.contratoTerceirizacaoPreco.unidade,
        })
        .from(s.contratoTerceirizacaoPreco)
        .where(eq(s.contratoTerceirizacaoPreco.contratoId, id))
        .orderBy(asc(s.contratoTerceirizacaoPreco.ordem))
      const pendencias = await pendenciasDoContrato(ctx, r.contrato)
      const [uso] = await ctx.tx
        .select({ romaneios: count() })
        .from(s.romaneio)
        .where(and(eq(s.romaneio.contratoId, id), eq(s.romaneio.empresaId, ctx.empresaId)))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = r.contrato
      return {
        ...resto,
        contraparte: r.contraparte,
        situacaoVigencia: r.situacaoVigencia,
        documento: r.documento,
        registroMapaEmpresa: estab?.registro ?? null,
        precos,
        pendencias,
        marcas: marcas.map((m) => m.id),
        nomesMarcas: marcas,
        produtos: produtos.map((p) => p.id),
        nomesProdutos: produtos,
        // Pagamento em produto: o previsto no contrato e o já transferido (bloco 2).
        transferido: await transferidoNoContrato(ctx, id),
        textoMontado: await textoMontado(ctx, r.contrato),
        textoFinal: await textoDoContrato(ctx, r.contrato),
        romaneios: uso?.romaneios ?? 0,
      }
    }),
  )

  app.post('/api/contratos-terceirizacao', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosContrato.parse(req.body)
      await conferir(ctx, d)
      const [c] = await ctx.tx
        .insert(s.contratoTerceirizacao)
        .values({
          ...valores(d),
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.contratoTerceirizacao.id })
      await gravarLigacoes(ctx, c!.id, d)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'contrato_terceirizacao',
        registroId: c!.id,
        depois: { ...valores(d), marcas: d.marcas, produtos: d.produtos },
      })
      return { id: c!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/contratos-terceirizacao/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosContrato.parse(req.body)
      const [atual] = await ctx.tx
        .select()
        .from(s.contratoTerceirizacao)
        .where(
          and(
            eq(s.contratoTerceirizacao.id, id),
            eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
          ),
        )
      if (!atual) throw new ErroNaoEncontrado('Contrato não encontrado.')
      conferirVersao(atual.versao, d.versao)
      await conferir(ctx, d)
      // A recepção ligada ao contrato é do dono da uva: a contraparte e o sentido ficam.
      if (atual.contraparteId !== d.contraparteId || atual.sentido !== d.sentido) {
        const [uso] = await ctx.tx
          .select({ n: count() })
          .from(s.romaneio)
          .where(eq(s.romaneio.contratoId, id))
        if (uso!.n)
          throw new ErroRegra(
            'O contrato já está em recepções: a contraparte e o sentido não mudam.',
            'contraparteId',
          )
      }
      // Mudou o que foi comunicado no SIPEAGRO e a comunicação não foi refeita: lembrete.
      const novos = valores(d)
      const comunicacaoNova =
        novos.comunicadoSipeagroEm !== atual.comunicadoSipeagroEm ||
        novos.protocoloSipeagro !== atual.protocoloSipeagro
      const mudouComunicado = CAMPOS_COMUNICADOS.some(
        (k) => JSON.stringify(novos[k]) !== JSON.stringify(atual[k]),
      )
      const alteradoAposComunicacao = comunicacaoNova
        ? false
        : atual.alteradoAposComunicacao || (!!atual.comunicadoSipeagroEm && mudouComunicado)
      await ctx.tx
        .update(s.contratoTerceirizacao)
        .set({
          ...novos,
          alteradoAposComunicacao,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.contratoTerceirizacao.versao} + 1`,
        })
        .where(eq(s.contratoTerceirizacao.id, id))
      await gravarLigacoes(ctx, id, d)
      const { empresaId: _e, ...antes } = atual
      await ctx.auditar({
        acao: 'editar',
        entidade: 'contrato_terceirizacao',
        registroId: id,
        antes,
        depois: { ...valores(d), marcas: d.marcas, produtos: d.produtos },
      })
      return { ok: true }
    }),
  )

  rotasInativacao(app, {
    url: '/api/contratos-terceirizacao',
    tabela: s.contratoTerceirizacao,
    entidade: 'contrato_terceirizacao',
    funcionalidade: F,
  })
}

/**
 * Contrato vigente hoje que cobre o produto (direto ou pela marca), para o texto do rótulo na
 * ficha do produto.
 */
export async function contratoDoProduto(ctx: ContextoEmpresa, produtoId: string, marcaId: string) {
  const c = s.contratoTerceirizacao
  const [r] = await ctx.tx
    .select({ contrato: c })
    .from(c)
    .where(
      and(
        eq(c.empresaId, ctx.empresaId),
        eq(c.ativo, true),
        sql`${c.vigenciaInicio} <= current_date and (${c.vigenciaFim} is null or ${c.vigenciaFim} >= current_date)`,
        sql`(exists (select 1 from contrato_terceirizacao_produto x where x.contrato_id = ${c.id} and x.produto_id = ${produtoId})
          or exists (select 1 from contrato_terceirizacao_marca x where x.contrato_id = ${c.id} and x.marca_id = ${marcaId}))`,
      ),
    )
    .orderBy(sql`${c.vigenciaInicio} desc`)
    .limit(1)
  if (!r) return null
  return {
    contratoId: r.contrato.id,
    sentido: r.contrato.sentido,
    registroProduto: r.contrato.registroProduto,
    prefixoLote: r.contrato.prefixoLote,
    texto: await textoDoContrato(ctx, r.contrato),
  }
}

/**
 * Código do lote comercial do vinho de um cliente: com o prefixo do contrato vigente, que identifica
 * quem elaborou quando o rótulo omite a cantina (IN MAPA 72/2018, art. 28, §2º).
 */
export async function codigoComPrefixo(
  ctx: ContextoEmpresa,
  titularId: string | null,
  data: Date,
  codigo: string,
): Promise<string> {
  if (!titularId) return codigo
  const dia = data.toISOString().slice(0, 10)
  const [c] = await ctx.tx
    .select({ prefixo: s.contratoTerceirizacao.prefixoLote })
    .from(s.contratoTerceirizacao)
    .where(
      and(
        eq(s.contratoTerceirizacao.empresaId, ctx.empresaId),
        eq(s.contratoTerceirizacao.contraparteId, titularId),
        eq(s.contratoTerceirizacao.sentido, 'prestamos'),
        eq(s.contratoTerceirizacao.ativo, true),
        sql`${s.contratoTerceirizacao.prefixoLote} is not null`,
        sql`${s.contratoTerceirizacao.vigenciaInicio} <= ${dia}::date`,
        sql`(${s.contratoTerceirizacao.vigenciaFim} is null or ${s.contratoTerceirizacao.vigenciaFim} >= ${dia}::date)`,
      ),
    )
    .orderBy(sql`${s.contratoTerceirizacao.vigenciaInicio} desc`)
    .limit(1)
  return c?.prefixo ? `${c.prefixo}-${codigo}` : codigo
}
