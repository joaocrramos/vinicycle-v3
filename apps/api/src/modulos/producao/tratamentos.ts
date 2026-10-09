// EnoTrace › Operações: adição de insumo, chaptalização e tratamentos (cantina.md, Adição de insumo;
// Fermentação, chaptalização…; Inventário, estorno e tratamentos). Os insumos entram pelo montador
// comum (apoio.ts, aplicarInsumos): baixa do lote do insumo, SO₂ somado e alertas.
import {
  adicaoInsumo as esquemaAdicao,
  chaptalizacao as esquemaChaptalizacao,
  tratamento as esquemaTratamento,
} from '@vinicycle/shared';
import { and, eq, inArray } from 'drizzle-orm';
import * as s from '../../db/schema';
import { ErroRegra } from '../../nucleo/erros';
import { type Aviso, fonteDaRegra, regraVigente } from '../../nucleo/regras';
import type { ContextoEmpresa } from '../../nucleo/requisicao';
import { lerParametro } from '../parametros';
import {
  carregarProjeto,
  conferirEtapaPlano,
  conferirOpcao,
  conferirPessoas,
  dataExecucao,
  fusoDo,
  type Montada,
  saldosPorLote,
} from './apoio';
import type { Lancamento, LinhaOperacao } from './motor';

/** Recipientes com vinho agora, com o lote e o projeto de cada um. */
export async function comVinho(ctx: ContextoEmpresa, ids: string[]) {
  const saldos = await saldosPorLote(ctx, ids);
  const nomes = await ctx.tx
    .select({ id: s.recipiente.id, codigo: s.recipiente.codigo })
    .from(s.recipiente)
    .where(inArray(s.recipiente.id, ids));
  for (const id of ids)
    if (!saldos.some((x) => x.recipienteId === id))
      throw new ErroRegra(
        `O recipiente ${nomes.find((n) => n.id === id)?.codigo ?? ''} está vazio.`,
        'vazio',
      );
  const lotes = await ctx.tx
    .select({ id: s.lote.id, projetoId: s.lote.projetoId })
    .from(s.lote)
    .where(
      inArray(
        s.lote.id,
        saldos.map((x) => x.loteId),
      ),
    );
  return saldos.map((x) => ({ ...x, projetoId: lotes.find((l) => l.id === x.loteId)!.projetoId }));
}

/** Projeto da operação: o único dos lotes tocados (ou nenhum, se forem vários). */
export async function projetoUnico(
  ctx: ContextoEmpresa,
  estab: string,
  partes: Array<{ projetoId: string }>,
  planoEtapaId: string | null | undefined,
) {
  const projetos = [...new Set(partes.map((p) => p.projetoId))];
  const projeto = projetos.length === 1 ? await carregarProjeto(ctx, projetos[0]!, estab) : null;
  if (projeto) await conferirEtapaPlano(ctx, planoEtapaId, projeto.id);
  else if (planoEtapaId) throw new ErroRegra('A etapa do plano é de um só projeto.', 'plano_etapa');
  return projeto;
}

export const linhasDeAjuste = (
  partes: Array<{ recipienteId: string; loteId: string; cl: number }>,
) =>
  partes.map((p, n): LinhaOperacao => ({
    ordem: n + 1,
    papel: 'ajuste',
    recipienteId: p.recipienteId,
    lote: { id: p.loteId },
    centilitros: p.cl,
  }));

// Adição de insumo ------------------------------------------------------------------------------

export async function planoAdicao(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento();
  const d = esquemaAdicao.parse(corpo);
  const executadoEm = dataExecucao(d.executadoEm);
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId]);
  const partes = await comVinho(ctx, [...new Set(d.insumos.map((i) => i.recipienteId!))]);
  const projeto = await projetoUnico(ctx, estab, partes, d.planoEtapaId);
  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: [] },
    plano: {
      tipo: 'adicao_insumo',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto?.id ?? null,
      responsavelId: d.responsavelId ?? projeto?.enologoId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      linhas: linhasDeAjuste(partes),
      lancamentos: [],
    },
  };
}

// Chaptalização ---------------------------------------------------------------------------------

