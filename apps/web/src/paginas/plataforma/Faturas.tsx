// Administração › Faturas e recebimentos (administracao.md): faturas de todas as empresas, baixa
// manual, estorno e cancelamento.
import {
  formatarMoeda,
  NOMES_SITUACAO_FATURA,
  paraCentavos,
  SITUACOES_FATURA,
} from '@vinicycle/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  DetalheFatura,
  EtiquetaFatura,
  type LinhaFatura,
  periodoFatura,
} from '@/componentes/Faturas';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { pode, useSessao } from '@/lib/sessao';
import { formatarData } from '@/lib/utils';

export function PaginaFaturas() {
  const { data: s } = useSessao();
  const navegar = useNavigate();
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <Pagina titulo="Faturas e recebimentos" trilha={['Administração']}>
      <p className="text-sm text-muted-foreground">
        A fatura de cada ciclo sai sozinha antes do vencimento; a baixa é manual até a integração
        com os meios de pagamento. Busque pelo cliente ou pelo número.
      </p>
      <TabelaDados<LinhaFatura>
        tabela="plataforma.faturas"
        url="/api/plataforma/faturas"
        ordemPadrao={{ campo: 'vencimento', direcao: 'desc' }}
        aoClicar={(f) => setAberta(f.id)}
        podeExportar={pode(s, 'plataforma.faturas', 'exportar')}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-44"
            value={f.situacao ?? ''}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="">Todas as situações</option>
            {SITUACOES_FATURA.map((x) => (
              <option key={x} value={x}>
                {NOMES_SITUACAO_FATURA[x]}
              </option>
            ))}
          </Selecao>
        )}
        colunas={[
          {
            id: 'numero',
            titulo: 'Nº',
            ordenavel: true,
            celula: (f) => f.numero,
            exportar: (f) => f.numero,
          },
          {
            id: 'cliente',
            titulo: 'Cliente',
            ordenavel: true,
            celula: (f) => (
              <button
                type="button"
                className="text-left underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  navegar(`/plataforma/clientes/${f.empresaId}`);
                }}
              >
                {f.cliente}
              </button>
            ),
            exportar: (f) => f.cliente,
          },
          {
            id: 'periodo',
            titulo: 'Período',
            celula: (f) => periodoFatura(f),
            exportar: (f) => periodoFatura(f),
          },
          {
            id: 'vencimento',
            titulo: 'Vencimento',
            ordenavel: true,
            celula: (f) => formatarData(f.vencimento),
            exportar: (f) => f.vencimento,
          },
          {
            id: 'total',
            titulo: 'Total',
            ordenavel: true,
            className: 'text-right whitespace-nowrap',
            celula: (f) => formatarMoeda(paraCentavos(f.total)),
            exportar: (f) => f.total,
          },
          {
            id: 'recebido',
            titulo: 'Recebido',
            className: 'text-right whitespace-nowrap',
            celula: (f) => formatarMoeda(paraCentavos(f.recebido)),
            exportar: (f) => f.recebido,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            ordenavel: true,
            celula: (f) => <EtiquetaFatura situacao={f.situacao} />,
            exportar: (f) => f.situacao,
          },
        ]}
      />
      {aberta && (
        <DetalheFatura
          id={aberta}
          plataforma
          podeEditar={pode(s, 'plataforma.faturas', 'editar')}
          podeEstornar={pode(s, 'plataforma.faturas', 'estornar')}
          aoFechar={() => setAberta(null)}
        />
      )}
    </Pagina>
  );
}
