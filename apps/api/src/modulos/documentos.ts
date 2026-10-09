// Gestão › Documentos (gestao.md, Documentos): documentos com vencimento, versões (renovar cria
// versão nova; a anterior vira "substituída"), responsável pela renovação, etiquetas e anexos.
// Os avisos escalonados (60, 30 e 7 dias) vêm com a central de alertas (ciclo 6).
import {
  consultaListagem,
  dadosDocumento,
  dadosEtiqueta,
  motivo,
  novoDocumento,
  SITUACOES_VENCIMENTO,
  versaoDocumento,
} from '@vinicycle/shared'
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import * as s from '../db/schema'
import { conferirVersao } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao'

const F = 'gestao.documentos'

/**
 * Situação de vencimento: vencido; vencendo dentro da maior antecedência de aviso do tipo
 * (padrão 60 dias); em dia; ou sem vencimento.
 */
const situacaoVencimento = sql<(typeof SITUACOES_VENCIMENTO)[number]>`case
  when ${s.documentoVersao.vencimento} is null then 'sem_vencimento'
  when ${s.documentoVersao.vencimento} < current_date then 'vencido'
  when ${s.documentoVersao.vencimento} <= current_date + coalesce((select max(a) from unnest(${s.tipoDocumento.avisosDias}) a), 60) then 'vencendo'
  else 'em_dia' end`

/** Documentos que o usuário vê: os do estabelecimento ativo (ou dos permitidos) e os da empresa toda. */
async function filtroEscopo(ctx: ContextoEmpresa) {
  const estabs = ctx.estabelecimentoId
    ? [ctx.estabelecimentoId]
    : await ctx.estabelecimentosPermitidos()
  return or(
    isNull(s.documento.estabelecimentoId),
    estabs.length ? inArray(s.documento.estabelecimentoId, estabs) : undefined,
  )
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [d] = await ctx.tx
    .select()
    .from(s.documento)
    .where(
      and(
        eq(s.documento.id, id),
        eq(s.documento.empresaId, ctx.empresaId),
        await filtroEscopo(ctx),
      ),
    )
  if (!d) throw new ErroNaoEncontrado('Documento não encontrado.')
  return d
}

async function conferirReferencias(
  ctx: ContextoEmpresa,
  d: z.output<typeof dadosDocumento>,
): Promise<void> {
  const [tipo] = await ctx.tx
    .select({ id: s.tipoDocumento.id })
    .from(s.tipoDocumento)
    .where(
      and(
        eq(s.tipoDocumento.id, d.tipoDocumentoId),
        or(isNull(s.tipoDocumento.empresaId), eq(s.tipoDocumento.empresaId, ctx.empresaId)),
      ),
    )
  if (!tipo) throw new ErroRegra('Tipo de documento inválido.', 'tipo_documento')
  if (d.estabelecimentoId) {
    const permitidos = await ctx.estabelecimentosPermitidos()
    if (!permitidos.includes(d.estabelecimentoId))
      throw new ErroRegra('Estabelecimento inválido.', 'estabelecimento')
  }
  if (d.responsavelId) {
    const [v] = await ctx.tx
      .select({ id: s.vinculo.id })
      .from(s.vinculo)
      .where(
        and(
          eq(s.vinculo.usuarioId, d.responsavelId),
          eq(s.vinculo.empresaId, ctx.empresaId),
          eq(s.vinculo.ativo, true),
        ),
      )
    if (!v) throw new ErroRegra('O responsável precisa ser um usuário da empresa.', 'responsavel')
  }
  if (d.etiquetas.length) {
    const r = await ctx.tx
      .select({ id: s.etiqueta.id })
      .from(s.etiqueta)
      .where(and(eq(s.etiqueta.empresaId, ctx.empresaId), inArray(s.etiqueta.id, d.etiquetas)))
    if (r.length !== new Set(d.etiquetas).size)
      throw new ErroRegra('Etiqueta inválida.', 'etiqueta')
  }
}