/**
 * Chaptalização: o açúcar em kg ou g/L, o ganho estimado (fator do parâmetro, 17 g/L por 1% vol
 * por padrão) e o alerta pelo limite da classe do produto pretendido (regra versionada, Decreto
 * 8.198/2014 mantido até ato novo do MAPA) e pelo limite da prática da vinícola, se houver (P29).
 * A parte tratada fica marcada como chaptalizada, e a marca viaja com os litros.
 */
export async function planoChaptalizacao(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento();
  const d = esquemaChaptalizacao.parse(corpo);
  const executadoEm = dataExecucao(d.executadoEm);
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId]);
  const [parte] = await comVinho(ctx, [d.recipienteId]);
  const projeto = (await projetoUnico(ctx, estab, [parte!], d.planoEtapaId))!;
  const litros = parte!.cl / 100;
  const kg = d.kg ? Number(d.kg) : (Number(d.gramasPorLitro) * litros) / 1000;
  const gramasPorLitro = (kg * 1000) / litros;
  const { acucarPorGrau, limitePratica } = await lerParametro(ctx, 'chaptalizacao');
  const ganho = gramasPorLitro / acucarPorGrau;

  // Limite pela classe e cor do projeto (cantina.md, Chaptalização).
  const avisos: Aviso[] = [];
  const [classe] = projeto.classeProdutoId
    ? await ctx.tx
        .select({ codigo: s.classeProduto.codigo, nome: s.classeProduto.nome })
        .from(s.classeProduto)
        .where(eq(s.classeProduto.id, projeto.classeProdutoId))
    : [];
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: await fusoDo(ctx, estab) }).format(
    executadoEm,
  );
  let regraUsada: string | null = null;
  if (!classe) {
    avisos.push({
      codigo: 'chaptalizacao:sem_classe',
      mensagem: `O projeto ${projeto.codigo} não tem classe: o limite de chaptalização não foi conferido.`,
    });
  } else {
    const chaves = [
      ...(projeto.cor ? [`chaptalizacao_maxima_${classe.codigo}_${projeto.cor}`] : []),
      `chaptalizacao_maxima_${classe.codigo}`,
    ];
    for (const chave of chaves) {
      const regra = await regraVigente(ctx.tx, chave, { data });
      if (!regra?.maximo) continue;
      regraUsada = chave;
      const maximo = Number(regra.maximo);
      const porGrau = regra.unidade !== 'g/L';
      const apurado = porGrau ? ganho : gramasPorLitro;
      if (apurado > maximo) {
        avisos.push({
          codigo: `chaptalizacao:${chave}`,
          mensagem:
            maximo === 0
              ? `${regra.descricao}: o projeto é ${classe.nome.toLowerCase()}${projeto.cor ? ` ${projeto.cor}` : ''}.`
              : `${porGrau ? `Ganho estimado de ${ganho.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% vol` : `${gramasPorLitro.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g/L de açúcar`}, acima do limite de ${maximo.toLocaleString('pt-BR')} ${regra.unidade}.`,
          regraId: regra.id,
          valorApurado: apurado.toFixed(2),
          limite: regra.maximo,
          fonte: fonteDaRegra(regra),
        });
      }
      break;
    }
  }
  if (limitePratica !== null && ganho > limitePratica)
    avisos.push({
      codigo: 'chaptalizacao:limite_pratica',
      mensagem: `Ganho estimado de ${ganho.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% vol, acima do limite da prática da vinícola (${limitePratica.toLocaleString('pt-BR')}% vol, em Configurações › Parâmetros).`,
    });

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: {
      lista: [
        {
          recipienteId: d.recipienteId,
          itemId: d.itemId ?? null,
          descricao: d.descricao ?? null,
          loteItemId: d.loteItemId ?? null,
          dose: gramasPorLitro.toFixed(4),
          unidade: 'g/L',
          volumeTratado: litros.toFixed(2),
        },
      ],
      localEstoqueId: d.localEstoqueId,
      padrao: [],
    },
    plano: {
      tipo: 'chaptalizacao',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto.id,
      responsavelId: d.responsavelId ?? projeto.enologoId,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      linhas: linhasDeAjuste([parte!]),
      lancamentos: [],
      ajustesParte: [{ recipienteId: d.recipienteId, chaptalizar: true }],
      chaptalizacao: {
        acucarKg: kg.toFixed(3),
        gramasPorLitro: gramasPorLitro.toFixed(2),
        ganhoEstimado: ganho.toFixed(2),
        regra: regraUsada,
      },
      dados: { ganhoEstimado: ganho.toFixed(2), gramasPorLitro: gramasPorLitro.toFixed(2) },
      avisos,
    },
  };
}

