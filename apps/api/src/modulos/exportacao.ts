// Exportação completa dos dados da empresa (P15; ambiente-cliente.md, Configurações › Exportar
// dados): só o Master, inclusive com a empresa bloqueada. O pacote é um ZIP montado durante o
// download: uma planilha CSV por tabela (só as linhas da empresa, pelo RLS) e os anexos.
// Segredos (hashes, tokens, certificados cifrados) nunca saem.
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ZipFile } from 'yazl';
import * as s from '../db/schema';
import { naEmpresa } from '../nucleo/requisicao';

const SEGREDO = /(hash|segredo|cifrad|token)/i;
const NUMERO = /^-?\d+(\.\d+)?$/;

/** CSV como o Excel em português abre (P23): ponto e vírgula e vírgula decimal. */
function celula(v: unknown): string {
  if (v === null || v === undefined) return '';
  const t =
    v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const x = NUMERO.test(t) ? t.replace('.', ',') : t;
  return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
}

function csv(linhas: Array<Record<string, unknown>>): string {
  const colunas = Object.keys(linhas[0] ?? {}).filter((c) => !SEGREDO.test(c));
  return (
    '﻿' +
    [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(';'))].join(
      '\r\n',
    )
  );
}

const LEIA_ME = `Exportação dos dados no ViniCycle

Este pacote tem todos os dados da empresa no momento do download:
- dados/: uma planilha CSV por tabela do sistema (separador ponto e vírgula, vírgula decimal,
  datas e horas no padrão ISO 8601, em UTC). As colunas "id" e "*_id" ligam as planilhas entre si.
- anexos/: os arquivos anexados, numa pasta por tipo de registro e registro. A planilha
  dados/anexo.csv diz a que registro cada arquivo pertence.

Senhas, códigos de acesso e certificados não são exportados.
`;

export async function rotasExportacao(app: FastifyInstance): Promise<void> {
  const { db, armazenamento } = app.deps;

  app.get('/api/exportacao/pacote', async (req, reply) => {
    // Lê tudo na transação da requisição; os anexos vêm do disco depois, em fluxo.
    const pacote = await naEmpresa(
      db,
      req,
      ['gestao.config.exportar_dados', 'exportar'],
      async (ctx) => {
        const tabelas = await ctx.tx.execute<{ tabela: string }>(sql`
          select distinct table_name as tabela from information_schema.columns
          where table_schema = 'public' and column_name = 'empresa_id'
          order by table_name`);
        const planilhas: Array<{ nome: string; conteudo: string }> = [];
        const empresa = await ctx.tx.execute(
          sql`select * from empresa where id = ${ctx.empresaId}`,
        );
        planilhas.push({ nome: 'empresa', conteudo: csv(empresa.rows) });
        for (const { tabela } of tabelas.rows) {
          if (!/^[a-z0-9_]+$/.test(tabela)) continue;
          const r = await ctx.tx.execute(
            sql`select * from ${sql.identifier(tabela)} where empresa_id = ${ctx.empresaId}`,
          );
          if (r.rows.length) planilhas.push({ nome: tabela, conteudo: csv(r.rows) });
        }
        const anexos = await ctx.tx
          .select({
            id: s.anexo.id,
            entidade: s.anexo.entidade,
            registroId: s.anexo.registroId,
            nome: s.anexo.nomeOriginal,
            caminho: s.anexo.caminho,
          })
          .from(s.anexo)
          .where(sql`${s.anexo.empresaId} = ${ctx.empresaId}`);
        const [nome] = (
          await ctx.tx.execute<{ nome: string }>(sql`
            select coalesce(nullif(f.nome_fantasia, ''), f.nome) as nome
            from empresa e join ficha f on f.id = e.ficha_id where e.id = ${ctx.empresaId}`)
        ).rows;
        await ctx.auditar({
          acao: 'exportar',
          entidade: 'empresa',
          registroId: ctx.empresaId,
          dados: { tipo: 'completa', tabelas: planilhas.length, anexos: anexos.length },
        });
        return { planilhas, anexos, nome: nome?.nome ?? 'empresa' };
      },
    );

    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(LEIA_ME), 'LEIA-ME.txt');
    for (const p of pacote.planilhas) zip.addBuffer(Buffer.from(p.conteudo), `dados/${p.nome}.csv`);
    for (const a of pacote.anexos) {
      const arquivo = a.nome.replace(/[\\/:*?"<>|]/g, '_');
      try {
        zip.addReadStream(
          await armazenamento.ler(a.caminho),
          `anexos/${a.entidade}/${a.registroId}/${a.id}-${arquivo}`,
        );
      } catch {
        // Arquivo ausente no disco: o registro continua em dados/anexo.csv.
      }
    }
    zip.end();
    const data = new Date().toISOString().slice(0, 10);
    const base = pacote.nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="vinicycle-${base}-${data}.zip"`)
      .header('Cache-Control', 'no-store');
    return reply.send(zip.outputStream);
  });
}
