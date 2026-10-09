// Bloco cadastral padrão (P2): os mesmos campos, máscaras e validações em todo cadastro de
// pessoa ou empresa.
import { cnpjValido, REDES, ROTULOS_ENDERECO, UFS } from '@vinicycle/shared'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { Formulario } from '@/lib/formulario'
import { CampoCep, CampoDocumento, CampoTelefone } from './campos-especiais'
import { Botao } from './ui/botao'
import { Aviso } from './ui/cartao'
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from './ui/campos'

const NOMES_ROTULO: Record<(typeof ROTULOS_ENDERECO)[number], string> = {
  principal: 'Principal',
  cobranca: 'Cobrança',
  entrega: 'Entrega',
  propriedade_rural: 'Propriedade rural',
}
const NOMES_REDE: Record<(typeof REDES)[number], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  outra: 'Outra',
}

interface Endereco {
  rotulo: string
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro?: string
  municipio: string
  codigoIbge?: string | null
  uf: string
  principal?: boolean
}
interface Contato {
  tipo: 'email' | 'telefone' | 'rede'
  rotulo?: string
  valor: string
  whatsapp?: boolean
  rede?: string | null
  principal?: boolean
}

interface EnderecoConsultado {
  cep: string
  logradouro: string
  bairro: string
  municipio: string
  uf: string
  codigoIbge: string | null
  numero?: string
  complemento?: string
}

interface DadosCnpj {
  nome: string
  nomeFantasia: string | null
  situacaoCadastral: string | null
  endereco: EnderecoConsultado | null
  email: string | null
  telefone: string | null
  fonte: string
}

export const FICHA_VAZIA_PJ = {
  tipoPessoa: 'juridica' as const,
  nome: '',
  nomeFantasia: '',
  documento: '',
  inscricaoEstadual: '',
  inscricaoMunicipal: '',
  site: '',
  observacoes: '',
  enderecos: [] as Endereco[],
  contatos: [] as Contato[],
}

export const FICHA_VAZIA_PF = { ...FICHA_VAZIA_PJ, tipoPessoa: 'fisica' as const }

