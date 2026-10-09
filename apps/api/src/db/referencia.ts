// Dados de referência (P6): o que o sistema precisa para funcionar, em qualquer ambiente.
// Idempotente: pode rodar a cada publicação. Roda com o papel dono do esquema.
// Dados de demonstração ficam em outro script e nunca vão para a produção.
import {
  FORMAS_PAGAMENTO,
  FUNCIONALIDADES,
  MODULOS,
  PERFIS_MODELO,
  gradeDoModelo,
} from '@vinicycle/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { carregarCatalogos } from './dados/carregar-catalogos'
import * as s from './schema'

type Db = NodePgDatabase<typeof s>

export const PERFIL_ADMINISTRADOR = 'ADMINISTRADOR'
export const PLANO_COMPLETO = 'Completo'
/**
 * Primeiro administrador da plataforma (decidido em 03/10/2026). Criado só quando a base não tem
 * nenhum membro da equipe; nasce sem senha, definida por "Esqueci minha senha".
 */
export const ADMIN_INICIAL = { email: 'admin@vinicycle.com', nome: 'Administrador ViniCycle' }

export async function carregarReferencia(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    for (const m of MODULOS) {
      await tx
        .insert(s.modulo)
        .values({
          codigo: m.codigo,
          nome: m.nome,
          funcao: m.funcao,
          situacao: m.situacao,
          ordem: m.ordem,
        })
        .onConflictDoUpdate({
          target: s.modulo.codigo,
          set: { nome: m.nome, funcao: m.funcao, situacao: m.situacao, ordem: m.ordem },
        })
    }
    const modulos = new Map((await tx.select().from(s.modulo)).map((m) => [m.codigo, m.id]))

    const jaExistiam = new Set(
      (await tx.select({ codigo: s.funcionalidade.codigo }).from(s.funcionalidade)).map(
        (f) => f.codigo,
      ),
    )
    for (const f of FUNCIONALIDADES) {
      const valores = {
        codigo: f.codigo,
        nome: f.nome,
        moduloId: f.modulo ? modulos.get(f.modulo)! : null,
        escopo: f.escopo,
        acoes: [...f.acoes],
        somenteMaster: f.somenteMaster ?? false,
        ordem: f.ordem,
      }
      await tx
        .insert(s.funcionalidade)
        .values(valores)
        .onConflictDoUpdate({ target: s.funcionalidade.codigo, set: valores })
    }
    const funcs = new Map((await tx.select().from(s.funcionalidade)).map((f) => [f.codigo, f.id]))

    // Perfis-modelo (P27). A grade só é gravada na criação do modelo: depois, quem a mantém é a
    // Administração.
    // Funcionalidade nova num modelo que já existia: o modelo ganha a grade dela (ex.: o ajuste de
    // inventário, no ciclo 4). Os perfis das empresas, cópias dos modelos, ficam como estão.
    for (const p of PERFIS_MODELO) {
      const [existente] = await tx
        .select({ id: s.perfil.id })
        .from(s.perfil)
        .where(and(eq(s.perfil.escopo, 'modelo'), eq(s.perfil.codigo, p.codigo)))
      if (existente) {
        if (p.codigo === 'MASTER' || !jaExistiam.size) continue
        const novas = gradeDoModelo(p.codigo).filter((g) => !jaExistiam.has(g.funcionalidade))
        if (novas.length) {
          await tx
            .insert(s.perfilPermissao)
            .values(
              novas.map((g) => ({
                perfilId: existente.id,
                funcionalidadeId: funcs.get(g.funcionalidade)!,
                acao: g.acao,
              })),
            )
            .onConflictDoNothing()
        }
        continue
      }
      const [novo] = await tx
        .insert(s.perfil)
        .values({ escopo: 'modelo', codigo: p.codigo, nome: p.nome, eMaster: p.eMaster })
        .returning({ id: s.perfil.id })
      if (p.codigo === 'MASTER') continue
      const grade = gradeDoModelo(p.codigo)
      if (grade.length) {
        await tx.insert(s.perfilPermissao).values(
          grade.map((g) => ({
            perfilId: novo!.id,
            funcionalidadeId: funcs.get(g.funcionalidade)!,
            acao: g.acao,
          })),
        )
      }
    }

    // Administrador da plataforma: todas as ações de todas as funcionalidades da plataforma.
    let [admin] = await tx
      .select({ id: s.perfil.id })
      .from(s.perfil)
      .where(and(eq(s.perfil.escopo, 'plataforma'), eq(s.perfil.codigo, PERFIL_ADMINISTRADOR)))
    if (!admin) {
      ;[admin] = await tx
        .insert(s.perfil)
        .values({ escopo: 'plataforma', codigo: PERFIL_ADMINISTRADOR, nome: 'Administrador' })
        .returning({ id: s.perfil.id })
    }
    const permissoesAdmin = FUNCIONALIDADES.filter((f) => f.escopo === 'plataforma').flatMap((f) =>
      f.acoes.map((acao) => ({
        perfilId: admin!.id,
        funcionalidadeId: funcs.get(f.codigo)!,
        acao,
      })),
    )
    await tx.insert(s.perfilPermissao).values(permissoesAdmin).onConflictDoNothing()

    // Plano inicial. Planos e preços são mantidos pela Administração (parte comercial, 2027).
    let [plano] = await tx
      .select({ id: s.plano.id })
      .from(s.plano)
      .where(eq(s.plano.nome, PLANO_COMPLETO))
    if (!plano) {
      ;[plano] = await tx
        .insert(s.plano)
        .values({
          nome: PLANO_COMPLETO,
          descricao: 'Gestão e EnoTrace, sem limites.',
          formasPagamento: [...FORMAS_PAGAMENTO],
        })
        .returning({ id: s.plano.id })
      await tx
        .insert(s.planoModulo)
        .values(
          ['GESTAO', 'ENOTRACE'].map((c) => ({ planoId: plano!.id, moduloId: modulos.get(c)! })),
        )
    }

    await tx.insert(s.configPlataforma).values({ id: true }).onConflictDoNothing()

    await carregarCatalogos(tx)

    const [algumMembro] = await tx.select({ id: s.equipeMembro.id }).from(s.equipeMembro).limit(1)
    if (!algumMembro) {
      const [ficha] = await tx
        .insert(s.ficha)
        .values({ dono: 'usuario', tipoPessoa: 'fisica', nome: ADMIN_INICIAL.nome })
        .returning({ id: s.ficha.id })
      const [usuario] = await tx
        .insert(s.usuario)
        .values({ email: ADMIN_INICIAL.email, fichaId: ficha!.id })
        .returning({ id: s.usuario.id })
      await tx.insert(s.equipeMembro).values({ usuarioId: usuario!.id, perfilId: admin!.id })
    }

    // Termos de uso e política de privacidade (P21). Rascunho até o texto definitivo.
    const termos = await tx
      .select({ tipo: s.termoVersao.tipo })
      .from(s.termoVersao)
      .where(inArray(s.termoVersao.tipo, ['termos_uso', 'privacidade']))
    const tipos = new Set(termos.map((t) => t.tipo))
    const rascunhos = [
      {
        tipo: 'termos_uso' as const,
        texto:
          'Termos de uso do ViniCycle (rascunho). O texto definitivo será publicado antes do início do uso.',
      },
      {
        tipo: 'privacidade' as const,
        texto:
          'Política de privacidade do ViniCycle (rascunho). Cookies: a aplicação usa só cookies estritamente necessários, como o de sessão (LGPD, arts. 6º, 9º e 10; Guia orientativo de cookies da ANPD, 2022).',
      },
    ]
    for (const r of rascunhos) {
      if (tipos.has(r.tipo)) continue
      await tx
        .insert(s.termoVersao)
        .values({ tipo: r.tipo, versao: '0-rascunho', texto: r.texto, vigenteDesde: sql`now()` })
    }
  })
}
