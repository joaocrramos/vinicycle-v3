// EnoTrace › Projetos de vinho (cantina.md, Projeto de vinho): o ponto de partida da cantina.
// Recebe as uvas, contém os lotes e termina no engarrafamento. Código PRJ-AAAA-NNN pela safra
// prevista (P19). Situações manuais e automáticas (cantina.md, Situações do projeto).
import {
  aplicarModeloPlano,
  CHAVES_SITUACAO_PROJETO,
  consultaListagem,
  dadosModeloPlano,
  dadosProjeto,
  etapaPlano,
  mudarEtapaLote,
  mudarSituacaoProjeto,
  SITUACOES_PROJETO,
} from '@vinicycle/shared'
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../../db/schema'
import { conferirVersao } from '../../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../../nucleo/erros'
import { rotasInativacao } from '../../nucleo/inativacao'
import { buscaTexto, listar } from '../../nucleo/listagem'
import { proximoCodigo } from '../../nucleo/numeracao'
import { type ContextoEmpresa, naEmpresa } from '../../nucleo/requisicao'

const F = 'enotrace.projetos'

/** Denominação: classe, cor e açúcar (Lei 7.678/1988, art. 8º, III; IN MAPA 14/2018, art. 26). */
const denominacao = sql<string>`concat_ws(' ',
  (select c.nome from classe_produto c where c.id = projeto.classe_produto_id),
  (select o.nome from opcao_lista o where o.lista = 'cor_vinho' and o.codigo = projeto.cor order by o.empresa_id nulls last limit 1),
  (select o.nome from opcao_lista o where o.lista = 'teor_acucar' and o.codigo = projeto.teor_acucar order by o.empresa_id nulls last limit 1))`

/** Volume atual do projeto: a soma do livro dos seus lotes (seção 4). */
const volumeAtual = sql<string>`coalesce((select sum(m.litros) from movimento_volume m join lote l on l.id = m.lote_id where l.projeto_id = projeto.id), 0)`

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [p] = await ctx.tx
    .select()
    .from(s.projeto)
    .where(and(eq(s.projeto.id, id), eq(s.projeto.empresaId, ctx.empresaId)))
  if (!p || !(await ctx.estabelecimentosPermitidos()).includes(p.estabelecimentoId))
    throw new ErroNaoEncontrado('Projeto não encontrado.')
  return p
}

/** Variedades globais ou próprias; enólogo da empresa; classe oficial (FKs não passam pela RLS). */
async function conferir(ctx: ContextoEmpresa, d: z.output<typeof dadosProjeto>) {
  if (d.variedades.length) {
    const ok = await ctx.tx
      .select({ id: s.variedade.id })
      .from(s.variedade)
      .where(
        and(
          inArray(s.variedade.id, d.variedades),
          or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)),
        ),
      )
    if (ok.length !== new Set(d.variedades).size)
      throw new ErroRegra('Variedade inválida.', 'variedade')
  }
  if (d.enologoId) {
    const [p] = await ctx.tx
      .select({ id: s.pessoa.id })
      .from(s.pessoa)
      .where(and(eq(s.pessoa.id, d.enologoId), eq(s.pessoa.empresaId, ctx.empresaId)))
    if (!p) throw new ErroRegra('Enólogo inválido.', 'enologo')
  }
  if (d.classeProdutoId) {
    const [c] = await ctx.tx
      .select({ exige: s.classeProduto.exigeMetodoEspumante })
      .from(s.classeProduto)
      .where(eq(s.classeProduto.id, d.classeProdutoId))
    if (!c) throw new ErroRegra('Classe inválida.', 'classe')
  }
}

function valores(d: z.output<typeof dadosProjeto>) {
  return {
    nome: d.nome,
    safraPrevista: d.safraPrevista,
    cicloPrevisto: d.cicloPrevisto ?? null,
    classeProdutoId: d.classeProdutoId ?? null,
    cor: d.cor ?? null,
    teorAcucar: d.teorAcucar ?? null,
    metodoEspumante: d.metodoEspumante ?? null,
    teorAlcoolicoPretendido: d.teorAlcoolicoPretendido ?? null,
    volumePrevistoLitros: d.volumePrevistoLitros ?? null,
    kgPrevistos: d.kgPrevistos ?? null,
    enologoId: d.enologoId ?? null,
    observacoes: d.observacoes ?? null,
  }
}

