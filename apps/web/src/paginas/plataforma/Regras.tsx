// Administração › Regras regulatórias (P16): cada regra com as suas versões, vigência, abrangência
// e fonte legal. Mudou a norma: nova versão; a anterior se encerra na véspera.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatarDecimal, novaRegra } from '@vinicycle/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Botao } from '@/componentes/ui/botao'
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos'
import { Dialogo } from '@/componentes/ui/dialogo'
import { Pagina } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { useFormulario } from '@/lib/formulario'
import { pode, useSessao } from '@/lib/sessao'
import { formatarData } from '@/lib/utils'

interface Regra {
  id: string
  tipo: string
  chave: string
  abrangencia: 'nacional' | 'uf' | 'ig'
  abrangenciaCodigo: string | null
  vigenteDesde: string
  vigenteAte: string | null
  minimo: string | null
  maximo: string | null
  unidade: string | null
  descricao: string
  fonteNorma: string
  fonteArtigo: string | null
  fonteLink: string | null
  fonteNota: string | null
}

const ABRANGENCIA = { nacional: 'Nacional', uf: 'UF', ig: 'IG' } as const
const hoje = () => new Date().toISOString().slice(0, 10)
const vigente = (r: Regra) => r.vigenteDesde <= hoje() && (!r.vigenteAte || r.vigenteAte >= hoje())
const valor = (r: Regra) =>
  [
    r.minimo && `mín. ${formatarDecimal(r.minimo, 2)}`,
    r.maximo && `máx. ${formatarDecimal(r.maximo, 4).replace(/0+$/, '').replace(/,$/, '')}`,
  ]
    .filter(Boolean)
    .join(' · ') + (r.unidade && (r.minimo || r.maximo) ? ` ${r.unidade}` : '')

