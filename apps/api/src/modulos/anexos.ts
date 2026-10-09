// Anexos de qualquer registro (P15). O arquivo fica fora do banco, num caminho previsível; o
// banco guarda os metadados e o hash. Remover só inativa (P26) e fica na auditoria (P14).
import { motivo, NOMES_CATEGORIA_ANEXO, novoAnexo, TIPOS_ANEXO_ACEITOS } from '@vinicycle/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import * as s from '../db/schema'
import { chaveAnexo } from '../nucleo/armazenamento'
import { entidade, localizarRegistro } from '../nucleo/entidades'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'
import { naEmpresa } from '../nucleo/requisicao'
import { limitesEfetivos } from './assinaturas'

export async function rotasAnexos(app: FastifyInstance): Promise<void> {
  const { db, armazenamento } = app.deps

  app.get('/api/anexos', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const q = z.object({ entidade: z.string(), registroId: z.uuid() }).parse(req.query)
      ctx.exigir(entidade(q.entidade).funcionalidade, 'visualizar')
      return ctx.tx
        .select({
          id: s.anexo.id,
          categoria: s.anexo.categoria,
          nomeOriginal: s.anexo.nomeOriginal,
          tipoMime: s.anexo.tipoMime,
          tamanhoBytes: s.anexo.tamanhoBytes,
          descricao: s.anexo.descricao,
          criadoEm: s.anexo.criadoEm,
          enviadoPor: sql<
            string | null
          >`(select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = anexo.criado_por)`,
        })
        .from(s.anexo)
        .where(
          and(
            eq(s.anexo.empresaId, ctx.empresaId),
            eq(s.anexo.entidade, q.entidade),
            eq(s.anexo.registroId, q.registroId),
            eq(s.anexo.ativo, true),
          ),
        )
        .orderBy(sql`${s.anexo.criadoEm} desc`)
    }),
  )

  app.post('/api/anexos', async (req) => {
    const arquivo = await req.file()
    if (!arquivo) throw new ErroRegra('Envie um arquivo.', 'arquivo')
    const campos = Object.fromEntries(
      Object.entries(arquivo.fields).flatMap(([k, v]) =>
        v && !Array.isArray(v) && v.type === 'field' ? [[k, String(v.value)]] : [],
      ),
    )
    const d = novoAnexo.parse(campos)
    const conteudo = await arquivo.toBuffer()
    if (arquivo.file.truncated)
      throw new ErroRegra('Arquivo acima do tamanho máximo (25 MB).', 'arquivo_grande')
    if (!(TIPOS_ANEXO_ACEITOS as readonly string[]).includes(arquivo.mimetype)) {
      throw new ErroRegra(
        'Tipo de arquivo não aceito. Use PDF, imagem, planilha, documento, XML, CSV ou ZIP.',
        'tipo_arquivo',
      )
    }
    const hash = createHash('sha256').update(conteudo).digest('hex')
    return naEmpresa(db, req, null, async (ctx) => {
      ctx.exigir(entidade(d.entidade).funcionalidade, 'editar')
      const { estabelecimentoId } = await localizarRegistro(
        ctx.tx,
        ctx.empresaId,
        d.entidade,
        d.registroId,
      )
      const [repetido] = await ctx.tx
        .select({ id: s.anexo.id })
        .from(s.anexo)
        .where(
          and(
            eq(s.anexo.empresaId, ctx.empresaId),
            eq(s.anexo.entidade, d.entidade),
            eq(s.anexo.registroId, d.registroId),
            eq(s.anexo.hashSha256, hash),
            eq(s.anexo.ativo, true),
          ),
        )
      if (repetido)
        throw new ErroRegra('Este arquivo já está anexado a este registro.', 'anexo_duplicado')
      // Limite de armazenamento do plano (P25).
      const limiteGb = (await limitesEfetivos(ctx.tx, ctx.empresaId))?.armazenamentoGb ?? null
      if (limiteGb !== null) {
        const [{ usado }] = (await ctx.tx
          .select({ usado: sql<number>`coalesce(sum(${s.anexo.tamanhoBytes}), 0)::bigint` })
          .from(s.anexo)
          .where(eq(s.anexo.empresaId, ctx.empresaId))) as [{ usado: number }]
        if (Number(usado) + conteudo.length > limiteGb * 1024 ** 3) {
          throw new ErroRegra(
            'O espaço de anexos da assinatura acabou. Para continuar, contrate armazenamento adicional.',
            'limite_plano',
          )
        }
      }
      const id = uuidv7()
      const caminho = chaveAnexo({
        empresaId: ctx.empresaId,
        estabelecimentoId,
        entidade: d.entidade,
        registroId: d.registroId,
        anexoId: id,
      })
      await armazenamento.gravar(caminho, conteudo)
      await ctx.tx.insert(s.anexo).values({
        id,
        empresaId: ctx.empresaId,
        estabelecimentoId,
        entidade: d.entidade,
        registroId: d.registroId,
        categoria: d.categoria,
        nomeOriginal: arquivo.filename.slice(0, 255),
        tipoMime: arquivo.mimetype,
        tamanhoBytes: conteudo.length,
        hashSha256: hash,
        caminho,
        descricao: d.descricao ?? null,
        criadoPor: ctx.usuarioId,
      })
      await ctx.auditar({
        acao: 'anexar',
        entidade: d.entidade,
        registroId: d.registroId,
        dados: {
          anexoId: id,
          arquivo: arquivo.filename,
          categoria: NOMES_CATEGORIA_ANEXO[d.categoria],
          tamanho: conteudo.length,
        },
      })
      return { id }
    })
  })

  app.get<{ Params: { id: string } }>('/api/anexos/:id/arquivo', async (req, reply) => {
    const a = await naEmpresa(db, req, null, async (ctx) => {
      const [a] = await ctx.tx
        .select()
        .from(s.anexo)
        .where(
          and(eq(s.anexo.id, z.uuid().parse(req.params.id)), eq(s.anexo.empresaId, ctx.empresaId)),
        )
      if (!a) throw new ErroNaoEncontrado('Anexo não encontrado.')
      ctx.exigir(entidade(a.entidade).funcionalidade, 'visualizar')
      return a
    })
    const nome = encodeURIComponent(a.nomeOriginal)
    reply
      .header('Content-Type', a.tipoMime)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${nome}`)
      .header('X-Content-Type-Options', 'nosniff')
    return reply.send(await armazenamento.ler(a.caminho))
  })

  app.post<{ Params: { id: string } }>('/api/anexos/:id/inativar', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const { motivo: m } = motivo.parse(req.body)
      const [a] = await ctx.tx
        .select()
        .from(s.anexo)
        .where(
          and(eq(s.anexo.id, z.uuid().parse(req.params.id)), eq(s.anexo.empresaId, ctx.empresaId)),
        )
      if (!a) throw new ErroNaoEncontrado('Anexo não encontrado.')
      ctx.exigir(entidade(a.entidade).funcionalidade, 'editar')
      if (!a.ativo) return { ok: true }
      await ctx.tx
        .update(s.anexo)
        .set({
          ativo: false,
          inativadoEm: sql`now()`,
          inativadoPor: ctx.usuarioId,
          motivoInativacao: m,
        })
        .where(eq(s.anexo.id, a.id))
      await ctx.auditar({
        acao: 'remover_anexo',
        entidade: a.entidade,
        registroId: a.registroId,
        dados: { anexoId: a.id, arquivo: a.nomeOriginal },
        motivo: m,
      })
      return { ok: true }
    }),
  )
}
