// Gestão › Documentos › Autocontrole (gestao.md, Autocontrole; 04, roteiro do ciclo 8; Decreto
// 12.709/2025, arts. 117 a 120): o programa de controles do estabelecimento, totalmente configurável
// (P29), e as evidências. O modelo da norma cria o programa inicial. A higienização de recipientes e
// as leituras de temperatura são evidência automática, lida das operações e análises (o estorno da
// operação tira a evidência). Controle atrasado gera alerta (alertas.ts).
import {
  esquemaControle,
  esquemaEvidencia,
  MODELO_AUTOCONTROLE,
  type UnidadePeriodicidade,
} from '@vinicycle/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as s from '../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';

const F = 'gestao.autocontrole';
const P = 'gestao.autocontrole_programa';

/** Data (AAAA-MM-DD) somada à periodicidade, no calendário. */
export function somarPeriodo(data: string, quantidade: number, unidade: UnidadePeriodicidade) {
  const [a, m, d] = data.split('-').map(Number) as [number, number, number];
  const x = new Date(Date.UTC(a, m - 1, d));
  if (unidade === 'dia') x.setUTCDate(x.getUTCDate() + quantidade);
  else if (unidade === 'semana') x.setUTCDate(x.getUTCDate() + 7 * quantidade);
  else {
    const meses = unidade === 'mes' ? quantidade : 12 * quantidade;
    // Último dia do mês quando o dia não existe (31/01 + 1 mês = 28 ou 29/02).
    const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
    const ultimo = new Date(
      Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
    ).getUTCDate();
    alvo.setUTCDate(Math.min(d, ultimo));
    return alvo.toISOString().slice(0, 10);
  }
  return x.toISOString().slice(0, 10);
}

/** Dias até o prazo em que o controle passa a "vence logo". */
const VENCE_LOGO_DIAS = 7;

export interface SituacaoControle {
  id: string;
  estabelecimentoId: string;
  nome: string;
  descricao: string | null;
  codigoModelo: string | null;
  periodicidadeQuantidade: number | null;
  periodicidadeUnidade: UnidadePeriodicidade | null;
  evidenciaAutomatica: 'higienizacao' | 'temperatura' | null;
  responsavelId: string | null;
  responsavel: string | null;
  ativo: boolean;
  inicio: string;
  ultima: string | null;
  proxima: string | null;
  situacao: 'sob_demanda' | 'em_dia' | 'vence_logo' | 'atrasado' | 'inativo';
}

