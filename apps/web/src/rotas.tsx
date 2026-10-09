// Rotas e regras de acesso das telas. A barreira de verdade é o servidor (P27); aqui só se
// decide o que mostrar.
import { PaginaAlertas } from '@/paginas/Alertas'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { createBrowserRouter, Navigate, useLocation, useNavigate } from 'react-router'
import { Aviso } from '@/componentes/ui/cartao'
import { Estrutura } from '@/layout/Estrutura'
import { api } from '@/lib/api'
import { type EstadoSessao, useAtualizarSessao, useSessao } from '@/lib/sessao'
import { PaginaAssinatura } from '@/paginas/config/Assinatura'
import { PaginaVitrine } from '@/paginas/gestao/Vitrine'
import { PaginaExportar } from '@/paginas/config/Exportar'
import { PaginaAuditoria } from '@/paginas/config/Auditoria'
import { PaginaEmpresa } from '@/paginas/config/Empresa'
import {
  CriarPrimeiroEstabelecimento,
  FichaEstabelecimento,
  ListaEstabelecimentos,
  NovoEstabelecimento,
} from '@/paginas/config/Estabelecimentos'
import { PaginaLocais } from '@/paginas/config/Locais'
import { GradePerfil, ListaPerfis } from '@/paginas/config/Perfis'
import { PaginaParametrosGestao } from '@/paginas/config/Parametros'
import { PaginaUsuarios } from '@/paginas/config/Usuarios'
import { PaginaBastao } from '@/paginas/Bastao'
import { PaginaConvite } from '@/paginas/Convite'
import { EscolherEmpresa } from '@/paginas/EscolherEmpresa'
import { PaginaCatalogos } from '@/paginas/enotrace/Catalogos'
import { PaginaItens } from '@/paginas/enotrace/Itens'
import { PaginaParametros } from '@/paginas/enotrace/Parametros'
import {
  FichaProjeto,
  ListaProjetos,
  NovoProjeto,
  PaginaModelosPlano,
} from '@/paginas/enotrace/Projetos'
import { FichaProduto, ListaProdutos, NovoProduto, PaginaMarcas } from '@/paginas/enotrace/Produtos'
import { FichaRecipiente, ListaRecipientes, NovoRecipiente } from '@/paginas/enotrace/Recipientes'
import { PaginaVinhedos } from '@/paginas/enotrace/Vinhedos'
import { FichaLote } from '@/paginas/enotrace/Lotes'
import { FichaRecepcao, ListaRecepcao, NovaRecepcao } from '@/paginas/enotrace/Recepcao'
import {
  FichaOperacao,
  ListaOperacoes,
  PaginaDesengace,
  PaginaPrensagem,
} from '@/paginas/enotrace/Operacoes'
import {
  PaginaAtesto,
  PaginaCorte,
  PaginaPerda,
  PaginaTrasfega,
} from '@/paginas/enotrace/operacoes/Movimentos'
import { RelatoriosCantina } from '@/paginas/enotrace/Relatorios'
import { FichaFermentacao, ListaFermentacoes } from '@/paginas/enotrace/Fermentacoes'
import { FichaInventario, ListaInventarios } from '@/paginas/enotrace/Inventarios'
import { PaginaPainel } from '@/paginas/enotrace/Painel'
import { FichaAnalise, PaginaLaboratorio } from '@/paginas/enotrace/Laboratorio'
import { PaginaEntradaGranel, PaginaSaidaGranel } from '@/paginas/enotrace/operacoes/Granel'
import { PaginaTitularidade } from '@/paginas/enotrace/operacoes/Titularidade'
import { PaginaHigienizacao } from '@/paginas/enotrace/operacoes/Higienizacao'
import {
  PaginaAdicao,
  PaginaChaptalizacao,
  PaginaTratamento,
} from '@/paginas/enotrace/operacoes/Tratamentos'
import {
  EntradaEstoque,
  FichaEstoque,
  ListaEstoque,
  TitularidadeEstoque,
  TransferenciaEstoque,
} from '@/paginas/enotrace/Estoque'
import {
  EditarOrdem,
  FichaOrdemEngarrafamento,
  ListaLotesComerciais,
  ListaOrdens,
  NovaOrdem,
} from '@/paginas/enotrace/Engarrafamento'
import { PaginaCargaInicial } from '@/paginas/enotrace/CargaInicial'
import { PaginaAlcool } from '@/paginas/enotrace/Alcool'
import { PaginaSelos } from '@/paginas/enotrace/Selos'
import { FichaEspumante, ListaEspumantes, NovaTiragem } from '@/paginas/enotrace/Espumantes'
import { PaginaContaCliente } from '@/paginas/enotrace/ContaCliente'
import { FichaDossie, ListaDossies } from '@/paginas/enotrace/Dossies'
import {
  FichaRemessa,
  ListaRemessas,
  NovaRemessa,
  NovoRetorno,
} from '@/paginas/enotrace/ProducaoTerceiro'
import { FichaContrato, ListaContratos, NovoContrato } from '@/paginas/enotrace/Contratos'
import { PaginaDeclaracoes } from '@/paginas/enotrace/Declaracoes'
import { PaginaAprovacoes } from '@/paginas/gestao/Aprovacoes'
import { PaginaDiario } from '@/paginas/gestao/Diario'
import { FichaAutocontrole, ListaAutocontrole } from '@/paginas/gestao/Autocontrole'
import { PaginaFechamento } from '@/paginas/enotrace/Fechamento'
import { PaginaHistoria } from '@/paginas/enotrace/Historia'
import { FichaNota, ListaNotas } from '@/paginas/enotrace/NotasEstoque'
import { FichaSaida, ListaSaidas, NovaSaida, RecolhimentoLote } from '@/paginas/enotrace/Saidas'
import {
  EtiquetasDocumentos,
  FichaDocumento,
  ListaDocumentos,
  NovoDocumento,
  TiposDocumento,
} from '@/paginas/gestao/Documentos'
import { ListasGestao } from '@/paginas/gestao/Listas'
import { FichaPessoa, ListaPessoas, NovaPessoa } from '@/paginas/gestao/Pessoas'
import { MeuPerfil, PreferenciasUsuario, Seguranca } from '@/paginas/eu/Eu'
import { PaginaInicio } from '@/paginas/Inicio'
import { Cliente, ListaClientes, NovoCliente, SegundoFator } from '@/paginas/plataforma/Plataforma'
import { PaginaCatalogosPlataforma } from '@/paginas/plataforma/Catalogos'
import { PaginaConfiguracoesPlataforma } from '@/paginas/plataforma/Configuracoes'
import { PaginaFaturas } from '@/paginas/plataforma/Faturas'
import { PaginaIntegracoes } from '@/paginas/plataforma/Integracoes'
import { PaginaEnvios, PaginaModelos } from '@/paginas/plataforma/Mensagens'
import { PaginaSuporte } from '@/paginas/plataforma/Suporte'
import { PaginaChamados, SuportePublico } from '@/paginas/Suporte'
import { PaginaPainel as PainelPlataforma } from '@/paginas/plataforma/Painel'
import { PaginaAdicionais, PaginaPlanos } from '@/paginas/plataforma/Planos'
import { PaginaRegras } from '@/paginas/plataforma/Regras'
import { ConfirmarEmail, Entrar, EsqueciSenha, RedefinirSenha } from '@/paginas/publicas'