async function gravarEtiquetas(ctx: ContextoEmpresa, documentoId: string, etiquetas: string[]) {
  await ctx.tx.delete(s.documentoEtiqueta).where(eq(s.documentoEtiqueta.documentoId, documentoId))
  const unicas = [...new Set(etiquetas)]
  if (unicas.length) {
    await ctx.tx
      .insert(s.documentoEtiqueta)
      .values(unicas.map((etiquetaId) => ({ documentoId, etiquetaId, empresaId: ctx.empresaId })))
  }
}

const camposDocumento = (d: z.output<typeof dadosDocumento>) => ({
  tipoDocumentoId: d.tipoDocumentoId,
  titulo: d.titulo,
  estabelecimentoId: d.estabelecimentoId ?? null,
  modulo: d.modulo ?? null,
  orgaoEmissor: d.orgaoEmissor ?? null,
  responsavelId: d.responsavelId ?? null,
  observacoes: d.observacoes ?? null,
})

const camposVersao = (v: z.output<typeof versaoDocumento>) => ({
  numero: v.numero ?? null,
  emissao: v.emissao ?? null,
  vencimento: v.vencimento ?? null,
  assinadoPor: v.assinadoPor ?? null,
  assinadoEm: v.assinadoEm ?? null,
  observacoes: v.observacoes ?? null,
})

