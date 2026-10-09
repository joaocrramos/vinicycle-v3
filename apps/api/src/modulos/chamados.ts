// Suporte: chamados (administracao.md, Suporte; decidido em 03/10/2026; 04, ciclo 12, bloco 3).
//   - O cliente abre pelo menu do avatar; cada usuário vê os seus, o Master vê os da empresa.
//   - Quem não consegue entrar abre pela página pública, com e-mail e CNPJ (a resposta vai por
//     e-mail).
//   - A equipe atende com prazo da primeira resposta por prioridade (padrão, ou por plano ou
//     cliente), semáforo do tempo de espera, notas internas e mudança de situação.
//   - Avisos: a equipe recebe os chamados novos; o cliente, as respostas e as mudanças.
import {
  chamadoPublico,
  consultaListagem,
  mensagemChamado,
  NOMES_PRIORIDADE,
  NOMES_SITUACAO_CHAMADO,
  novoChamado,
  PRAZO_PADRAO_HORAS,
  PRIORIDADES_CHAMADO,
  type PrioridadeChamado,
  SITUACOES_CHAMADO,
  type SituacaoChamado,
  TIPOS_ANEXO_ACEITOS,
} from '@vinicycle/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { emContexto, type Tx } from '../db/cliente'
import * as s from '../db/schema'
import { chaveAnexo } from '../nucleo/armazenamento'
import { enfileirarEmail } from '../nucleo/email'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { buscaTexto, listar } from '../nucleo/listagem'
import {
  emailChamadoNovo,
  emailChamadoRecebido,
  emailChamadoResposta,
  emailChamadoSituacao,
} from '../nucleo/modelos-email'
import { type ContextoEmpresa, naEmpresa, naPlataforma } from '../nucleo/requisicao'

const LIMITE_PUBLICO = { rateLimit: { max: 5, timeWindow: '10 minutes' } }
const ENCERRADAS: SituacaoChamado[] = ['resolvido', 'fechado']

/** Prazo da primeira resposta: o do cliente, senão o do plano, senão o padrão. */
export async function horasDePrazo(
  tx: Tx,
  empresaId: string | null,
  prioridade: PrioridadeChamado,
): Promise<number> {
  if (empresaId) {
    const [p] = await tx
      .select({ horas: s.chamadoPrazo.horas })
      .from(s.chamadoPrazo)
      .where(
        and(eq(s.chamadoPrazo.empresaId, empresaId), eq(s.chamadoPrazo.prioridade, prioridade)),
      )
    if (p) return p.horas
    const [q] = await tx
      .select({ horas: s.chamadoPrazo.horas })
      .from(s.chamadoPrazo)
      .innerJoin(s.assinatura, eq(s.assinatura.planoId, s.chamadoPrazo.planoId))
      .where(
        and(
          eq(s.assinatura.empresaId, empresaId),
          eq(s.assinatura.situacao, 'vigente'),
          eq(s.chamadoPrazo.prioridade, prioridade),
        ),
      )
    if (q) return q.horas
  }
  return PRAZO_PADRAO_HORAS[prioridade]
}

/** Semáforo do tempo de espera pela primeira resposta. */
export function semaforo(c: {
  criadoEm: Date
  prazoEm: Date
  primeiraRespostaEm: Date | null
  situacao: string
}): 'respondido' | 'verde' | 'amarelo' | 'vermelho' {
  if (c.primeiraRespostaEm || ENCERRADAS.includes(c.situacao as SituacaoChamado))
    return 'respondido'
  const agora = Date.now()
  if (agora > c.prazoEm.getTime()) return 'vermelho'
  const decorrido = (agora - c.criadoEm.getTime()) / (c.prazoEm.getTime() - c.criadoEm.getTime())
  return decorrido >= 0.5 ? 'amarelo' : 'verde'
}

const fmtHora = (d: Date) =>
  d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

