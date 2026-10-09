// EnoTrace › Declarações (cantina.md, Declarações e fechamento; 04, roteiro do ciclo 7):
// - declaração anual de produção e estoques ao MAPA (Portaria MAPA 615/2023): os números do ano, a
//   granel e engarrafado, com o vinho de terceiros separado; entregue, guarda o protocolo e trava o
//   ano; mudanças só por retificação;
// - apoio ao SIVIBE (IN MAPA 59/2020): uva própria, comprada e de terceiros do ano.
// Cada tabela sai em CSV; a página se imprime pelo navegador.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal, NOMES_SITUACAO_SIVIBE, ORIGENS_UVA_REMESSA } from '@vinicycle/shared'
import { Download, Printer } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Anexos } from '@/componentes/Anexos'
import { PedirMotivo } from '@/componentes/PedirMotivo'
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { api, ErroApi } from '@/lib/api'
import { baixarCsv, type CelulaCsv } from '@/lib/csv'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'

type Tipo = 'anual_mapa' | 'sivibe'
type Colunas = Record<
  | 'inicial'
  | 'producao'
  | 'entradas'
  | 'engarrafado'
  | 'saidas'
  | 'perdas'
  | 'ajustes'
  | 'internos'
  | 'final',
  string
>
interface Aviso {
  codigo: string
  mensagem: string
}
interface Anual {
  ano: number
  granel: Array<{
    titularId: string | null
    titular: string | null
    classe: string | null
    cor: string | null
    litros: Colunas
  }>
  /** Vinho que voltou da cantina contratada, já incluído nas entradas (ciclo 10). */
  retornosTerceiro?: { granelLitros: string; engarrafadoLitros: string; garrafas: number }
  /** Garrafas em processo (espumante na garrafa), em litros; ausente nas declarações antigas. */
  emProcesso?: {
    inicial: string
    tiragens: string
    perdas: string
    finalizadas: string
    final: string
  }
  engarrafado: Array<{
    titularId: string | null
    titular: string | null
    produto: string
    marca: string | null
    classe: string | null
    registroMapa: string | null
    volumeMl: number | null
    garrafas: Record<keyof Colunas, number>
    litros: Record<keyof Colunas, string | null>
  }>
  totais: Array<{
    titularId: string | null
    titular: string | null
    granel: { inicial: string; producao: string; final: string }
    engarrafado: { inicial: string; producao: string; final: string }
  }>
  avisos: Aviso[]
  calculadoEm: string
}
interface PessoaUva {
  pessoaId: string | null
  nome: string | null
  documento: string | null
  numeroSivibe: string | null
  situacaoCadastro: keyof typeof NOMES_SITUACAO_SIVIBE | null
  declaracaoAnoAnterior: boolean | null
  propriedade: string | null
  variedade: string
  codigoOficial: string | null
  kg: string
  notas: string[]
}
interface Sivibe {
  ano: number
  propria: Array<{
    propriedade: string | null
    numeroSivibe: string | null
    municipio: string | null
    uf: string | null
    parcela: string | null
    areaHa: string | null
    variedade: string
    codigoOficial: string | null
    ciclo: string | null
    kg: string
    romaneios: number
  }>
  compradas: PessoaUva[]
  terceiros: PessoaUva[]
  /** Uva enviada para processamento por terceiros (ciclo 10); ausente nas declarações antigas. */
  enviadas?: Array<{
    cantina: string
    documento: string | null
    variedade: string
    codigoOficial: string | null
    origem: string
    kg: string
    notas: string[]
  }>
  avisos: Aviso[]
  calculadoEm: string
}
interface Declaracao<N> {
  ano: number
  tipo: Tipo
  terminou: boolean
  instantaneo: boolean
  registro: {
    id: string
    situacao: 'declarada' | 'em_retificacao' | 'retificada'
    protocolo: string
    declaradaEm: string
    declaradaPor: string | null
  } | null
  retificacoes: Array<{
    id: string
    motivo: string
    abertaEm: string
    abertaPor: string | null
    protocoloAnterior: string
    concluidaEm: string | null
    protocolo: string | null
  }>
  numeros: N
}

const L = (v: string | null | undefined) =>
  v === null || v === undefined ? '—' : formatarDecimal(v, 2)
