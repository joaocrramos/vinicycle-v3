// Carga do saldo de abertura (cantina.md, Carga inicial; P23; 03-modelo-de-dados.md, 3): planilha
// CSV validada linha a linha antes de gravar, tudo ou nada. Granel: uma operação "abertura de saldo"
// com um lote por projeto e grupo, e a composição informada. Garrafas: lote comercial e entrada de
// produto acabado. Insumos e embalagens: entrada com lote e validade. Tudo marcado "carga inicial"
// e ligado à importação, que se estorna enquanto não houver movimento posterior.
import {
  type Composicao,
  dataBr,
  deCentilitros,
  lerCsv,
  normalizar,
  normalizarNome,
  numeroBr,
  paraCentilitros,
  simNao,
} from '@vinicycle/shared';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import * as s from '../db/schema';
import { chaveAnexo } from '../nucleo/armazenamento';
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros';
import { proximoCodigo } from '../nucleo/numeracao';
import { pode } from '../nucleo/permissoes';
import { type ContextoEmpresa, naEmpresa } from '../nucleo/requisicao';
import { lancarEstoque, type MovimentoNovo, obterLote } from './estoque';
import {
  confirmar,
  estornar,
  type Lancamento,
  type LinhaOperacao,
  type LoteNovo,
  preparar,
} from './producao/motor';

type Tipo = (typeof s.TIPOS_IMPORTACAO)[number];

const PERMISSAO: Record<Tipo, readonly [string, 'criar' | 'importar']> = {
  saldo_granel: ['enotrace.operacoes', 'criar'],
  saldo_garrafas: ['enotrace.estoque', 'importar'],
  saldo_itens: ['enotrace.estoque', 'importar'],
};

/** Modelos para baixar: cabeçalho e linhas de exemplo (P23). */
export const MODELOS: Record<Tipo, { nome: string; colunas: string[]; exemplo: string[][] }> = {
  saldo_granel: {
    nome: 'saldo-granel',
    colunas: [
      'recipiente',
      'projeto',
      'lote',
      'litros',
      'variedade',
      'safra',
      'percentual',
      'organica',
    ],
    exemplo: [
      ['T01', 'Tinto 2025', 'A', '3500,00', 'Syrah', '2025', '70', 'não'],
      ['T01', 'Tinto 2025', 'A', '', 'Tempranillo', '2025', '30', 'não'],
      ['B01', 'Tinto 2025', 'A', '225,00', 'Syrah', '2025', '100', 'não'],
    ],
  },
  saldo_garrafas: {
    nome: 'saldo-garrafas',
    colunas: ['produto', 'formato_ml', 'lote_comercial', 'local', 'quantidade', 'data_envase'],
    exemplo: [['Syrah Reserva', '750', 'L25-0012', 'Expedição', '480', '15/09/2025']],
  },
  saldo_itens: {
    nome: 'saldo-insumos-embalagens',
    colunas: ['item', 'local', 'lote', 'validade', 'quantidade'],
    exemplo: [
      ['Levedura EC1118', 'Almoxarifado', 'L2025A', '31/12/2027', '500'],
      ['Garrafa bordalesa 750 mL', 'Almoxarifado', '', '', '1200'],
    ],
  },
};

interface Erro {
  linha: number;
  mensagem: string;
}

/** Linhas da planilha como objetos pelo cabeçalho (sem acento e minúsculo). */
function linhasDaPlanilha(texto: string, tipo: Tipo) {
  const tabela = lerCsv(texto);
  if (!tabela.length) throw new ErroRegra('A planilha está vazia.', 'planilha');
  const cab = tabela[0]!.map((c) => normalizarNome(c).replace(/ /g, '_'));
  const faltam = MODELOS[tipo].colunas.filter((c) => !cab.includes(c));
  if (faltam.length)
    throw new ErroRegra(
      `Faltam colunas na planilha: ${faltam.join(', ')}. Use o modelo para baixar.`,
      'planilha',
    );
  return tabela.slice(1).map((l, n) => ({
    linha: n + 2,
    v: Object.fromEntries(cab.map((c, i) => [c, l[i] ?? ''])) as Record<string, string>,
  }));
}

