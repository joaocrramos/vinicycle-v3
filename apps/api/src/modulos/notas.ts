// Importação de NF-e (P11; 03-modelo-de-dados.md, 2.4, NF-e): comum à nota da uva (recepção) e à
// nota de compra (estoque). Confere o destinatário, cadastra o emitente se ainda não existir e
// guarda a nota, os itens e o XML como anexo (P15). Não calcula imposto (FISCAL.md).
import { type CodigoPapel, dadosPessoa } from '@vinicycle/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import * as s from '../db/schema';
import { type Armazenamento, chaveAnexo } from '../nucleo/armazenamento';
import type { NfeLida } from '../nucleo/nfe';
import type { ContextoEmpresa } from '../nucleo/requisicao';
import { criarPessoa } from './pessoas';

/** O destinatário deveria ser a própria empresa ou o estabelecimento: só avisa (P29). */
export async function avisoDestinatario(
  ctx: ContextoEmpresa,
  estabelecimentoId: string,
  lida: NfeLida,
): Promise<string | null> {
  if (!lida.destinatario.documento) return null;
  const docs = await ctx.tx.execute<{ documento: string | null }>(sql`
    select f.documento from ficha f where f.id in (
      (select ficha_id from empresa where id = ${ctx.empresaId}),
      (select ficha_id from estabelecimento where id = ${estabelecimentoId}))`);
  const nossos = docs.rows.map((d) => d.documento).filter(Boolean);
  return nossos.includes(lida.destinatario.documento)
    ? null
    : `O destinatário da nota (${lida.destinatario.nome ?? lida.destinatario.documento}) não é esta vinícola.`;
}

/**
 * Emitente da nota: a pessoa com o mesmo documento, que ganha o papel; sem cadastro, é criada a
 * partir da nota (P11). Endereço que não passa na validação fica para completar depois.
 */
export async function emitenteDaNota(
  ctx: ContextoEmpresa,
  lida: NfeLida,
  papel: CodigoPapel,
): Promise<{ id: string | null; novo: boolean; aviso: string | null }> {
  const [achado] = await ctx.tx
    .select({ id: s.pessoa.id })
    .from(s.pessoa)
    .innerJoin(s.ficha, eq(s.ficha.id, s.pessoa.fichaId))
    .where(
      and(eq(s.pessoa.empresaId, ctx.empresaId), eq(s.ficha.documento, lida.emitente.documento)),
    );
  if (achado) {
    await ctx.tx
      .insert(s.pessoaPapel)
      .values({ empresaId: ctx.empresaId, pessoaId: achado.id, papel })
      .onConflictDoNothing();
    return { id: achado.id, novo: false, aviso: null };
  }
  const e = lida.emitente.endereco;
  const ficha = {
    tipoPessoa: lida.emitente.tipoPessoa,
    nome: lida.emitente.nome,
    nomeFantasia: lida.emitente.nomeFantasia,
    documento: lida.emitente.documento,
    inscricaoEstadual: lida.emitente.inscricaoEstadual,
    enderecos: e ? [{ rotulo: 'principal', principal: true, ...e }] : [],
  };
  let d = dadosPessoa.safeParse({ ficha, papeis: [papel] });
  if (!d.success)
    d = dadosPessoa.safeParse({ ficha: { ...ficha, enderecos: [] }, papeis: [papel] });
  if (d.success) return { id: await criarPessoa(ctx, d.data), novo: true, aviso: null };
  return {
    id: null,
    novo: false,
    aviso: `O emitente ${lida.emitente.nome} não pôde ser cadastrado automaticamente; cadastre-o em Pessoas.`,
  };
}