function Carregando() {
  return <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
}

function AreaAutenticada() {
  const { data: s, isLoading, isError, error } = useSessao()
  const local = useLocation()
  const navegar = useNavigate()
  const atualizar = useAtualizarSessao()
  const troca = useMutation({
    mutationFn: (contexto: 'empresa' | 'plataforma') =>
      api.post<EstadoSessao>('/api/auth/contexto', { contexto }),
    onSuccess: atualizar,
  })
  const trocando = troca.isPending
  const querPlataforma = local.pathname.startsWith('/plataforma')
  const ehPerfilPessoal = local.pathname.startsWith('/eu/')

  // O endereço decide a área: entrar num link da Administração muda o contexto, e vice-versa.
  useEffect(() => {
    if (!s || trocando || troca.isError || ehPerfilPessoal) return
    const alvo = querPlataforma ? 'plataforma' : 'empresa'
    if (s.contexto === alvo) return
    if (alvo === 'plataforma' && !s.equipe) return void navegar('/inicio', { replace: true })
    if (alvo === 'empresa' && !s.empresas.length)
      return void navegar('/plataforma/clientes', { replace: true })
    troca.mutate(alvo)
  }, [s, querPlataforma, ehPerfilPessoal, trocando, navegar, troca])

  if (isLoading || trocando) return <Carregando />
  if (isError) return <Aviso tom="erro">{(error as Error).message}</Aviso>
  if (!s)
    return (
      <Navigate to={`/entrar?volta=${encodeURIComponent(local.pathname + local.search)}`} replace />
    )

  if (s.contexto === 'plataforma') {
    if (!ehPerfilPessoal && !s.equipe?.segundoFatorValido) {
      return (
        <Estrutura sessao={s}>
          <SegundoFator sessao={s} />
        </Estrutura>
      )
    }
    return <Estrutura sessao={s} />
  }
  if (!s.empresa) {
    // Equipe da plataforma sem empresa vai direto para a Administração.
    if (!s.empresas.length && s.equipe) return <Navigate to="/plataforma/clientes" replace />
    return <EscolherEmpresa sessao={s} />
  }
  // Empresa bloqueada: o Master vê a assinatura (o que está em aberto) e exporta os dados; os
  // demais, só o aviso (administracao.md, Inadimplência e bloqueio).
  if (s.empresa.situacao === 'bloqueado' && !ehPerfilPessoal) {
    if (!s.empresa.eMaster) {
      return (
        <Estrutura sessao={s}>
          <Aviso tom="erro">
            O acesso de {s.empresa.nome} está bloqueado. Só o Master entra enquanto a situação não
            for regularizada; fale com ele.
          </Aviso>
        </Estrutura>
      )
    }
    if (!['/config/assinatura', '/config/exportar', '/suporte/chamados'].includes(local.pathname)) {
      return <Navigate to="/config/assinatura" replace />
    }
  }
  if (s.empresa.precisaEstabelecimento && !ehPerfilPessoal) {
    return (
      <Estrutura sessao={s}>
        <CriarPrimeiroEstabelecimento sessao={s} />
      </Estrutura>
    )
  }
  return <Estrutura sessao={s} />
}

