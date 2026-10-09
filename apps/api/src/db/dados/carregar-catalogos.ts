// Carga idempotente dos catálogos globais (P6, P16). Atualiza os itens globais pelo código e não
// toca nos itens das empresas.
import { PAPEIS } from '@vinicycle/shared';
import { REGRAS } from './regras';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import * as s from '../schema';
import {
  CLASSES_PRODUTO,
  IGS,
  OPCOES_LISTA,
  PARAMETROS_ANALISE,
  TIPOS_DOCUMENTO,
  TIPOS_INSUMO,
  TIPOS_RECIPIENTE,
  UNIDADES,
} from './catalogos';
import { CULTIVARES, FONTE_CULTIVARES } from './cultivares-sisdevin-2023';

type Tx = Parameters<Parameters<NodePgDatabase<typeof s>['transaction']>[0]>[0];

type TabelaGlobMais = PgTable & { id: AnyPgColumn; codigo: AnyPgColumn; empresaId: AnyPgColumn };

/**
 * Item global pelo código. Os catálogos que a Administração edita (Administração › Catálogos) só
 * recebem o item que falta: a carga não desfaz o que a equipe alterou.
 */
async function globalPorCodigo(
  tx: Tx,
  tabela: TabelaGlobMais,
  codigo: string,
  valores: Record<string, unknown>,
  { atualizar = false } = {},
) {
  const [existente] = (await tx
    .select({ id: tabela.id })
    .from(tabela)
    .where(and(eq(tabela.codigo, codigo), isNull(tabela.empresaId)))) as Array<{ id: string }>;
  if (existente) {
    if (!atualizar) return;
    await tx
      .update(tabela)
      .set(valores as never)
      .where(eq(tabela.id, existente.id));
  } else {
    await tx.insert(tabela).values({ ...valores, codigo } as never);
  }
}

export async function carregarCatalogos(tx: Tx): Promise<void> {
  // Regras regulatórias iniciais (P16): só inclui a versão que falta; versão gravada não muda.
  for (const r of REGRAS) {
    await tx
      .insert(s.regraRegulatoria)
      .values({
        ...r,
        minimo: r.minimo ?? null,
        maximo: r.maximo ?? null,
        unidade: r.unidade ?? null,
        fonteArtigo: r.fonteArtigo ?? null,
        fonteLink: r.fonteLink ?? null,
        fonteNota: r.fonteNota ?? null,
      })
      .onConflictDoNothing();
  }
  for (const [i, p] of PAPEIS.entries()) {
    await tx
      .insert(s.papel)
      .values({ codigo: p.codigo, nome: p.nome, ordem: i + 1 })
      .onConflictDoUpdate({ target: s.papel.codigo, set: { nome: p.nome, ordem: i + 1 } });
  }
  for (const [i, [simbolo, nome, grandeza, casas]] of UNIDADES.entries()) {
    await tx
      .insert(s.unidade)
      .values({ simbolo, nome, grandeza, casas, ordem: i + 1 })
      .onConflictDoUpdate({
        target: s.unidade.simbolo,
        set: { nome, grandeza, casas, ordem: i + 1 },
      });
  }
  for (const [
    i,
    [codigo, nome, categoria, exigeMetodoEspumante, fonte, vigenteDesde],
  ] of CLASSES_PRODUTO.entries()) {
    const valores = { nome, categoria, exigeMetodoEspumante, fonte, ordem: i + 1 };
    await tx
      .insert(s.classeProduto)
      .values({ codigo, vigenteDesde, ...valores })
      .onConflictDoUpdate({
        target: [s.classeProduto.codigo, s.classeProduto.vigenteDesde],
        set: valores,
      });
  }
  for (const ig of IGS) {
    await tx
      .insert(s.indicacaoGeografica)
      .values(ig)
      .onConflictDoUpdate({ target: s.indicacaoGeografica.codigo, set: ig });
  }
  for (const [codigo, nome, pressurizado, eBarrica] of TIPOS_RECIPIENTE) {
    await globalPorCodigo(tx, s.tipoRecipiente, codigo, { nome, pressurizado, eBarrica });
  }
  for (const [codigo, nome, unidades, apresentacoes] of TIPOS_INSUMO) {
    await globalPorCodigo(tx, s.tipoInsumo, codigo, {
      nome,
      unidades: [...unidades],
      apresentacoes: [...apresentacoes],
    });
  }
  for (const [codigo, nome, temVencimento] of TIPOS_DOCUMENTO) {
    await globalPorCodigo(tx, s.tipoDocumento, codigo, { nome, temVencimento });
  }
  for (const [
    i,
    [codigo, nome, unidadePadrao, unidadesAceitas, casas, minimo, maximo],
  ] of PARAMETROS_ANALISE.entries()) {
    await globalPorCodigo(
      tx,
      s.parametroAnalise,
      codigo,
      {
        nome,
        unidadePadrao,
        unidadesAceitas: [...unidadesAceitas],
        casas,
        minimo,
        maximo,
        ordem: i + 1,
      },
      { atualizar: true },
    );
  }
  for (const [codigo, nome, cor, tipo] of CULTIVARES) {
    await globalPorCodigo(tx, s.variedade, codigo, {
      codigoOficial: codigo,
      nome,
      cor,
      tipo,
      fonte: FONTE_CULTIVARES,
    });
  }
  for (const [lista, opcoes] of Object.entries(OPCOES_LISTA)) {
    // Opção nova numa lista que já existe entra logo depois da anterior da carga.
    let anterior: number | null = null;
    for (const [i, [codigo, nome]] of opcoes.entries()) {
      const [existente] = await tx
        .select({ id: s.opcaoLista.id, ordem: s.opcaoLista.ordem })
        .from(s.opcaoLista)
        .where(
          and(
            eq(s.opcaoLista.lista, lista),
            eq(s.opcaoLista.codigo, codigo),
            isNull(s.opcaoLista.empresaId),
          ),
        );
      if (existente) {
        anterior = existente.ordem;
        continue;
      }
      const ordem: number = anterior === null ? (i + 1) * 10 : anterior + 1;
      await tx.insert(s.opcaoLista).values({ lista, codigo, nome, ordem });
      anterior = ordem;
    }
  }
}