/** Grava a nota, os itens (com o lote do XML) e o arquivo como anexo; devolve o id da nota. */
export async function gravarNota(
  ctx: ContextoEmpresa,
  armazenamento: Armazenamento,
  d: {
    estabelecimentoId: string;
    lida: NfeLida;
    arquivo: { nome: string; conteudo: Buffer };
    tipoUso: (typeof s.nfe.$inferInsert)['tipoUso'];
    emitenteId: string | null;
    emitenteNovo: boolean;
  },
): Promise<string> {
  const { lida, estabelecimentoId } = d;
  const nfeId = uuidv7();
  const anexoId = uuidv7();
  const caminho = chaveAnexo({
    empresaId: ctx.empresaId,
    estabelecimentoId,
    entidade: 'nfe',
    registroId: nfeId,
    anexoId,
  });
  await armazenamento.gravar(caminho, d.arquivo.conteudo);
  await ctx.tx.insert(s.nfe).values({
    id: nfeId,
    empresaId: ctx.empresaId,
    estabelecimentoId,
    chave: lida.chave,
    numero: lida.numero,
    serie: lida.serie,
    emissao: new Date(lida.emissao),
    emitenteId: d.emitenteId,
    emitenteDocumento: lida.emitente.documento,
    emitenteNome: lida.emitente.nome,
    destinatarioDocumento: lida.destinatario.documento,
    destinatarioNome: lida.destinatario.nome,
    tipoUso: d.tipoUso,
    anexoId,
    criadoPor: ctx.usuarioId,
    atualizadoPor: ctx.usuarioId,
  });
  await ctx.tx.insert(s.anexo).values({
    id: anexoId,
    empresaId: ctx.empresaId,
    estabelecimentoId,
    entidade: 'nfe',
    registroId: nfeId,
    categoria: 'nota_fiscal',
    nomeOriginal: d.arquivo.nome.slice(0, 255),
    tipoMime: 'application/xml',
    tamanhoBytes: d.arquivo.conteudo.length,
    hashSha256: createHash('sha256').update(d.arquivo.conteudo).digest('hex'),
    caminho,
    criadoPor: ctx.usuarioId,
  });
  if (lida.itens.length) {
    await ctx.tx.insert(s.nfeItem).values(
      lida.itens.map((i) => ({
        empresaId: ctx.empresaId,
        nfeId,
        numeroItem: i.numero,
        codigoEmitente: i.codigo,
        descricao: i.descricao,
        quantidade: i.quantidade,
        unidade: i.unidade,
        valor: i.valor,
        loteNota: i.lote,
        fabricacaoNota: i.fabricacao,
        validadeNota: i.validade,
      })),
    );
  }
  await ctx.auditar({
    acao: 'importar',
    entidade: 'nfe',
    registroId: nfeId,
    dados: {
      chave: lida.chave,
      numero: lida.numero,
      emitente: lida.emitente.nome,
      emitenteNovo: d.emitenteNovo,
      tipoUso: d.tipoUso,
    },
  });
  return nfeId;
}

/**
 * Memoriza a associação de um código da nota (P11): item, conversão, local, variedade ou descarte,
 * para a próxima nota do mesmo emitente. Na saída, o emitente é a própria empresa (vazio).
 */
export async function memorizarAssociacao(
  ctx: ContextoEmpresa,
  chave: { pessoaId: string | null; codigo: string; sentido: 'entrada' | 'saida' },
  valores: Partial<
    Pick<
      typeof s.associacaoItem.$inferInsert,
      'itemEstoqueId' | 'conversao' | 'localId' | 'variedadeId' | 'descartar'
    >
  >,
): Promise<void> {
  const [atual] = await ctx.tx
    .select({ id: s.associacaoItem.id })
    .from(s.associacaoItem)
    .where(
      and(
        eq(s.associacaoItem.empresaId, ctx.empresaId),
        chave.pessoaId
          ? eq(s.associacaoItem.pessoaId, chave.pessoaId)
          : isNull(s.associacaoItem.pessoaId),
        eq(s.associacaoItem.codigoEmitente, chave.codigo),
        eq(s.associacaoItem.sentido, chave.sentido),
      ),
    );
  if (atual) {
    await ctx.tx
      .update(s.associacaoItem)
      .set({ ...valores, atualizadoEm: sql`now()`, atualizadoPor: ctx.usuarioId })
      .where(eq(s.associacaoItem.id, atual.id));
    return;
  }
  await ctx.tx.insert(s.associacaoItem).values({
    empresaId: ctx.empresaId,
    pessoaId: chave.pessoaId,
    codigoEmitente: chave.codigo,
    sentido: chave.sentido,
    ...valores,
    criadoPor: ctx.usuarioId,
    atualizadoPor: ctx.usuarioId,
  });
}