async function locaisDeEstoque(ctx: ContextoEmpresa, estab: string) {
  const l = await ctx.tx
    .select({ id: s.local.id, nome: s.local.nome })
    .from(s.local)
    .where(
      and(
        eq(s.local.estabelecimentoId, estab),
        inArray(s.local.uso, ['estoque', 'ambos']),
        eq(s.local.moduloEstoque, 'ENOTRACE'),
        eq(s.local.ativo, true),
      ),
    );
  return new Map(l.map((x) => [normalizarNome(x.nome), x.id]));
}

// Granel ----------------------------------------------------------------------------------------

async function planejarGranel(
  ctx: ContextoEmpresa,
  estab: string,
  dataSaldo: Date,
  linhas: ReturnType<typeof linhasDaPlanilha>,
) {
  const erros: Erro[] = [];
  const recipientes = await ctx.tx
    .select({ id: s.recipiente.id, codigo: s.recipiente.codigo, situacao: s.recipiente.situacao })
    .from(s.recipiente)
    .where(eq(s.recipiente.estabelecimentoId, estab));
  const porCodigo = new Map(recipientes.map((r) => [normalizarNome(r.codigo), r]));
  const projetos = await ctx.tx
    .select({
      id: s.projeto.id,
      codigo: s.projeto.codigo,
      nome: s.projeto.nome,
      situacao: s.projeto.situacao,
    })
    .from(s.projeto)
    .where(eq(s.projeto.estabelecimentoId, estab));
  const variedades = await ctx.tx
    .select({ id: s.variedade.id, nome: s.variedade.nome, sinonimos: s.variedade.sinonimos })
    .from(s.variedade)
    .where(or(isNull(s.variedade.empresaId), eq(s.variedade.empresaId, ctx.empresaId)));
  const porVariedade = new Map<string, string>();
  for (const v of variedades) {
    porVariedade.set(normalizarNome(v.nome), v.id);
    for (const x of v.sinonimos)
      if (!porVariedade.has(normalizarNome(x))) porVariedade.set(normalizarNome(x), v.id);
  }

  // Agrupa por recipiente: litros na primeira linha, composição em uma linha por variedade.
  const grupos = new Map<
    string,
    {
      linha: number;
      recipienteId: string;
      projeto: string;
      lote: string;
      cl: number | null;
      itens: Array<{
        variedadeId: string;
        safra: number | null;
        fracao: number;
        organica: boolean;
      }>;
      semComposicao: boolean;
    }
  >();
  for (const { linha, v } of linhas) {
    const r = porCodigo.get(normalizarNome(v.recipiente ?? ''));
    if (!r) {
      erros.push({
        linha,
        mensagem: `Recipiente "${v.recipiente}" não encontrado neste estabelecimento.`,
      });
      continue;
    }
    if (r.situacao === 'inativo')
      erros.push({ linha, mensagem: `Recipiente ${r.codigo} inativo.` });
    if (!v.projeto) erros.push({ linha, mensagem: 'Informe o projeto.' });
    const g = grupos.get(r.id) ?? {
      linha,
      recipienteId: r.id,
      projeto: v.projeto ?? '',
      lote: v.lote || 'A',
      cl: null,
      itens: [],
      semComposicao: false,
    };
    if (g.projeto !== (v.projeto ?? '') || g.lote !== (v.lote || 'A'))
      erros.push({ linha, mensagem: `${r.codigo}: o recipiente tem um só projeto e lote.` });
    const litros = numeroBr(v.litros);
    if (v.litros && (!litros || Number(litros) <= 0))
      erros.push({ linha, mensagem: `Litros inválidos: "${v.litros}".` });
    if (litros) {
      if (g.cl !== null && g.cl !== paraCentilitros(litros))
        erros.push({
          linha,
          mensagem: `${r.codigo}: litros diferentes em linhas do mesmo recipiente.`,
        });
      g.cl = paraCentilitros(litros);
    }
    if (v.variedade) {
      const vid = porVariedade.get(normalizarNome(v.variedade));
      if (!vid) erros.push({ linha, mensagem: `Variedade "${v.variedade}" não encontrada.` });
      const pct = numeroBr(v.percentual);
      if (!pct || Number(pct) <= 0 || Number(pct) > 100)
        erros.push({ linha, mensagem: `Percentual inválido: "${v.percentual}".` });
      const safra = v.safra ? Number(v.safra) : null;
      if (v.safra && (!Number.isInteger(safra) || safra! < 1900 || safra! > 2200))
        erros.push({ linha, mensagem: `Safra inválida: "${v.safra}".` });
      if (vid && pct)
        g.itens.push({
          variedadeId: vid,
          safra,
          fracao: Number(pct) / 100,
          organica: simNao(v.organica),
        });
    } else g.semComposicao = true;
    grupos.set(r.id, g);
  }
  // Recipiente com erro de linha não tem a soma conferida (o erro já diz o que corrigir).
  const comErro = new Set(
    linhas
      .filter((l) => erros.some((e) => e.linha === l.linha))
      .map((l) => porCodigo.get(normalizarNome(l.v.recipiente ?? ''))?.id),
  );
  for (const g of grupos.values()) {
    if (comErro.has(g.recipienteId)) continue;
    const codigo = recipientes.find((r) => r.id === g.recipienteId)!.codigo;
    if (g.cl === null) erros.push({ linha: g.linha, mensagem: `${codigo}: informe os litros.` });
    if (g.itens.length && g.semComposicao)
      erros.push({
        linha: g.linha,
        mensagem: `${codigo}: linha sem variedade junto com composição.`,
      });
    const soma = g.itens.reduce((t, i) => t + i.fracao, 0);
    if (g.itens.length && Math.abs(soma - 1) > 0.0001)
      erros.push({
        linha: g.linha,
        mensagem: `${codigo}: os percentuais somam ${(soma * 100).toLocaleString('pt-BR')}%, não 100%.`,
      });
  }
  if (erros.length) return { erros, plano: null, projetosNovos: [] as string[] };

  // Projetos: pelo código ou pelo nome; os que não existem são criados na aplicação.
  const projetoDe = (nome: string) =>
    projetos.find(
      (p) =>
        normalizarNome(p.codigo) === normalizarNome(nome) ||
        normalizarNome(p.nome) === normalizarNome(nome),
    );
  const projetosNovos = [...new Set([...grupos.values()].map((g) => g.projeto))].filter(
    (p) => !projetoDe(p),
  );
  for (const g of grupos.values()) {
    const p = projetoDe(g.projeto);
    if (p && ['encerrado', 'cancelado', 'engarrafado'].includes(p.situacao))
      erros.push({ linha: g.linha, mensagem: `O projeto ${p.codigo} não está aberto.` });
  }

  const composicaoDe = (g: {
    itens: Array<{ variedadeId: string; safra: number | null; fracao: number; organica: boolean }>;
  }): Composicao =>
    g.itens.length
      ? {
          componentes: normalizar(
            g.itens.map((i) => ({
              variedadeId: i.variedadeId,
              safra: i.safra,
              ciclo: null,
              origem: 'nao_informada' as const,
              organica: i.organica,
              candidataIp: false,
              fracao: i.fracao,
            })),
          ),
          chaptalizado: false,
        }
      : {
          componentes: [
            {
              variedadeId: null,
              safra: null,
              ciclo: null,
              origem: 'nao_informada',
              organica: false,
              candidataIp: false,
              fracao: 1,
            },
          ],
          chaptalizado: false,
        };
  const lancamentos: Lancamento[] = [];
  const linhasOp: LinhaOperacao[] = [];
  const lotesNovos: LoteNovo[] = [];
  let n = 0;
  for (const g of grupos.values()) {
    n += 1;
    const chave = `${normalizarNome(g.projeto)}|${g.lote}`;
    if (!lotesNovos.some((l) => l.chave === chave))
      lotesNovos.push({
        chave,
        projetoId: projetoDe(g.projeto)?.id ?? `novo:${normalizarNome(g.projeto)}`,
        titularId: null,
        origem: 'carga_inicial',
      });
    lancamentos.push({
      recipienteId: g.recipienteId,
      lote: { novo: chave },
      centilitros: g.cl!,
      tipo: 'abertura_saldo',
      linha: n,
      composicao: { composicao: composicaoDe(g) },
    });
    linhasOp.push({
      ordem: n,
      papel: 'destino',
      recipienteId: g.recipienteId,
      lote: { novo: chave },
      centilitros: g.cl!,
      mistura: 'lote_novo',
    });
  }
  return {
    erros,
    projetosNovos,
    plano: {
      tipo: 'abertura_saldo' as const,
      estabelecimentoId: estab,
      executadoEm: dataSaldo,
      projetoId: null,
      observacao: 'Carga inicial do saldo de abertura (planilha).',
      dados: { cargaInicial: true },
      linhas: linhasOp,
      lancamentos,
      lotesNovos,
    },
  };
}

