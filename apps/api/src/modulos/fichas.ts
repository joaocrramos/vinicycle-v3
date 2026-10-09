// Ficha cadastral (P2): gravação e leitura num só lugar, para empresa, estabelecimento,
// pessoa e usuário.
import { type Ficha, tipoDocumentoDaPessoa } from '@vinicycle/shared'
import { asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '../db/cliente'
import { ficha, fichaContato, fichaEndereco } from '../db/schema'
import type { DONOS_FICHA } from '../db/schema/ficha'
import { ErroNaoEncontrado, ErroRegra } from '../nucleo/erros'

export type FichaCompleta = Ficha & { id: string }

function valoresFicha(d: Ficha) {
  return {
    tipoPessoa: d.tipoPessoa,
    nome: d.nome,
    nomeFantasia: d.nomeFantasia ?? null,
    tipoDocumento: d.documento ? tipoDocumentoDaPessoa(d.tipoPessoa) : null,
    documento: d.documento ?? null,
    pais: d.tipoPessoa === 'estrangeira' ? (d.pais ?? null) : null,
    inscricaoEstadual:
      d.inscricaoEstadual?.toUpperCase() === 'ISENTO' ? 'ISENTO' : (d.inscricaoEstadual ?? null),
    inscricaoMunicipal:
      d.inscricaoMunicipal?.toUpperCase() === 'ISENTO' ? 'ISENTO' : (d.inscricaoMunicipal ?? null),
    site: d.site ?? null,
    observacoes: d.observacoes ?? null,
    avatarCor: d.avatarCor ?? null,
  }
}

/** Traduz a violação de documento único numa mensagem para a tela. */
function tratarDuplicidade(e: unknown): never {
  const c = (e as { cause?: { constraint?: string }; constraint?: string }) ?? {}
  const restricao = c.constraint ?? c.cause?.constraint
  if (restricao === 'ficha_documento_empresa') {
    throw new ErroRegra('Já existe um cliente com este documento.', 'documento_duplicado')
  }
  if (restricao === 'ficha_documento_na_empresa') {
    throw new ErroRegra('Este documento já está cadastrado nesta empresa.', 'documento_duplicado')
  }
  throw e
}

export async function criarFicha(
  tx: Tx,
  d: Ficha,
  dono: (typeof DONOS_FICHA)[number],
  empresaId: string | null,
  usuarioId: string | null,
): Promise<string> {
  const [f] = await tx
    .insert(ficha)
    .values({ ...valoresFicha(d), dono, empresaId, criadoPor: usuarioId, atualizadoPor: usuarioId })
    .returning({ id: ficha.id })
    .catch(tratarDuplicidade)
  await gravarFilhos(tx, f!.id, d)
  return f!.id
}

export async function atualizarFicha(
  tx: Tx,
  id: string,
  d: Ficha,
  usuarioId: string | null,
): Promise<void> {
  await tx
    .update(ficha)
    .set({
      ...valoresFicha(d),
      atualizadoEm: sql`now()`,
      atualizadoPor: usuarioId,
      versao: sql`${ficha.versao} + 1`,
    })
    .where(eq(ficha.id, id))
    .catch(tratarDuplicidade)
  await gravarFilhos(tx, id, d)
}

async function gravarFilhos(tx: Tx, fichaId: string, d: Ficha): Promise<void> {
  // Endereços e contatos são substituídos por inteiro; a auditoria guarda o antes e o depois.
  await tx.delete(fichaEndereco).where(eq(fichaEndereco.fichaId, fichaId))
  await tx.delete(fichaContato).where(eq(fichaContato.fichaId, fichaId))
  const enderecos = d.enderecos.map((e, i) => ({
    fichaId,
    rotulo: e.rotulo,
    cep: e.cep,
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento ?? null,
    bairro: e.bairro,
    municipio: e.municipio,
    codigoIbge: e.codigoIbge ?? null,
    uf: e.uf,
    // Com um só endereço, ele é o principal.
    principal:
      e.principal || (d.enderecos.length > 0 && !d.enderecos.some((x) => x.principal) && i === 0),
  }))
  if (enderecos.length) await tx.insert(fichaEndereco).values(enderecos)
  const primeiroEmail = d.contatos.findIndex((c) => c.tipo === 'email')
  const temPrincipal = d.contatos.some((c) => c.tipo === 'email' && c.principal)
  const contatos = d.contatos.map((c, i) => ({
    fichaId,
    tipo: c.tipo,
    rotulo: c.rotulo,
    valor: c.valor,
    whatsapp: c.tipo === 'telefone' ? c.whatsapp : false,
    rede: c.tipo === 'rede' ? (c.rede ?? null) : null,
    principal:
      c.tipo === 'email' ? c.principal || (!temPrincipal && i === primeiroEmail) : c.principal,
  }))
  if (contatos.length) await tx.insert(fichaContato).values(contatos)
}

export async function lerFicha(tx: Tx, id: string): Promise<FichaCompleta> {
  const [f] = await tx.select().from(ficha).where(eq(ficha.id, id))
  if (!f) throw new ErroNaoEncontrado('Ficha cadastral não encontrada.')
  const enderecos = await tx
    .select()
    .from(fichaEndereco)
    .where(eq(fichaEndereco.fichaId, id))
    .orderBy(asc(fichaEndereco.rotulo))
  const contatos = await tx
    .select()
    .from(fichaContato)
    .where(eq(fichaContato.fichaId, id))
    .orderBy(asc(fichaContato.tipo))
  return {
    id: f.id,
    tipoPessoa: f.tipoPessoa,
    nome: f.nome,
    nomeFantasia: f.nomeFantasia,
    documento: f.documento,
    pais: f.pais,
    inscricaoEstadual: f.inscricaoEstadual,
    inscricaoMunicipal: f.inscricaoMunicipal,
    site: f.site,
    observacoes: f.observacoes,
    avatarCor: f.avatarCor,
    enderecos: enderecos.map((e) => ({
      id: e.id,
      rotulo: e.rotulo as Ficha['enderecos'][number]['rotulo'],
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      municipio: e.municipio,
      codigoIbge: e.codigoIbge,
      uf: e.uf as Ficha['enderecos'][number]['uf'],
      principal: e.principal,
    })),
    contatos: contatos.map((c) => ({
      id: c.id,
      tipo: c.tipo as Ficha['contatos'][number]['tipo'],
      rotulo: c.rotulo,
      valor: c.valor,
      whatsapp: c.whatsapp,
      rede: c.rede as Ficha['contatos'][number]['rede'],
      principal: c.principal,
    })),
  }
}

/** Versão resumida para a auditoria (sem os identificadores dos filhos). */
export function resumoFicha(f: Ficha | FichaCompleta): Record<string, unknown> {
  const { enderecos, contatos, ...resto } = f as FichaCompleta
  return {
    ...resto,
    id: undefined,
    enderecos: enderecos.map(({ id: _id, ...e }) => e),
    contatos: contatos.map(({ id: _id, ...c }) => c),
  }
}
