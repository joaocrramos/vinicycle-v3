// Estrutura da tela (ambiente-cliente.md): barra superior, menu lateral por módulo e conteúdo.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NOMES_SITUACAO_EMPRESA, type SituacaoEmpresa } from '@vinicycle/shared';
import {
  FlaskConical,
  Boxes,
  ChartColumn,
  ClipboardCheck,
  LayoutDashboard,
  Microscope,
  Building2,
  ChevronDown,
  Droplet,
  Stamp,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  Contact,
  Container,
  FileClock,
  FileText,
  Grape,
  Handshake,
  Home,
  KeyRound,
  Library,
  LogOut,
  MapPin,
  Menu as IconeMenu,
  Package,
  Palette,
  Scale,
  BookOpen,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Tag,
  Truck,
  User,
  Users,
  Warehouse,
  Wine,
  Workflow,
  ShoppingBag,
  Upload,
  CalendarCheck,
  Landmark,
  ListChecks,
  NotebookPen,
  Layers,
  PackagePlus,
  CreditCard,
  Receipt,
  Plug,
  LifeBuoy,
  Send,
  MessageSquareText,
  Download,
  PackageCheck,
  GlassWater,
  Tags,
  FileInput,
  ClipboardList,
  FileSearch,
  BottleWine,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { SinoAlertas } from '@/componentes/SinoAlertas';
import { Botao } from '@/componentes/ui/botao';
import { Selecao } from '@/componentes/ui/campos';
import {
  ConteudoMenu,
  GatilhoMenu,
  ItemMenu,
  Menu,
  RotuloMenu,
  SeparadorMenu,
} from '@/componentes/ui/menu';
import { api } from '@/lib/api';
import { type EstadoSessao, pode, useAtualizarSessao } from '@/lib/sessao';
import { cn, formatarData, iniciais } from '@/lib/utils';

interface ItemNavegacao {
  para: string;
  rotulo: string;
  icone: ReactNode;
  visivel: boolean;
  /** Seção retrátil dentro do módulo (itens da mesma seção ficam juntos). */
  secao?: string;
  /** Número ao lado do nome (ex.: aprovações pendentes); zero não aparece. */
  contador?: number;
}

const ICONES_SECAO: Record<string, ReactNode> = {
  'Envase e expedição': <PackageCheck />,
  Estoque: <Boxes />,
  Conformidade: <Landmark />,
  Terceiros: <Handshake />,
  Cadastros: <Library />,
  Documentos: <FileText />,
  'Empresa e acesso': <Building2 />,
  'Conta e dados': <CreditCard />,
};

/** Módulos e seções abertos ou fechados: preferência deste navegador. */
const CHAVE_MENU = 'vinicycle.menu.abertos';
function lerAbertos(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_MENU) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}
function gravarAbertos(v: Record<string, boolean>) {
  try {
    localStorage.setItem(CHAVE_MENU, JSON.stringify(v));
  } catch {
    // Sem armazenamento: o menu só não lembra.
  }
}

