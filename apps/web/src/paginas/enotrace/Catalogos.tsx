// EnoTrace › Cadastros › Catálogos: variedades, tipos e listas configuráveis (P8, P29).
import { CORES_UVA, LISTAS, NOMES_COR_UVA, NOMES_TIPO_UVA, TIPOS_UVA } from '@vinicycle/shared';
import { useNavigate, useParams } from 'react-router';
import { Catalogo, type ConfigCatalogo } from '@/componentes/Catalogo';
import { Caixa, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { pode, useSessao } from '@/lib/sessao';

const LISTAS_CANTINA = [
  'motivo_perda',
  'fracao_prensa',
  'metodo_trasfega',
  'etapa_producao',
  'tipo_saida',
  'metodo_espumante',
  'material_recipiente',
  'origem_madeira',
  'tosta',
  'apresentacao_insumo',
  'cor_vinho',
  'teor_acucar',
] as const;

export const CONFIGS: Record<string, ConfigCatalogo & { titulo: string }> = {
  variedades: {
    titulo: 'Variedades',
    catalogo: 'variedade',
    descricao:
      'Catálogo oficial de cultivares (tabela do SISDEVIN, 30/03/2023). Marque as variedades com que a vinícola trabalha: só elas aparecem nas telas. Variedade fora do catálogo pode ser criada; ela fica "sem código oficial", a plataforma é avisada e as declarações mostram alerta.',
    campos: [
      {
        nome: 'tipo',
        rotulo: 'Tipo',
        tipo: 'selecao',
        opcoes: () => TIPOS_UVA.map((t) => ({ valor: t, nome: NOMES_TIPO_UVA[t] })),
      },
      {
        nome: 'cor',
        rotulo: 'Cor',
        tipo: 'selecao',
        opcoes: () => CORES_UVA.map((c) => ({ valor: c, nome: NOMES_COR_UVA[c] })),
      },
      { nome: 'sinonimos', rotulo: 'Sinônimos e nomes regionais', tipo: 'textos' },
    ],
    colunas: [
      {
        id: 'codigoOficial',
        titulo: 'Código oficial',
        ordenavel: true,
        celula: (i) =>
          (i.codigoOficial as string) ?? (
            <span className="text-muted-foreground">sem código oficial</span>
          ),
        exportar: (i) => i.codigoOficial as string,
      },
      {
        id: 'tipo',
        titulo: 'Tipo',
        celula: (i) => NOMES_TIPO_UVA[i.tipo as 'vinifera'],
        exportar: (i) => i.tipo as string,
      },
      {
        id: 'cor',
        titulo: 'Cor',
        celula: (i) => NOMES_COR_UVA[i.cor as 'tinta'],
        exportar: (i) => i.cor as string,
      },
    ],
    filtrosExtras: (f, definir) => (
      <Selecao
        aria-label="Em uso"
        className="w-40"
        value={f.emUso ?? 'todos'}
        onChange={(e) => definir('emUso', e.target.value)}
      >
        <option value="todos">Todas</option>
        <option value="sim">Só as em uso</option>
      </Selecao>
    ),
  },
  'tipos-recipiente': {
    titulo: 'Tipos de recipiente',
    catalogo: 'tipo_recipiente',
    campos: [
      { nome: 'pressurizado', rotulo: 'Pressurizado (ex.: autoclave)', tipo: 'booleano' },
      {
        nome: 'eBarrica',
        rotulo: 'Madeira (habilita tanoaria, origem da madeira, tosta e ano do primeiro uso)',
        tipo: 'booleano',
      },
    ],
    colunas: [
      {
        id: 'pressurizado',
        titulo: 'Pressurizado',
        celula: (i) => (i.pressurizado ? 'Sim' : 'Não'),
      },
      { id: 'eBarrica', titulo: 'Madeira', celula: (i) => (i.eBarrica ? 'Sim' : 'Não') },
    ],
  },
  'tipos-insumo': {
    titulo: 'Tipos de insumo',
    catalogo: 'tipo_insumo',
    descricao: 'Cada tipo define as unidades e apresentações permitidas nos insumos.',
    campos: [
      {
        nome: 'unidades',
        rotulo: 'Unidades permitidas',
        tipo: 'multipla',
        opcoes: (ref) =>
          (ref?.unidades ?? [])
            .filter((u) => ['massa', 'volume', 'contagem'].includes(u.grandeza))
            .map((u) => ({ valor: u.simbolo, nome: u.simbolo })),
      },
      {
        nome: 'apresentacoes',
        rotulo: 'Apresentações',
        tipo: 'multipla',
        opcoes: (ref) =>
          (ref?.listas.apresentacao_insumo ?? []).map((o) => ({ valor: o.codigo, nome: o.nome })),
      },
    ],
    colunas: [
      {
        id: 'unidades',
        titulo: 'Unidades',
        celula: (i) => ((i.unidades as string[]) ?? []).join(', '),
      },
    ],
  },
  ...Object.fromEntries(
    LISTAS_CANTINA.map((l) => [
      l.replaceAll('_', '-'),
      {
        titulo: LISTAS[l],
        catalogo: `opcao:${l}` as const,
        campos: [{ nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'numero' as const, padrao: 100 }],
      },
    ]),
  ),
};

export function PaginaCatalogos() {
  const { aba = 'variedades' } = useParams();
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const config = CONFIGS[aba] ?? CONFIGS.variedades!;
  const usoVariedade: ConfigCatalogo['acoesLinha'] = (i, recarregar) =>
    pode(s, 'enotrace.cadastros', 'editar') && i.ativo ? (
      <Caixa
        rotulo="Em uso"
        checked={i.emUso}
        onChange={async (e) => {
          await api.post(`/api/variedades/${i.id}/uso`, { emUso: e.target.checked });
          recarregar();
        }}
      />
    ) : i.emUso ? (
      'Em uso'
    ) : null;
  return (
    <Pagina titulo="Catálogos" trilha={['EnoTrace', 'Cadastros']}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="catalogo" className="text-sm font-medium">
          Catálogo
        </label>
        <Selecao
          id="catalogo"
          className="w-72"
          value={aba}
          onChange={(e) => navegar(`/enotrace/catalogos/${e.target.value}`)}
        >
          {Object.entries(CONFIGS).map(([k, c]) => (
            <option key={k} value={k}>
              {c.titulo}
            </option>
          ))}
        </Selecao>
      </div>
      <Catalogo
        key={aba}
        config={aba === 'variedades' ? { ...config, acoesLinha: usoVariedade } : config}
      />
    </Pagina>
  );
}