/** A equipe com acesso ao suporte recebe o aviso do chamado novo. */
async function avisarEquipe(
  tx: Tx,
  url: string,
  c: { id: string; numero: number; assunto: string; prioridade: PrioridadeChamado },
  cliente: string,
) {
  const equipe = await tx.execute<{ email: string }>(sql`select emails_equipe_suporte() as email`)
  for (const { email } of equipe.rows) {
    await enfileirarEmail(tx, {
      ...emailChamadoNovo({
        para: email,
        numero: c.numero,
        cliente,
        assunto: c.assunto,
        prioridade: NOMES_PRIORIDADE[c.prioridade],
        link: `${url}/plataforma/suporte?chamado=${c.id}`,
      }),
      modelo: 'chamado_novo',
      origem: 'chamado',
      origemId: c.id,
    })
  }
}

async function nomeDaEmpresa(tx: Tx, empresaId: string | null): Promise<string | null> {
  if (!empresaId) return null
  const [e] = await tx
    .select({ nome: s.ficha.nome, fantasia: s.ficha.nomeFantasia })
    .from(s.empresa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
    .where(eq(s.empresa.id, empresaId))
  return e ? e.fantasia || e.nome : null
}

async function lerChamado(tx: Tx, id: string) {
  const [c] = await tx.select().from(s.chamado).where(eq(s.chamado.id, id))
  if (!c) throw new ErroNaoEncontrado('Chamado não encontrado.')
  const mensagens = await tx
    .select({
      id: s.chamadoMensagem.id,
      autorTipo: s.chamadoMensagem.autorTipo,
      autor: sql<
        string | null
      >`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = chamado_mensagem.autor_id)`,
      texto: s.chamadoMensagem.texto,
      interna: s.chamadoMensagem.interna,
      criadoEm: s.chamadoMensagem.criadoEm,
    })
    .from(s.chamadoMensagem)
    .where(eq(s.chamadoMensagem.chamadoId, id))
    .orderBy(asc(s.chamadoMensagem.criadoEm))
  const historico = await tx
    .select()
    .from(s.chamadoHistorico)
    .where(eq(s.chamadoHistorico.chamadoId, id))
    .orderBy(asc(s.chamadoHistorico.criadoEm))
  const anexos = c.empresaId
    ? await tx
        .select({
          id: s.anexo.id,
          nomeOriginal: s.anexo.nomeOriginal,
          tamanhoBytes: s.anexo.tamanhoBytes,
          criadoEm: s.anexo.criadoEm,
        })
        .from(s.anexo)
        .where(
          and(eq(s.anexo.entidade, 'chamado'), eq(s.anexo.registroId, id), eq(s.anexo.ativo, true)),
        )
        .orderBy(asc(s.anexo.criadoEm))
    : []
  return {
    ...c,
    cliente: await nomeDaEmpresa(tx, c.empresaId),
    semaforo: semaforo(c),
    mensagens,
    historico,
    anexos,
  }
}

async function mudarSituacao(
  tx: Tx,
  c: { id: string; empresaId: string | null; situacao: string },
  para: SituacaoChamado,
  usuarioId: string | null,
) {
  if (c.situacao === para) return
  await tx
    .update(s.chamado)
    .set({
      situacao: para,
      encerradoEm: ENCERRADAS.includes(para) ? sql`now()` : null,
      atualizadoEm: sql`now()`,
      atualizadoPor: usuarioId,
      versao: sql`${s.chamado.versao} + 1`,
    })
    .where(eq(s.chamado.id, c.id))
  await tx.insert(s.chamadoHistorico).values({
    chamadoId: c.id,
    empresaId: c.empresaId,
    de: c.situacao,
    para,
    criadoPor: usuarioId,
  })
}

/** Chamado do cliente: o próprio solicitante, ou o Master da empresa. */
async function doCliente(ctx: ContextoEmpresa, id: string) {
  const [c] = await ctx.tx
    .select()
    .from(s.chamado)
    .where(and(eq(s.chamado.id, id), eq(s.chamado.empresaId, ctx.empresaId)))
  if (!c || (!ctx.acesso.eMaster && c.solicitanteId !== ctx.usuarioId)) {
    throw new ErroNaoEncontrado('Chamado não encontrado.')
  }
  return c
}

export async function rotasChamados(app: FastifyInstance): Promise<void> {
  const { db, config, armazenamento } = app.deps
  const url = config.URL_APLICACAO
  const linkCliente = (id: string) => `${url}/suporte/chamados?chamado=${id}`

  // ---- Cliente ----

  app.get('/api/chamados/categorias', async (req) =>
    naEmpresa(db, req, null, async ({ tx }) => {
      const [c] = await tx
        .select({ categorias: s.configPlataforma.chamadoCategorias })
        .from(s.configPlataforma)
      return c?.categorias ?? []
    }),
  )

  app.get('/api/chamados', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const lista = await ctx.tx
        .select({
          id: s.chamado.id,
          numero: s.chamado.numero,
          assunto: s.chamado.assunto,
          categoria: s.chamado.categoria,
          prioridade: s.chamado.prioridade,
          situacao: s.chamado.situacao,
          solicitante: s.chamado.solicitanteNome,
          criadoEm: s.chamado.criadoEm,
          atualizadoEm: s.chamado.atualizadoEm,
        })
        .from(s.chamado)
        .where(
          and(
            eq(s.chamado.empresaId, ctx.empresaId),
            ctx.acesso.eMaster ? undefined : eq(s.chamado.solicitanteId, ctx.usuarioId),
          ),
        )
        .orderBy(desc(s.chamado.criadoEm))
        .limit(200)
      return lista
    }),
  )

  app.post('/api/chamados', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const d = novoChamado.parse(req.body)
      const [u] = await ctx.tx
        .select({ nome: s.ficha.nome, email: s.usuario.email })
        .from(s.usuario)
        .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
        .where(eq(s.usuario.id, ctx.usuarioId))
      const horas = await horasDePrazo(ctx.tx, ctx.empresaId, d.prioridade)
      const [c] = await ctx.tx
        .insert(s.chamado)
        .values({
          empresaId: ctx.empresaId,
          solicitanteId: ctx.usuarioId,
          solicitanteNome: u!.nome,
          solicitanteEmail: u!.email,
          origem: 'sistema',
          assunto: d.assunto,
          categoria: d.categoria,
          prioridade: d.prioridade,
          situacao: 'aberto',
          prazoEm: sql`now() + ${`${horas} hours`}::interval`,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning()
      await ctx.tx.insert(s.chamadoMensagem).values({
        chamadoId: c!.id,
        empresaId: ctx.empresaId,
        autorId: ctx.usuarioId,
        autorTipo: 'cliente',
        texto: d.descricao,
        criadoPor: ctx.usuarioId,
      })
      await ctx.tx.insert(s.chamadoHistorico).values({
        chamadoId: c!.id,
        empresaId: ctx.empresaId,
        para: 'aberto',
        criadoPor: ctx.usuarioId,
      })
      await avisarEquipe(ctx.tx, url, c!, (await nomeDaEmpresa(ctx.tx, ctx.empresaId)) ?? '')
      await ctx.auditar({ acao: 'criar', entidade: 'chamado', registroId: c!.id, depois: d })
      return { id: c!.id, numero: c!.numero }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/chamados/:id', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const c = await doCliente(ctx, z.uuid().parse(req.params.id))
      const r = await lerChamado(ctx.tx, c.id)
      // O cliente não vê o semáforo interno nem as notas internas (o RLS já as esconde).
      return { ...r, semaforo: undefined }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/chamados/:id/mensagens', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const c = await doCliente(ctx, z.uuid().parse(req.params.id))
      if (c.situacao === 'fechado') {
        throw new ErroRegra('O chamado está fechado. Abra um novo, citando o número.', 'fechado')
      }
      const { texto } = mensagemChamado.parse(req.body)
      await ctx.tx.insert(s.chamadoMensagem).values({
        chamadoId: c.id,
        empresaId: ctx.empresaId,
        autorId: ctx.usuarioId,
        autorTipo: 'cliente',
        texto,
        criadoPor: ctx.usuarioId,
      })
      // Resposta do cliente traz o chamado de volta para a equipe.
      if (['aguardando_cliente', 'resolvido'].includes(c.situacao)) {
        await mudarSituacao(ctx.tx, c, 'em_atendimento', ctx.usuarioId)
      }
      await ctx.tx
        .update(s.chamado)
        .set({ atualizadoEm: sql`now()` })
        .where(eq(s.chamado.id, c.id))
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/chamados/:id/fechar', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const c = await doCliente(ctx, z.uuid().parse(req.params.id))
      await mudarSituacao(ctx.tx, c, 'fechado', ctx.usuarioId)
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/chamados/:id/anexos', async (req) => {
    const id = z.uuid().parse(req.params.id)
    const arquivo = await req.file()
    if (!arquivo) throw new ErroRegra('Envie um arquivo.', 'arquivo')
    const conteudo = await arquivo.toBuffer()
    if (arquivo.file.truncated)
      throw new ErroRegra('Arquivo acima do tamanho máximo (25 MB).', 'arquivo_grande')
    if (!(TIPOS_ANEXO_ACEITOS as readonly string[]).includes(arquivo.mimetype)) {
      throw new ErroRegra('Tipo de arquivo não aceito.', 'tipo_arquivo')
    }
    return naEmpresa(db, req, null, async (ctx) => {
      const c = await doCliente(ctx, id)
      const anexoId = uuidv7()
      const caminho = chaveAnexo({
        empresaId: ctx.empresaId,
        estabelecimentoId: null,
        entidade: 'chamado',
        registroId: c.id,
        anexoId,
      })
      await armazenamento.gravar(caminho, conteudo)
      await ctx.tx.insert(s.anexo).values({
        id: anexoId,
        empresaId: ctx.empresaId,
        entidade: 'chamado',
        registroId: c.id,
        categoria: 'outro',
        nomeOriginal: arquivo.filename.slice(0, 255),
        tipoMime: arquivo.mimetype,
        tamanhoBytes: conteudo.length,
        hashSha256: createHash('sha256').update(conteudo).digest('hex'),
        caminho,
        descricao: `Anexo do chamado ${c.numero}`,
        criadoPor: ctx.usuarioId,
      })
      return { id: anexoId }
    })
  })

  app.get<{ Params: { id: string; anexo: string } }>(
    '/api/chamados/:id/anexos/:anexo',
    async (req, reply) => {
      const a = await naEmpresa(db, req, null, async (ctx) => {
        const c = await doCliente(ctx, z.uuid().parse(req.params.id))
        const [a] = await ctx.tx
          .select()
          .from(s.anexo)
          .where(
            and(
              eq(s.anexo.id, z.uuid().parse(req.params.anexo)),
              eq(s.anexo.entidade, 'chamado'),
              eq(s.anexo.registroId, c.id),
            ),
          )
        if (!a) throw new ErroNaoEncontrado('Anexo não encontrado.')
        return a
      })
      reply
        .header('Content-Type', a.tipoMime)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`,
        )
        .header('X-Content-Type-Options', 'nosniff')
      return reply.send(await armazenamento.ler(a.caminho))
    },
  )

  // ---- Página pública ----

  app.post('/api/suporte/publico', { config: LIMITE_PUBLICO }, async (req) => {
    const d = chamadoPublico.parse(req.body)
    return emContexto(db, { plataforma: true }, async (tx) => {
      const [e] = await tx
        .select({ id: s.empresa.id })
        .from(s.empresa)
        .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
        .where(eq(s.ficha.documento, d.cnpj))
      const empresaId = e?.id ?? null
      const horas = await horasDePrazo(tx, empresaId, 'normal')
      const [c] = await tx
        .insert(s.chamado)
        .values({
          empresaId,
          solicitanteNome: d.nome,
          solicitanteEmail: d.email,
          documentoInformado: d.cnpj,
          origem: 'publico',
          assunto: d.assunto,
          categoria: 'Acesso',
          prioridade: 'normal',
          situacao: 'aberto',
          prazoEm: sql`now() + ${`${horas} hours`}::interval`,
        })
        .returning()
      await tx.insert(s.chamadoMensagem).values({
        chamadoId: c!.id,
        empresaId,
        autorTipo: 'cliente',
        texto: d.descricao,
      })
      await tx.insert(s.chamadoHistorico).values({ chamadoId: c!.id, empresaId, para: 'aberto' })
      await enfileirarEmail(tx, {
        ...emailChamadoRecebido({
          para: d.email,
          numero: c!.numero,
          assunto: d.assunto,
          prazo: fmtHora(c!.prazoEm),
        }),
        modelo: 'chamado_recebido',
        origem: 'chamado',
        origemId: c!.id,
        empresaId,
      })
      await avisarEquipe(
        tx,
        url,
        c!,
        (await nomeDaEmpresa(tx, empresaId)) ?? `${d.nome} (sem acesso)`,
      )
      // Não diz se o CNPJ é cliente: só o número do chamado.
      return { numero: c!.numero }
    })
  })

  // ---- Equipe da plataforma ----

  const F = 'plataforma.suporte'

  app.get('/api/plataforma/chamados', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
      const c = consultaListagem
        .extend({
          situacao: z.enum([...SITUACOES_CHAMADO, 'abertos'] as [string, ...string[]]).optional(),
          prioridade: z.enum(PRIORIDADES_CHAMADO).optional(),
          empresaId: z.uuid().optional(),
        })
        .parse(req.query)
      const filtro = and(
        buscaTexto(c.busca, [
          s.chamado.assunto,
          s.chamado.solicitanteNome,
          s.chamado.solicitanteEmail,
          s.ficha.nome,
          sql`${s.chamado.numero}::text`,
        ]),
        c.situacao === 'abertos'
          ? sql`${s.chamado.situacao} not in ('resolvido', 'fechado')`
          : c.situacao
            ? eq(s.chamado.situacao, c.situacao as SituacaoChamado)
            : undefined,
        c.prioridade ? eq(s.chamado.prioridade, c.prioridade) : undefined,
        c.empresaId ? eq(s.chamado.empresaId, c.empresaId) : undefined,
      )
      const r = await listar({
        consulta: c,
        ordenaveis: {
          numero: s.chamado.numero,
          prazoEm: s.chamado.prazoEm,
          prioridade: s.chamado.prioridade,
          situacao: s.chamado.situacao,
          criadoEm: s.chamado.criadoEm,
        },
        ordemPadrao: { campo: 'prazoEm', direcao: 'asc' },
        contar: async () =>
          (
            await tx
              .select({ n: sql<number>`count(*)::int` })
              .from(s.chamado)
              .leftJoin(s.empresa, eq(s.empresa.id, s.chamado.empresaId))
              .leftJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          tx
            .select({
              id: s.chamado.id,
              numero: s.chamado.numero,
              empresaId: s.chamado.empresaId,
              cliente: sql<
                string | null
              >`coalesce(nullif(${s.ficha.nomeFantasia}, ''), ${s.ficha.nome})`,
              solicitante: s.chamado.solicitanteNome,
              origem: s.chamado.origem,
              assunto: s.chamado.assunto,
              categoria: s.chamado.categoria,
              prioridade: s.chamado.prioridade,
              situacao: s.chamado.situacao,
              criadoEm: s.chamado.criadoEm,
              prazoEm: s.chamado.prazoEm,
              primeiraRespostaEm: s.chamado.primeiraRespostaEm,
            })
            .from(s.chamado)
            .leftJoin(s.empresa, eq(s.empresa.id, s.chamado.empresaId))
            .leftJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      })
      return { ...r, itens: r.itens.map((x) => ({ ...x, semaforo: semaforo(x) })) }
    }),
  )

  app.get<{ Params: { id: string } }>('/api/plataforma/chamados/:id', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) =>
      lerChamado(tx, z.uuid().parse(req.params.id)),
    ),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/chamados/:id/mensagens', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId }) => {
      const id = z.uuid().parse(req.params.id)
      const d = mensagemChamado.parse(req.body)
      const [c] = await tx.select().from(s.chamado).where(eq(s.chamado.id, id))
      if (!c) throw new ErroNaoEncontrado('Chamado não encontrado.')
      await tx.insert(s.chamadoMensagem).values({
        chamadoId: id,
        empresaId: c.empresaId,
        autorId: usuarioId,
        autorTipo: 'equipe',
        texto: d.texto,
        interna: d.interna,
        criadoPor: usuarioId,
      })
      if (!d.interna) {
        await tx
          .update(s.chamado)
          .set({
            primeiraRespostaEm: c.primeiraRespostaEm ?? sql`now()`,
            atualizadoEm: sql`now()`,
            atualizadoPor: usuarioId,
          })
          .where(eq(s.chamado.id, id))
        if (c.situacao === 'aberto') await mudarSituacao(tx, c, 'em_atendimento', usuarioId)
        await enfileirarEmail(tx, {
          ...emailChamadoResposta({
            para: c.solicitanteEmail,
            numero: c.numero,
            assunto: c.assunto,
            texto: d.texto,
            link: c.origem === 'sistema' ? linkCliente(id) : null,
          }),
          modelo: 'chamado_resposta',
          origem: 'chamado',
          origemId: id,
          empresaId: c.empresaId,
        })
      }
      return { ok: true }
    }),
  )

  app.post<{ Params: { id: string } }>('/api/plataforma/chamados/:id/situacao', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id)
      const { situacao } = z.object({ situacao: z.enum(SITUACOES_CHAMADO) }).parse(req.body)
      const [c] = await tx.select().from(s.chamado).where(eq(s.chamado.id, id))
      if (!c) throw new ErroNaoEncontrado('Chamado não encontrado.')
      if (c.situacao === situacao) return { ok: true }
      await mudarSituacao(tx, c, situacao, usuarioId)
      await enfileirarEmail(tx, {
        ...emailChamadoSituacao({
          para: c.solicitanteEmail,
          numero: c.numero,
          assunto: c.assunto,
          situacao: NOMES_SITUACAO_CHAMADO[situacao],
          link: c.origem === 'sistema' ? linkCliente(id) : null,
        }),
        modelo: 'chamado_situacao',
        origem: 'chamado',
        origemId: id,
        empresaId: c.empresaId,
      })
      await auditar({
        acao: 'situacao',
        entidade: 'chamado',
        registroId: id,
        empresaId: c.empresaId,
        antes: { situacao: c.situacao },
        depois: { situacao },
      })
      return { ok: true }
    }),
  )

  /** Categoria e prioridade; sem resposta ainda, o prazo é recalculado pela prioridade nova. */
  app.put<{ Params: { id: string } }>('/api/plataforma/chamados/:id', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId }) => {
      const id = z.uuid().parse(req.params.id)
      const d = z
        .object({
          categoria: z.string().trim().min(2).max(60),
          prioridade: z.enum(PRIORIDADES_CHAMADO),
        })
        .parse(req.body)
      const [c] = await tx.select().from(s.chamado).where(eq(s.chamado.id, id))
      if (!c) throw new ErroNaoEncontrado('Chamado não encontrado.')
      const horas = await horasDePrazo(tx, c.empresaId, d.prioridade)
      await tx
        .update(s.chamado)
        .set({
          categoria: d.categoria,
          prioridade: d.prioridade,
          ...(c.primeiraRespostaEm
            ? {}
            : { prazoEm: sql`${s.chamado.criadoEm} + ${`${horas} hours`}::interval` }),
          atualizadoEm: sql`now()`,
          atualizadoPor: usuarioId,
        })
        .where(eq(s.chamado.id, id))
      return { ok: true }
    }),
  )

  app.get<{ Params: { id: string; anexo: string } }>(
    '/api/plataforma/chamados/:id/anexos/:anexo',
    async (req, reply) => {
      const a = await naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
        const [a] = await tx
          .select()
          .from(s.anexo)
          .where(
            and(
              eq(s.anexo.id, z.uuid().parse(req.params.anexo)),
              eq(s.anexo.entidade, 'chamado'),
              eq(s.anexo.registroId, z.uuid().parse(req.params.id)),
            ),
          )
        if (!a) throw new ErroNaoEncontrado('Anexo não encontrado.')
        return a
      })
      reply
        .header('Content-Type', a.tipoMime)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`,
        )
        .header('X-Content-Type-Options', 'nosniff')
      return reply.send(await armazenamento.ler(a.caminho))
    },
  )

  /** Resumo por categoria e por prazo (últimos 90 dias). */
  app.get('/api/plataforma/chamados-resumo', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => {
      const r = await tx.execute<{
        categoria: string
        total: number
        abertos: number
        no_prazo: number
        fora_do_prazo: number
      }>(sql`
        select categoria, count(*)::int as total,
          count(*) filter (where situacao not in ('resolvido', 'fechado'))::int as abertos,
          count(*) filter (where coalesce(primeira_resposta_em, now()) <= prazo_em)::int as no_prazo,
          count(*) filter (where coalesce(primeira_resposta_em, now()) > prazo_em)::int as fora_do_prazo
        from chamado where criado_em > now() - interval '90 days'
        group by categoria order by total desc`)
      return r.rows.map((x) => ({
        categoria: x.categoria,
        total: x.total,
        abertos: x.abertos,
        noPrazo: x.no_prazo,
        foraDoPrazo: x.fora_do_prazo,
      }))
    }),
  )

  // ---- Prazos de atendimento por plano ou cliente ----

  app.get('/api/plataforma/chamados-prazos', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) => ({
      padrao: PRAZO_PADRAO_HORAS,
      excecoes: await tx
        .select({
          id: s.chamadoPrazo.id,
          planoId: s.chamadoPrazo.planoId,
          empresaId: s.chamadoPrazo.empresaId,
          prioridade: s.chamadoPrazo.prioridade,
          horas: s.chamadoPrazo.horas,
          plano: s.plano.nome,
          cliente: sql<
            string | null
          >`(select coalesce(nullif(f.nome_fantasia, ''), f.nome) from empresa e join ficha f on f.id = e.ficha_id where e.id = chamado_prazo.empresa_id)`,
        })
        .from(s.chamadoPrazo)
        .leftJoin(s.plano, eq(s.plano.id, s.chamadoPrazo.planoId))
        .orderBy(asc(s.chamadoPrazo.criadoEm)),
    })),
  )

  app.put('/api/plataforma/chamados-prazos', async (req) =>
    naPlataforma(db, req, [F, 'editar'], async ({ tx, usuarioId, auditar }) => {
      const d = z
        .object({
          planoId: z.uuid().nullable(),
          empresaId: z.uuid().nullable(),
          horas: z.partialRecord(
            z.enum(PRIORIDADES_CHAMADO),
            z.number().int().min(1).max(2000).nullable(),
          ),
        })
        .refine(
          (x) => (x.planoId === null) !== (x.empresaId === null),
          'Escolha um plano ou um cliente',
        )
        .parse(req.body)
      const alvo = d.planoId
        ? eq(s.chamadoPrazo.planoId, d.planoId)
        : eq(s.chamadoPrazo.empresaId, d.empresaId!)
      await tx.delete(s.chamadoPrazo).where(alvo)
      for (const [prioridade, horas] of Object.entries(d.horas)) {
        if (!horas) continue
        await tx.insert(s.chamadoPrazo).values({
          planoId: d.planoId,
          empresaId: d.empresaId,
          prioridade: prioridade as PrioridadeChamado,
          horas,
          criadoPor: usuarioId,
        })
      }
      await auditar({ acao: 'editar', entidade: 'chamado_prazo', depois: d })
      return { ok: true }
    }),
  )
}