function NovaVersao({ base, aoFechar }: { base: Regra | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const form = useFormulario(novaRegra, {
    tipo: (base?.tipo ?? 'limite') as 'limite',
    chave: base?.chave ?? '',
    abrangencia: base?.abrangencia ?? 'nacional',
    abrangenciaCodigo: base?.abrangenciaCodigo ?? '',
    vigenteDesde: hoje(),
    minimo: base?.minimo ?? '',
    maximo: base?.maximo ?? '',
    unidade: base?.unidade ?? '',
    descricao: base?.descricao ?? '',
    fonteNorma: '',
    fonteArtigo: '',
    fonteLink: '',
    fonteNota: '',
  })
  const v = form.valores
  const texto = (
    campo: keyof typeof v,
    rotulo: string,
    extra: { ajuda?: string; obrigatorio?: boolean } = {},
  ) => (
    <Campo rotulo={rotulo} id={`regra-${campo}`} erro={form.erro(campo)} {...extra}>
      <Entrada
        id={`regra-${campo}`}
        value={(v[campo] as string | null) ?? ''}
        disabled={!!base && (campo === 'chave' || campo === 'abrangenciaCodigo')}
        onChange={(e) => form.definir(campo, e.target.value)}
      />
    </Campo>
  )
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={base ? `Nova versão: ${base.descricao}` : 'Nova regra'}
      descricao="A versão em vigor desta regra e abrangência passa a valer até a véspera da nova."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const d = form.validar()
              if (!d) return
              try {
                await api.post('/api/plataforma/regras', d)
                await qc.invalidateQueries({ queryKey: ['regras-plataforma'] })
                aoFechar()
              } catch (e) {
                form.erroDaApi(e)
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {form.erroGeral && (
          <Aviso tom="erro" className="sm:col-span-2">
            {form.erroGeral}
          </Aviso>
        )}
        {texto('chave', 'Chave', {
          obrigatorio: true,
          ajuda: 'Ex.: safra_minima. Liga a regra ao sistema.',
        })}
        <Campo rotulo="Abrangência" id="regra-abrangencia">
          <Selecao
            id="regra-abrangencia"
            disabled={!!base}
            value={v.abrangencia}
            onChange={(e) => form.definir('abrangencia', e.target.value as typeof v.abrangencia)}
          >
            {Object.entries(ABRANGENCIA).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </Selecao>
        </Campo>
        {v.abrangencia !== 'nacional' &&
          texto('abrangenciaCodigo', v.abrangencia === 'uf' ? 'UF' : 'Código da IG', {
            obrigatorio: true,
          })}
        <Campo
          rotulo="Vigente desde"
          id="regra-vigencia"
          erro={form.erro('vigenteDesde')}
          obrigatorio
        >
          <Entrada
            id="regra-vigencia"
            type="date"
            value={v.vigenteDesde}
            onChange={(e) => form.definir('vigenteDesde', e.target.value)}
          />
        </Campo>
        {texto('minimo', 'Mínimo')}
        {texto('maximo', 'Máximo')}
        {texto('unidade', 'Unidade')}
        <Campo
          rotulo="Descrição"
          id="regra-descricao"
          erro={form.erro('descricao')}
          obrigatorio
          className="sm:col-span-2"
        >
          <Entrada
            id="regra-descricao"
            value={v.descricao}
            onChange={(e) => form.definir('descricao', e.target.value)}
          />
        </Campo>
        {texto('fonteNorma', 'Norma', { obrigatorio: true, ajuda: 'Ex.: Decreto 12.709/2025' })}
        {texto('fonteArtigo', 'Artigo', { ajuda: 'Ex.: art. 93' })}
        <Campo
          rotulo="Link da norma"
          id="regra-link"
          erro={form.erro('fonteLink')}
          className="sm:col-span-2"
        >
          <Entrada
            id="regra-link"
            type="url"
            value={v.fonteLink ?? ''}
            onChange={(e) => form.definir('fonteLink', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Nota" id="regra-nota" className="sm:col-span-2">
          <AreaTexto
            id="regra-nota"
            value={v.fonteNota ?? ''}
            onChange={(e) => form.definir('fonteNota', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  )
}

export function PaginaRegras() {
  const { data: s } = useSessao()
  const [nova, setNova] = useState<Regra | 'nova' | null>(null)
  const q = useQuery({
    queryKey: ['regras-plataforma'],
    queryFn: () => api.get<Regra[]>('/api/plataforma/regras'),
  })
  const podeCriar = pode(s, 'plataforma.regras', 'criar')
  const series = new Map<string, Regra[]>()
  for (const r of q.data ?? []) {
    const k = `${r.chave}|${r.abrangencia}|${r.abrangenciaCodigo ?? ''}`
    series.set(k, [...(series.get(k) ?? []), r])
  }
  return (
    <Pagina
      titulo="Regras regulatórias"
      trilha={['Administração']}
      acoes={
        podeCriar && (
          <Botao onClick={() => setNova('nova')}>
            <Plus /> Nova regra
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Limites e exigências legais usados nos alertas (P16, P29). A regra vale pela data do fato; o
        cliente é avisado e confirma que está ciente. Nenhuma versão é apagada.
      </p>
      {q.isError && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {[...series.values()].map((versoes) => {
        const atual = versoes[0]!
        return (
          <Cartao key={atual.id}>
            <CabecalhoCartao
              titulo={atual.descricao}
              descricao={`${atual.chave} · ${ABRANGENCIA[atual.abrangencia]}${atual.abrangenciaCodigo ? ` ${atual.abrangenciaCodigo}` : ''}`}
              acoes={
                podeCriar && (
                  <Botao variante="secundario" tamanho="pequeno" onClick={() => setNova(atual)}>
                    Nova versão
                  </Botao>
                )
              }
            />
            <CorpoCartao className="flex flex-col gap-2 text-sm">
              {versoes.map((r) => (
                <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="min-w-48">
                    {formatarData(r.vigenteDesde)}{' '}
                    {r.vigenteAte ? `a ${formatarData(r.vigenteAte)}` : 'em diante'}{' '}
                    {vigente(r) && <Etiqueta tom="sucesso">Em vigor</Etiqueta>}
                  </span>
                  {valor(r) && <strong>{valor(r)}</strong>}
                  <span className="text-muted-foreground">
                    {r.fonteLink ? (
                      <a href={r.fonteLink} target="_blank" rel="noreferrer" className="underline">
                        {[r.fonteNorma, r.fonteArtigo].filter(Boolean).join(', ')}
                      </a>
                    ) : (
                      [r.fonteNorma, r.fonteArtigo].filter(Boolean).join(', ')
                    )}
                    {r.fonteNota && ` · ${r.fonteNota}`}
                  </span>
                </div>
              ))}
            </CorpoCartao>
          </Cartao>
        )
      })}
      {nova && <NovaVersao base={nova === 'nova' ? null : nova} aoFechar={() => setNova(null)} />}
    </Pagina>
  )
}