function grupos(
  s: EstadoSessao,
  pendentes = 0,
): Array<{ titulo: string; funcao?: string; itens: ItemNavegacao[] }> {
  if (s.contexto === 'plataforma') {
    return [
      {
        titulo: 'Administração',
        itens: [
          {
            para: '/plataforma/painel',
            rotulo: 'Painel',
            icone: <LayoutDashboard />,
            visivel: pode(s, 'plataforma.painel', 'visualizar'),
          },
          {
            para: '/plataforma/clientes',
            rotulo: 'Clientes',
            icone: <Building2 />,
            visivel: pode(s, 'plataforma.clientes', 'visualizar'),
          },
          {
            para: '/plataforma/planos',
            rotulo: 'Planos',
            icone: <Layers />,
            visivel: pode(s, 'plataforma.planos', 'visualizar'),
          },
          {
            para: '/plataforma/adicionais',
            rotulo: 'Adicionais',
            icone: <PackagePlus />,
            visivel: pode(s, 'plataforma.planos', 'visualizar'),
          },
          {
            para: '/plataforma/faturas',
            rotulo: 'Faturas',
            icone: <Receipt />,
            visivel: pode(s, 'plataforma.faturas', 'visualizar'),
          },
          {
            para: '/plataforma/catalogos',
            rotulo: 'Catálogos',
            icone: <BookOpen />,
            visivel: pode(s, 'plataforma.catalogos', 'visualizar'),
          },
          {
            para: '/plataforma/regras',
            rotulo: 'Regras regulatórias',
            icone: <Scale />,
            visivel: pode(s, 'plataforma.regras', 'visualizar'),
          },
          {
            para: '/plataforma/suporte',
            rotulo: 'Suporte',
            icone: <LifeBuoy />,
            visivel: pode(s, 'plataforma.suporte', 'visualizar'),
          },
          {
            para: '/plataforma/integracoes',
            rotulo: 'Integrações',
            icone: <Plug />,
            visivel: pode(s, 'plataforma.integracoes', 'visualizar'),
          },
          {
            para: '/plataforma/envios',
            rotulo: 'Envios',
            icone: <Send />,
            visivel: pode(s, 'plataforma.envios', 'visualizar'),
          },
          {
            para: '/plataforma/modelos',
            rotulo: 'Modelos de mensagem',
            icone: <MessageSquareText />,
            visivel: pode(s, 'plataforma.envios', 'visualizar'),
          },
          {
            para: '/plataforma/configuracoes',
            rotulo: 'Configurações',
            icone: <Settings />,
            visivel: pode(s, 'plataforma.configuracoes', 'visualizar'),
          },
        ],
      },
    ];
  }
  // Um item sem permissão de Visualizar não aparece; um módulo não contratado também não (P25, P27).
  // Do uso diário para o raro (05/10/2026): o trabalho do dia a um clique, os módulos antes da
  // Gestão e as configurações no fim. Módulos novos entram entre o EnoTrace e a Gestão.
  return [
    {
      titulo: '',
      itens: [
        {
          para: '/inicio',
          rotulo: 'Início',
          icone: <Home />,
          visivel: true,
        },
        {
          para: '/gestao/aprovacoes',
          rotulo: 'Aprovações',
          icone: <ListChecks />,
          visivel: pode(s, 'gestao.aprovacoes', 'visualizar'),
          contador: pendentes,
        },
      ],
    },
    {
      titulo: 'EnoTrace',
      funcao: 'Enologia',
      itens: [
        {
          para: '/enotrace/painel',
          rotulo: 'Painel da cantina',
          icone: <LayoutDashboard />,
          visivel: pode(s, 'enotrace.painel', 'visualizar'),
        },
        {
          para: '/enotrace/projetos',
          rotulo: 'Projetos de vinho',
          icone: <Grape />,
          visivel: pode(s, 'enotrace.projetos', 'visualizar'),
        },
        {
          para: '/enotrace/recepcao',
          rotulo: 'Recepção da uva',
          icone: <Truck />,
          visivel: pode(s, 'enotrace.recepcao', 'visualizar'),
        },
        {
          para: '/enotrace/operacoes',
          rotulo: 'Operações',
          icone: <Workflow />,
          visivel: pode(s, 'enotrace.operacoes', 'visualizar'),
        },
        {
          para: '/enotrace/fermentacoes',
          rotulo: 'Fermentações',
          icone: <FlaskConical />,
          visivel: pode(s, 'enotrace.operacoes', 'visualizar'),
        },
        {
          para: '/enotrace/laboratorio',
          rotulo: 'Laboratório',
          icone: <Microscope />,
          visivel: pode(s, 'enotrace.laboratorio', 'visualizar'),
        },
        {
          para: '/enotrace/engarrafamento',
          secao: 'Envase e expedição',
          rotulo: 'Engarrafamento',
          icone: <Wine />,
          visivel: pode(s, 'enotrace.engarrafamento', 'visualizar'),
        },
        {
          para: '/enotrace/espumantes',
          secao: 'Envase e expedição',
          rotulo: 'Espumante na garrafa',
          icone: <GlassWater />,
          visivel: pode(s, 'enotrace.engarrafamento', 'visualizar'),
        },
        {
          para: '/enotrace/engarrafamento/lotes',
          secao: 'Envase e expedição',
          rotulo: 'Lotes comerciais',
          icone: <Tags />,
          visivel: pode(s, 'enotrace.engarrafamento', 'visualizar'),
        },
        {
          para: '/enotrace/saidas',
          secao: 'Envase e expedição',
          rotulo: 'Saídas',
          icone: <ShoppingBag />,
          visivel: pode(s, 'enotrace.saidas', 'visualizar'),
        },
        {
          para: '/enotrace/estoque',
          secao: 'Estoque',
          rotulo: 'Estoque',
          icone: <Boxes />,
          visivel: pode(s, 'enotrace.estoque', 'visualizar'),
        },
        {
          para: '/enotrace/estoque/notas',
          secao: 'Estoque',
          rotulo: 'Notas de entrada',
          icone: <FileInput />,
          visivel: pode(s, 'enotrace.estoque', 'visualizar'),
        },
        {
          para: '/enotrace/selos',
          secao: 'Estoque',
          rotulo: 'Selos numerados',
          icone: <Stamp />,
          visivel: pode(s, 'enotrace.estoque', 'visualizar'),
        },
        {
          para: '/enotrace/inventarios',
          secao: 'Conformidade',
          rotulo: 'Inventário da cantina',
          icone: <ClipboardList />,
          visivel: pode(s, 'enotrace.operacoes', 'visualizar'),
        },
        {
          para: '/enotrace/fechamento',
          secao: 'Conformidade',
          rotulo: 'Fechamento do mês',
          icone: <CalendarCheck />,
          visivel: pode(s, 'enotrace.declaracoes', 'visualizar'),
        },
        {
          para: '/enotrace/declaracoes',
          secao: 'Conformidade',
          rotulo: 'Declarações',
          icone: <Landmark />,
          visivel: pode(s, 'enotrace.declaracoes', 'visualizar'),
        },
        {
          para: '/enotrace/alcool',
          secao: 'Conformidade',
          rotulo: 'Livro de álcool',
          icone: <Droplet />,
          visivel: pode(s, 'enotrace.estoque', 'visualizar'),
        },
        {
          para: '/enotrace/relatorios',
          secao: 'Conformidade',
          rotulo: 'Relatórios',
          icone: <ChartColumn />,
          visivel: pode(s, 'enotrace.relatorios', 'visualizar'),
        },
        {
          para: '/enotrace/contratos',
          secao: 'Terceiros',
          rotulo: 'Contratos',
          icone: <Handshake />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/terceiros/contas',
          secao: 'Terceiros',
          rotulo: 'Conta do cliente',
          icone: <Scale />,
          visivel: pode(s, 'enotrace.relatorios', 'visualizar'),
        },
        {
          para: '/enotrace/terceiros/dossies',
          secao: 'Terceiros',
          rotulo: 'Dossiês',
          icone: <FileSearch />,
          visivel: pode(s, 'enotrace.relatorios', 'visualizar'),
        },
        {
          para: '/enotrace/terceiros/remessas',
          secao: 'Terceiros',
          rotulo: 'Produção em terceiro',
          icone: <Send />,
          visivel: pode(s, 'enotrace.operacoes', 'visualizar'),
        },
        {
          para: '/enotrace/recipientes',
          secao: 'Cadastros',
          rotulo: 'Recipientes',
          icone: <Container />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/produtos',
          secao: 'Cadastros',
          rotulo: 'Produtos',
          icone: <BottleWine />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/marcas',
          secao: 'Cadastros',
          rotulo: 'Marcas',
          icone: <Tag />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/itens',
          secao: 'Cadastros',
          rotulo: 'Insumos e embalagens',
          icone: <Package />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/vinhedos',
          secao: 'Cadastros',
          rotulo: 'Vinhedos',
          icone: <Sprout />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/catalogos',
          secao: 'Cadastros',
          rotulo: 'Catálogos',
          icone: <Library />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
        {
          para: '/enotrace/parametros',
          secao: 'Cadastros',
          rotulo: 'Parâmetros técnicos',
          icone: <SlidersHorizontal />,
          visivel: pode(s, 'enotrace.cadastros', 'visualizar'),
        },
      ],
    },
    {
      titulo: 'Gestão',
      itens: [
        {
          para: '/gestao/pessoas',
          rotulo: 'Pessoas',
          icone: <Contact />,
          visivel: pode(s, 'gestao.pessoas', 'visualizar'),
        },
        {
          para: '/gestao/diario',
          rotulo: 'Diário',
          icone: <NotebookPen />,
          visivel: pode(s, 'gestao.diario', 'visualizar'),
        },
        {
          para: '/gestao/documentos',
          secao: 'Documentos',
          rotulo: 'Documentos',
          icone: <FileText />,
          visivel: pode(s, 'gestao.documentos', 'visualizar'),
        },
        {
          para: '/gestao/autocontrole',
          secao: 'Documentos',
          rotulo: 'Autocontrole',
          icone: <ClipboardCheck />,
          visivel: pode(s, 'gestao.autocontrole', 'visualizar'),
        },
      ],
    },
    {
      titulo: 'Configurações',
      itens: [
        {
          para: '/config/empresa',
          secao: 'Empresa e acesso',
          rotulo: 'Empresa',
          icone: <Building2 />,
          visivel: pode(s, 'gestao.config.empresa', 'visualizar'),
        },
        {
          para: '/config/estabelecimentos',
          secao: 'Empresa e acesso',
          rotulo: 'Estabelecimentos',
          icone: <Warehouse />,
          visivel: pode(s, 'gestao.config.estabelecimentos', 'visualizar'),
        },
        {
          para: '/config/locais',
          secao: 'Empresa e acesso',
          rotulo: 'Locais',
          icone: <MapPin />,
          visivel: pode(s, 'gestao.config.locais', 'visualizar'),
        },
        {
          para: '/config/usuarios',
          secao: 'Empresa e acesso',
          rotulo: 'Usuários',
          icone: <Users />,
          visivel: pode(s, 'gestao.config.usuarios', 'visualizar'),
        },
        {
          para: '/config/perfis',
          secao: 'Empresa e acesso',
          rotulo: 'Perfis e permissões',
          icone: <ShieldCheck />,
          visivel: pode(s, 'gestao.config.perfis', 'visualizar'),
        },
        {
          para: '/config/parametros',
          secao: 'Empresa e acesso',
          rotulo: 'Parâmetros',
          icone: <SlidersHorizontal />,
          visivel: pode(s, 'gestao.config.parametros', 'visualizar'),
        },
        {
          para: '/config/auditoria',
          secao: 'Empresa e acesso',
          rotulo: 'Auditoria',
          icone: <FileClock />,
          visivel: pode(s, 'gestao.config.auditoria', 'visualizar'),
        },
        {
          para: '/config/assinatura',
          secao: 'Conta e dados',
          rotulo: 'Assinatura',
          icone: <CreditCard />,
          visivel: pode(s, 'gestao.assinatura', 'visualizar'),
        },
        {
          para: '/config/exportar',
          secao: 'Conta e dados',
          rotulo: 'Exportar dados',
          icone: <Download />,
          visivel: pode(s, 'gestao.config.exportar_dados', 'exportar'),
        },
        {
          para: '/enotrace/carga-inicial',
          secao: 'Conta e dados',
          rotulo: 'Carga inicial',
          icone: <Upload />,
          visivel:
            pode(s, 'enotrace.estoque', 'importar') || pode(s, 'enotrace.operacoes', 'criar'),
        },
      ],
    },
  ];
}

/**
 * O item da tela aberta: o de endereço mais longo que a contém (em Lotes comerciais, não marca
 * também o Engarrafamento).
 */
function itemAtivo(pathname: string, itens: ItemNavegacao[]): string | null {
  let melhor: string | null = null;
  for (const i of itens) {
    if (pathname !== i.para && !pathname.startsWith(`${i.para}/`)) continue;
    if (!melhor || i.para.length > melhor.length) melhor = i.para;
  }
  return melhor;
}

function LinkMenu({
  item,
  ativo,
  recolhido,
  recuo,
  aoNavegar,
}: {
  item: ItemNavegacao;
  ativo: boolean;
  recolhido: boolean;
  recuo?: boolean;
  aoNavegar: () => void;
}) {
  const contador = item.contador ? (
    <span
      className={cn(
        'rounded-full bg-primary px-1.5 text-xs leading-5 font-medium text-primary-foreground',
        recolhido ? 'absolute top-0 right-0 md:px-1 md:text-[10px] md:leading-4' : 'ml-auto',
      )}
    >
      {item.contador}
    </span>
  ) : null;
  return (
    <li>
      <NavLink
        to={item.para}
        title={item.rotulo}
        onClick={aoNavegar}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
          recuo && !recolhido && 'pl-7',
          ativo && 'bg-accent font-medium text-accent-foreground',
        )}
      >
        {item.icone}
        <span className={cn(recolhido && 'md:sr-only')}>{item.rotulo}</span>
        {contador}
      </NavLink>
    </li>
  );
}