export function FichaCadastral({
  form,
  prefixo = 'ficha',
  documentoBloqueado,
  documentoObrigatorio,
  tiposPermitidos = ['juridica', 'fisica'],
  simples,
}: {
  form: Formulario
  prefixo?: string
  /** O documento da empresa só é trocado pelo suporte. */
  documentoBloqueado?: boolean
  documentoObrigatorio?: boolean
  tiposPermitidos?: Array<'juridica' | 'fisica' | 'estrangeira'>
  /** Pessoa física sem inscrições (ficha do usuário). */
  simples?: boolean
}) {
  const c = (campo: string) => (prefixo ? `${prefixo}.${campo}` : campo)
  const tipo = form.valor(c('tipoPessoa')) as 'juridica' | 'fisica' | 'estrangeira'
  const pj = tipo === 'juridica'
  const enderecos = (form.valor(c('enderecos')) as Endereco[] | undefined) ?? []
  const contatos = (form.valor(c('contatos')) as Contato[] | undefined) ?? []
  const [consulta, setConsulta] = useState<{ tom: 'info' | 'alerta'; texto: string } | null>(null)
  const [buscando, setBuscando] = useState(false)
  const documento = (form.valor(c('documento')) as string | null) ?? ''

  // Busca de CEP (P2): preenche o endereço; o usuário completa número e complemento.
  async function buscarCep(i: number, cep: string) {
    try {
      const r = await api.get<EnderecoConsultado & { encontrado: boolean; fonte?: string }>(
        `/api/consultas/cep/${cep}`,
      )
      if (!r.encontrado)
        return setConsulta({
          tom: 'alerta',
          texto: 'CEP não encontrado. Preencha o endereço à mão.',
        })
      const base = `enderecos.${i}`
      form.definir(c(`${base}.logradouro`), r.logradouro)
      form.definir(c(`${base}.bairro`), r.bairro)
      form.definir(c(`${base}.municipio`), r.municipio)
      form.definir(c(`${base}.uf`), r.uf)
      form.definir(c(`${base}.codigoIbge`), r.codigoIbge)
      setConsulta({
        tom: 'info',
        texto: `Endereço preenchido pelo CEP (${r.fonte}). Complete o número e confira.`,
      })
    } catch {
      setConsulta({
        tom: 'alerta',
        texto: 'A busca de CEP não respondeu. Preencha o endereço à mão.',
      })
    }
  }

  // Busca de CNPJ (P2, decidido em 03/10/2026): pré-preenche com os dados públicos da Receita.
  async function buscarCnpj() {
    setBuscando(true)
    try {
      const r = await api.get<DadosCnpj & { encontrado: boolean }>(
        `/api/consultas/cnpj/${documento}`,
      )
      if (!r.encontrado)
        return setConsulta({
          tom: 'alerta',
          texto: 'CNPJ não encontrado nos serviços públicos. Preencha à mão.',
        })
      if (!form.valor(c('nome'))) form.definir(c('nome'), r.nome)
      if (!form.valor(c('nomeFantasia')) && r.nomeFantasia)
        form.definir(c('nomeFantasia'), r.nomeFantasia)
      if (r.endereco && !enderecos.length) {
        form.definir(c('enderecos'), [
          {
            rotulo: 'principal',
            cep: r.endereco.cep,
            logradouro: r.endereco.logradouro,
            numero: r.endereco.numero || 'S/N',
            complemento: r.endereco.complemento ?? '',
            bairro: r.endereco.bairro,
            municipio: r.endereco.municipio,
            codigoIbge: r.endereco.codigoIbge,
            uf: r.endereco.uf,
            principal: true,
          },
        ])
      }
      const novos: Contato[] = []
      if (r.email && !contatos.some((x) => x.tipo === 'email')) {
        novos.push({ tipo: 'email', valor: r.email, rotulo: '', principal: true })
      }
      if (r.telefone && !contatos.some((x) => x.tipo === 'telefone')) {
        novos.push({ tipo: 'telefone', valor: `+55${r.telefone}`, rotulo: '' })
      }
      if (novos.length) form.definir(c('contatos'), [...contatos, ...novos])
      const situacao = r.situacaoCadastral ? ` Situação na Receita: ${r.situacaoCadastral}.` : ''
      setConsulta({
        tom: r.situacaoCadastral && !/ativ/i.test(r.situacaoCadastral) ? 'alerta' : 'info',
        texto: `Dados de ${r.fonte}.${situacao} Os campos já preenchidos foram mantidos; confira antes de salvar.`,
      })
    } catch {
      setConsulta({ tom: 'alerta', texto: 'A busca de CNPJ não respondeu. Preencha à mão.' })
    } finally {
      setBuscando(false)
    }
  }

  const texto = (campo: string) => ({
    id: c(campo),
    value: (form.valor(c(campo)) as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => form.definir(c(campo), e.target.value),
    onBlur: () => form.tocar(c(campo)),
    'aria-invalid': !!form.erro(c(campo)),
  })

  return (
    <div className="flex flex-col gap-6">
      {consulta && <Aviso tom={consulta.tom}>{consulta.texto}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        {tiposPermitidos.length > 1 && (
          <Campo rotulo="Tipo" id={c('tipoPessoa')} obrigatorio>
            <Selecao
              id={c('tipoPessoa')}
              value={tipo}
              disabled={documentoBloqueado}
              onChange={(e) => {
                form.definir(c('tipoPessoa'), e.target.value)
                form.definir(c('documento'), '')
              }}
            >
              {tiposPermitidos.includes('juridica') && (
                <option value="juridica">Pessoa jurídica</option>
              )}
              {tiposPermitidos.includes('fisica') && <option value="fisica">Pessoa física</option>}
              {tiposPermitidos.includes('estrangeira') && (
                <option value="estrangeira">Estrangeira</option>
              )}
            </Selecao>
          </Campo>
        )}
        <Campo
          rotulo={pj ? 'Razão social' : 'Nome'}
          erro={form.erro(c('nome'))}
          id={c('nome')}
          obrigatorio
        >
          <Entrada autoComplete={pj ? 'organization' : 'name'} {...texto('nome')} />
        </Campo>
        <Campo
          rotulo={pj ? 'Nome fantasia' : 'Apelido'}
          erro={form.erro(c('nomeFantasia'))}
          id={c('nomeFantasia')}
        >
          <Entrada {...texto('nomeFantasia')} />
        </Campo>
        {tipo !== 'estrangeira' ? (
          <Campo
            rotulo={pj ? 'CNPJ' : 'CPF'}
            erro={form.erro(c('documento'))}
            id={c('documento')}
            obrigatorio={documentoObrigatorio}
            ajuda={
              documentoBloqueado
                ? 'O documento identifica o contrato; só o suporte pode trocá-lo.'
                : undefined
            }
          >
            <CampoDocumento
              id={c('documento')}
              tipo={pj ? 'cnpj' : 'cpf'}
              valor={form.valor(c('documento')) as string}
              aoMudar={(v) => form.definir(c('documento'), v)}
              onBlur={() => form.tocar(c('documento'))}
              disabled={documentoBloqueado}
              aria-invalid={!!form.erro(c('documento'))}
            />
            {pj && !documentoBloqueado && cnpjValido(documento) && (
              <Botao
                variante="link"
                tamanho="pequeno"
                className="self-start px-0"
                disabled={buscando}
                onClick={() => void buscarCnpj()}
              >
                <Search /> {buscando ? 'Buscando…' : 'Buscar dados públicos do CNPJ'}
              </Botao>
            )}
          </Campo>
        ) : (
          <>
            <Campo rotulo="Documento do país" erro={form.erro(c('documento'))} id={c('documento')}>
              <Entrada {...texto('documento')} />
            </Campo>
            <Campo rotulo="País (sigla)" erro={form.erro(c('pais'))} id={c('pais')} obrigatorio>
              <Entrada maxLength={2} placeholder="AR" {...texto('pais')} />
            </Campo>
          </>
        )}
        {pj && !simples && (
          <>
            <Campo
              rotulo="Inscrição estadual"
              id={c('inscricaoEstadual')}
              ajuda='Número ou "Isento"'
            >
              <Entrada placeholder="Isento" {...texto('inscricaoEstadual')} />
            </Campo>
            <Campo
              rotulo="Inscrição municipal"
              id={c('inscricaoMunicipal')}
              ajuda='Número ou "Isento"'
            >
              <Entrada placeholder="Isento" {...texto('inscricaoMunicipal')} />
            </Campo>
          </>
        )}
        {!simples && (
          <Campo rotulo="Site" erro={form.erro(c('site'))} id={c('site')}>
            <Entrada type="url" placeholder="https://www.exemplo.com.br" {...texto('site')} />
          </Campo>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Contatos</legend>
        {contatos.map((ct, i) => {
          const base = `contatos.${i}`
          return (
            <div
              key={i}
              className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-[9rem_1fr_9rem_auto]"
            >
              <Campo rotulo="Tipo" id={c(`${base}.tipo`)}>
                <Selecao
                  id={c(`${base}.tipo`)}
                  value={ct.tipo}
                  onChange={(e) =>
                    form.definir(c(base), {
                      tipo: e.target.value,
                      valor: '',
                      rotulo: ct.rotulo ?? '',
                    })
                  }
                >
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="rede">Rede social</option>
                </Selecao>
              </Campo>
              <Campo
                rotulo={
                  ct.tipo === 'email'
                    ? 'E-mail'
                    : ct.tipo === 'telefone'
                      ? 'Número'
                      : 'Usuário ou endereço'
                }
                erro={form.erro(c(`${base}.valor`))}
                id={c(`${base}.valor`)}
              >
                {ct.tipo === 'telefone' ? (
                  <CampoTelefone
                    id={c(`${base}.valor`)}
                    valor={ct.valor}
                    aoMudar={(v) => form.definir(c(`${base}.valor`), v)}
                    onBlur={() => form.tocar(c(`${base}.valor`))}
                  />
                ) : (
                  <Entrada
                    id={c(`${base}.valor`)}
                    type={ct.tipo === 'email' ? 'email' : 'text'}
                    placeholder={ct.tipo === 'email' ? 'nome@exemplo.com.br' : '@usuario'}
                    value={ct.valor}
                    onChange={(e) => form.definir(c(`${base}.valor`), e.target.value)}
                    onBlur={() => form.tocar(c(`${base}.valor`))}
                  />
                )}
              </Campo>
              {ct.tipo === 'rede' ? (
                <Campo rotulo="Rede" erro={form.erro(c(`${base}.rede`))} id={c(`${base}.rede`)}>
                  <Selecao
                    id={c(`${base}.rede`)}
                    value={ct.rede ?? ''}
                    onChange={(e) => form.definir(c(`${base}.rede`), e.target.value || null)}
                  >
                    <option value="">Escolha</option>
                    {REDES.map((r) => (
                      <option key={r} value={r}>
                        {NOMES_REDE[r]}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              ) : (
                <Campo rotulo="Rótulo" id={c(`${base}.rotulo`)}>
                  <Entrada
                    id={c(`${base}.rotulo`)}
                    placeholder={ct.tipo === 'email' ? 'financeiro, técnico…' : 'celular, cantina…'}
                    value={ct.rotulo ?? ''}
                    onChange={(e) => form.definir(c(`${base}.rotulo`), e.target.value)}
                  />
                </Campo>
              )}
              <div className="flex items-center gap-3 pb-2">
                {ct.tipo === 'telefone' && (
                  <Caixa
                    rotulo="WhatsApp"
                    checked={!!ct.whatsapp}
                    onChange={(e) => form.definir(c(`${base}.whatsapp`), e.target.checked)}
                  />
                )}
                {ct.tipo === 'email' && (
                  <Caixa
                    rotulo="Principal"
                    checked={!!ct.principal}
                    onChange={(e) =>
                      form.definir(
                        c('contatos'),
                        contatos.map((x, j) =>
                          x.tipo === 'email' ? { ...x, principal: j === i && e.target.checked } : x,
                        ),
                      )
                    }
                  />
                )}
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover contato"
                  onClick={() =>
                    form.definir(
                      c('contatos'),
                      contatos.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 />
                </Botao>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-2">
          {(['email', 'telefone', 'rede'] as const).map((tipoContato) => (
            <Botao
              key={tipoContato}
              variante="secundario"
              tamanho="pequeno"
              onClick={() =>
                form.definir(c('contatos'), [
                  ...contatos,
                  {
                    tipo: tipoContato,
                    valor: '',
                    rotulo: '',
                    principal: tipoContato === 'email' && !contatos.some((x) => x.tipo === 'email'),
                  },
                ])
              }
            >
              <Plus />{' '}
              {tipoContato === 'email'
                ? 'E-mail'
                : tipoContato === 'telefone'
                  ? 'Telefone'
                  : 'Rede social'}
            </Botao>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">Endereços</legend>
        {enderecos.map((en, i) => {
          const base = `enderecos.${i}`
          const campoTexto = (
            campo: keyof Endereco,
            rotulo: string,
            extra: { obrigatorio?: boolean; className?: string } = {},
          ) => (
            <Campo
              rotulo={rotulo}
              erro={form.erro(c(`${base}.${campo}`))}
              id={c(`${base}.${campo}`)}
              obrigatorio={extra.obrigatorio}
              className={extra.className}
            >
              <Entrada
                id={c(`${base}.${campo}`)}
                value={(en[campo] as string | null | undefined) ?? ''}
                onChange={(e) => form.definir(c(`${base}.${campo}`), e.target.value)}
                onBlur={() => form.tocar(c(`${base}.${campo}`))}
              />
            </Campo>
          )
          return (
            <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-6">
              <Campo rotulo="Tipo" id={c(`${base}.rotulo`)} className="sm:col-span-2">
                <Selecao
                  id={c(`${base}.rotulo`)}
                  value={en.rotulo}
                  onChange={(e) => form.definir(c(`${base}.rotulo`), e.target.value)}
                >
                  {ROTULOS_ENDERECO.map((r) => (
                    <option key={r} value={r}>
                      {NOMES_ROTULO[r]}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo
                rotulo="CEP"
                erro={form.erro(c(`${base}.cep`))}
                id={c(`${base}.cep`)}
                obrigatorio
                className="sm:col-span-2"
                ajuda="Com os 8 dígitos, o endereço é preenchido."
              >
                <CampoCep
                  id={c(`${base}.cep`)}
                  valor={en.cep}
                  aoMudar={(v) => {
                    form.definir(c(`${base}.cep`), v)
                    if (v.length === 8 && v !== en.cep) void buscarCep(i, v)
                  }}
                  onBlur={() => form.tocar(c(`${base}.cep`))}
                />
              </Campo>
              <div className="flex items-end justify-end gap-3 pb-2 sm:col-span-2">
                <Caixa
                  rotulo="Principal"
                  checked={!!en.principal}
                  onChange={(e) =>
                    form.definir(
                      c('enderecos'),
                      enderecos.map((x, j) => ({ ...x, principal: j === i && e.target.checked })),
                    )
                  }
                />
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label="Remover endereço"
                  onClick={() =>
                    form.definir(
                      c('enderecos'),
                      enderecos.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 />
                </Botao>
              </div>
              {campoTexto('logradouro', 'Logradouro', {
                obrigatorio: true,
                className: 'sm:col-span-4',
              })}
              {campoTexto('numero', 'Número', { obrigatorio: true, className: 'sm:col-span-2' })}
              {campoTexto('complemento', 'Complemento', { className: 'sm:col-span-2' })}
              {campoTexto('bairro', 'Bairro', { className: 'sm:col-span-2' })}
              {campoTexto('municipio', 'Município', {
                obrigatorio: true,
                className: 'sm:col-span-2',
              })}
              <Campo
                rotulo="UF"
                erro={form.erro(c(`${base}.uf`))}
                id={c(`${base}.uf`)}
                obrigatorio
                className="sm:col-span-2"
              >
                <Selecao
                  id={c(`${base}.uf`)}
                  value={en.uf}
                  onChange={(e) => form.definir(c(`${base}.uf`), e.target.value)}
                >
                  <option value="">Escolha</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              {campoTexto('codigoIbge', 'Código IBGE do município', { className: 'sm:col-span-2' })}
            </div>
          )
        })}
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() =>
              form.definir(c('enderecos'), [
                ...enderecos,
                {
                  rotulo: enderecos.length ? 'entrega' : 'principal',
                  cep: '',
                  logradouro: '',
                  numero: '',
                  complemento: '',
                  bairro: '',
                  municipio: '',
                  codigoIbge: null,
                  uf: '',
                  principal: !enderecos.length,
                },
              ])
            }
          >
            <Plus /> Endereço
          </Botao>
        </div>
      </fieldset>

      {!simples && (
        <Campo rotulo="Observações" id={c('observacoes')}>
          <AreaTexto {...texto('observacoes')} />
        </Campo>
      )}
    </div>
  )
}
