// Administração › Regras regulatórias (P16): limites, faixas, prazos e dizeres com vigência,
// abrangência e fonte. Mudou a norma? Nova versão; a anterior se encerra na véspera. Nada se apaga.
import { novaRegra } from '@vinicycle/shared'
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import * as s from '../db/schema'
import { auditar } from '../nucleo/auditoria'
import { ErroRegra } from '../nucleo/erros'
import { naEmpresa, naPlataforma } from '../nucleo/requisicao'

const F = 'plataforma.regras'

export async function rotasRegras(app: FastifyInstance): Promise<void> {
  const { db } = app.deps

  app.get('/api/plataforma/regras', async (req) =>
    naPlataforma(db, req, [F, 'visualizar'], async ({ tx }) =>
      tx
        .select()
        .from(s.regraRegulatoria)
        .orderBy(
          asc(s.regraRegulatoria.chave),
          asc(s.regraRegulatoria.abrangencia),
          asc(s.regraRegulatoria.abrangenciaCodigo),
          desc(s.regraRegulatoria.vigenteDesde),
        ),
    ),
  )

  app.post('/api/plataforma/regras', async (req) =>
    naPlataforma(db, req, [F, 'criar'], async ({ tx, origem }) => {
      const d = novaRegra.parse(req.body)
      const mesmaSerie = and(
        eq(s.regraRegulatoria.chave, d.chave),
        eq(s.regraRegulatoria.abrangencia, d.abrangencia),
        d.abrangenciaCodigo
          ? eq(s.regraRegulatoria.abrangenciaCodigo, d.abrangenciaCodigo)
          : isNull(s.regraRegulatoria.abrangenciaCodigo),
      )
      const [ultima] = await tx
        .select()
        .from(s.regraRegulatoria)
        .where(mesmaSerie)
        .orderBy(desc(s.regraRegulatoria.vigenteDesde))
        .limit(1)
      if (ultima && ultima.vigenteDesde >= d.vigenteDesde) {
        throw new ErroRegra(
          'A nova versão precisa começar depois da versão mais recente desta regra.',
          'vigencia',
        )
      }
      // A versão anterior vale até a véspera da nova.
      await tx
        .update(s.regraRegulatoria)
        .set({ vigenteAte: sql`(${d.vigenteDesde}::date - 1)` })
        .where(
          and(
            mesmaSerie,
            lt(s.regraRegulatoria.vigenteDesde, d.vigenteDesde),
            sql`(${s.regraRegulatoria.vigenteAte} is null or ${s.regraRegulatoria.vigenteAte} >= ${d.vigenteDesde}::date)`,
          ),
        )
      const [r] = await tx
        .insert(s.regraRegulatoria)
        .values({
          ...d,
          abrangenciaCodigo: d.abrangenciaCodigo ?? null,
          minimo: d.minimo ?? null,
          maximo: d.maximo ?? null,
          unidade: d.unidade ?? null,
          fonteArtigo: d.fonteArtigo ?? null,
          fonteLink: d.fonteLink ?? null,
          fonteNota: d.fonteNota ?? null,
          criadoPor: origem.usuarioId,
        })
        .returning({ id: s.regraRegulatoria.id })
      await auditar(tx, origem, {
        acao: 'criar',
        entidade: 'regra_regulatoria',
        registroId: r!.id,
        depois: d,
      })
      return { id: r!.id }
    }),
  )

  // Para as telas da empresa: as regras em vigor hoje, com a fonte (o sistema informa, P29).
  app.get('/api/regras', async (req) =>
    naEmpresa(db, req, null, async (ctx) =>
      ctx.tx
        .select({
          id: s.regraRegulatoria.id,
          chave: s.regraRegulatoria.chave,
          abrangencia: s.regraRegulatoria.abrangencia,
          abrangenciaCodigo: s.regraRegulatoria.abrangenciaCodigo,
          minimo: s.regraRegulatoria.minimo,
          maximo: s.regraRegulatoria.maximo,
          unidade: s.regraRegulatoria.unidade,
          descricao: s.regraRegulatoria.descricao,
          fonteNorma: s.regraRegulatoria.fonteNorma,
          fonteArtigo: s.regraRegulatoria.fonteArtigo,
          vigenteDesde: s.regraRegulatoria.vigenteDesde,
        })
        .from(s.regraRegulatoria)
        .where(
          and(
            sql`${s.regraRegulatoria.vigenteDesde} <= current_date`,
            sql`(${s.regraRegulatoria.vigenteAte} is null or ${s.regraRegulatoria.vigenteAte} >= current_date)`,
          ),
        )
        .orderBy(asc(s.regraRegulatoria.chave), asc(s.regraRegulatoria.abrangencia)),
    ),
  )
}