function EscolherEmpresaRota() {
  const { data: s } = useSessao()
  if (!s) return <Navigate to="/entrar" replace />
  return <EscolherEmpresa sessao={s} />
}

function NaoEncontrada() {
  return (
    <div className="mx-auto max-w-md p-8">
      <Aviso tom="alerta">Página não encontrada.</Aviso>
    </div>
  )
}

export const rotas = createBrowserRouter([
  { path: '/entrar', element: <Entrar /> },
  { path: '/esqueci-senha', element: <EsqueciSenha /> },
  { path: '/suporte', element: <SuportePublico /> },
  { path: '/redefinir-senha', element: <RedefinirSenha /> },
  { path: '/convite/:token', element: <PaginaConvite /> },
  { path: '/bastao/:token', element: <PaginaBastao /> },
  { path: '/confirmar-email', element: <ConfirmarEmail /> },
  { path: '/escolher-empresa', element: <EscolherEmpresaRota /> },
  {
    element: <AreaAutenticada />,
    children: [
      { index: true, element: <Navigate to="/inicio" replace /> },
      { path: 'inicio', element: <PaginaInicio /> },
      { path: 'alertas', element: <PaginaAlertas /> },
      { path: 'config/empresa', element: <PaginaEmpresa /> },
      { path: 'config/estabelecimentos', element: <ListaEstabelecimentos /> },
      { path: 'config/estabelecimentos/novo', element: <NovoEstabelecimento /> },
      { path: 'config/estabelecimentos/:id', element: <FichaEstabelecimento /> },
      { path: 'config/locais', element: <PaginaLocais /> },
      { path: 'config/usuarios', element: <PaginaUsuarios /> },
      { path: 'config/perfis', element: <ListaPerfis /> },
      { path: 'config/perfis/:id', element: <GradePerfil /> },
      { path: 'config/parametros', element: <PaginaParametrosGestao /> },
      { path: 'config/auditoria', element: <PaginaAuditoria /> },
      { path: 'config/assinatura', element: <PaginaAssinatura /> },
      { path: 'modulos', element: <PaginaVitrine /> },
      { path: 'config/exportar', element: <PaginaExportar /> },
      { path: 'gestao/pessoas', element: <ListaPessoas /> },
      { path: 'gestao/pessoas/nova', element: <NovaPessoa /> },
      { path: 'gestao/pessoas/:id', element: <FichaPessoa /> },
      { path: 'gestao/listas/:lista', element: <ListasGestao /> },
      { path: 'gestao/documentos', element: <ListaDocumentos /> },
      { path: 'gestao/autocontrole', element: <ListaAutocontrole /> },
      { path: 'gestao/aprovacoes', element: <PaginaAprovacoes /> },
      { path: 'gestao/diario', element: <PaginaDiario /> },
      { path: 'gestao/autocontrole/:id', element: <FichaAutocontrole /> },
      { path: 'gestao/documentos/novo', element: <NovoDocumento /> },
      { path: 'gestao/documentos/etiquetas', element: <EtiquetasDocumentos /> },
      { path: 'gestao/documentos/tipos', element: <TiposDocumento /> },
      { path: 'gestao/documentos/:id', element: <FichaDocumento /> },
      { path: 'enotrace/recepcao', element: <ListaRecepcao /> },
      { path: 'enotrace/recepcao/nova', element: <NovaRecepcao /> },
      { path: 'enotrace/recepcao/:id', element: <FichaRecepcao /> },
      { path: 'enotrace/operacoes', element: <ListaOperacoes /> },
      { path: 'enotrace/operacoes/desengace', element: <PaginaDesengace /> },
      { path: 'enotrace/operacoes/prensagem', element: <PaginaPrensagem /> },
      { path: 'enotrace/operacoes/trasfega', element: <PaginaTrasfega /> },
      { path: 'enotrace/operacoes/corte', element: <PaginaCorte /> },
      { path: 'enotrace/operacoes/atesto', element: <PaginaAtesto /> },
      { path: 'enotrace/operacoes/perda', element: <PaginaPerda /> },
      { path: 'enotrace/operacoes/adicao_insumo', element: <PaginaAdicao /> },
      { path: 'enotrace/operacoes/chaptalizacao', element: <PaginaChaptalizacao /> },
      { path: 'enotrace/operacoes/tratamento', element: <PaginaTratamento /> },
      { path: 'enotrace/operacoes/higienizacao', element: <PaginaHigienizacao /> },
      { path: 'enotrace/operacoes/entrada_granel', element: <PaginaEntradaGranel /> },
      { path: 'enotrace/operacoes/saida_granel', element: <PaginaSaidaGranel /> },
      { path: 'enotrace/operacoes/titularidade', element: <PaginaTitularidade /> },
      { path: 'enotrace/painel', element: <PaginaPainel /> },
      { path: 'enotrace/laboratorio', element: <PaginaLaboratorio /> },
      { path: 'enotrace/laboratorio/analises/:id', element: <FichaAnalise /> },
      { path: 'enotrace/laboratorio/:aba', element: <PaginaLaboratorio /> },
      { path: 'enotrace/relatorios', element: <RelatoriosCantina /> },
      { path: 'enotrace/fermentacoes', element: <ListaFermentacoes /> },
      { path: 'enotrace/fermentacoes/:id', element: <FichaFermentacao /> },
      { path: 'enotrace/inventarios', element: <ListaInventarios /> },
      { path: 'enotrace/inventarios/:id', element: <FichaInventario /> },
      { path: 'enotrace/estoque', element: <ListaEstoque /> },
      { path: 'enotrace/estoque/entrada', element: <EntradaEstoque /> },
      { path: 'enotrace/estoque/transferencia', element: <TransferenciaEstoque /> },
      { path: 'enotrace/estoque/titularidade', element: <TitularidadeEstoque /> },
      { path: 'enotrace/engarrafamento', element: <ListaOrdens /> },
      { path: 'enotrace/engarrafamento/nova', element: <NovaOrdem /> },
      { path: 'enotrace/engarrafamento/lotes', element: <ListaLotesComerciais /> },
      { path: 'enotrace/engarrafamento/:id', element: <FichaOrdemEngarrafamento /> },
      { path: 'enotrace/engarrafamento/:id/editar', element: <EditarOrdem /> },
      { path: 'enotrace/carga-inicial', element: <PaginaCargaInicial /> },
      { path: 'enotrace/fechamento', element: <PaginaFechamento /> },
      { path: 'enotrace/declaracoes', element: <PaginaDeclaracoes /> },
      { path: 'enotrace/alcool', element: <PaginaAlcool /> },
      { path: 'enotrace/selos', element: <PaginaSelos /> },
      { path: 'enotrace/espumantes', element: <ListaEspumantes /> },
      { path: 'enotrace/espumantes/tiragem', element: <NovaTiragem /> },
      { path: 'enotrace/espumantes/:id', element: <FichaEspumante /> },
      { path: 'enotrace/historia', element: <PaginaHistoria /> },
      { path: 'enotrace/estoque/notas', element: <ListaNotas tipo="compra" /> },
      { path: 'enotrace/estoque/notas/:id', element: <FichaNota tipo="compra" /> },
      { path: 'enotrace/saidas', element: <ListaSaidas /> },
      { path: 'enotrace/saidas/nova', element: <NovaSaida /> },
      { path: 'enotrace/saidas/notas', element: <ListaNotas tipo="venda" /> },
      { path: 'enotrace/saidas/notas/:id', element: <FichaNota tipo="venda" /> },
      { path: 'enotrace/saidas/:id', element: <FichaSaida /> },
      { path: 'enotrace/engarrafamento/lotes/:id', element: <RecolhimentoLote /> },
      { path: 'enotrace/estoque/:id', element: <FichaEstoque /> },
      { path: 'enotrace/operacoes/:id', element: <FichaOperacao /> },
      { path: 'enotrace/lotes/:id', element: <FichaLote /> },
      { path: 'enotrace/projetos', element: <ListaProjetos /> },
      { path: 'enotrace/projetos/novo', element: <NovoProjeto /> },
      { path: 'enotrace/projetos/:id', element: <FichaProjeto /> },
      { path: 'enotrace/modelos-plano', element: <PaginaModelosPlano /> },
      { path: 'enotrace/vinhedos', element: <PaginaVinhedos /> },
      { path: 'enotrace/catalogos', element: <PaginaCatalogos /> },
      { path: 'enotrace/catalogos/:aba', element: <PaginaCatalogos /> },
      { path: 'enotrace/recipientes', element: <ListaRecipientes /> },
      { path: 'enotrace/recipientes/novo', element: <NovoRecipiente /> },
      { path: 'enotrace/recipientes/:id', element: <FichaRecipiente /> },
      { path: 'enotrace/itens', element: <PaginaItens /> },
      { path: 'enotrace/itens/:tipo', element: <PaginaItens /> },
      { path: 'enotrace/marcas', element: <PaginaMarcas /> },
      { path: 'enotrace/contratos', element: <ListaContratos /> },
      { path: 'enotrace/terceiros/contas', element: <PaginaContaCliente /> },
      { path: 'enotrace/terceiros/dossies', element: <ListaDossies /> },
      { path: 'enotrace/terceiros/remessas', element: <ListaRemessas /> },
      { path: 'enotrace/terceiros/remessas/nova', element: <NovaRemessa /> },
      { path: 'enotrace/terceiros/remessas/:id', element: <FichaRemessa /> },
      { path: 'enotrace/terceiros/remessas/:id/retorno', element: <NovoRetorno /> },
      { path: 'enotrace/terceiros/dossies/:id', element: <FichaDossie /> },
      { path: 'enotrace/contratos/novo', element: <NovoContrato /> },
      { path: 'enotrace/contratos/:id', element: <FichaContrato /> },
      { path: 'enotrace/produtos', element: <ListaProdutos /> },
      { path: 'enotrace/produtos/novo', element: <NovoProduto /> },
      { path: 'enotrace/produtos/:id', element: <FichaProduto /> },
      { path: 'enotrace/parametros', element: <PaginaParametros /> },
      { path: 'enotrace/parametros/:aba', element: <PaginaParametros /> },
      { path: 'eu/perfil', element: <MeuPerfil /> },
      { path: 'eu/seguranca', element: <Seguranca /> },
      { path: 'eu/preferencias', element: <PreferenciasUsuario /> },
      { path: 'plataforma', element: <Navigate to="/plataforma/clientes" replace /> },
      { path: 'plataforma/clientes', element: <ListaClientes /> },
      { path: 'plataforma/clientes/novo', element: <NovoCliente /> },
      { path: 'plataforma/clientes/:id', element: <Cliente /> },
      { path: 'plataforma/regras', element: <PaginaRegras /> },
      { path: 'plataforma/catalogos', element: <PaginaCatalogosPlataforma /> },
      { path: 'plataforma/catalogos/:aba', element: <PaginaCatalogosPlataforma /> },
      { path: 'plataforma/planos', element: <PaginaPlanos /> },
      { path: 'plataforma/adicionais', element: <PaginaAdicionais /> },
      { path: 'plataforma/faturas', element: <PaginaFaturas /> },
      { path: 'plataforma/integracoes', element: <PaginaIntegracoes /> },
      { path: 'plataforma/envios', element: <PaginaEnvios /> },
      { path: 'plataforma/modelos', element: <PaginaModelos /> },
      { path: 'plataforma/suporte', element: <PaginaSuporte /> },
      { path: 'suporte/chamados', element: <PaginaChamados /> },
      { path: 'plataforma/painel', element: <PainelPlataforma /> },
      { path: 'plataforma/configuracoes', element: <PaginaConfiguracoesPlataforma /> },
      { path: '*', element: <NaoEncontrada /> },
    ],
  },
])