// Tratamento ------------------------------------------------------------------------------------

/** Tratamento: insumos, perdas e os parâmetros técnicos do tipo (configuráveis, P29). */
export async function planoTratamento(ctx: ContextoEmpresa, corpo: unknown): Promise<Montada> {
  const estab = ctx.exigirEstabelecimento();
  const d = esquemaTratamento.parse(corpo);
  const executadoEm = dataExecucao(d.executadoEm);
  await conferirPessoas(ctx, [d.responsavelId, d.executadoPorId]);
  await conferirOpcao(ctx, 'tipo_tratamento', d.tipoTratamento, 'Tipo de tratamento');
  const recipientes = [...new Set(d.recipientes)];
  const partes = await comVinho(ctx, recipientes);
  const projeto = await projetoUnico(ctx, estab, partes, d.planoEtapaId);

  // Parâmetros técnicos do tipo: os obrigatórios precisam de valor.
  const configurados = await ctx.tx
    .select({
      id: s.tipoTratamentoParametro.id,
      nome: s.tipoTratamentoParametro.nome,
      obrigatorio: s.tipoTratamentoParametro.obrigatorio,
    })
    .from(s.tipoTratamentoParametro)
    .where(
      and(
        eq(s.tipoTratamentoParametro.empresaId, ctx.empresaId),
        eq(s.tipoTratamentoParametro.tipoTratamento, d.tipoTratamento),
        eq(s.tipoTratamentoParametro.ativo, true),
      ),
    );
  for (const p of d.parametros)
    if (!configurados.some((c) => c.id === p.parametroId))
      throw new ErroRegra('Parâmetro de outro tratamento.', 'parametro');
  for (const c of configurados)
    if (c.obrigatorio && !d.parametros.some((p) => p.parametroId === c.id))
      throw new ErroRegra(`Informe ${c.nome}.`, 'parametro');

  const linhas = linhasDeAjuste(partes);
  const lancamentos: Lancamento[] = [];
  for (const m of new Set(d.perdas.map((p) => p.motivo)))
    await conferirOpcao(ctx, 'motivo_perda', m, 'Motivo de perda');
  for (const p of d.perdas) {
    const parte = partes.find((x) => x.recipienteId === p.recipienteId);
    if (!parte) throw new ErroRegra('A perda é de um recipiente do tratamento.', 'perda');
    const ordem = linhas.length + 1;
    linhas.push({
      ordem,
      papel: 'perda',
      recipienteId: p.recipienteId,
      lote: { id: parte.loteId },
      centilitros: Math.round(Number(p.litros) * 100),
      motivoPerda: p.motivo,
    });
    lancamentos.push({
      recipienteId: p.recipienteId,
      lote: { id: parte.loteId },
      centilitros: -Math.round(Number(p.litros) * 100),
      tipo: 'perda',
      linha: ordem,
    });
  }

  return {
    cientes: d.cientes,
    rascunhoId: d.rascunhoId ?? null,
    insumos: { lista: d.insumos, localEstoqueId: d.localEstoqueId, padrao: recipientes },
    plano: {
      tipo: 'tratamento',
      estabelecimentoId: estab,
      executadoEm,
      projetoId: projeto?.id ?? null,
      responsavelId: d.responsavelId ?? projeto?.enologoId ?? null,
      executadoPorId: d.executadoPorId ?? null,
      planoEtapaId: d.planoEtapaId ?? null,
      observacao: d.observacao ?? null,
      linhas,
      lancamentos,
      parametros: d.parametros,
      dados: { tipoTratamento: d.tipoTratamento },
    },
  };
}