/**
 * Um módulo do menu, retrátil, com as seções retráteis dentro. A seção da tela aberta fica aberta
 * até a pessoa fechá-la. Com o menu recolhido (só ícones), tudo aparece em ícones, sem seções.
 */
function GrupoMenu({
  titulo,
  funcao,
  itens,
  ativoPara,
  recolhido,
  abertos,
  alternar,
  aoNavegar,
}: {
  /** Vazio: itens soltos no topo, sem título. */
  titulo: string;
  funcao?: string;
  itens: ItemNavegacao[];
  ativoPara: string | null;
  recolhido: boolean;
  abertos: Record<string, boolean>;
  alternar: (chave: string, atual: boolean) => void;
  aoNavegar: () => void;
}) {
  if (!itens.length) return null;
  const ativo = (i: ItemNavegacao) => i.para === ativoPara;
  const chaveModulo = `m:${titulo}`;
  const moduloAberto = recolhido || (abertos[chaveModulo] ?? true) || itens.some(ativo);
  // Itens soltos e seções, na ordem em que aparecem.
  const blocos: Array<{ secao: string | null; itens: ItemNavegacao[] }> = [];
  for (const i of itens) {
    const ultimo = blocos.at(-1);
    if (i.secao && ultimo?.secao === i.secao) ultimo.itens.push(i);
    else blocos.push({ secao: i.secao ?? null, itens: [i] });
  }
  return (
    <div>
      {!titulo ? null : recolhido ? (
        <p className="sr-only">{titulo}</p>
      ) : (
        <button
          type="button"
          aria-expanded={moduloAberto}
          aria-label={titulo}
          onClick={() => alternar(chaveModulo, moduloAberto)}
          className="mb-1 flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:bg-muted"
        >
          <span className="flex-1">
            {titulo}
            {funcao && <span className="font-normal normal-case"> · {funcao}</span>}
          </span>
          <ChevronDown
            className={cn('size-3.5 transition-transform', !moduloAberto && '-rotate-90')}
          />
        </button>
      )}
      {moduloAberto && (
        <ul className="flex flex-col gap-0.5">
          {blocos.map((b) => {
            if (!b.secao || recolhido)
              return b.itens.map((i) => (
                <LinkMenu
                  key={i.para}
                  item={i}
                  ativo={ativo(i)}
                  recolhido={recolhido}
                  aoNavegar={aoNavegar}
                />
              ));
            const chave = `s:${titulo}/${b.secao}`;
            const aberta = abertos[chave] ?? b.itens.some(ativo);
            return (
              <li key={chave}>
                <button
                  type="button"
                  aria-expanded={aberta}
                  aria-label={b.secao}
                  onClick={() => alternar(chave, aberta)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
                    !aberta && b.itens.some(ativo) && 'font-medium text-primary',
                  )}
                >
                  {ICONES_SECAO[b.secao]}
                  <span className="flex-1">{b.secao}</span>
                  <ChevronDown className={cn('transition-transform', !aberta && '-rotate-90')} />
                </button>
                {aberta && (
                  <ul className="flex flex-col gap-0.5">
                    {b.itens.map((i) => (
                      <LinkMenu
                        key={i.para}
                        item={i}
                        ativo={ativo(i)}
                        recolhido={recolhido}
                        recuo
                        aoNavegar={aoNavegar}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Avatar({
  nome,
  cor,
  className,
}: {
  nome: string;
  cor?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
      style={cor ? { background: cor } : undefined}
    >
      {iniciais(nome)}
    </span>
  );
}

/** Faixa fixa da personificação (P28), com o botão de encerrar. */
function FaixaPersonificacao({ p }: { p: NonNullable<EstadoSessao['personificacao']> }) {
  const atualizar = useAtualizarSessao();
  const navegar = useNavigate();
  return (
    <div
      role="alert"
      className="sticky top-14 z-40 flex flex-wrap items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm font-medium text-white"
    >
      <span>
        Você está personificando {p.usuario} ({p.empresa}) até{' '}
        {new Date(p.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
        Tudo fica na auditoria com o seu nome.
      </span>
      <button
        type="button"
        className="rounded-md bg-white/20 px-3 py-1 hover:bg-white/30"
        onClick={async () => {
          const s = await api.post<EstadoSessao>('/api/auth/personificacao/encerrar', {});
          atualizar(s);
          navegar('/plataforma/clientes');
        }}
      >
        Encerrar
      </button>
    </div>
  );
}

function Faixas({ s }: { s: EstadoSessao }) {
  const e = s.empresa;
  if (s.contexto !== 'empresa' || !e) return null;
  const faixas: Array<{ tom: string; texto: string }> = [];
  if (e.emTeste && e.fimTeste)
    faixas.push({
      tom: 'bg-accent text-accent-foreground',
      texto: `Período de teste até ${formatarData(e.fimTeste)}.`,
    });
  const c = e.cobranca;
  if (e.situacao === 'ativo' && c && e.eMaster)
    faixas.push({
      tom: 'bg-warning-muted',
      texto: `Fatura ${c.numero} vencida em ${formatarData(c.vencimento)}. Sem o pagamento, a empresa passa a somente leitura em ${formatarData(c.somenteLeituraEm)}.`,
    });
  if (e.situacao === 'somente_leitura')
    faixas.push({
      tom: 'bg-warning-muted',
      texto: c
        ? `Fatura ${c.numero} vencida em ${formatarData(c.vencimento)}: empresa em somente leitura (consultas e exportações liberadas, lançamentos bloqueados). Sem o pagamento, o acesso é bloqueado em ${formatarData(c.bloqueioEm)}. O pagamento libera na hora.`
        : 'Empresa em somente leitura: consultas liberadas, alterações bloqueadas. Fale com o suporte.',
    });
  if (e.situacao === 'bloqueado')
    faixas.push({
      tom: 'bg-destructive-muted',
      texto: c
        ? `Fatura ${c.numero} vencida em ${formatarData(c.vencimento)}: empresa bloqueada. Só o Master tem acesso, à assinatura e à exportação dos dados. O pagamento libera na hora.`
        : 'Empresa bloqueada. Só o Master tem acesso, à assinatura e à exportação dos dados.',
    });
  return (
    <>
      {faixas.map((f) => (
        <div key={f.texto} role="status" className={cn('px-4 py-2 text-center text-sm', f.tom)}>
          {f.texto}
        </div>
      ))}
    </>
  );
}

export function Estrutura({ sessao: s, children }: { sessao: EstadoSessao; children?: ReactNode }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const atualizar = useAtualizarSessao();
  const [recolhido, setRecolhido] = useState(!!s.usuario.preferencias?.menuRecolhido);
  const [menuMovel, setMenuMovel] = useState(false);
  const [abertos, setAbertos] = useState(lerAbertos);
  function alternarAberto(chave: string, atual: boolean) {
    const v = { ...abertos, [chave]: !atual };
    setAbertos(v);
    gravarAbertos(v);
  }

  async function trocar(dados: Record<string, unknown>) {
    const novo = await api.post<EstadoSessao>('/api/auth/contexto', dados);
    atualizar(novo);
    if (dados.empresaId || dados.contexto)
      navegar(novo.contexto === 'plataforma' ? '/plataforma/clientes' : '/inicio');
  }

  async function sair() {
    await api.post('/api/auth/sair');
    qc.clear();
    navegar('/entrar');
  }

  function alternarMenu() {
    const v = !recolhido;
    setRecolhido(v);
    void api.put('/api/eu/preferencias', { menuRecolhido: v }).catch(() => {});
  }

  const e = s.empresa;
  const { pathname } = useLocation();
  const resumoAprovacoes = useQuery({
    queryKey: ['aprovacoes', 'resumo', e?.id, e?.estabelecimentoId],
    queryFn: () => api.get<{ pendentes: number }>('/api/aprovacoes/resumo'),
    enabled: s.contexto === 'empresa' && pode(s, 'gestao.aprovacoes', 'visualizar'),
    refetchInterval: 60_000,
  });
  const navegacao = grupos(s, resumoAprovacoes.data?.pendentes ?? 0);
  const visiveis = navegacao.flatMap((g) => g.itens.filter((i) => i.visivel));
  const ativoPara = itemAtivo(pathname, visiveis);
  // Vitrine dos módulos não contratados: no rodapé do menu, fora do trabalho do dia.
  const vitrine: ItemNavegacao = {
    para: '/modulos',
    rotulo: 'Conheça e contrate',
    icone: <Sparkles />,
    visivel: s.contexto === 'empresa' && e?.situacao !== 'bloqueado' && e?.modulos.length !== 5,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card px-3">
        <Botao
          variante="fantasma"
          tamanho="icone"
          className="md:hidden"
          aria-label="Abrir menu"
          onClick={() => setMenuMovel((v) => !v)}
        >
          <IconeMenu />
        </Botao>
        <NavLink
          to={s.contexto === 'plataforma' ? '/plataforma/clientes' : '/inicio'}
          className="flex items-center gap-2 font-semibold text-primary"
        >
          <img src="/icone.svg" alt="" className="size-7" />
          <span className="hidden sm:inline">ViniCycle</span>
        </NavLink>
        {s.contexto === 'empresa' && e && (
          <div className="flex min-w-0 items-center gap-2">
            {s.empresas.length > 1 ? (
              <Selecao
                aria-label="Empresa"
                className="h-8 max-w-48 truncate"
                value={e.id}
                onChange={(ev) => void trocar({ empresaId: ev.target.value })}
              >
                {s.empresas.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Selecao>
            ) : (
              <span className="hidden truncate text-sm font-medium sm:inline">{e.nome}</span>
            )}
            {e.estabelecimentos.length > 0 && (
              <Selecao
                aria-label="Estabelecimento"
                className="h-8 max-w-48 truncate"
                value={e.estabelecimentoId ?? ''}
                onChange={(ev) => void trocar({ estabelecimentoId: ev.target.value || null })}
              >
                {e.estabelecimentos.length > 1 && <option value="">Todos</option>}
                {e.estabelecimentos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </div>
        )}
        {s.contexto === 'plataforma' && (
          <span className="text-sm font-medium">Administração da plataforma</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {s.contexto === 'empresa' && <SinoAlertas />}
          <Menu>
            <GatilhoMenu asChild>
              <button
                type="button"
                className="cursor-pointer rounded-full"
                aria-label="Menu do usuário"
              >
                <Avatar nome={s.usuario.nome} cor={s.usuario.avatarCor} />
              </button>
            </GatilhoMenu>
            <ConteudoMenu>
              <RotuloMenu>
                <span className="block text-sm font-medium text-foreground">{s.usuario.nome}</span>
                <span className="block">{s.usuario.email}</span>
                {e && s.contexto === 'empresa' && <span className="block">{e.perfil}</span>}
              </RotuloMenu>
              <SeparadorMenu />
              <ItemMenu icone={<User />} onSelect={() => navegar('/eu/perfil')}>
                Meu perfil
              </ItemMenu>
              <ItemMenu icone={<KeyRound />} onSelect={() => navegar('/eu/seguranca')}>
                Segurança
              </ItemMenu>
              <ItemMenu icone={<Palette />} onSelect={() => navegar('/eu/preferencias')}>
                Preferências
              </ItemMenu>
              {s.contexto === 'empresa' && e && (
                <ItemMenu icone={<LifeBuoy />} onSelect={() => navegar('/suporte/chamados')}>
                  Ajuda e suporte
                </ItemMenu>
              )}
              {s.empresas.length > 1 && s.contexto === 'empresa' && (
                <ItemMenu icone={<Building2 />} onSelect={() => navegar('/escolher-empresa')}>
                  Trocar empresa
                </ItemMenu>
              )}
              {s.equipe && s.contexto === 'empresa' && (
                <ItemMenu
                  icone={<Shield />}
                  onSelect={() => void trocar({ contexto: 'plataforma' })}
                >
                  Administração da plataforma
                </ItemMenu>
              )}
              {s.contexto === 'plataforma' && s.empresas.length > 0 && (
                <ItemMenu
                  icone={<Settings />}
                  onSelect={() => void trocar({ contexto: 'empresa' })}
                >
                  Voltar para as empresas
                </ItemMenu>
              )}
              <SeparadorMenu />
              <ItemMenu icone={<LogOut />} onSelect={() => void sair()}>
                Sair
              </ItemMenu>
            </ConteudoMenu>
          </Menu>
        </div>
      </header>
      {s.personificacao && <FaixaPersonificacao p={s.personificacao} />}
      <Faixas s={s} />
      <div className="flex flex-1">
        <nav
          aria-label="Menu principal"
          className={cn(
            'fixed inset-y-14 left-0 z-30 flex w-60 shrink-0 -translate-x-full flex-col gap-4 overflow-y-auto border-r bg-card p-3 transition-transform md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:translate-x-0',
            menuMovel && 'translate-x-0',
            recolhido && 'md:w-14',
          )}
        >
          {navegacao.map((g) => (
            <GrupoMenu
              key={g.titulo || 'topo'}
              titulo={g.titulo}
              funcao={g.funcao}
              itens={g.itens.filter((i) => i.visivel)}
              ativoPara={ativoPara}
              recolhido={recolhido}
              abertos={abertos}
              alternar={alternarAberto}
              aoNavegar={() => setMenuMovel(false)}
            />
          ))}
          <div className="mt-auto flex flex-col gap-0.5">
            {vitrine.visivel && (
              <ul>
                <LinkMenu
                  item={vitrine}
                  ativo={ativoPara === vitrine.para || pathname === vitrine.para}
                  recolhido={recolhido}
                  aoNavegar={() => setMenuMovel(false)}
                />
              </ul>
            )}
            <button
              type="button"
              onClick={alternarMenu}
              className="hidden cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted md:flex"
              aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
            >
              {recolhido ? (
                <ChevronsRight className="size-4" />
              ) : (
                <ChevronsLeft className="size-4" />
              )}
              <span className={cn(recolhido && 'sr-only')}>Recolher menu</span>
            </button>
          </div>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {e && s.contexto === 'empresa' && e.situacao !== 'ativo' && e.situacao !== 'teste' && (
            <p className="sr-only">
              Situação: {NOMES_SITUACAO_EMPRESA[e.situacao as SituacaoEmpresa]}
            </p>
          )}
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

/** Título da tela e trilha (ex.: Gestão › Locais). */
export function Pagina({
  titulo,
  trilha,
  acoes,
  children,
}: {
  titulo: string;
  trilha?: string[];
  acoes?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${titulo} · ViniCycle`;
  }, [titulo]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {trilha && <p className="text-xs text-muted-foreground">{trilha.join(' › ')}</p>}
          <h1 className="text-xl font-semibold">{titulo}</h1>
        </div>
        {acoes && (
          <div className="flex gap-2" data-sem-impressao>
            {acoes}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
