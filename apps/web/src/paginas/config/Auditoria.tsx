// Consulta da auditoria da empresa (P14), incluindo personificações (P28).
import { api } from '@/lib/api'
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao'
import { useQuery } from '@tanstack/react-query'
import { Diferencas, NOMES_ACAO, type RegistroAuditoria } from '@/componentes/Historico'
import { TabelaDados } from '@/componentes/TabelaDados'
import { Entrada, Selecao } from '@/componentes/ui/campos'
import { Pagina } from '@/layout/Estrutura'
import { fusoAtivo, pode, useSessao } from '@/lib/sessao'
import { formatarDataHora } from '@/lib/utils'

const ENTIDADES: Record<string, string> = {
  empresa: 'Empresa',
  estabelecimento: 'Estabelecimento',
  local: 'Local',
  perfil: 'Perfil',
  vinculo: 'Usuário',
  convite: 'Convite',
  sessao: 'Sessão',
  usuario: 'Usuário',
  funcionalidade: 'Permissão',
  pessoa: 'Pessoa',
  documento: 'Documento',
  documento_versao: 'Versão de documento',
  etiqueta: 'Etiqueta',
  recipiente: 'Recipiente',
  item_estoque: 'Item de estoque',
  marca: 'Marca',
  produto: 'Produto',
  variedade: 'Variedade',
  parametro: 'Parâmetro',
  parametros_analise: 'Parâmetros de análise',
  rendimento_padrao: 'Rendimento padrão',
  ciclo: 'Ciclos da safra',
  periodicidade_higienizacao: 'Higienização',
  troca_master: 'Passagem de bastão',
  listagem: 'Listagem',
}

export function PaginaAuditoria() {
  const { data: s } = useSessao()
  const fuso = fusoAtivo(s)
  return (
    <Pagina titulo="Auditoria" trilha={['Configurações']}>
      <p className="text-sm text-muted-foreground">
        Tudo o que acontece na empresa: quem fez, o quê, quando e de onde. Os registros não podem
        ser alterados.
      </p>
      <AcessosDoSuporte />
      <TabelaDados
        tabela="auditoria"
        url="/api/auditoria"
        ordemPadrao={{ campo: 'ocorridoEm', direcao: 'desc' }}
        podeExportar={pode(s, 'gestao.config.auditoria', 'exportar')}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Ação"
              className="w-48"
              value={f.acao ?? ''}
              onChange={(e) => definir('acao', e.target.value)}
            >
              <option value="">Todas as ações</option>
              {Object.entries(NOMES_ACAO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Registro"
              className="w-40"
              value={f.entidade ?? ''}
              onChange={(e) => definir('entidade', e.target.value)}
            >
              <option value="">Todos os registros</option>
              {Object.entries(ENTIDADES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
            <Entrada
              aria-label="De"
              type="date"
              className="w-40"
              value={f.de ?? ''}
              onChange={(e) => definir('de', e.target.value)}
            />
            <Entrada
              aria-label="Até"
              type="date"
              className="w-40"
              value={f.ate ?? ''}
              onChange={(e) => definir('ate', e.target.value)}
            />
          </>
        )}
        colunas={[
          {
            id: 'ocorridoEm',
            titulo: 'Quando',
            ordenavel: true,
            className: 'whitespace-nowrap',
            celula: (r) => formatarDataHora(r.ocorridoEm, fuso),
            exportar: (r) => r.ocorridoEm,
          },
          {
            id: 'usuario',
            titulo: 'Quem',
            celula: (r) => r.usuario ?? 'Sistema',
            exportar: (r) => r.usuario,
          },
          {
            id: 'acao',
            titulo: 'Ação',
            ordenavel: true,
            celula: (r) => NOMES_ACAO[r.acao] ?? r.acao,
            exportar: (r) => r.acao,
          },
          {
            id: 'entidade',
            titulo: 'Registro',
            ordenavel: true,
            celula: (r) => (r.entidade ? (ENTIDADES[r.entidade] ?? r.entidade) : '—'),
            exportar: (r) => r.entidade,
          },
          {
            id: 'detalhes',
            titulo: 'Detalhes',
            className: 'min-w-72',
            celula: (r) => <Diferencas r={r} />,
            exportar: (r) => JSON.stringify(r.diferenca ?? r.dados ?? ''),
          },
          { id: 'ip', titulo: 'IP', celula: (r) => r.ip ?? '—', exportar: (r) => r.ip },
        ]}
      />
    </Pagina>
  )
}

/** Quando e por quem a empresa foi personificada pelo suporte (P28, transparência). */
function AcessosDoSuporte() {
  const q = useQuery({
    queryKey: ['personificacoes-empresa'],
    queryFn: () =>
      api.get<
        Array<{
          id: string
          membro: string
          usuario: string
          motivo: string
          inicio: string
          fim: string | null
        }>
      >('/api/personificacoes'),
  })
  if (!q.data?.length) return null
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Acessos do suporte"
        descricao="Vezes em que a equipe do ViniCycle viu o sistema como um usuário da empresa. O que foi feito aparece na auditoria abaixo, com o nome de quem fez."
      />
      <CorpoCartao className="flex flex-col gap-1 text-sm">
        {q.data.map((p) => (
          <p key={p.id}>
            {formatarDataHora(p.inicio)} · {p.membro} como {p.usuario} · {p.motivo}
            {p.fim ? ` · até ${formatarDataHora(p.fim)}` : ' · em curso'}
          </p>
        ))}
      </CorpoCartao>
    </Cartao>
  )
}