export async function rotasDocumentos(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/documentos', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const q = consultaListagem
        .extend({
          situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
          vencimento: z.enum(SITUACOES_VENCIMENTO).optional(),
          tipo: z.uuid().optional(),
          etiqueta: z.uuid().optional(),
        })
        .parse(req.query)
      const filtro = and(
        eq(s.documento.empresaId, ctx.empresaId),
        await filtroEscopo(ctx),
        q.situacao === 'todos' ? undefined : eq(s.documento.ativo, q.situacao === 'ativos'),
        q.tipo ? eq(s.documento.tipoDocumentoId, q.tipo) : undefined,
        q.vencimento ? sql`${situacaoVencimento} = ${q.vencimento}` : undefined,
        q.etiqueta
          ? sql`exists (select 1 from documento_etiqueta de where de.documento_id = ${s.documento.id} and de.etiqueta_id = ${q.etiqueta})`
          : undefined,
        buscaTexto(q.busca, [
          s.documento.titulo,
          s.documento.orgaoEmissor,
          s.documentoVersao.numero,
          s.tipoDocumento.nome,
        ]),
      )
      const vigente = and(
        eq(s.documentoVersao.documentoId, s.documento.id),
        eq(s.documentoVersao.situacao, 'vigente'),
      )
      return listar({
        consulta: q,
        ordenaveis: {
          vencimento: s.documentoVersao.vencimento,
          titulo: s.documento.titulo,
          tipo: s.tipoDocumento.nome,
        },
        ordemPadrao: { campo: 'vencimento', direcao: 'asc' },
        contar: async () =>
          (
            await ctx.tx
              .select({ n: count() })
              .from(s.documento)
              .innerJoin(s.tipoDocumento, eq(s.tipoDocumento.id, s.documento.tipoDocumentoId))
              .leftJoin(s.documentoVersao, vigente)
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          ctx.tx
            .select({
              id: s.documento.id,
              titulo: s.documento.titulo,
              tipo: s.tipoDocumento.nome,
              orgaoEmissor: s.documento.orgaoEmissor,
              estabelecimentoId: s.documento.estabelecimentoId,
              estabelecimento: sql<
                string | null
              >`(select f.nome from estabelecimento e join ficha f on f.id = e.ficha_id where e.id = ${s.documento.estabelecimentoId})`,
              numero: s.documentoVersao.numero,
              emissao: s.documentoVersao.emissao,
              vencimento: s.documentoVersao.vencimento,
              situacaoVencimento,
              responsavel: sql<
                string | null
              >`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = ${s.documento.responsavelId})`,
              etiquetas: sql<
                Array<{ id: string; nome: string; cor: string | null }>
              >`coalesce((select json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.nome) from documento_etiqueta de join etiqueta e on e.id = de.etiqueta_id where de.documento_id = ${s.documento.id}), '[]')`,
              ativo: s.documento.ativo,
            })
            .from(s.documento)
            .innerJoin(s.tipoDocumento, eq(s.tipoDocumento.id, s.documento.tipoDocumentoId))
            .leftJoin(s.documentoVersao, vigente)
            .where(filtro)
            .orderBy(...ordem, asc(s.documento.titulo))
            .limit(limite)
            .offset(deslocamento),
      })
    }),
  )

  /** Resumo para o Início: documentos vencidos e vencendo (documento vencido aparece em destaque). */
  app.get('/api/documentos/resumo', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const linhas = await ctx.tx
        .select({ situacao: situacaoVencimento, n: count() })
        .from(s.documento)
        .innerJoin(s.tipoDocumento, eq(s.tipoDocumento.id, s.documento.tipoDocumentoId))
        .innerJoin(
          s.documentoVersao,
          and(
            eq(s.documentoVersao.documentoId, s.documento.id),
            eq(s.documentoVersao.situacao, 'vigente'),
          ),
        )
        .where(
          and(
            eq(s.documento.empresaId, ctx.empresaId),
            eq(s.documento.ativo, true),
            await filtroEscopo(ctx),
          ),
        )
        .groupBy(situacaoVencimento)
      const n = (x: string) => linhas.find((l) => l.situacao === x)?.n ?? 0
      return { vencidos: n('vencido'), vencendo: n('vencendo') }
    }),
  )

  /** Usuários ativos da empresa, para escolher o responsável pela renovação. */
  app.get('/api/documentos/responsaveis', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      ctx.tx
        .select({ id: s.usuario.id, nome: s.ficha.nome })
        .from(s.vinculo)
        .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
        .where(and(eq(s.vinculo.empresaId, ctx.empresaId), eq(s.vinculo.ativo, true)))
        .orderBy(asc(s.ficha.nome)),
    ),
  )

  app.get<{ Params: { id: string } }>('/api/documentos/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const d = await carregar(ctx, z.uuid().parse(req.params.id))
      const versoes = await ctx.tx
        .select()
        .from(s.documentoVersao)
        .where(eq(s.documentoVersao.documentoId, d.id))
        .orderBy(desc(s.documentoVersao.criadoEm))
      const etiquetas = await ctx.tx
        .select({ id: s.documentoEtiqueta.etiquetaId })
        .from(s.documentoEtiqueta)
        .where(eq(s.documentoEtiqueta.documentoId, d.id))
      const { empresaId: _e, criadoPor: _c, atualizadoPor: _a, ...resto } = d
      return { ...resto, etiquetas: etiquetas.map((e) => e.id), versoes }
    }),
  )

  app.post('/api/documentos', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = novoDocumento.parse(req.body)
      await conferirReferencias(ctx, d)
      const [doc] = await ctx.tx
        .insert(s.documento)
        .values({
          ...camposDocumento(d),
          empresaId: ctx.empresaId,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.documento.id })
      await ctx.tx.insert(s.documentoVersao).values({
        ...camposVersao(d.primeiraVersao),
        documentoId: doc!.id,
        empresaId: ctx.empresaId,
        criadoPor: ctx.usuarioId,
      })
      await gravarEtiquetas(ctx, doc!.id, d.etiquetas)
      await ctx.auditar({
        acao: 'criar',
        entidade: 'documento',
        registroId: doc!.id,
        depois: {
          ...camposDocumento(d),
          etiquetas: d.etiquetas,
          versao: camposVersao(d.primeiraVersao),
        },
      })
      return { id: doc!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/documentos/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosDocumento.parse(req.body)
      const atual = await carregar(ctx, id)
      conferirVersao(atual.versao, d.versao)
      await conferirReferencias(ctx, d)
      const etiquetasAntes = (
        await ctx.tx
          .select({ id: s.documentoEtiqueta.etiquetaId })
          .from(s.documentoEtiqueta)
          .where(eq(s.documentoEtiqueta.documentoId, id))
      )
        .map((e) => e.id)
        .sort()
      await ctx.tx
        .update(s.documento)
        .set({
          ...camposDocumento(d),
          atualizadoEm: sql`now()`,
          atualizadoPor: ctx.usuarioId,
          versao: sql`${s.documento.versao} + 1`,
        })
        .where(eq(s.documento.id, id))
      await gravarEtiquetas(ctx, id, d.etiquetas)
      const {
        tipoDocumentoId,
        titulo,
        estabelecimentoId,
        modulo,
        orgaoEmissor,
        responsavelId,
        observacoes,
      } = atual
      await ctx.auditar({
        acao: 'editar',
        entidade: 'documento',
        registroId: id,
        antes: {
          tipoDocumentoId,
          titulo,
          estabelecimentoId,
          modulo,
          orgaoEmissor,
          responsavelId,
          observacoes,
          etiquetas: etiquetasAntes,
        },
        depois: { ...camposDocumento(d), etiquetas: [...new Set(d.etiquetas)].sort() },
      })
      return { ok: true }
    }),
  )

  // Renovação: versão nova vigente; a anterior passa a "substituída" (gestao.md, Renovação).
  app.post<{ Params: { id: string } }>('/api/documentos/:id/versoes', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const v = versaoDocumento.parse(req.body)
      await carregar(ctx, id)
      const [anterior] = await ctx.tx
        .update(s.documentoVersao)
        .set({ situacao: 'substituida' })
        .where(
          and(eq(s.documentoVersao.documentoId, id), eq(s.documentoVersao.situacao, 'vigente')),
        )
        .returning({ id: s.documentoVersao.id, vencimento: s.documentoVersao.vencimento })
      const [nova] = await ctx.tx
        .insert(s.documentoVersao)
        .values({
          ...camposVersao(v),
          documentoId: id,
          empresaId: ctx.empresaId,
          anteriorId: anterior?.id ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.documentoVersao.id })
      await ctx.auditar({
        acao: 'renovar',
        entidade: 'documento',
        registroId: id,
        dados: {
          versaoId: nova!.id,
          vencimentoAnterior: anterior?.vencimento ?? null,
          ...camposVersao(v),
        },
      })
      return { id: nova!.id }
    }),
  )

  // Correção da versão vigente (ex.: número digitado errado), com auditoria.
  app.put<{ Params: { id: string; versaoId: string } }>(
    '/api/documentos/:id/versoes/:versaoId',
    async (req) =>
      naEmpresa(db, req, [F, 'editar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id)
        const versaoId = z.uuid().parse(req.params.versaoId)
        const v = versaoDocumento.parse(req.body)
        await carregar(ctx, id)
        const [atual] = await ctx.tx
          .select()
          .from(s.documentoVersao)
          .where(and(eq(s.documentoVersao.id, versaoId), eq(s.documentoVersao.documentoId, id)))
        if (!atual) throw new ErroNaoEncontrado('Versão não encontrada.')
        if (atual.situacao !== 'vigente')
          throw new ErroRegra('Só a versão vigente pode ser corrigida.', 'versao_substituida')
        await ctx.tx
          .update(s.documentoVersao)
          .set(camposVersao(v))
          .where(eq(s.documentoVersao.id, versaoId))
        const { numero, emissao, vencimento, assinadoPor, assinadoEm, observacoes } = atual
        await ctx.auditar({
          acao: 'corrigir_versao',
          entidade: 'documento',
          registroId: id,
          antes: { numero, emissao, vencimento, assinadoPor, assinadoEm, observacoes },
          depois: camposVersao(v),
        })
        return { ok: true }
      }),
  )

  for (const acao of ['inativar', 'reativar'] as const) {
    app.post<{ Params: { id: string } }>(`/api/documentos/:id/${acao}`, async (req) =>
      naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
        const id = z.uuid().parse(req.params.id)
        const m = acao === 'inativar' ? motivo.parse(req.body).motivo : null
        await carregar(ctx, id)
        await ctx.tx
          .update(s.documento)
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
          .where(eq(s.documento.id, id))
        await ctx.auditar({ acao, entidade: 'documento', registroId: id, motivo: m })
        return { ok: true }
      }),
    )
  }

  // Etiquetas (decidido em 03/10/2026: organização por etiquetas, sem pastas).
  app.get('/api/etiquetas', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      ctx.tx
        .select({
          id: s.etiqueta.id,
          nome: s.etiqueta.nome,
          cor: s.etiqueta.cor,
          documentos: sql<number>`(select count(*)::int from documento_etiqueta de where de.etiqueta_id = ${s.etiqueta.id})`,
        })
        .from(s.etiqueta)
        .where(eq(s.etiqueta.empresaId, ctx.empresaId))
        .orderBy(asc(s.etiqueta.nome)),
    ),
  )

  const nomeRepetido = (e: unknown): never => {
    if ((e as { cause?: { constraint?: string } }).cause?.constraint === 'etiqueta_nome') {
      throw new ErroRegra('Já existe uma etiqueta com este nome.', 'nome_duplicado')
    }
    throw e
  }

  app.post('/api/etiquetas', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const d = dadosEtiqueta.parse(req.body)
      const [e] = await ctx.tx
        .insert(s.etiqueta)
        .values({
          empresaId: ctx.empresaId,
          nome: d.nome,
          cor: d.cor ?? null,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.etiqueta.id })
        .catch(nomeRepetido)
      await ctx.auditar({ acao: 'criar', entidade: 'etiqueta', registroId: e!.id, depois: d })
      return { id: e!.id }
    }),
  )

  app.put<{ Params: { id: string } }>('/api/etiquetas/:id', async (req) =>
    naEmpresa(db, req, [F, 'editar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const d = dadosEtiqueta.parse(req.body)
      const [antes] = await ctx.tx
        .select()
        .from(s.etiqueta)
        .where(and(eq(s.etiqueta.id, id), eq(s.etiqueta.empresaId, ctx.empresaId)))
      if (!antes) throw new ErroNaoEncontrado('Etiqueta não encontrada.')
      await ctx.tx
        .update(s.etiqueta)
        .set({ nome: d.nome, cor: d.cor ?? null })
        .where(eq(s.etiqueta.id, id))
        .catch(nomeRepetido)
      await ctx.auditar({
        acao: 'editar',
        entidade: 'etiqueta',
        registroId: id,
        antes: { nome: antes.nome, cor: antes.cor },
        depois: d,
      })
      return { ok: true }
    }),
  )

  // Etiqueta não é registro regulatório: pode ser apagada; sai dos documentos que a usavam.
  app.post<{ Params: { id: string } }>('/api/etiquetas/:id/excluir', async (req) =>
    naEmpresa(db, req, [F, 'inativar'], async (ctx) => {
      const id = z.uuid().parse(req.params.id)
      const [e] = await ctx.tx
        .delete(s.etiqueta)
        .where(and(eq(s.etiqueta.id, id), eq(s.etiqueta.empresaId, ctx.empresaId)))
        .returning({ nome: s.etiqueta.nome })
      if (!e) throw new ErroNaoEncontrado('Etiqueta não encontrada.')
      await ctx.auditar({
        acao: 'excluir',
        entidade: 'etiqueta',
        registroId: id,
        dados: { nome: e.nome },
      })
      return { ok: true }
    }),
  )
}
