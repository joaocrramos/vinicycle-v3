// Configurações › Empresa (ambiente-cliente.md). O Master atualiza os dados; o documento só é
// trocado pelo suporte, porque identifica o contrato.
import { dadosEmpresa } from '@vinicycle/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import * as s from '../db/schema';
import { conferirVersao } from '../nucleo/entidades';
import { ErroRegra } from '../nucleo/erros';
import { naEmpresa } from '../nucleo/requisicao';
import { atualizarFicha, lerFicha, resumoFicha } from './fichas';

export async function rotasEmpresa(app: FastifyInstance): Promise<void> {
  const { db } = app.deps;

  app.get('/api/empresa', async (req) =>
    naEmpresa(db, req, ['gestao.config.empresa', 'visualizar'], async ({ tx, empresaId }) => {
      const [e] = await tx.select().from(s.empresa).where(eq(s.empresa.id, empresaId));
      return {
        id: e!.id,
        situacao: e!.situacao,
        corMarca: e!.corMarca,
        contatoFinanceiroNome: e!.contatoFinanceiroNome,
        contatoFinanceiroEmail: e!.contatoFinanceiroEmail,
        contatoFinanceiroTelefone: e!.contatoFinanceiroTelefone,
        regimeTributario: e!.regimeTributario,
        versao: e!.versao,
        ficha: await lerFicha(tx, e!.fichaId),
      };
    }),
  );

  app.put('/api/empresa', async (req) =>
    naEmpresa(
      db,
      req,
      ['gestao.config.empresa', 'editar'],
      async ({ tx, empresaId, usuarioId, auditar }) => {
        const d = dadosEmpresa.parse(req.body);
        const [e] = await tx.select().from(s.empresa).where(eq(s.empresa.id, empresaId));
        conferirVersao(e!.versao, d.versao);
        const antes = await lerFicha(tx, e!.fichaId);
        if (antes.documento !== d.ficha.documento || antes.tipoPessoa !== d.ficha.tipoPessoa) {
          throw new ErroRegra(
            'O documento da empresa identifica o contrato e só pode ser trocado pelo suporte.',
            'documento_bloqueado',
          );
        }
        await atualizarFicha(tx, e!.fichaId, d.ficha, usuarioId);
        const depois = {
          corMarca: d.corMarca ?? null,
          contatoFinanceiroNome: d.contatoFinanceiroNome ?? null,
          contatoFinanceiroEmail: d.contatoFinanceiroEmail ?? null,
          contatoFinanceiroTelefone: d.contatoFinanceiroTelefone ?? null,
          regimeTributario: d.regimeTributario ?? null,
        };
        await tx
          .update(s.empresa)
          .set({
            ...depois,
            atualizadoEm: sql`now()`,
            atualizadoPor: usuarioId,
            versao: sql`${s.empresa.versao} + 1`,
          })
          .where(eq(s.empresa.id, empresaId));
        await auditar({
          acao: 'editar',
          entidade: 'empresa',
          registroId: empresaId,
          antes: {
            ...resumoFicha(antes),
            corMarca: e!.corMarca,
            contatoFinanceiroNome: e!.contatoFinanceiroNome,
            contatoFinanceiroEmail: e!.contatoFinanceiroEmail,
            contatoFinanceiroTelefone: e!.contatoFinanceiroTelefone,
            regimeTributario: e!.regimeTributario,
          },
          depois: { ...resumoFicha(d.ficha), ...depois },
        });
        return { ok: true };
      },
    ),
  );
}