/** Controles com a última evidência (manual ou automática), o próximo prazo e a situação. */
export async function situacaoControles(
  ctx: ContextoEmpresa,
  filtro: { estabelecimentoId?: string; id?: string; ativos?: boolean } = {},
): Promise<SituacaoControle[]> {
  const r = await ctx.tx.execute<{
    id: string;
    estabelecimento_id: string;
    nome: string;
    descricao: string | null;
    codigo_modelo: string | null;
    periodicidade_quantidade: number | null;
    periodicidade_unidade: UnidadePeriodicidade | null;
    evidencia_automatica: 'higienizacao' | 'temperatura' | null;
    responsavel_id: string | null;
    responsavel: string | null;
    ativo: boolean;
    inicio: string;
    hoje: string;
    manual: string | null;
    automatica: string | null;
  }>(sql`
    select c.id, c.estabelecimento_id, c.nome, c.descricao, c.codigo_modelo, c.periodicidade_quantidade,
      c.periodicidade_unidade, c.evidencia_automatica, c.responsavel_id, c.ativo, c.inicio::text as inicio,
      (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = c.responsavel_id) as responsavel,
      (now() at time zone e.fuso)::date::text as hoje,
      (select max(v.realizada_em)::text from autocontrole_evidencia v
        where v.controle_id = c.id and v.anulada_em is null) as manual,
      case c.evidencia_automatica
        when 'higienizacao' then (select (max(o.executado_em) at time zone e.fuso)::date::text
          from operacao o where o.estabelecimento_id = c.estabelecimento_id and o.situacao = 'confirmada'
            and exists (select 1 from operacao_higienizacao h where h.operacao_id = o.id and h.tipo = 'higienizacao'))
        when 'temperatura' then (select (max(a.amostra_em) at time zone e.fuso)::date::text
          from analise a join analise_resultado ar on ar.analise_id = a.id
            join parametro_analise p on p.id = ar.parametro_id
          where a.estabelecimento_id = c.estabelecimento_id and p.codigo = 'temperatura')
      end as automatica
    from autocontrole_controle c join estabelecimento e on e.id = c.estabelecimento_id
    where c.empresa_id = ${ctx.empresaId}
      ${filtro.estabelecimentoId ? sql`and c.estabelecimento_id = ${filtro.estabelecimentoId}` : sql``}
      ${filtro.id ? sql`and c.id = ${filtro.id}` : sql``}
      ${filtro.ativos ? sql`and c.ativo` : sql``}
    order by c.ativo desc, c.nome`);
  return r.rows.map((c) => {
    const ultima = [c.manual, c.automatica].filter(Boolean).sort().at(-1) ?? null;
    const q = c.periodicidade_quantidade;
    const u = c.periodicidade_unidade;
    const proxima = q && u ? somarPeriodo(ultima ?? c.inicio, q, u) : null;
    const situacao: SituacaoControle['situacao'] = !c.ativo
      ? 'inativo'
      : !proxima
        ? 'sob_demanda'
        : proxima < c.hoje
          ? 'atrasado'
          : proxima <= somarPeriodo(c.hoje, VENCE_LOGO_DIAS, 'dia')
            ? 'vence_logo'
            : 'em_dia';
    return {
      id: c.id,
      estabelecimentoId: c.estabelecimento_id,
      nome: c.nome,
      descricao: c.descricao,
      codigoModelo: c.codigo_modelo,
      periodicidadeQuantidade: q,
      periodicidadeUnidade: u,
      evidenciaAutomatica: c.evidencia_automatica,
      responsavelId: c.responsavel_id,
      responsavel: c.responsavel,
      ativo: c.ativo,
      inicio: c.inicio,
      ultima,
      proxima,
      situacao,
    };
  });
}

async function hojeNoEstabelecimento(ctx: ContextoEmpresa, estab: string) {
  const [r] = (
    await ctx.tx.execute<{ hoje: string }>(
      sql`select (now() at time zone fuso)::date::text as hoje from estabelecimento where id = ${estab}`,
    )
  ).rows;
  return r!.hoje;
}

async function carregar(ctx: ContextoEmpresa, id: string) {
  const [c] = await ctx.tx
    .select()
    .from(s.autocontroleControle)
    .where(
      and(eq(s.autocontroleControle.id, id), eq(s.autocontroleControle.empresaId, ctx.empresaId)),
    )
    .for('update');
  if (!c || c.estabelecimentoId !== ctx.exigirEstabelecimento())
    throw new ErroNaoEncontrado('Controle não encontrado.');
  return c;
}

async function conferirResponsavel(ctx: ContextoEmpresa, id: string | null | undefined) {
  if (!id) return;
  const [v] = await ctx.tx
    .select({ id: s.vinculo.id })
    .from(s.vinculo)
    .where(
      and(
        eq(s.vinculo.usuarioId, id),
        eq(s.vinculo.empresaId, ctx.empresaId),
        eq(s.vinculo.ativo, true),
      ),
    );
  if (!v)
    throw new ErroRegra('O responsável precisa ser um usuário ativo da empresa.', 'responsavel');
}

