// Administração da plataforma: clientes (administracao.md, Fluxo: criar um novo cliente).
import {
  consultaListagem,
  email as esquemaEmail,
  fimDoCiclo,
  NOMES_PERIODICIDADE,
  FORMATOS_CODIGO_PADRAO,
  novaEmpresa,
  SITUACOES_EMPRESA,
  diaVencimentoPadrao,
} from '@vinicycle/shared';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import type { Tx } from '../db/cliente';
import * as s from '../db/schema';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { buscaTexto, listar } from '../nucleo/listagem';
import { naPlataforma } from '../nucleo/requisicao';
import { criarConvite, reenviarConvite } from './convites';
import { criarFicha, lerFicha, resumoFicha } from './fichas';
import { gerarFaturaDoCiclo } from './cobranca';
import { hoje, precoDoPlano } from './planos';

/** Cada empresa recebe uma cópia dos perfis-modelo ao ser criada (P27). */
export async function copiarPerfisModelo(
  tx: Tx,
  empresaId: string,
  usuarioId: string | null,
): Promise<Map<string, string>> {
  const modelos = await tx
    .select()
    .from(s.perfil)
    .where(and(eq(s.perfil.escopo, 'modelo'), eq(s.perfil.ativo, true)));
  const copias = new Map<string, string>();
  for (const m of modelos) {
    const [p] = await tx
      .insert(s.perfil)
      .values({
        escopo: 'empresa',
        empresaId,
        codigo: m.codigo,
        nome: m.nome,
        descricao: m.descricao,
        modeloOrigemId: m.id,
        eMaster: m.eMaster,
        criadoPor: usuarioId,
        atualizadoPor: usuarioId,
      })
      .returning({ id: s.perfil.id });
    copias.set(m.codigo ?? m.id, p!.id);
    const grade = await tx
      .select({
        funcionalidadeId: s.perfilPermissao.funcionalidadeId,
        acao: s.perfilPermissao.acao,
      })
      .from(s.perfilPermissao)
      .where(eq(s.perfilPermissao.perfilId, m.id));
    if (grade.length) {
      await tx
        .insert(s.perfilPermissao)
        .values(grade.map((g) => ({ ...g, perfilId: p!.id, empresaId })));
    }
  }
  return copias;
}

const situacaoEmpresa = z.object({
  situacao: z.enum(SITUACOES_EMPRESA),
  motivo: z.string().trim().min(3, 'Informe o motivo').max(500),
});