// Garrafas e itens ------------------------------------------------------------------------------

async function planejarEstoque(
  ctx: ContextoEmpresa,
  estab: string,
  tipo: 'saldo_garrafas' | 'saldo_itens',
  linhas: ReturnType<typeof linhasDaPlanilha>,
) {
  const erros: Erro[] = [];
  const locais = await locaisDeEstoque(ctx, estab);
  const itens = await ctx.tx
    .select({
      id: s.itemEstoque.id,
      nome: s.itemEstoque.nome,
      tipo: s.itemEstoque.tipo,
      controlaLote: s.itemEstoque.controlaLote,
      ativo: s.itemEstoque.ativo,
    })
    .from(s.itemEstoque)
    .where(eq(s.itemEstoque.empresaId, ctx.empresaId));
  const formatos =
    tipo === 'saldo_garrafas'
      ? await ctx.tx
          .select({
            produto: s.produto.nome,
            produtoId: s.produto.id,
            volumeMl: s.produtoFormato.volumeMl,
            itemId: s.produtoFormato.itemEstoqueId,
          })
          .from(s.produtoFormato)
          .innerJoin(s.produto, eq(s.produto.id, s.produtoFormato.produtoId))
          .where(eq(s.produto.empresaId, ctx.empresaId))
      : [];
  const comerciais =
    tipo === 'saldo_garrafas'
      ? await ctx.tx
          .select({ codigo: s.loteComercial.codigo, origem: s.loteComercial.origem })
          .from(s.loteComercial)
          .where(eq(s.loteComercial.estabelecimentoId, estab))
      : [];
  const planejadas: Array<{
    linha: number;
    itemId: string;
    localId: string;
    lote: string | null;
    validade: string | null;
    quantidade: string;
    produtoId?: string;
    dataEnvase?: string | null;
  }> = [];
  for (const { linha, v } of linhas) {
    const localId = locais.get(normalizarNome(v.local ?? ''));
    if (!localId) erros.push({ linha, mensagem: `Local de estoque "${v.local}" não encontrado.` });
    const q = numeroBr(v.quantidade);
    if (!q || Number(q) <= 0)
      erros.push({ linha, mensagem: `Quantidade inválida: "${v.quantidade}".` });
    if (tipo === 'saldo_garrafas') {
      const f = formatos.find(
        (x) =>
          normalizarNome(x.produto) === normalizarNome(v.produto ?? '') &&
          String(x.volumeMl) === (v.formato_ml ?? '').trim(),
      );
      if (!f)
        erros.push({
          linha,
          mensagem: `Produto "${v.produto}" no formato ${v.formato_ml} mL não encontrado.`,
        });
      if (!v.lote_comercial) erros.push({ linha, mensagem: 'Informe o lote comercial.' });
      const existente = comerciais.find((c) => c.codigo === v.lote_comercial);
      if (existente && existente.origem !== 'carga_inicial')
        erros.push({
          linha,
          mensagem: `O lote comercial ${v.lote_comercial} já existe (envase do sistema).`,
        });
      if (q && !Number.isInteger(Number(q)))
        erros.push({ linha, mensagem: 'Garrafas em número inteiro.' });
      const dataEnvase = v.data_envase ? dataBr(v.data_envase) : null;
      if (v.data_envase && !dataEnvase)
        erros.push({ linha, mensagem: `Data de envase inválida: "${v.data_envase}".` });
      if (f && localId && q && v.lote_comercial)
        planejadas.push({
          linha,
          itemId: f.itemId,
          localId,
          lote: v.lote_comercial,
          validade: null,
          quantidade: q,
          produtoId: f.produtoId,
          dataEnvase,
        });
    } else {
      const i = itens.find((x) => normalizarNome(x.nome) === normalizarNome(v.item ?? ''));
      if (!i)
        erros.push({ linha, mensagem: `Item "${v.item}" não encontrado (Insumos e embalagens).` });
      else if (i.tipo === 'produto_acabado')
        erros.push({ linha, mensagem: `${i.nome} é produto acabado: use a planilha de garrafas.` });
      else if (!i.ativo) erros.push({ linha, mensagem: `${i.nome} está inativo.` });
      else if (i.controlaLote && !v.lote)
        erros.push({ linha, mensagem: `${i.nome} controla lote: informe o lote.` });
      const validade = v.validade ? dataBr(v.validade) : null;
      if (v.validade && !validade)
        erros.push({ linha, mensagem: `Validade inválida: "${v.validade}".` });
      if (i && localId && q)
        planejadas.push({
          linha,
          itemId: i.id,
          localId,
          lote: v.lote || null,
          validade,
          quantidade: q,
        });
    }
  }
  return { erros, planejadas };
}