async function gravarVariedades(ctx: ContextoEmpresa, projetoId: string, variedades: string[]) {
  await ctx.tx.delete(s.projetoVariedade).where(eq(s.projetoVariedade.projetoId, projetoId))
  const unicas = [...new Set(variedades)]
  if (unicas.length) {
    await ctx.tx
      .insert(s.projetoVariedade)
      .values(unicas.map((v) => ({ projetoId, empresaId: ctx.empresaId, variedadeId: v })))
  }
}

/** Itens de insumo do plano: da empresa e do tipo insumo. */
async function conferirInsumos(ctx: ContextoEmpresa, ids: string[]) {
  if (!ids.length) return
  const ok = await ctx.tx
    .select({ id: s.itemEstoque.id })
    .from(s.itemEstoque)
    .where(
      and(
        inArray(s.itemEstoque.id, ids),
        eq(s.itemEstoque.empresaId, ctx.empresaId),
        eq(s.itemEstoque.tipo, 'insumo'),
      ),
    )
  if (ok.length !== new Set(ids).size) throw new ErroRegra('Insumo inválido.', 'insumo')
}

async function lerPlano(ctx: ContextoEmpresa, projetoId: string) {
  const etapas = await ctx.tx
    .select({
      id: s.planoEtapa.id,
      tipoOperacao: s.planoEtapa.tipoOperacao,
      dataPrevista: s.planoEtapa.dataPrevista,
      recipienteId: s.planoEtapa.recipienteId,
      recipiente: s.recipiente.codigo,
      observacao: s.planoEtapa.observacao,
      ordem: s.planoEtapa.ordem,
      versao: s.planoEtapa.versao,
      // Previsto × executado: operações confirmadas ligadas à etapa.
      executadas: sql<
        Array<{ id: string; codigo: string; executadoEm: string }>
      >`coalesce((select json_agg(json_build_object('id', o.id, 'codigo', o.codigo, 'executadoEm', o.executado_em) order by o.executado_em) from operacao o where o.plano_etapa_id = plano_etapa.id and o.situacao = 'confirmada'), '[]')`,
    })
    .from(s.planoEtapa)
    .leftJoin(s.recipiente, eq(s.recipiente.id, s.planoEtapa.recipienteId))
    .where(eq(s.planoEtapa.projetoId, projetoId))
    .orderBy(asc(s.planoEtapa.dataPrevista), asc(s.planoEtapa.ordem))
  const insumos = etapas.length
    ? await ctx.tx
        .select({
          planoEtapaId: s.planoInsumo.planoEtapaId,
          itemEstoqueId: s.planoInsumo.itemEstoqueId,
          item: s.itemEstoque.nome,
          dose: s.planoInsumo.dose,
          unidade: s.planoInsumo.unidade,
        })
        .from(s.planoInsumo)
        .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.planoInsumo.itemEstoqueId))
        .where(
          inArray(
            s.planoInsumo.planoEtapaId,
            etapas.map((e) => e.id),
          ),
        )
    : []
  return etapas.map((e) => ({ ...e, insumos: insumos.filter((i) => i.planoEtapaId === e.id) }))
}

async function gravarInsumosEtapa(
  ctx: ContextoEmpresa,
  dono: { planoEtapaId: string } | { modeloEtapaId: string },
  insumos: z.output<typeof etapaPlano>['insumos'],
) {
  if (!insumos.length) return
  await ctx.tx.insert(s.planoInsumo).values(
    insumos.map((i) => ({
      empresaId: ctx.empresaId,
      planoEtapaId: 'planoEtapaId' in dono ? dono.planoEtapaId : null,
      modeloEtapaId: 'modeloEtapaId' in dono ? dono.modeloEtapaId : null,
      itemEstoqueId: i.itemEstoqueId,
      dose: i.dose,
      unidade: i.unidade,
    })),
  )
}

