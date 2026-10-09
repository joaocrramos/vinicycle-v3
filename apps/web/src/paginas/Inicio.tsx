// Início (ambiente-cliente.md, Primeiro acesso do Master): alertas abertos (P20), os passos da
// implantação com o que já foi feito, e atalhos da cantina pelo que o perfil pode fazer (P27).
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router';
import { type Alerta, COR_GRAVIDADE } from '@/componentes/SinoAlertas';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { pode, useSessao } from '@/lib/sessao';
import { cn } from '@/lib/utils';

interface Contagens {
  locais: number;
  recipientes: number;
  produtos: number;
  itens: number;
  usuarios: number;
  cargas: number;
  projetos: number;
  empresaCompleta: boolean;
}

export function PaginaInicio() {
  const { data: s } = useSessao();
  const e = s?.empresa;
  const contagens = useQuery({
    queryKey: ['inicio'],
    queryFn: () => api.get<Contagens>('/api/inicio'),
    enabled: !!e,
  });
  const alertas = useQuery({
    queryKey: ['alertas', 'aberto'],
    queryFn: () => api.get<Alerta[]>('/api/alertas'),
    enabled: !!e,
  });
  if (!s || !e) return null;
  const c = contagens.data;
  const passos = [
    {
      feito: !!c?.empresaCompleta,
      texto: 'Completar os dados da empresa (CNPJ, endereço, registro no MAPA)',
      para: '/config/empresa',
      visivel: pode(s, 'gestao.config.empresa', 'editar'),
    },
    {
      feito: e.estabelecimentos.length > 0,
      texto: 'Cadastrar o estabelecimento',
      para: '/config/estabelecimentos',
      visivel: pode(s, 'gestao.config.estabelecimentos', 'criar'),
    },
    {
      feito: (c?.locais ?? 0) > 0,
      texto: 'Cadastrar os locais (adega, almoxarifado, expedição…)',
      para: '/config/locais',
      visivel: pode(s, 'gestao.config.locais', 'criar'),
    },
    {
      feito: (c?.recipientes ?? 0) > 0,
      texto: 'Cadastrar os recipientes (tanques, barricas…)',
      para: '/enotrace/recipientes',
      visivel: pode(s, 'enotrace.cadastros', 'criar'),
    },
    {
      feito: (c?.itens ?? 0) > 0,
      texto: 'Cadastrar insumos e embalagens',
      para: '/enotrace/itens',
      visivel: pode(s, 'enotrace.cadastros', 'criar'),
    },
    {
      feito: (c?.produtos ?? 0) > 0,
      texto: 'Cadastrar os produtos, com rótulo, formatos e ficha de embalagem',
      para: '/enotrace/produtos',
      visivel: pode(s, 'enotrace.cadastros', 'criar'),
    },
    {
      feito: (c?.cargas ?? 0) > 0,
      texto: 'Carregar o saldo de abertura (vinho, garrafas e insumos)',
      para: '/enotrace/carga-inicial',
      visivel: pode(s, 'enotrace.estoque', 'importar') || pode(s, 'enotrace.operacoes', 'criar'),
    },
    {
      feito: false,
      texto: 'Revisar os perfis e a grade de permissões',
      para: '/config/perfis',
      visivel: pode(s, 'gestao.config.perfis', 'editar'),
    },
    {
      feito: (c?.usuarios ?? 0) > 1,
      texto: 'Convidar os usuários',
      para: '/config/usuarios',
      visivel: pode(s, 'gestao.config.usuarios', 'criar'),
    },
  ].filter((p) => p.visivel);
  const atalhos = [
    {
      texto: 'Painel da cantina',
      para: '/enotrace/painel',
      ok: pode(s, 'enotrace.painel', 'visualizar'),
    },
    {
      texto: 'Nova operação',
      para: '/enotrace/operacoes',
      ok: pode(s, 'enotrace.operacoes', 'criar'),
    },
    {
      texto: 'Recepção da uva',
      para: '/enotrace/recepcao',
      ok: pode(s, 'enotrace.recepcao', 'visualizar'),
    },
    {
      texto: 'Laboratório',
      para: '/enotrace/laboratorio',
      ok: pode(s, 'enotrace.laboratorio', 'visualizar'),
    },
    {
      texto: 'Engarrafamento',
      para: '/enotrace/engarrafamento',
      ok: pode(s, 'enotrace.engarrafamento', 'visualizar'),
    },
    { texto: 'Saídas', para: '/enotrace/saidas', ok: pode(s, 'enotrace.saidas', 'visualizar') },
    { texto: 'Estoque', para: '/enotrace/estoque', ok: pode(s, 'enotrace.estoque', 'visualizar') },
    {
      texto: 'Fechamento do mês',
      para: '/enotrace/fechamento',
      ok: pode(s, 'enotrace.declaracoes', 'visualizar'),
    },
  ].filter((a) => a.ok);
  const nomeEstab = e.estabelecimentos.find((x) => x.id === e.estabelecimentoId)?.nome;
  const faltam = passos.filter((p) => !p.feito).length;
  const abertos = alertas.data ?? [];
  const criticos = abertos.filter((a) => a.gravidade === 'critico').length;
  return (
    <Pagina titulo={`Olá, ${s.usuario.nome.split(' ')[0]}`}>
      <p className="text-sm text-muted-foreground">
        {e.nome}
        {nomeEstab ? ` · ${nomeEstab}` : ' · todos os estabelecimentos'} · perfil {e.perfil}
      </p>
      {abertos.length > 0 && (
        <Cartao>
          <CabecalhoCartao
            titulo={`Alertas abertos: ${abertos.length}`}
            descricao={criticos ? `${criticos} críticos.` : undefined}
            acoes={
              <Link to="/alertas" className="text-sm underline">
                Ver todos
              </Link>
            }
          />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            {abertos.slice(0, 6).map((a) => (
              <p key={a.id} className="flex gap-2">
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', COR_GRAVIDADE[a.gravidade])}
                />
                {a.link ? (
                  <Link to={a.link} className="hover:underline">
                    {a.mensagem}
                  </Link>
                ) : (
                  a.mensagem
                )}
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      )}
      {alertas.data && !abertos.length && <Aviso tom="sucesso">Nenhum alerta aberto.</Aviso>}
      {atalhos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <Link
              key={a.para}
              to={a.para}
              className="rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted"
            >
              {a.texto}
            </Link>
          ))}
        </div>
      )}
      {passos.length > 0 && faltam > 0 && (
        <Cartao>
          <CabecalhoCartao
            titulo="Implantação"
            descricao="Os passos para começar a usar. Cada um some da conta quando estiver feito."
          />
          <CorpoCartao>
            <ul className="flex flex-col gap-2">
              {passos.map((p) => (
                <li key={p.texto} className="flex items-center gap-2 text-sm">
                  {p.feito ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <Link
                    to={p.para}
                    className={cn('hover:underline', p.feito && 'text-muted-foreground')}
                  >
                    {p.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      )}
    </Pagina>
  );
}
