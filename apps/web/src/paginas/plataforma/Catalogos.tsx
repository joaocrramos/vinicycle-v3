// Administração › Catálogos: a equipe da plataforma mantém os itens globais de todos os catálogos
// simples, inclusive as listas oficiais (decisão de 05/10/2026). Valem para todas as empresas.
import { LISTAS, type Lista } from '@vinicycle/shared';
import { useNavigate, useParams } from 'react-router';
import { Catalogo, type ConfigCatalogo } from '@/componentes/Catalogo';
import { Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { CONFIGS as DA_CANTINA } from '@/paginas/enotrace/Catalogos';
import { CONFIG_TIPOS_DOCUMENTO } from '@/paginas/gestao/Documentos';

const { variedades, ...outrosDaCantina } = DA_CANTINA;

const CONFIGS: Record<string, ConfigCatalogo & { titulo: string }> = {
  variedades: {
    ...variedades!,
    filtrosExtras: undefined,
    descricao:
      'Catálogo oficial de cultivares (tabela do SISDEVIN, 30/03/2023). As variedades criadas pelas empresas, sem código oficial, ficam com elas e não aparecem aqui.',
    campos: [
      {
        nome: 'codigoOficial',
        rotulo: 'Código oficial (SISDEVIN)',
        tipo: 'texto',
        ajuda: 'Vazio para variedade sem código oficial.',
      },
      ...variedades!.campos,
    ],
  },
  ...outrosDaCantina,
  'tipos-documento': { titulo: 'Tipos de documento', ...CONFIG_TIPOS_DOCUMENTO },
};
// As listas que não estão na cantina (cargos, conselhos, estágios do espumante…).
for (const l of Object.keys(LISTAS) as Lista[]) {
  const chave = l.replaceAll('_', '-');
  CONFIGS[chave] ??= {
    titulo: LISTAS[l],
    catalogo: `opcao:${l}`,
    campos: [{ nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'numero', padrao: 100 }],
  };
}
const ORDENADOS = Object.entries(CONFIGS).sort(([, a], [, b]) =>
  a.titulo.localeCompare(b.titulo, 'pt-BR'),
);

export function PaginaCatalogosPlataforma() {
  const { aba = 'tipos-recipiente' } = useParams();
  const navegar = useNavigate();
  const chave = aba in CONFIGS ? aba : 'tipos-recipiente';
  const config = CONFIGS[chave]!;
  return (
    <Pagina titulo="Catálogos globais" trilha={['Administração']}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="catalogo" className="text-sm font-medium">
          Catálogo
        </label>
        <Selecao
          id="catalogo"
          className="w-72"
          value={chave}
          onChange={(e) => navegar(`/plataforma/catalogos/${e.target.value}`)}
        >
          {ORDENADOS.map(([k, c]) => (
            <option key={k} value={k}>
              {c.titulo}
            </option>
          ))}
        </Selecao>
      </div>
      <Catalogo key={chave} plataforma config={config} />
    </Pagina>
  );
}