async function conferirRecipiente(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  id?: string | null,
) {
  if (!id) return
  const [r] = await ctx.tx
    .select({ id: s.recipiente.id })
    .from(s.recipiente)
    .where(and(eq(s.recipiente.id, id), eq(s.recipiente.estabelecimentoId, estabelecimentoId)))
  if (!r)
    throw new ErroRegra('O recipiente previsto precisa ser do mesmo estabelecimento.', 'recipiente')
}

export async function rotasProjetos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/projetos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum([...CHAVES_SITUACAO_PROJETO, 'abertos', 'todos']).default('abertos'),
          safra: z.coerce.number().int().optional(),
        })
        .parse(req.query)
      const estabs = ctx.estabelecimentoId
        ? [ctx.estabelecimentoId]
        : await ctx.estabelecimentosPermitidos()
      if (!estabs.length) return { itens: [], total: 0, pagina: 1, tamanho: q.tamanho }
      const filtro = and(
        eq(s.projeto.empresaId, ctx.empresaId),
        inArray(s.projeto.estabelecimentoId, estabs),
        q.situacao === 'todos'
          ? undefined
          : q.situacao === 'abertos'
            ? sql`${s.projeto.situacao} not in ('encerrado', 'cancelado')`
            : eq(s.projeto.situacao, q.situacao),
        q.safra ? eq(s.projeto.safraPrevista, q.safra) : undefined,
        buscaTexto(q.busca, [s.projeto.codigo, s.projeto.nome]),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          codigo: s.projeto.codigo,
          nome: s.projeto.nome,
          safra: s.projeto.safraPrevista,
          situacao: s.projeto.situacao,
        },
        ordemPadrao: { campo: 'codigo', direcao: 'desc' },
        contar: async () =>
          (await ctx.tx.select({ n: count() }).from(s.projeto).where(filtro))[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.projeto.id,
              codigo: s.projeto.codigo,
              nome: s.projeto.nome,
              safraPrevista: s.projeto.safraPrevista,
              cicloPrevisto: s.projeto.cicloPrevisto,
              denominacao,
              situacao: s.projeto.situacao,
              volume: volumeAtual,
              etapas: sql<
                string[]
              >`coalesce((select array_agg(distinct coalesce((select o.nome from opcao_lista o where o.lista = 'etapa_producao' and o.codigo = l.etapa order by o.empresa_id nulls last limit 1), l.etapa)) from lote l where l.projeto_id = projeto.id and l.situacao = 'ativo' and l.etapa is not null), '{}')`,
              enologo: sql<
                string | null
              >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = projeto.enologo_id)`,
            })
            .from(s.projeto)
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  /** Projetos abertos do estabelecimento ativo, para escolher na recepção e nas operações. */
  app.get('/api/projetos/opcoes', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento()
      return ctx.tx
        .select({
          id: s.projeto.id,
          codigo: s.projeto.codigo,
          nome: s.projeto.nome,
          safraPrevista: s.projeto.safraPrevista,
          cicloPrevisto: s.projeto.cicloPrevisto,
        })
        .from(s.projeto)
        .where(
          and(
            eq(s.projeto.estabelecimentoId, estab),
            sql`${s.projeto.situacao} not in ('encerrado', 'cancelado', 'engarrafado')`,
          ),
        )
        .orderBy(desc(s.projeto.safraPrevista), asc(s.projeto.nome))
    }),
  )

  app.get<{ Params: { id: string } }>('/api/projetos/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      const [extra] = await ctx.tx
        .select({ denominacao, volume: volumeAtual })
        .from(s.projeto)
        .where(eq(s.projeto.id, p.id))
      const variedades = await ctx.tx
        .select({ id: s.variedade.id, nome: s.variedade.nome })
        .from(s.projetoVariedade)
        .innerJoin(s.variedade, eq(s.variedade.id, s.projetoVariedade.variedadeId))
        .where(eq(s.projetoVariedade.projetoId, p.id))
        .orderBy(asc(s.variedade.nome))
      const lotes = await ctx.tx
        .select({
          id: s.lote.id,
          codigo: s.lote.codigo,
          etapa: s.lote.etapa,
          situacao: s.lote.situacao,
          titularId: s.lote.titularId,
          titular: sql<
            string | null
          >`(select f.nome from pessoa p join ficha f on f.id = p.ficha_id where p.id = lote.titular_id)`,
          rendimentoReal: s.lote.rendimentoReal,
          volume: sql<string>`coalesce((select sum(m.litros) from movimento_volume m where m.lote_id = lote.id), 0)`,
          recipientes: sql<
            Array<{ id: string; codigo: string; litros: string }>
          >`coalesce((select json_agg(json_build_object('id', r.id, 'codigo', r.codigo, 'litros', x.litros) order by r.codigo) from (select m.recipiente_id, sum(m.litros) as litros from movimento_volume m where m.lote_id = lote.id group by m.recipiente_id having sum(m.litros) > 0) x join recipiente r on r.id = x.recipiente_id), '[]')`,
        })
        .from(s.lote)
        .where(eq(s.lote.projetoId, p.id))
        .orderBy(asc(s.lote.codigo))
      // Projeto de origem (nasceu de um corte) e "incorporado ao projeto X" (cantina.md, Corte).
      const ligados = [p.projetoOrigemId, p.incorporadoAoProjetoId].filter(Boolean) as string[]
      const nomes = ligados.length
        ? await ctx.tx
            .select({ id: s.projeto.id, codigo: s.projeto.codigo, nome: s.projeto.nome })
            .from(s.projeto)
            .where(inArray(s.projeto.id, ligados))
        : []
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = p
      return {
        ...resto,
        projetoOrigem: nomes.find((x) => x.id === p.projetoOrigemId) ?? null,
        incorporadoAo: nomes.find((x) => x.id === p.incorporadoAoProjetoId) ?? null,
        denominacao: extra?.denominacao ?? '',
        volume: extra?.volume ?? '0',
        variedades,
        lotes,
        plano: await lerPlano(ctx, p.id),
      }
    }),
  )

  app.post('/api/projetos', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const estabelecimentoId = ctx.exigirEstabelecimento()
      const d = dadosProjeto.parse(req.body)
      await conferir(ctx, d)
      const codigo = await proximoCodigo(ctx, {
        estabelecimentoId,
        tipo: 'projeto',
        ano: d.safraPrevista,
        ciclo: d.cicloPrevisto,
      })
      const [p] = await ctx.tx
        .insert(s.projeto)
        .values({
          ...valores(d),
          empresaId: ctx.empresaId,
          estabelecimentoId,
          codigo,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.projeto.id })
      await gravarVariedades(ctx, p!.id, d.variedades)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'projeto',
        registroId: p!.id,
        depois: { codigo, ...valores(d), variedades: d.variedades },
      })
      return { id: p!.id, codigo }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/projetos/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosProjeto.parse(req.body)
      const atual = await carregar(ctx, id)
      conferirVersao(atual.versao, d.versao)
      if (atual.situacao === 'cancelado')
        throw new ErroRegra('Projeto cancelado não se edita.', 'cancelado')
      await conferir(ctx, d)
      const novos = valores(d)
      await ctx.tx
        .update(s.projeto)
        .set({
          ...novos,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.projeto.versao} + 1`,
        })
        .where(eq(s.projeto.id, id))
      await gravarVariedades(ctx, id, d.variedades)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'projeto',
        registroId: id,
        antes: Object.fromEntries(
          Object.keys(novos).map((k) => [k, atual[k as keyof typeof atual]]),
        ),
        depois: novos,
      })
      return { ok: true }
    }),
  )

  // Situações manuais (cantina.md, Situações do projeto). As demais mudam sozinhas.
  app.post<{ Params: { id: string } }>('/api/projetos/:id/situacao', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = mudarSituacaoProjeto.parse(req.body)
      const atual = await carregar(ctx, id)
      if (atual.situacao === d.situacao) return { ok: true }
      if (['cancelado', 'encerrado'].includes(atual.situacao))
        throw new ErroRegra(
          `Projeto ${SITUACOES_PROJETO[atual.situacao].toLowerCase()} não muda de situação.`,
          'situacao',
        )
      const [{ volume }] = (await ctx.tx
        .select({ volume: volumeAtual })
        .from(s.projeto)
        .where(eq(s.projeto.id, id))) as [{ volume: string }]
      if (d.situacao === 'cancelado') {
        if (!d.motivo) throw new ErroRegra('Informe o motivo.', 'motivo')
        // Só sem nenhum movimento (P26): nem recepção confirmada, nem operação, nem lote.
        const [mov] = await ctx.tx
          .execute<{ tem: boolean }>(
            sql`
          select exists (select 1 from romaneio where projeto_id = ${id} and situacao <> 'rascunho')
              or exists (select 1 from operacao where projeto_id = ${id} and situacao <> 'rascunho')
              or exists (select 1 from lote where projeto_id = ${id}) as tem`,
          )
          .then((r) => r.rows)
        if (mov?.tem)
          throw new ErroRegra(
            'Projeto com movimento não pode ser cancelado; encerre-o.',
            'com_movimento',
          )
      }
      if (d.situacao === 'encerrado' && Number(volume) > 0) {
        throw new ErroRegra(
          `O projeto ainda tem ${Number(volume).toLocaleString('pt-BR')} L em lotes. Encerre depois de engarrafar ou cortar.`,
          'com_saldo',
        )
      }
      if (d.situacao === 'pronto_envase' && atual.situacao !== 'em_producao')
        throw new ErroRegra('Só projeto em produção fica pronto para envase.', 'situacao')
      if (d.situacao === 'em_producao' && atual.situacao !== 'pronto_envase')
        throw new ErroRegra(
          'Em produção é automática, na primeira recepção ou operação.',
          'situacao',
        )
      await ctx.tx
        .update(s.projeto)
        .set({
          situacao: d.situacao,
          situacaoDesde: sql`now()`,
          versao: sql`${s.projeto.versao} + 1`,
        })
        .where(eq(s.projeto.id, id))
      await ctx.auditar({
        acao: 'situacao',
        entidade: 'projeto',
        registroId: id,
        antes: { situacao: atual.situacao },
        depois: { situacao: d.situacao },
        motivo: d.motivo ?? null,
      })
      return { ok: true }
    }),
  )

  // Plano do projeto --------------------------------------------------------------------------

  app.post<{ Params: { id: string } }>('/api/projetos/:id/plano', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      const d = etapaPlano.parse(req.body)
      await conferirRecipiente(ctx, p.estabelecimentoId, d.recipienteId)
      await conferirInsumos(
        ctx,
        d.insumos.map((i) => i.itemEstoqueId),
      )
      const [{ n }] = (await ctx.tx
        .select({ n: count() })
        .from(s.planoEtapa)
        .where(eq(s.planoEtapa.projetoId, p.id))) as [{ n: number }]
      const [e] = await ctx.tx
        .insert(s.planoEtapa)
        .values({
          empresaId: ctx.empresaId,
          projetoId: p.id,
          tipoOperacao: d.tipoOperacao,
          dataPrevista: d.dataPrevista,
          recipienteId: d.recipienteId ?? null,
          observacao: d.observacao ?? null,
          ordem: n + 1,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.planoEtapa.id })
      await gravarInsumosEtapa(ctx, { planoEtapaId: e!.id }, d.insumos)
      await ctx.auditar({ acao: 'incluir_etapa', entidade: 'projeto', registroId: p.id, dados: d })
      return { id: e!.id }
    }),
  )

  app.put<{ Params: { id: string; etapaId: string } }>(
    '/api/projetos/:id/plano/:etapaId',
    async (req) =>
      naEmpresa(db, req, [F, 'editar'], async (ctx) => {
        const p = await carregar(ctx, z.uuid().parse(req.params.id))
        const etapaId = z.uuid().parse(req.params.etapaId)
        const d = etapaPlano.parse(req.body)
        await conferirRecipiente(ctx, p.estabelecimentoId, d.recipienteId)
        await conferirInsumos(
          ctx,
          d.insumos.map((i) => i.itemEstoqueId),
        )
        const alterada = await ctx.tx
          .update(s.planoEtapa)
          .set({
            tipoOperacao: d.tipoOperacao,
            dataPrevista: d.dataPrevista,
            recipienteId: d.recipienteId ?? null,
            observacao: d.observacao ?? null,
            atualizadoEm: sql`now()`,
            atualizadoPor: ctx.usuarioId,
            versao: sql`${s.planoEtapa.versao} + 1`,
          })
          .where(and(eq(s.planoEtapa.id, etapaId), eq(s.planoEtapa.projetoId, p.id)))
          .returning({ id: s.planoEtapa.id })
        if (!alterada.length) throw new ErroNaoEncontrado('Etapa não encontrada.')
        await ctx.tx.delete(s.planoInsumo).where(eq(s.planoInsumo.planoEtapaId, etapaId))
        await gravarInsumosEtapa(ctx, { planoEtapaId: etapaId }, d.insumos)
        await ctx.auditar({
          acao: 'editar_etapa',
          entidade: 'projeto',
          registroId: p.id,
          dados: d,
        })
        return { ok: true }
      }),
  )

  // Etapa sem execução pode sair do plano; com execução, fica (é o histórico do previsto).
  app.post<{ Params: { id: string; etapaId: string } }>(
    '/api/projetos/:id/plano/:etapaId/excluir',
    async (req) =>
      naEmpresa(db, req, [F, 'editar'], async (ctx) => {
        const p = await carregar(ctx, z.uuid().parse(req.params.id))
        const etapaId = z.uuid().parse(req.params.etapaId)
        const [usada] = await ctx.tx
          .select({ id: s.operacao.id })
          .from(s.operacao)
          .where(eq(s.operacao.planoEtapaId, etapaId))
          .limit(1)
        if (usada) throw new ErroRegra('Etapa já executada não sai do plano.', 'executada')
        const r = await ctx.tx
          .delete(s.planoEtapa)
          .where(and(eq(s.planoEtapa.id, etapaId), eq(s.planoEtapa.projetoId, p.id)))
          .returning({ tipo: s.planoEtapa.tipoOperacao, data: s.planoEtapa.dataPrevista })
        if (!r.length) throw new ErroNaoEncontrado('Etapa não encontrada.')
        await ctx.auditar({
          acao: 'excluir_etapa',
          entidade: 'projeto',
          registroId: p.id,
          antes: r[0],
        })
        return { ok: true }
      }),
  )

  // Aplica um modelo: dia 0 informado, as demais datas calculadas (cantina.md, Modelos de plano).
  app.post<{ Params: { id: string } }>('/api/projetos/:id/plano/modelo', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const p = await carregar(ctx, z.uuid().parse(req.params.id))
      const d = aplicarModeloPlano.parse(req.body)
      const [modelo] = await ctx.tx
        .select({ nome: s.modeloPlano.nome })
        .from(s.modeloPlano)
        .where(and(eq(s.modeloPlano.id, d.modeloId), eq(s.modeloPlano.empresaId, ctx.empresaId)))
      if (!modelo) throw new ErroNaoEncontrado('Modelo não encontrado.')
      const etapas = await ctx.tx
        .select()
        .from(s.modeloPlanoEtapa)
        .where(eq(s.modeloPlanoEtapa.modeloId, d.modeloId))
        .orderBy(asc(s.modeloPlanoEtapa.diaRelativo), asc(s.modeloPlanoEtapa.ordem))
      const insumos = etapas.length
        ? await ctx.tx
            .select()
            .from(s.planoInsumo)
            .where(
              inArray(
                s.planoInsumo.modeloEtapaId,
                etapas.map((e) => e.id),
              ),
            )
        : []
      const [{ n }] = (await ctx.tx
        .select({ n: count() })
        .from(s.planoEtapa)
        .where(eq(s.planoEtapa.projetoId, p.id))) as [{ n: number }]
      const dia0 = new Date(`${d.dataDia0}T12:00:00Z`)
      for (const [i, e] of etapas.entries()) {
        const data = new Date(dia0.getTime() + e.diaRelativo * 86_400_000)
          .toISOString()
          .slice(0, 10)
        const [nova] = await ctx.tx
          .insert(s.planoEtapa)
          .values({
            empresaId: ctx.empresaId,
            projetoId: p.id,
            tipoOperacao: e.tipoOperacao,
            dataPrevista: data,
            observacao: e.observacao,
            ordem: n + i + 1,
            criadoPor: ctx.usuarioId,
            atualizadoPor: ctx.usuarioId,
          })
          .returning({ id: s.planoEtapa.id })
        await gravarInsumosEtapa(
          ctx,
          { planoEtapaId: nova!.id },
          insumos
            .filter((x) => x.modeloEtapaId === e.id)
            .map((x) => ({ itemEstoqueId: x.itemEstoqueId, dose: x.dose, unidade: x.unidade })),
        )
      }
      await ctx.auditar({
        acao: 'aplicar_modelo',
        entidade: 'projeto',
        registroId: p.id,
        dados: { modelo: modelo.nome, dataDia0: d.dataDia0, etapas: etapas.length },
      })
      return { etapas: etapas.length }
    }),
  )

  // Etapa do lote, mudada pelo enólogo; o histórico fica em lote_etapa (cantina.md, Etapas).
  app.post<{ Params: { id: string } }>('/api/lotes/:id/etapa', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const { etapa } = mudarEtapaLote.parse(req.body)
      const [l] = await ctx.tx
        .select({ etapa: s.lote.etapa, estab: s.lote.estabelecimentoId })
        .from(s.lote)
        .where(and(eq(s.lote.id, id), eq(s.lote.empresaId, ctx.empresaId)))
      if (!l || !(await ctx.estabelecimentosPermitidos()).includes(l.estab))
        throw new ErroNaoEncontrado('Lote não encontrado.')
      const [existe] = await ctx.tx
        .select({ codigo: s.opcaoLista.codigo })
        .from(s.opcaoLista)
        .where(
          and(
            eq(s.opcaoLista.lista, 'etapa_producao'),
            eq(s.opcaoLista.codigo, etapa),
            eq(s.opcaoLista.ativo, true),
            or(isNull(s.opcaoLista.empresaId), eq(s.opcaoLista.empresaId, ctx.empresaId)),
          ),
        )
      if (!existe) throw new ErroRegra('Etapa inválida.', 'etapa')
      if (l.etapa === etapa) return { ok: true }
      await ctx.tx
        .update(s.lote)
        .set({ etapa, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.lote.id, id))
      await ctx.tx
        .insert(s.loteEtapa)
        .values({ empresaId: ctx.empresaId, loteId: id, etapa, por: ctx.usuarioId })
      await ctx.auditar({
        acao: 'etapa',
        entidade: 'lote',
        registroId: id,
        antes: { etapa: l.etapa },
        depois: { etapa },
      })
      return { ok: true }
    }),
  )

  // Modelos de plano ----------------------------------------------------------------------------

  app.get('/api/modelos-plano', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const modelos = await ctx.tx
        .select()
        .from(s.modeloPlano)
        .where(eq(s.modeloPlano.empresaId, ctx.empresaId))
        .orderBy(asc(s.modeloPlano.nome))
      const etapas = modelos.length
        ? await ctx.tx
            .select()
            .from(s.modeloPlanoEtapa)
            .where(
              inArray(
                s.modeloPlanoEtapa.modeloId,
                modelos.map((m) => m.id),
              ),
            )
            .orderBy(asc(s.modeloPlanoEtapa.diaRelativo), asc(s.modeloPlanoEtapa.ordem))
        : []
      const insumos = etapas.length
        ? await ctx.tx
            .select({
              modeloEtapaId: s.planoInsumo.modeloEtapaId,
              itemEstoqueId: s.planoInsumo.itemEstoqueId,
              item: s.itemEstoque.nome,
              dose: s.planoInsumo.dose,
              unidade: s.planoInsumo.unidade,
            })
            .from(s.planoInsumo)
            .innerJoin(s.itemEstoque, eq(s.itemEstoque.id, s.planoInsumo.itemEstoqueId))
            .where(
              inArray(
                s.planoInsumo.modeloEtapaId,
                etapas.map((e) => e.id),
              ),
            )
        : []
      return modelos.map((m) => ({
        id: m.id,
        nome: m.nome,
        descricao: m.descricao,
        ativo: m.ativo,
        versao: m.versao,
        etapas: etapas
          .filter((e) => e.modeloId === m.id)
          .map((e) => ({
            tipoOperacao: e.tipoOperacao,
            diaRelativo: e.diaRelativo,
            observacao: e.observacao,
            insumos: insumos.filter((i) => i.modeloEtapaId === e.id),
          })),
      }))
    }),
  )

  async function gravarEtapasModelo(
    ctx: ContextoEmpresa,
    modeloId: string,
    etapas: z.output<typeof dadosModeloPlano>['etapas'],
  ) {
    await conferirInsumos(
      ctx,
      etapas.flatMap((e) => e.insumos.map((i) => i.itemEstoqueId)),
    )
    await ctx.tx.delete(s.modeloPlanoEtapa).where(eq(s.modeloPlanoEtapa.modeloId, modeloId))
    for (const [i, e] of etapas.entries()) {
      const [nova] = await ctx.tx
        .insert(s.modeloPlanoEtapa)
        .values({
          empresaId: ctx.empresaId,
          modeloId,
          tipoOperacao: e.tipoOperacao,
          diaRelativo: e.diaRelativo,
          observacao: e.observacao ?? null,
          ordem: i + 1,
        })
        .returning({ id: s.modeloPlanoEtapa.id })
      await gravarInsumosEtapa(ctx, { modeloEtapaId: nova!.id }, e.insumos)
    }
  }

  const nomeRepetido = (e: unknown): never => {
    if ((e as { cause?: { constraint?: string } }).cause?.constraint === 'modelo_plano_nome')
      throw new ErroRegra('Já existe um modelo com este nome.', 'nome_duplicado')
    throw e
  }

  app.post('/api/modelos-plano', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosModeloPlano.parse(req.body)
      const [m] = await ctx.tx
        .insert(s.modeloPlano)
        .values({
          empresaId: ctx.empresaId,
          nome: d.nome,
          descricao: d.descricao ?? null,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.modeloPlano.id })
        .catch(nomeRepetido)
      await gravarEtapasModelo(ctx, m!.id, d.etapas)
      await ctx.auditar({ acao: 'criar', entidade: 'modelo_plano', registroId: m!.id, depois: d })
      return { id: m!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/modelos-plano/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosModeloPlano.parse(req.body)
      const [atual] = await ctx.tx
        .select()
        .from(s.modeloPlano)
        .where(and(eq(s.modeloPlano.id, id), eq(s.modeloPlano.empresaId, ctx.empresaId)))
      if (!atual) throw new ErroNaoEncontrado('Modelo não encontrado.')
      conferirVersao(atual.versao, d.versao)
      await ctx.tx
        .update(s.modeloPlano)
        .set({
          nome: d.nome,
          descricao: d.descricao ?? null,
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.modeloPlano.versao} + 1`,
        })
        .where(eq(s.modeloPlano.id, id))
        .catch(nomeRepetido)
      await gravarEtapasModelo(ctx, id, d.etapas)
      await ctx.auditar({ acao: 'editar', entidade: 'modelo_plano', registroId: id, depois: d })
      return { ok: true }
    }),
  )

  rotasInativacao(app, {
    url: '/api/modelos-plano',
    tabela: s.modeloPlano,
    entidade: 'modelo_plano',
    funcionalidade: F,
  })
}
