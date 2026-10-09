// Gestão › listas simples da Gestão (cargos, categorias de fornecimento), com o componente de catálogo.
import { LISTAS, type Lista } from '@vinicycle/shared';
import { useParams } from 'react-router';
import { Catalogo } from '@/componentes/Catalogo';
import { Aviso } from '@/componentes/ui/cartao';
import { Pagina } from '@/layout/Estrutura';

const DA_GESTAO: Lista[] = ['cargo', 'categoria_fornecimento'];

export function ListasGestao() {
  const { lista = '' } = useParams();
  if (!DA_GESTAO.includes(lista as Lista)) return <Aviso tom="alerta">Lista não encontrada.</Aviso>;
  return (
    <Pagina titulo={LISTAS[lista as Lista]} trilha={['Gestão', 'Pessoas']}>
      <Catalogo
        config={{
          catalogo: `opcao:${lista as Lista}`,
          campos: [{ nome: 'ordem', rotulo: 'Ordem na lista', tipo: 'numero', padrao: 100 }],
        }}
      />
    </Pagina>
  );
}