export async function rotasAutocontrole(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.get('/api/autocontrole', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const controles = await situacaoControles(ctx, { estabelecimentoId: estab });
      return {
        controles,
        modelo: MODELO_AUTOCONTROLE.filter(
          (m) => !controles.some((c) => c.codigoModelo === m.codigo),
        ),
      };
    }),
  );

  /** Usuários ativos da empresa, para escolher o responsável. */
  app.get('/api/autocontrole/responsaveis', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) =>
      ctx.tx
        .select({ id: s.usuario.id, nome: s.ficha.nome })
        .from(s.vinculo)
        .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
        .where(and(eq(s.vinculo.empresaId, ctx.empresaId), eq(s.vinculo.ativo, true)))
        .orderBy(asc(s.ficha.nome)),
    ),
  );

  /** Inclui os controles do modelo da norma que ainda não estão no programa (todos ou os escolhidos). */
  app.post('/api/autocontrole/modelo', async (req) =>
    naEmpresa(db, req, [P, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const { codigos } = z
        .object({ codigos: z.array(z.string().max(40)).max(50).optional() })
        .parse(req.body ?? {});
      const existentes = await ctx.tx
        .select({ codigo: s.autocontroleControle.codigoModelo })
        .from(s.autocontroleControle)
        .where(eq(s.autocontroleControle.estabelecimentoId, estab));
      const novos = MODELO_AUTOCONTROLE.filter(
        (m) =>
          (!codigos || codigos.includes(m.codigo)) &&
          !existentes.some((e) => e.codigo === m.codigo),
      );
      if (!novos.length) return { incluidos: 0 };
      const inicio = await hojeNoEstabelecimento(ctx, estab);
      await ctx.tx.insert(s.autocontroleControle).values(
        novos.map((m) => ({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          codigoModelo: m.codigo,
          nome: m.nome,
          descricao: m.descricao,
          periodicidadeQuantidade: m.periodicidade?.quantidade ?? null,
          periodicidadeUnidade: m.periodicidade?.unidade ?? null,
          evidenciaAutomatica: m.evidenciaAutomatica,
          inicio,
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })),
      );
      await ctx.auditar({
        acao: 'criar',
        entidade: 'autocontrole_controle',
        registroId: null,
        dados: { modelo: novos.map((m) => m.codigo) },
      });
      return { incluidos: novos.length };
    }),
  );

  app.post('/api/autocontrole', async (req) =>
    naEmpresa(db, req, [P, 'criar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const d = esquemaControle.parse(req.body);
      await conferirResponsavel(ctx, d.responsavelId);
      const [c] = await ctx.tx
        .insert(s.autocontroleControle)
        .values({
          empresaId: ctx.empresaId,
          estabelecimentoId: estab,
          nome: d.nome,
          descricao: d.descricao ?? null,
          periodicidadeQuantidade: d.periodicidadeQuantidade,
          periodicidadeUnidade: d.periodicidadeUnidade,
          responsavelId: d.responsavelId ?? null,
          evidenciaAutomatica: d.evidenciaAutomatica ?? null,
          inicio: await hojeNoEstabelecimento(ctx, estab),
          criadoPor: ctx.usuarioId,
          atualizadoPor: ctx.usuarioId,
        })
        .returning({ id: s.autocontroleControle.id });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'autocontrole_controle',
        registroId: c!.id,
        dados: d,
      });
      return { id: c!.id };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/autocontrole/:id', async (req) =>
    naEmpresa(db, req, [P, 'editar'], async (ctx) => {
      const c = await carregar(ctx, z.uuid().parse(req.params.id));
      const d = esquemaControle.parse(req.body);
      await conferirResponsavel(ctx, d.responsavelId);
      const novo = {
        nome: d.nome,
        descricao: d.descricao ?? null,
        periodicidadeQuantidade: d.periodicidadeQuantidade,
        periodicidadeUnidade: d.periodicidadeUnidade,
        responsavelId: d.responsavelId ?? null,
        evidenciaAutomatica: d.evidenciaAutomatica ?? null,
      };
      await ctx.tx
        .update(s.autocontroleControle)
        .set({ ...novo, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
        .where(eq(s.autocontroleControle.id, c.id));
      await ctx.auditar({
        acao: 'editar',
        entidade: 'autocontrole_controle',
        registroId: c.id,
        dados: {
          antes: {
            nome: c.nome,
            descricao: c.descricao,
            periodicidadeQuantidade: c.periodicidadeQuantidade,
            periodicidadeUnidade: c.periodicidadeUnidade,
            responsavelId: c.responsavelId,
            evidenciaAutomatica: c.evidenciaAutomatica,
          },
          depois: novo,
        },
      });
      return { ok: true };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/autocontrole/:id/inativar', async (req) =>
    naEmpresa(db, req, [P, 'inativar'], async (ctx) => {
      const c = await carregar(ctx, z.uuid().parse(req.params.id));
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body);
      if (!c.ativo) throw new ErroRegra('O controle já está inativo.', 'inativo');
      await ctx.tx
        .update(s.autocontroleControle)
        .set({
          ativo: false,
          inativadoEm: new Date(),
          inativadoPor: ctx.usuarioId,
          motivoInativacao: motivo,
        })
        .where(eq(s.autocontroleControle.id, c.id));
      await ctx.auditar({
        acao: 'inativar',
        entidade: 'autocontrole_controle',
        registroId: c.id,
        dados: { motivo },
      });
      return { ok: true };
    }),
  );

  /** Reativar: o primeiro prazo volta a contar de hoje (ou da última evidência, se houver). */
  app.post<{ Params: { id: string } }>('/api/autocontrole/:id/reativar', async (req) =>
    naEmpresa(db, req, [P, 'inativar'], async (ctx) => {
      const c = await carregar(ctx, z.uuid().parse(req.params.id));
      if (c.ativo) throw new ErroRegra('O controle já está ativo.', 'ativo');
      await ctx.tx
        .update(s.autocontroleControle)
        .set({
          ativo: true,
          inativadoEm: null,
          inativadoPor: null,
          motivoInativacao: null,
          inicio: await hojeNoEstabelecimento(ctx, c.estabelecimentoId),
        })
        .where(eq(s.autocontroleControle.id, c.id));
      await ctx.auditar({
        acao: 'reativar',
        entidade: 'autocontrole_controle',
        registroId: c.id,
        dados: {},
      });
      return { ok: true };
    }),
  );

  /** Ficha do controle: situação e evidências (manuais e automáticas, as mais recentes primeiro). */
  app.get<{ Params: { id: string } }>('/api/autocontrole/:id', async (req) =>
    naEmpresa(db, req, [F, 'visualizar'], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const id = z.uuid().parse(req.params.id);
      const [c] = await situacaoControles(ctx, { estabelecimentoId: estab, id });
      if (!c) throw new ErroNaoEncontrado('Controle não encontrado.');
      const manuais = await ctx.tx.execute<{
        id: string;
        realizada_em: string;
        descricao: string;
        por: string | null;
        criado_em: string;
        anulada_em: string | null;
        motivo_anulacao: string | null;
      }>(sql`
        select v.id, v.realizada_em::text as realizada_em, v.descricao, v.criado_em::text as criado_em,
          v.anulada_em::text as anulada_em, v.motivo_anulacao,
          (select f.nome from usuario u join ficha f on f.id = u.ficha_id where u.id = v.criado_por) as por
        from autocontrole_evidencia v where v.controle_id = ${id}
        order by v.realizada_em desc, v.criado_em desc limit 200`);
      const automaticas =
        c.evidenciaAutomatica === 'higienizacao'
          ? await ctx.tx.execute<{ data: string; descricao: string; link: string }>(sql`
              select (o.executado_em at time zone e.fuso)::date::text as data,
                'Higienização ' || coalesce(o.codigo, '') || ': ' || string_agg(r.codigo, ', ' order by r.codigo) as descricao,
                '/enotrace/operacoes/' || o.id as link
              from operacao o join estabelecimento e on e.id = o.estabelecimento_id
                join operacao_higienizacao h on h.operacao_id = o.id and h.tipo = 'higienizacao'
                join recipiente r on r.id = h.recipiente_id
              where o.estabelecimento_id = ${estab} and o.situacao = 'confirmada'
              group by o.id, o.codigo, o.executado_em, e.fuso
              order by o.executado_em desc limit 50`)
          : c.evidenciaAutomatica === 'temperatura'
            ? await ctx.tx.execute<{ data: string; descricao: string; link: string }>(sql`
                select (a.amostra_em at time zone e.fuso)::date::text as data,
                  'Temperatura de ' || coalesce(r.codigo, l.codigo) || ': ' || replace(trim(trailing '.' from trim(trailing '0' from ar.valor::text)), '.', ',') || ' °C' as descricao,
                  '/enotrace/lotes/' || l.id as link
                from analise a join estabelecimento e on e.id = a.estabelecimento_id
                  join analise_resultado ar on ar.analise_id = a.id
                  join parametro_analise p on p.id = ar.parametro_id and p.codigo = 'temperatura'
                  join lote l on l.id = a.lote_id left join recipiente r on r.id = a.recipiente_id
                where a.estabelecimento_id = ${estab}
                order by a.amostra_em desc limit 50`)
            : { rows: [] };
      return {
        ...c,
        evidencias: manuais.rows.map((v) => ({
          id: v.id,
          realizadaEm: v.realizada_em,
          descricao: v.descricao,
          por: v.por,
          criadoEm: v.criado_em,
          anuladaEm: v.anulada_em,
          motivoAnulacao: v.motivo_anulacao,
        })),
        automaticas: automaticas.rows,
      };
    }),
  );

  app.post<{ Params: { id: string } }>('/api/autocontrole/:id/evidencias', async (req) =>
    naEmpresa(db, req, [F, 'criar'], async (ctx) => {
      const c = await carregar(ctx, z.uuid().parse(req.params.id));
      if (!c.ativo) throw new ErroRegra('O controle está inativo.', 'inativo');
      const d = esquemaEvidencia.parse(req.body);
      if (d.realizadaEm > (await hojeNoEstabelecimento(ctx, c.estabelecimentoId)))
        throw new ErroRegra('A data não pode ser futura.', 'data');
      const [v] = await ctx.tx
        .insert(s.autocontroleEvidencia)
        .values({
          empresaId: ctx.empresaId,
          controleId: c.id,
          realizadaEm: d.realizadaEm,
          descricao: d.descricao,
          criadoPor: ctx.usuarioId,
        })
        .returning({ id: s.autocontroleEvidencia.id });
      await ctx.auditar({
        acao: 'criar',
        entidade: 'autocontrole_evidencia',
        registroId: v!.id,
        dados: { controle: c.nome, ...d },
      });
      return { id: v!.id };
    }),
  );

  /** Evidência lançada por engano: anulada com motivo, nunca apagada (P13). */
  app.post<{ Params: { id: string; evidenciaId: string } }>(
    '/api/autocontrole/:id/evidencias/:evidenciaId/anular',
    async (req) =>
      naEmpresa(db, req, [F, 'estornar'], async (ctx) => {
        const c = await carregar(ctx, z.uuid().parse(req.params.id));
        const { motivo } = z
          .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
          .parse(req.body);
        const r = await ctx.tx
          .update(s.autocontroleEvidencia)
          .set({ anuladaEm: new Date(), anuladaPor: ctx.usuarioId, motivoAnulacao: motivo })
          .where(
            and(
              eq(s.autocontroleEvidencia.id, z.uuid().parse(req.params.evidenciaId)),
              eq(s.autocontroleEvidencia.controleId, c.id),
              sql`${s.autocontroleEvidencia.anuladaEm} is null`,
            ),
          )
          .returning({ id: s.autocontroleEvidencia.id });
        if (!r.length) throw new ErroNaoEncontrado('Evidência não encontrada ou já anulada.');
        await ctx.auditar({
          acao: 'anular',
          entidade: 'autocontrole_evidencia',
          registroId: r[0]!.id,
          dados: { motivo },
        });
        return { ok: true };
      }),
  );
}
