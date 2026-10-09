// Fluxo de aprovação (P27; 04, roteiro do ciclo 8): a ação que a empresa sujeitou à aprovação
// (parâmetro "aprovacoes") não é feita no pedido; vira uma solicitação pendente, que alguém com a
// ação "aprovar" em Aprovações aprova (e a ação é feita na hora) ou recusa com motivo.
import type { TipoAprovacao } from '@vinicycle/shared';
import { and, eq } from 'drizzle-orm';
import * as s from '../db/schema';
import { lerParametro } from '../modulos/parametros';
import { ErroRegra } from './erros';
import type { ContextoEmpresa } from './requisicao';

/** Verdadeiro se a empresa exige aprovação para este tipo de ação e o pedido não vem da aprovação. */
export async function exigeAprovacao(
  ctx: ContextoEmpresa,
  tipo: TipoAprovacao,
  opcoes: { aprovado?: boolean } = {},
): Promise<boolean> {
  if (opcoes.aprovado) return false;
  return (await lerParametro(ctx, 'aprovacoes'))[tipo];
}

export interface PedidoAprovacao {
  tipo: TipoAprovacao;
  estabelecimentoId: string;
  entidade: string;
  registroId: string;
  resumo: string;
  dados: Record<string, unknown>;
}

/** Resposta da rota quando a ação ficou esperando aprovação. */
export interface AguardandoAprovacao {
  aguardandoAprovacao: true;
  solicitacaoId: string;
  mensagem: string;
}

export async function pedirAprovacao(
  ctx: ContextoEmpresa,
  p: PedidoAprovacao,
): Promise<AguardandoAprovacao> {
  const [ja] = await ctx.tx
    .select({ id: s.solicitacaoAprovacao.id })
    .from(s.solicitacaoAprovacao)
    .where(
      and(
        eq(s.solicitacaoAprovacao.tipo, p.tipo),
        eq(s.solicitacaoAprovacao.entidade, p.entidade),
        eq(s.solicitacaoAprovacao.registroId, p.registroId),
        eq(s.solicitacaoAprovacao.situacao, 'pendente'),
      ),
    );
  if (ja) throw new ErroRegra('Já há um pedido pendente de aprovação para isto.', 'pendente');
  const [r] = await ctx.tx
    .insert(s.solicitacaoAprovacao)
    .values({ ...p, empresaId: ctx.empresaId, solicitadoPor: ctx.usuarioId })
    .returning({ id: s.solicitacaoAprovacao.id });
  await ctx.auditar({
    acao: 'pedir_aprovacao',
    entidade: p.entidade,
    registroId: p.registroId,
    dados: { tipo: p.tipo, resumo: p.resumo, solicitacao: r!.id },
  });
  return {
    aguardandoAprovacao: true,
    solicitacaoId: r!.id,
    mensagem: 'Pedido enviado para aprovação. A ação é feita quando for aprovada.',
  };
}
