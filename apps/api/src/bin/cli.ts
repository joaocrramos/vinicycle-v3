// Linha de comando de manutenção.
//   pnpm cli criar-admin <email> <nome>   cria (ou promove) um membro da equipe da plataforma com o
//                                         perfil Administrador e envia o link para definir a senha.
// Roda com o papel da API (DATABASE_URL) no contexto da plataforma, e fica na auditoria.
import { email as esquemaEmail } from '@vinicycle/shared';
import { and, eq, sql } from 'drizzle-orm';
import { lerConfig } from '../config';
import { criarBanco, emContexto } from '../db/cliente';
import * as s from '../db/schema';
import { PERFIL_ADMINISTRADOR } from '../db/referencia';
import { auditar } from '../nucleo/auditoria';
import { enfileirarEmail } from '../nucleo/email';
import { emailDefinirSenhaEquipe } from '../nucleo/modelos-email';
import { gerarToken } from '../nucleo/seguranca';
import { criarFicha } from '../modulos/fichas';

const [comando, ...args] = process.argv.slice(2);
const config = lerConfig();
const { pool, db } = criarBanco(config.DATABASE_URL, 1);

async function criarAdmin(emailBruto: string | undefined, nome: string | undefined) {
  const email = esquemaEmail.parse(emailBruto ?? '');
  if (!nome) throw new Error('Informe o nome: pnpm cli criar-admin <email> "<nome>"');
  await emContexto(db, { plataforma: true, autenticacao: true }, async (tx) => {
    const [perfil] = await tx
      .select({ id: s.perfil.id })
      .from(s.perfil)
      .where(and(eq(s.perfil.escopo, 'plataforma'), eq(s.perfil.codigo, PERFIL_ADMINISTRADOR)));
    if (!perfil) throw new Error('Perfil Administrador ausente: rode os dados de referência.');
    let [u] = await tx
      .select({ id: s.usuario.id })
      .from(s.usuario)
      .where(eq(sql`lower(${s.usuario.email})`, email));
    if (!u) {
      const fichaId = await criarFicha(
        tx,
        { tipoPessoa: 'fisica', nome, documento: null, enderecos: [], contatos: [] },
        'usuario',
        null,
        null,
      );
      [u] = await tx.insert(s.usuario).values({ email, fichaId }).returning({ id: s.usuario.id });
    }
    await tx
      .insert(s.equipeMembro)
      .values({ usuarioId: u!.id, perfilId: perfil.id })
      .onConflictDoUpdate({
        target: s.equipeMembro.usuarioId,
        set: { perfilId: perfil.id, ativo: true },
      });
    const { token, hash } = gerarToken();
    await tx.insert(s.tokenVerificacao).values({
      usuarioId: u!.id,
      email,
      tipo: 'redefinir_senha',
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600 * 1000),
    });
    const link = `${config.URL_APLICACAO}/redefinir-senha?token=${token}`;
    await enfileirarEmail(tx, {
      ...emailDefinirSenhaEquipe({ para: email, link }),
      modelo: 'definir_senha_equipe',
      origem: 'equipe',
      origemId: u!.id,
    });
    await auditar(
      tx,
      { usuarioId: null, empresaId: null, navegador: 'cli' },
      {
        acao: 'conceder_equipe',
        entidade: 'usuario',
        registroId: u!.id,
        dados: { perfil: PERFIL_ADMINISTRADOR, email },
      },
    );
    console.log(`Administrador ${email} pronto. Link para definir a senha (vale 1 hora):\n${link}`);
  });
}

try {
  if (comando === 'criar-admin') await criarAdmin(args[0], args[1]);
  else console.log('Comandos: criar-admin <email> "<nome>"');
} finally {
  await pool.end();
}