const KG = (v: string) => formatarDecimal(v, 1)
const G = (n: number) => n.toLocaleString('pt-BR')
const nomeTitular = (t: string | null) => (t ? `Para terceiro: ${t}` : 'Vinificação própria')
const SITUACAO: Record<string, { texto: string; tom: 'sucesso' | 'alerta' | 'neutro' }> = {
  declarada: { texto: 'Entregue', tom: 'sucesso' },
  retificada: { texto: 'Entregue (retificada)', tom: 'sucesso' },
  em_retificacao: { texto: 'Em retificação', tom: 'alerta' },
}

export function PaginaDeclaracoes() {
  const [params, setParams] = useSearchParams()
  const hoje = new Date()
  const padrao = hoje.getMonth() < 3 ? hoje.getFullYear() - 1 : hoje.getFullYear()
  const ano = Number(params.get('ano')) || padrao
  const anos = Array.from({ length: 4 }, (_, i) => hoje.getFullYear() - 3 + i)
  if (!anos.includes(ano)) anos.push(ano)
  return (
    <Pagina
      titulo="Declarações"
      trilha={['EnoTrace']}
      acoes={
        <Botao variante="secundario" onClick={() => window.print()}>
          <Printer /> Imprimir
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground print:hidden">
        Os números para transcrever no gov.br (declaração anual de produção e estoques, de 1º a 10
        de janeiro, Portaria MAPA 615/2023) e no SIVIBE (declaração de uvas, IN MAPA 59/2020).
        Depois de enviar, registre o protocolo: a declaração anual entregue trava o ano, e mudanças
        só por retificação.
      </p>
      <div className="flex items-center gap-2 print:hidden">
        <Selecao
          aria-label="Ano"
          className="w-28"
          value={ano}
          onChange={(e) => setParams({ ano: e.target.value }, { replace: true })}
        >
          {anos.sort().map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selecao>
      </div>
      <Abas defaultValue="anual_mapa">
        <ListaAbas className="print:hidden">
          <Aba value="anual_mapa">Declaração anual (MAPA)</Aba>
          <Aba value="sivibe">Uvas (SIVIBE)</Aba>
        </ListaAbas>
        <ConteudoAba value="anual_mapa" className="flex flex-col gap-4">
          <Bloco<Anual> key={`a${ano}`} ano={ano} tipo="anual_mapa">
            {(n, d) => <NumerosAnuais n={n} ano={d.ano} />}
          </Bloco>
        </ConteudoAba>
        <ConteudoAba value="sivibe" className="flex flex-col gap-4">
          <Bloco<Sivibe> key={`s${ano}`} ano={ano} tipo="sivibe">
            {(n) => <NumerosSivibe n={n} />}
          </Bloco>
        </ConteudoAba>
      </Abas>
    </Pagina>
  )
}

/** Situação, avisos com "ciente", entrega, recibo e retificação: igual nos dois tipos. */
function Bloco<N extends { avisos: Aviso[]; calculadoEm: string }>({
  ano,
  tipo,
  children,
}: {
  ano: number
  tipo: Tipo
  children: (n: N, d: Declaracao<N>) => ReactNode
}) {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  const qc = useQueryClient()
  const [cientes, setCientes] = useState<string[]>([])
  const [protocolo, setProtocolo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [retificando, setRetificando] = useState(false)
  const q = useQuery({
    queryKey: ['declaracao', ano, tipo],
    queryFn: () => api.get<Declaracao<N>>(`/api/declaracoes/${ano}/${tipo}`),
  })
  const d = q.data
  if (q.error) return <Aviso tom="erro">{(q.error as Error).message}</Aviso>
  if (!d) return <p className="text-sm text-muted-foreground">Calculando…</p>
  const r = d.registro
  const anual = tipo === 'anual_mapa'
  const podeConfirmar = pode(s, 'enotrace.declaracoes', 'confirmar')
  const aberta = !r || r.situacao === 'em_retificacao'
  const faltaCiente = d.numeros.avisos.some((a) => !cientes.includes(a.codigo))
  const enviar = async (url: string) => {
    setErro(null)
    try {
      await api.post(url, { protocolo, cientes })
      setProtocolo('')
      setCientes([])
      await qc.invalidateQueries({ queryKey: ['declaracao', ano, tipo] })
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : (e as Error).message)
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">
          {anual ? 'Declaração anual de produção e estoques' : 'Declaração de uvas'} de {ano}
        </h2>
        {r ? (
          <Etiqueta tom={SITUACAO[r.situacao]!.tom}>{SITUACAO[r.situacao]!.texto}</Etiqueta>
        ) : (
          <Etiqueta>Não entregue</Etiqueta>
        )}
        {r && (
          <span className="text-sm text-muted-foreground">
            protocolo {r.protocolo}, registrado em {formatarDataHora(r.declaradaEm, fuso)}
            {r.declaradaPor ? ` por ${r.declaradaPor}` : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {d.instantaneo
          ? 'Os números guardados na entrega.'
          : `Números calculados agora (${formatarDataHora(d.numeros.calculadoEm, fuso)}).`}
        {anual && !d.terminou && ' O ano ainda não terminou: os números ainda vão mudar.'}
      </p>
      {aberta && d.numeros.avisos.length > 0 && (
        <Cartao className="print:hidden">
          <CabecalhoCartao
            titulo="Avisos"
            descricao="O sistema informa; para registrar a entrega, confirme que está ciente de cada um."
          />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {d.numeros.avisos.map((a) => (
              <div key={a.codigo} className="flex flex-wrap items-start gap-3">
                <span className="flex-1">{a.mensagem}</span>
                <Caixa
                  rotulo="Estou ciente"
                  checked={cientes.includes(a.codigo)}
                  onChange={(e) =>
                    setCientes(
                      e.target.checked
                        ? [...cientes, a.codigo]
                        : cientes.filter((x) => x !== a.codigo),
                    )
                  }
                />
              </div>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {children(d.numeros, d)}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aberta && podeConfirmar && (
        <Cartao className="print:hidden">
          <CabecalhoCartao
            titulo={r ? 'Concluir a retificação' : 'Registrar a entrega'}
            descricao={
              r
                ? 'Depois de enviar a retificação no portal, informe o novo protocolo. Os números de agora ficam guardados e o ano volta a travar.'
                : anual
                  ? 'Depois de enviar no gov.br, informe o protocolo. Os números de agora ficam guardados e o ano fica travado: nenhum lançamento com data nele.'
                  : 'Depois de enviar no SIVIBE, informe o protocolo. Os números de agora ficam guardados.'
            }
          />
          <CorpoCartao className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Protocolo" className="w-64">
              <Entrada value={protocolo} onChange={(e) => setProtocolo(e.target.value)} />
            </Campo>
            <Botao
              disabled={!protocolo.trim() || faltaCiente || (anual && !d.terminou)}
              onClick={() =>
                enviar(
                  r
                    ? `/api/declaracoes/${ano}/${tipo}/retificacao/concluir`
                    : `/api/declaracoes/${ano}/${tipo}/declarar`,
                )
              }
            >
              {r ? 'Concluir a retificação' : 'Marcar como entregue'}
            </Botao>
            {anual && !d.terminou && (
              <span className="text-sm text-muted-foreground">
                A entrega é de 1º a 10 de janeiro de {ano + 1}.
              </span>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      {r && (
        <Cartao className="print:hidden">
          <CabecalhoCartao
            titulo="Recibo e retificações"
            acoes={
              r.situacao !== 'em_retificacao' &&
              pode(s, 'enotrace.reabrir_periodo', 'reabrir_periodo') && (
                <Botao variante="secundario" onClick={() => setRetificando(true)}>
                  Abrir retificação
                </Botao>
              )
            }
          />
          <CorpoCartao className="flex flex-col gap-4">
            <Anexos
              entidade="declaracao"
              registroId={r.id}
              podeAlterar={podeConfirmar}
              fuso={fuso}
            />
            {d.retificacoes.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {d.retificacoes.map((x) => (
                  <li key={x.id}>
                    {formatarDataHora(x.abertaEm, fuso)}
                    {x.abertaPor ? `, ${x.abertaPor}` : ''}: {x.motivo} (protocolo{' '}
                    {x.protocoloAnterior} → {x.protocolo ?? 'em aberto'})
                  </li>
                ))}
              </ul>
            )}
          </CorpoCartao>
        </Cartao>
      )}
      <PedirMotivo
        aberto={retificando}
        aoMudar={setRetificando}
        titulo="Abrir retificação"
        descricao={
          anual
            ? 'O ano fica destravado para as correções até a retificação ser concluída com o novo protocolo.'
            : 'Os números voltam a ser calculados até a retificação ser concluída com o novo protocolo.'
        }
        rotuloBotao="Abrir"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/declaracoes/${ano}/${tipo}/retificacao`, { motivo })
          setRetificando(false)
          await qc.invalidateQueries({ queryKey: ['declaracao', ano, tipo] })
        }}
      />
    </>
  )
}

/** Tabela com cabeçalho do cartão e botão de CSV. */
function Tabela({
  titulo,
  descricao,
  arquivo,
  cabecalho,
  linhas,
  csv,
  vazio,
}: {
  titulo: string
  descricao?: string
  arquivo: string
  cabecalho: Array<{ texto: string; numero?: boolean }>
  linhas: ReactNode[][]
  csv: CelulaCsv[][]
  vazio: string
}) {
  return (
    <Cartao>
      <CabecalhoCartao
        titulo={titulo}
        descricao={descricao}
        acoes={
          linhas.length > 0 && (
            <Botao
              variante="secundario"
              className="print:hidden"
              onClick={() => baixarCsv(arquivo, [cabecalho.map((c) => c.texto), ...csv])}
            >
              <Download /> CSV
            </Botao>
          )
        }
      />
      <CorpoCartao className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              {cabecalho.map((c, i) => (
                <th
                  key={c.texto}
                  className={`py-2 font-medium ${i === 0 ? 'pl-5' : ''} ${i === cabecalho.length - 1 ? 'pr-5' : 'pr-4'} ${c.numero ? 'text-right' : ''}`}
                >
                  {c.texto}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, j) => (
              <tr key={j} className="border-b last:border-0">
                {l.map((v, i) => (
                  <td
                    key={i}
                    className={`py-2 ${i === 0 ? 'pl-5' : ''} ${i === l.length - 1 ? 'pr-5' : 'pr-4'} ${cabecalho[i]?.numero ? 'text-right whitespace-nowrap' : ''}`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            {!linhas.length && (
              <tr>
                <td
                  colSpan={cabecalho.length}
                  className="px-5 py-4 text-center text-muted-foreground"
                >
                  {vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CorpoCartao>
    </Cartao>
  )
}

function NumerosAnuais({ n, ano }: { n: Anual; ano: number }) {
  const ini = `Em 31/12/${ano - 1}`
  const fim = `Em 31/12/${ano}`
  const outros = (c: Record<string, string | null>) =>
    (Number(c.perdas ?? 0) + Number(c.ajustes ?? 0) + Number(c.internos ?? 0)).toFixed(2)
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {n.totais.map((t) => (
          <Cartao key={t.titularId ?? 'propria'}>
            <CabecalhoCartao titulo={nomeTitular(t.titular)} descricao="Em litros." />
            <CorpoCartao className="text-sm">
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-1 font-medium" />
                    <th className="pb-1 text-right font-medium">{ini}</th>
                    <th className="pb-1 text-right font-medium">Produção</th>
                    <th className="pb-1 text-right font-medium">{fim}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['granel', 'engarrafado'] as const).map((k) => (
                    <tr key={k} className="border-t">
                      <td className="py-1">{k === 'granel' ? 'A granel' : 'Engarrafado'}</td>
                      <td className="py-1 text-right">{L(t[k].inicial)}</td>
                      <td className="py-1 text-right">{L(t[k].producao)}</td>
                      <td className="py-1 text-right font-medium">{L(t[k].final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
      <Tabela
        titulo="A granel (litros)"
        descricao="Vinho e mosto nos recipientes, pela classe e cor do projeto. Produção: o vinho elaborado no ano (desengace e prensagem). Engarrafado: o que saiu do granel para as garrafas."
        arquivo={`declaracao-${ano}-granel`}
        cabecalho={[
          { texto: 'Titular' },
          { texto: 'Classe' },
          { texto: 'Cor' },
          { texto: ini, numero: true },
          { texto: 'Produção', numero: true },
          { texto: 'Outras entradas', numero: true },
          { texto: 'Engarrafado', numero: true },
          { texto: 'Saídas', numero: true },
          { texto: 'Perdas, ajustes e internos', numero: true },
          { texto: fim, numero: true },
        ]}
        linhas={n.granel.map((g) => [
          g.titular ?? 'Própria',
          g.classe ?? <span className="text-warning">sem classe</span>,
          g.cor ?? '—',
          L(g.litros.inicial),
          L(g.litros.producao),
          L(g.litros.entradas),
          L(g.litros.engarrafado),
          L(g.litros.saidas),
          L(outros(g.litros)),
          <strong key="f">{L(g.litros.final)}</strong>,
        ])}
        csv={n.granel.map((g) => [
          g.titular ?? 'Própria',
          g.classe ?? 'sem classe',
          g.cor,
          g.litros.inicial,
          g.litros.producao,
          g.litros.entradas,
          g.litros.engarrafado,
          g.litros.saidas,
          outros(g.litros),
          g.litros.final,
        ])}
        vazio="Sem vinho a granel no ano."
      />
      {n.retornosTerceiro &&
        (Number(n.retornosTerceiro.granelLitros) > 0 ||
          Number(n.retornosTerceiro.engarrafadoLitros) > 0) && (
          <Aviso tom="info">
            Retorno de terceiro (vinho elaborado em cantina contratada), já incluído nas entradas:{' '}
            {L(n.retornosTerceiro.granelLitros)} a granel e{' '}
            {L(n.retornosTerceiro.engarrafadoLitros)} engarrafados ({n.retornosTerceiro.garrafas}{' '}
            garrafas). Lançado como entrada, até a resposta do RT (perguntas para o RT e o MAPA,
            ponto 2).
          </Aviso>
        )}
      {n.emProcesso && Object.values(n.emProcesso).some((v) => Number(v) !== 0) && (
        <Cartao>
          <CabecalhoCartao
            titulo="Espumante em elaboração (litros)"
            descricao="Garrafas em processo, da tiragem até a finalização como produto acabado."
          />
          <CorpoCartao className="grid gap-2 text-sm sm:grid-cols-5">
            <p>
              {ini}: <strong>{L(n.emProcesso.inicial)}</strong>
            </p>
            <p>Tiragens: {L(n.emProcesso.tiragens)}</p>
            <p>Perdas: {L(n.emProcesso.perdas)}</p>
            <p>Finalizadas: {L(n.emProcesso.finalizadas)}</p>
            <p>
              {fim}: <strong>{L(n.emProcesso.final)}</strong>
            </p>
          </CorpoCartao>
        </Cartao>
      )}
      <Tabela
        titulo="Engarrafado"
        descricao="Por produto e formato: garrafas e litros. Produção: o engarrafado no ano."
        arquivo={`declaracao-${ano}-engarrafado`}
        cabecalho={[
          { texto: 'Titular' },
          { texto: 'Marca' },
          { texto: 'Produto' },
          { texto: 'Registro MAPA' },
          { texto: 'Classe' },
          { texto: 'Formato', numero: true },
          { texto: ini, numero: true },
          { texto: 'Produção', numero: true },
          { texto: 'Outras entradas', numero: true },
          { texto: 'Saídas', numero: true },
          { texto: 'Perdas, ajustes e internos', numero: true },
          { texto: fim, numero: true },
        ]}
        linhas={n.engarrafado.map((g) => {
          const par = (k: keyof Colunas) => (
            <>
              {G(g.garrafas[k])}
              <span className="block text-xs text-muted-foreground">{L(g.litros[k])} L</span>
            </>
          )
          return [
            g.titular ?? 'Própria',
            g.marca ?? '—',
            g.produto,
            g.registroMapa ?? <span className="text-warning">sem registro</span>,
            g.classe ?? '—',
            g.volumeMl ? `${g.volumeMl} mL` : '—',
            par('inicial'),
            par('producao'),
            par('entradas'),
            par('saidas'),
            <>
              {G(g.garrafas.perdas + g.garrafas.ajustes + g.garrafas.internos)}
              <span className="block text-xs text-muted-foreground">{L(outros(g.litros))} L</span>
            </>,
            <strong key="f">{par('final')}</strong>,
          ]
        })}
        csv={n.engarrafado.map((g) => [
          g.titular ?? 'Própria',
          g.marca,
          g.produto,
          g.registroMapa,
          g.classe,
          g.volumeMl,
          g.litros.inicial,
          g.litros.producao,
          g.litros.entradas,
          g.litros.saidas,
          outros(g.litros),
          g.litros.final,
        ])}
        vazio="Sem produto engarrafado no ano."
      />
    </>
  )
}

function NumerosSivibe({ n }: { n: Sivibe }) {
  const pessoas = (lista: PessoaUva[], titulo: string, descricao: string, arquivo: string) => (
    <Tabela
      titulo={titulo}
      descricao={descricao}
      arquivo={`sivibe-${n.ano}-${arquivo}`}
      cabecalho={[
        { texto: 'Produtor' },
        { texto: 'CPF/CNPJ' },
        { texto: 'Nº SIVIBE' },
        { texto: 'Cadastro' },
        { texto: 'Declarou o ano anterior' },
        { texto: 'Propriedade' },
        { texto: 'Cultivar' },
        { texto: 'Código' },
        { texto: 'Notas' },
        { texto: 'kg', numero: true },
      ]}
      linhas={lista.map((l) => [
        l.nome ?? '—',
        l.documento ?? '—',
        l.numeroSivibe ?? <span className="text-warning">sem número</span>,
        l.situacaoCadastro ? NOMES_SITUACAO_SIVIBE[l.situacaoCadastro] : '—',
        l.declaracaoAnoAnterior === null ? '—' : l.declaracaoAnoAnterior ? 'Sim' : 'Não',
        l.propriedade ?? '—',
        l.variedade,
        l.codigoOficial ?? <span className="text-warning">sem código</span>,
        l.notas.join(', ') || '—',
        KG(l.kg),
      ])}
      csv={lista.map((l) => [
        l.nome,
        l.documento,
        l.numeroSivibe,
        l.situacaoCadastro ? NOMES_SITUACAO_SIVIBE[l.situacaoCadastro] : null,
        l.declaracaoAnoAnterior === null ? null : l.declaracaoAnoAnterior ? 'Sim' : 'Não',
        l.propriedade,
        l.variedade,
        l.codigoOficial,
        l.notas.join(', '),
        l.kg,
      ])}
      vazio="Nenhuma no ano."
    />
  )
  return (
    <>
      <Tabela
        titulo="Uva própria"
        descricao="Colhida no ano (a vindima é o ano civil), por propriedade, parcela e cultivar: a quantidade por parreiral que o SIVIBE pede."
        arquivo={`sivibe-${n.ano}-propria`}
        cabecalho={[
          { texto: 'Propriedade' },
          { texto: 'Nº SIVIBE' },
          { texto: 'Município' },
          { texto: 'Parcela' },
          { texto: 'Área (ha)', numero: true },
          { texto: 'Cultivar' },
          { texto: 'Código' },
          { texto: 'Ciclo' },
          { texto: 'kg', numero: true },
        ]}
        linhas={n.propria.map((l) => [
          l.propriedade ?? <span className="text-warning">sem parcela</span>,
          l.numeroSivibe ?? '—',
          l.municipio ? `${l.municipio}${l.uf ? `/${l.uf}` : ''}` : '—',
          l.parcela ?? '—',
          l.areaHa ? formatarDecimal(l.areaHa, 4) : '—',
          l.variedade,
          l.codigoOficial ?? <span className="text-warning">sem código</span>,
          l.ciclo ?? '—',
          KG(l.kg),
        ])}
        csv={n.propria.map((l) => [
          l.propriedade,
          l.numeroSivibe,
          l.municipio ? `${l.municipio}${l.uf ? `/${l.uf}` : ''}` : null,
          l.parcela,
          l.areaHa,
          l.variedade,
          l.codigoOficial,
          l.ciclo,
          l.kg,
        ])}
        vazio="Nenhuma uva própria colhida no ano."
      />
      {pessoas(
        n.compradas,
        'Uva comprada',
        'Por fornecedor e cultivar: a compra só de produtor cadastrado e com a declaração do ano anterior (IN MAPA 59/2020, art. 13).',
        'compradas',
      )}
      {pessoas(
        n.terceiros,
        'Uva de terceiros',
        'Recebida para vinificação para terceiro, por dono da uva.',
        'terceiros',
      )}
      {n.enviadas && (
        <Tabela
          titulo="Uva enviada para processamento por terceiros"
          descricao="Remetida a outra cantina (produção em terceiro, entrega simples), pela data da remessa."
          arquivo={`sivibe-${n.ano}-enviadas`}
          cabecalho={[
            { texto: 'Cantina' },
            { texto: 'CNPJ' },
            { texto: 'Cultivar' },
            { texto: 'Código' },
            { texto: 'Origem' },
            { texto: 'kg', numero: true },
            { texto: 'Notas' },
          ]}
          linhas={n.enviadas.map((l) => [
            l.cantina,
            l.documento ?? '—',
            l.variedade,
            l.codigoOficial ?? <span className="text-warning">sem código</span>,
            ORIGENS_UVA_REMESSA[l.origem as keyof typeof ORIGENS_UVA_REMESSA] ?? l.origem,
            KG(l.kg),
            l.notas.join(', ') || '—',
          ])}
          csv={n.enviadas.map((l) => [
            l.cantina,
            l.documento,
            l.variedade,
            l.codigoOficial,
            l.origem,
            l.kg,
            l.notas.join(', '),
          ])}
          vazio="Nenhuma uva enviada a outra cantina no ano."
        />
      )}
    </>
  )
}