// Rotas -----------------------------------------------------------------------------------------

export async function rotasCargaInicial(app: FastifyInstance): Promise<void> {
  const { db, armazenamento } = app.deps;

  app.get<{ Params: { tipo: string } }>('/api/carga-inicial/modelo/:tipo', async (req, res) => {
    const tipo = z.enum(s.TIPOS_IMPORTACAO).parse(req.params.tipo);
    const m = MODELOS[tipo];
    const csv = [m.colunas, ...m.exemplo].map((l) => l.join(';')).join('\r\n');
    return res
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${m.nome}.csv"`)
      .send(`\uFEFF${csv}\r\n`);
  });

  /** Valida e, sem erros e com "aplicar", grava tudo numa transação (P23: tudo ou nada). */
  const processar = (aplicar: boolean) => async (req: FastifyRequest) => {
    const q = z
      .object({
        tipo: z.enum(s.TIPOS_IMPORTACAO),
        data: z.iso.datetime({ offset: true, message: 'Informe a data do saldo' }),
      })
      .parse(req.query);
    const arquivo = await req.file();
    if (!arquivo) throw new ErroRegra('Envie a planilha (CSV).', 'arquivo');
    const conteudo = await arquivo.toBuffer();
    if (arquivo.file.truncated) throw new ErroRegra('Arquivo grande demais.', 'arquivo_grande');
    const linhas = linhasDaPlanilha(conteudo.toString('utf8'), q.tipo);
    if (!linhas.length)
      throw new ErroRegra('A planilha não tem linhas além do cabeçalho.', 'planilha');
    const dataSaldo = new Date(q.data);
    if (dataSaldo.getTime() > Date.now())
      throw new ErroRegra('A data do saldo não pode ser no futuro.', 'data_futura');
    return naEmpresa(db, req, PERMISSAO[q.tipo], async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const importacaoId = uuidv7();
      let resumo: Record<string, number> = {};
      let erros: Erro[];
      let operacaoId: string | null = null;
      let grupoId: string | null = null;

      if (q.tipo === 'saldo_granel') {
        const g = await planejarGranel(ctx, estab, dataSaldo, linhas);
        erros = g.erros;
        if (!erros.length && g.plano) {
          resumo = {
            recipientes: g.plano.lancamentos.length,
            lotes: g.plano.lotesNovos.length,
            projetosNovos: g.projetosNovos.length,
            litros: Number(
              deCentilitros(g.plano.lancamentos.reduce((t, l) => t + l.centilitros, 0)),
            ),
          };
          // A prévia do motor confere os bloqueios físicos (recipiente com vinho, capacidade).
          const { previa } = await preparar(ctx, g.plano, { travar: false });
          erros.push(...previa.bloqueios.map((b) => ({ linha: 0, mensagem: b })));
          if (aplicar && !erros.length) {
            const [estabRow] = await ctx.tx
              .select({ fuso: s.estabelecimento.fuso })
              .from(s.estabelecimento)
              .where(eq(s.estabelecimento.id, estab));
            for (const nome of g.projetosNovos) {
              const p = { id: uuidv7() };
              const ano = Number(
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: estabRow!.fuso,
                  year: 'numeric',
                }).format(dataSaldo),
              );
              const codigo = await proximoCodigo(ctx, {
                estabelecimentoId: estab,
                tipo: 'projeto',
                ano,
              });
              await ctx.tx.insert(s.projeto).values({
                id: p!.id,
                empresaId: ctx.empresaId,
                estabelecimentoId: estab,
                codigo,
                nome,
                safraPrevista: ano,
                situacao: 'em_producao',
                observacoes: 'Criado pela carga inicial.',
                criadoPor: ctx.usuarioId,
                atualizadoPor: ctx.usuarioId,
              });
              for (const l of g.plano.lotesNovos)
                if (l.projetoId === `novo:${normalizarNome(nome)}`) l.projetoId = p!.id;
            }
            const op = await confirmar(ctx, g.plano, []);
            operacaoId = op.operacaoId;
          }
        }
      } else {
        const e = await planejarEstoque(ctx, estab, q.tipo, linhas);
        erros = e.erros;
        resumo =
          q.tipo === 'saldo_garrafas'
            ? {
                linhas: e.planejadas.length,
                garrafas: e.planejadas.reduce((t, x) => t + Number(x.quantidade), 0),
              }
            : { linhas: e.planejadas.length };
        if (!erros.length) {
          const movimentos: MovimentoNovo[] = [];
          for (const x of aplicar ? e.planejadas : []) {
            let loteItemId: string | null = null;
            if (x.lote) {
              if (q.tipo === 'saldo_garrafas') {
                const [lc] = await ctx.tx
                  .select({ id: s.loteComercial.id })
                  .from(s.loteComercial)
                  .where(
                    and(
                      eq(s.loteComercial.estabelecimentoId, estab),
                      eq(s.loteComercial.codigo, x.lote),
                    ),
                  );
                if (!lc)
                  await ctx.tx.insert(s.loteComercial).values({
                    empresaId: ctx.empresaId,
                    estabelecimentoId: estab,
                    codigo: x.lote,
                    produtoId: x.produtoId ?? null,
                    primeiroEnvase: x.dataEnvase ? new Date(`${x.dataEnvase}T12:00:00Z`) : null,
                    ultimoEnvase: x.dataEnvase ? new Date(`${x.dataEnvase}T12:00:00Z`) : null,
                    origem: 'carga_inicial',
                    criadoPor: ctx.usuarioId,
                  });
              }
              loteItemId = await obterLote(
                ctx,
                estab,
                x.itemId,
                { codigo: x.lote, validade: x.validade },
                'carga_inicial',
              );
            }
            movimentos.push({
              localId: x.localId,
              itemId: x.itemId,
              loteItemId,
              quantidade: x.quantidade,
              tipo: 'carga_inicial',
              documento: 'Carga inicial',
            });
          }
          if (aplicar) {
            const r = await lancarEstoque(ctx, {
              estabelecimentoId: estab,
              executadoEm: dataSaldo,
              movimentos,
            });
            grupoId = r.grupoId;
          }
        }
      }
      if (erros.length || !aplicar) {
        if (aplicar)
          throw new ErroRegra(
            `A planilha tem ${erros.length} erro(s). Nada foi gravado.`,
            'planilha',
            { erros },
          );
        return { linhas: linhas.length, erros, resumo };
      }

      // O arquivo fica guardado como anexo da importação (P15, P23).
      const anexoId = uuidv7();
      const caminho = chaveAnexo({
        empresaId: ctx.empresaId,
        estabelecimentoId: estab,
        entidade: 'importacao',
        registroId: importacaoId,
        anexoId,
      });
      await armazenamento.gravar(caminho, conteudo);
      await ctx.tx.insert(s.importacao).values({
        id: importacaoId,
        empresaId: ctx.empresaId,
        estabelecimentoId: estab,
        tipo: q.tipo,
        dataSaldo,
        nomeArquivo: arquivo.filename.slice(0, 255),
        anexoId,
        linhas: linhas.length,
        operacaoId,
        grupoId,
        criadoPor: ctx.usuarioId,
      });
      await ctx.tx.insert(s.anexo).values({
        id: anexoId,
        empresaId: ctx.empresaId,
        estabelecimentoId: estab,
        entidade: 'importacao',
        registroId: importacaoId,
        categoria: 'outro',
        nomeOriginal: arquivo.filename.slice(0, 255),
        tipoMime: 'text/csv',
        tamanhoBytes: conteudo.length,
        hashSha256: createHash('sha256').update(conteudo).digest('hex'),
        caminho,
        criadoPor: ctx.usuarioId,
      });
      await ctx.auditar({
        acao: 'importar',
        entidade: 'importacao',
        registroId: importacaoId,
        dados: { tipo: q.tipo, linhas: linhas.length, ...resumo },
      });
      return { id: importacaoId, linhas: linhas.length, erros: [], resumo };
    });
  };

  app.post('/api/carga-inicial/validar', processar(false));
  app.post('/api/carga-inicial', processar(true));

  app.get('/api/carga-inicial', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const linhas = await ctx.tx
        .select({
          id: s.importacao.id,
          tipo: s.importacao.tipo,
          dataSaldo: s.importacao.dataSaldo,
          nomeArquivo: s.importacao.nomeArquivo,
          anexoId: s.importacao.anexoId,
          linhas: s.importacao.linhas,
          situacao: s.importacao.situacao,
          operacaoId: s.importacao.operacaoId,
          criadoEm: s.importacao.criadoEm,
          motivoEstorno: s.importacao.motivoEstorno,
        })
        .from(s.importacao)
        .where(eq(s.importacao.estabelecimentoId, estab))
        .orderBy(desc(s.importacao.criadoEm));
      return linhas.filter((l) => pode(ctx.acesso, PERMISSAO[l.tipo][0], 'visualizar'));
    }),
  );

  /** Estorno da carga: só sem movimento posterior nos mesmos recipientes ou itens (P23). */
  app.post<{ Params: { id: string } }>('/api/carga-inicial/:id/estorno', async (req) =>
    naEmpresa(db, req, null, async (ctx) => {
      const estab = ctx.exigirEstabelecimento();
      const { motivo } = z
        .object({ motivo: z.string().trim().min(3, 'Informe o motivo').max(500) })
        .parse(req.body);
      const [imp] = await ctx.tx
        .select()
        .from(s.importacao)
        .where(
          and(
            eq(s.importacao.id, z.uuid().parse(req.params.id)),
            eq(s.importacao.empresaId, ctx.empresaId),
          ),
        )
        .for('update');
      if (!imp || imp.estabelecimentoId !== estab)
        throw new ErroNaoEncontrado('Importação não encontrada.');
      ctx.exigir(PERMISSAO[imp.tipo][0], 'estornar');
      if (imp.situacao !== 'aplicada')
        throw new ErroRegra('A importação já foi estornada.', 'situacao');
      if (imp.operacaoId) {
        // O motor pede o estorno das operações posteriores antes (4.5).
        await estornar(ctx, imp.operacaoId, `Estorno da carga inicial: ${motivo}`);
      } else if (imp.grupoId) {
        const movs = await ctx.tx
          .select()
          .from(s.movimentoEstoque)
          .where(eq(s.movimentoEstoque.grupoId, imp.grupoId));
        const depois = await ctx.tx
          .select({ id: s.movimentoEstoque.id })
          .from(s.movimentoEstoque)
          .where(
            and(
              inArray(s.movimentoEstoque.itemId, [...new Set(movs.map((m) => m.itemId))]),
              eq(s.movimentoEstoque.estabelecimentoId, estab),
              ne(s.movimentoEstoque.grupoId, imp.grupoId),
              gt(s.movimentoEstoque.lancadoEm, imp.criadoEm),
            ),
          )
          .limit(1);
        if (depois.length)
          throw new ErroRegra(
            'Há movimentos depois da carga nestes itens: estorne-os antes, ou corrija por ajuste.',
            'dependentes',
          );
        await lancarEstoque(ctx, {
          estabelecimentoId: estab,
          executadoEm: imp.dataSaldo,
          movimentos: movs.map((m) => ({
            localId: m.localId,
            itemId: m.itemId,
            loteItemId: m.loteItemId,
            quantidade: (-Number(m.quantidade)).toFixed(3),
            tipo: 'estorno' as const,
            motivo,
            documento: m.documento,
            estornoDeId: m.id,
          })),
        });
      }
      await ctx.tx
        .update(s.importacao)
        .set({ situacao: 'estornada', motivoEstorno: motivo, estornadaEm: sql`now()` })
        .where(eq(s.importacao.id, imp.id));
      await ctx.auditar({ acao: 'estornar', entidade: 'importacao', registroId: imp.id, motivo });
      return { ok: true };
    }),
  );
}