export async function rotasPlataforma(app: FastifyInstance): Promise<void> {
  const { db, config } = app.deps;

  app.get('/api/plataforma/empresas', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'visualizar'], async ({ tx }) => {
      const consulta = consultaListagem
        .extend({ situacao: z.enum(SITUACOES_EMPRESA).optional() })
        .parse(req.query);
      const filtro = and(
        buscaTexto(consulta.busca, [s.ficha.nome, s.ficha.nomeFantasia, s.ficha.documento]),
        consulta.situacao ? eq(s.empresa.situacao, consulta.situacao) : undefined,
      );
      const usuarios = tx
        .select({ empresaId: s.vinculo.empresaId, total: count().as('total') })
        .from(s.vinculo)
        .where(eq(s.vinculo.ativo, true))
        .groupBy(s.vinculo.empresaId)
        .as('usuarios');
      return listar({
        consulta,
        ordenaveis: {
          nome: s.ficha.nome,
          documento: s.ficha.documento,
          situacao: s.empresa.situacao,
          criadoEm: s.empresa.criadoEm,
        },
        ordemPadrao: { campo: 'nome', direcao: 'asc' },
        contar: async () =>
          (
            await tx
              .select({ n: count() })
              .from(s.empresa)
              .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
              .where(filtro)
          )[0]!.n,
        buscar: ({ ordem, limite, deslocamento }) =>
          tx
            .select({
              id: s.empresa.id,
              nome: s.ficha.nome,
              nomeFantasia: s.ficha.nomeFantasia,
              documento: s.ficha.documento,
              tipoPessoa: s.ficha.tipoPessoa,
              situacao: s.empresa.situacao,
              criadoEm: s.empresa.criadoEm,
              usuarios: sql<number>`coalesce(${usuarios.total}, 0)::int`,
            })
            .from(s.empresa)
            .innerJoin(s.ficha, eq(s.ficha.id, s.empresa.fichaId))
            .leftJoin(usuarios, eq(usuarios.empresaId, s.empresa.id))
            .where(filtro)
            .orderBy(...ordem)
            .limit(limite)
            .offset(deslocamento),
      });
    }),
  );

  app.post('/api/plataforma/empresas', async (req) =>
    naPlataforma(
      db,
      req,
      ['plataforma.clientes', 'criar'],
      async ({ tx, usuarioId, origem, auditar }) => {
        const d = novaEmpresa.parse(req.body);
        const [plano] = await tx
          .select()
          .from(s.plano)
          .where(and(eq(s.plano.id, d.planoId), eq(s.plano.ativo, true)));
        if (!plano) throw new ErroRegra('Plano inválido.', 'plano');
        const [cfg] = await tx.select().from(s.configPlataforma);
        const empresaId = uuidv7();
        const fichaId = await criarFicha(tx, d.ficha, 'empresa', empresaId, usuarioId);
        const situacao = d.emTeste ? 'teste' : 'ativo';
        await tx.insert(s.empresa).values({
          id: empresaId,
          fichaId,
          situacao,
          corMarca: d.corMarca ?? null,
          contatoFinanceiroNome: d.contatoFinanceiroNome ?? null,
          contatoFinanceiroEmail: d.contatoFinanceiroEmail ?? null,
          contatoFinanceiroTelefone: d.contatoFinanceiroTelefone ?? null,
          regimeTributario: d.regimeTributario ?? null,
          criadoPor: usuarioId,
          atualizadoPor: usuarioId,
        });
        await tx
          .insert(s.empresaSituacao)
          .values({ empresaId, situacao, origem: 'criacao', criadoPor: usuarioId });
        const fimTeste = d.emTeste
          ? new Date(
              new Date(`${d.inicio}T00:00:00Z`).getTime() + (cfg?.testeDias ?? 7) * 86400_000,
            )
              .toISOString()
              .slice(0, 10)
          : null;
        // Preço congelado na contratação (P25); no teste, é o preço do dia, revisto ao contratar.
        const valor = await precoDoPlano(tx, plano.id, d.periodicidade, d.inicio);
        if (valor === null) {
          throw new ErroRegra(
            `O plano ${plano.nome} não tem preço no ciclo ${NOMES_PERIODICIDADE[d.periodicidade].toLowerCase()}.`,
            'periodicidade',
          );
        }
        if (d.formaPagamento && !plano.formasPagamento.includes(d.formaPagamento)) {
          throw new ErroRegra('O plano não aceita essa forma de pagamento.', 'formaPagamento');
        }
        const dia = Number(d.inicio.slice(8, 10));
        const [assinatura] = await tx
          .insert(s.assinatura)
          .values({
            empresaId,
            planoId: plano.id,
            periodicidade: d.periodicidade,
            inicio: d.inicio,
            emTeste: d.emTeste,
            fimTeste,
            situacao: 'vigente',
            valorContratado: valor,
            cicloInicio: d.emTeste ? null : d.inicio,
            cicloFim: d.emTeste ? null : fimDoCiclo(d.inicio, d.periodicidade),
            diaBase: dia,
            diaVencimento: d.diaVencimento ?? diaVencimentoPadrao(d.inicio),
            formaPagamento: d.formaPagamento ?? null,
            criadoPor: usuarioId,
            atualizadoPor: usuarioId,
          })
          .returning();
        const perfis = await copiarPerfisModelo(tx, empresaId, usuarioId);
        await tx.insert(s.formatoCodigo).values(
          Object.entries(FORMATOS_CODIGO_PADRAO).map(([tipo, mascara]) => ({
            empresaId,
            tipo,
            mascara,
            criadoPor: usuarioId,
            atualizadoPor: usuarioId,
          })),
        );
        // Fora do teste, a fatura do primeiro ciclo sai na hora.
        if (!d.emTeste) {
          await gerarFaturaDoCiclo(tx, assinatura!, d.inicio, hoje(), usuarioId);
        }
        await auditar({
          acao: 'criar',
          entidade: 'empresa',
          registroId: empresaId,
          empresaId,
          depois: {
            ...resumoFicha(d.ficha),
            situacao,
            planoId: plano.id,
            emTeste: d.emTeste,
            emailMaster: d.emailMaster,
          },
        });
        await criarConvite(
          tx,
          { ...origem, empresaId },
          {
            empresaId,
            email: d.emailMaster,
            perfilId: perfis.get('MASTER')!,
            estabelecimentos: [],
            urlAplicacao: config.URL_APLICACAO,
          },
        );
        return { id: empresaId };
      },
    ),
  );

  app.get<{ Params: { id: string } }>('/api/plataforma/empresas/:id', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'visualizar'], async ({ tx }) => {
      const id = z.uuid().parse(req.params.id);
      const [e] = await tx.select().from(s.empresa).where(eq(s.empresa.id, id));
      if (!e) throw new ErroNaoEncontrado('Cliente não encontrado.');
      const [assinatura] = await tx
        .select({
          plano: s.plano.nome,
          periodicidade: s.assinatura.periodicidade,
          inicio: s.assinatura.inicio,
          emTeste: s.assinatura.emTeste,
          fimTeste: s.assinatura.fimTeste,
        })
        .from(s.assinatura)
        .innerJoin(s.plano, eq(s.plano.id, s.assinatura.planoId))
        .where(and(eq(s.assinatura.empresaId, id), eq(s.assinatura.situacao, 'vigente')));
      const usuarios = await tx
        .select({
          vinculoId: s.vinculo.id,
          usuarioId: s.vinculo.usuarioId,
          email: s.usuario.email,
          nome: s.ficha.nome,
          perfil: s.perfil.nome,
          eMaster: s.vinculo.eMaster,
          ativo: s.vinculo.ativo,
        })
        .from(s.vinculo)
        .innerJoin(s.usuario, eq(s.usuario.id, s.vinculo.usuarioId))
        .innerJoin(s.ficha, eq(s.ficha.id, s.usuario.fichaId))
        .innerJoin(s.perfil, eq(s.perfil.id, s.vinculo.perfilId))
        .where(eq(s.vinculo.empresaId, id))
        .orderBy(s.ficha.nome);
      const convites = await tx
        .select({
          id: s.convite.id,
          email: s.convite.email,
          perfil: s.perfil.nome,
          eMaster: s.perfil.eMaster,
          situacao: s.convite.situacao,
          expiraEm: s.convite.expiraEm,
          enviadoEm: s.convite.enviadoEm,
        })
        .from(s.convite)
        .innerJoin(s.perfil, eq(s.perfil.id, s.convite.perfilId))
        .where(
          and(eq(s.convite.empresaId, id), inArray(s.convite.situacao, ['pendente', 'expirado'])),
        )
        .orderBy(s.convite.enviadoEm);
      const estabelecimentos = await tx
        .select({
          id: s.estabelecimento.id,
          nome: s.ficha.nome,
          documento: s.ficha.documento,
          ativo: s.estabelecimento.ativo,
        })
        .from(s.estabelecimento)
        .innerJoin(s.ficha, eq(s.ficha.id, s.estabelecimento.fichaId))
        .where(eq(s.estabelecimento.empresaId, id))
        .orderBy(s.ficha.nome);
      const historico = await tx
        .select()
        .from(s.empresaSituacao)
        .where(eq(s.empresaSituacao.empresaId, id))
        .orderBy(s.empresaSituacao.desde);
      return {
        id: e.id,
        situacao: e.situacao,
        criadoEm: e.criadoEm,
        ficha: await lerFicha(tx, e.fichaId),
        assinatura: assinatura ?? null,
        usuarios,
        convites: convites.map((c) => ({
          ...c,
          situacao:
            c.situacao === 'pendente' && c.expiraEm.getTime() < Date.now()
              ? 'expirado'
              : c.situacao,
        })),
        estabelecimentos,
        historico,
      };
    }),
  );

  // Reenvia o convite do Master; sem Master ativo, permite trocar o e-mail convidado.
  app.post<{ Params: { id: string } }>('/api/plataforma/empresas/:id/convite-master', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'editar'], async ({ tx, origem }) => {
      const id = z.uuid().parse(req.params.id);
      const { email } = z.object({ email: esquemaEmail.optional() }).parse(req.body ?? {});
      const [master] = await tx
        .select({ id: s.vinculo.id })
        .from(s.vinculo)
        .where(
          and(eq(s.vinculo.empresaId, id), eq(s.vinculo.eMaster, true), eq(s.vinculo.ativo, true)),
        );
      if (master) {
        throw new ErroRegra(
          'A empresa já tem um Master. A troca é feita pela passagem de bastão.',
          'master_existente',
        );
      }
      const [perfilMaster] = await tx
        .select({ id: s.perfil.id })
        .from(s.perfil)
        .where(and(eq(s.perfil.empresaId, id), eq(s.perfil.eMaster, true)));
      const [pendente] = await tx
        .select({ id: s.convite.id, email: s.convite.email })
        .from(s.convite)
        .where(
          and(
            eq(s.convite.empresaId, id),
            eq(s.convite.perfilId, perfilMaster!.id),
            inArray(s.convite.situacao, ['pendente', 'expirado']),
            isNull(s.convite.aceitoEm),
          ),
        );
      const o = { ...origem, empresaId: id };
      if (pendente && (!email || email === pendente.email)) {
        await reenviarConvite(tx, o, pendente.id, config.URL_APLICACAO);
      } else {
        if (!email) throw new ErroRegra('Informe o e-mail do Master.', 'email');
        await criarConvite(tx, o, {
          empresaId: id,
          email,
          perfilId: perfilMaster!.id,
          estabelecimentos: [],
          urlAplicacao: config.URL_APLICACAO,
        });
      }
      return { ok: true };
    }),
  );

  // Situação do cliente, com motivo (administracao.md, Inadimplência e bloqueio).
  app.post<{ Params: { id: string } }>('/api/plataforma/empresas/:id/situacao', async (req) =>
    naPlataforma(db, req, ['plataforma.clientes', 'editar'], async ({ tx, usuarioId, auditar }) => {
      const id = z.uuid().parse(req.params.id);
      const d = situacaoEmpresa.parse(req.body);
      const [e] = await tx
        .select({ situacao: s.empresa.situacao })
        .from(s.empresa)
        .where(eq(s.empresa.id, id));
      if (!e) throw new ErroNaoEncontrado('Cliente não encontrado.');
      if (e.situacao === d.situacao) return { ok: true };
      await tx
        .update(s.empresa)
        .set({
          situacao: d.situacao,
          atualizadoEm: sql`now()`,
          atualizadoPor: usuarioId,
          versao: sql`${s.empresa.versao} + 1`,
        })
        .where(eq(s.empresa.id, id));
      await tx.insert(s.empresaSituacao).values({
        empresaId: id,
        situacao: d.situacao,
        motivo: d.motivo,
        origem: 'manual',
        criadoPor: usuarioId,
      });
      await auditar({
        acao: 'situacao',
        entidade: 'empresa',
        registroId: id,
        empresaId: id,
        antes: { situacao: e.situacao },
        depois: { situacao: d.situacao },
        motivo: d.motivo,
      });
      return { ok: true };
    }),
  );
}
