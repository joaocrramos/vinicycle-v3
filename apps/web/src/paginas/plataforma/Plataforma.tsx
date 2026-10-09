// Administração da plataforma (administracao.md): segundo fator, clientes.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DIAS_VENCIMENTO,
  type FormaPagamento,
  formatarDocumento,
  formatarMoeda,
  NOMES_FORMA_PAGAMENTO,
  NOMES_PERIODICIDADE,
  NOMES_SITUACAO_EMPRESA,
  paraCentavos,
  type Periodicidade,
  novaEmpresa,
  PERIODICIDADES,
  SITUACOES_EMPRESA,
  type SituacaoEmpresa,
} from '@vinicycle/shared';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PainelAssinatura } from '@/componentes/Assinatura';
import {
  DetalheFatura,
  type LinhaFatura,
  ListaFaturas,
  NovaFaturaAvulsa,
} from '@/componentes/Faturas';
import { CampoTelefone } from '@/componentes/campos-especiais';
import { FICHA_VAZIA_PJ, FichaCadastral } from '@/componentes/FichaCadastral';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { type EstadoSessao, pode, useAtualizarSessao, useSessao } from '@/lib/sessao';
import { formatarData, formatarDataHora } from '@/lib/utils';
import { ConfigurarSegundoFator } from '../eu/Eu';

const TOM: Record<SituacaoEmpresa, 'sucesso' | 'alerta' | 'erro' | 'neutro' | 'primario'> = {
  teste: 'primario',
  ativo: 'sucesso',
  somente_leitura: 'alerta',
  bloqueado: 'erro',
  inativo: 'neutro',
};

/** A Administração exige o código do aplicativo autenticador (P21). */
export function SegundoFator({ sessao }: { sessao: EstadoSessao }) {
  const atualizar = useAtualizarSessao();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = async () => atualizar(await api.get<EstadoSessao>('/api/auth/sessao'));
  return (
    <Pagina titulo="Segundo fator">
      <Cartao>
        <CorpoCartao className="flex flex-col gap-4">
          {!sessao.equipe?.segundoFatorConfigurado ? (
            <>
              <Aviso tom="info">
                A equipe da plataforma precisa do segundo fator para entrar na Administração.
              </Aviso>
              <ConfigurarSegundoFator aoConcluir={() => void recarregar()} />
            </>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (ev) => {
                ev.preventDefault();
                try {
                  await api.post('/api/auth/segundo-fator/conferir', { codigo });
                  await recarregar();
                } catch (e) {
                  setErro((e as Error).message);
                }
              }}
            >
              <p className="text-sm">
                Informe o código de 6 dígitos do aplicativo autenticador. Ele vale por 12 horas
                nesta sessão.
              </p>
              {erro && <Aviso tom="erro">{erro}</Aviso>}
              <Campo rotulo="Código" id="codigo">
                <Entrada
                  id="codigo"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  className="w-32"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                />
              </Campo>
              <div>
                <Botao type="submit">Confirmar</Botao>
              </div>
            </form>
          )}
        </CorpoCartao>
      </Cartao>
    </Pagina>
  );
}

interface LinhaCliente {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  documento: string | null;
  tipoPessoa: string;
  situacao: SituacaoEmpresa;
  criadoEm: string;
  usuarios: number;
}

export function ListaClientes() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  return (
    <Pagina
      titulo="Clientes"
      trilha={['Administração']}
      acoes={
        pode(s, 'plataforma.clientes', 'criar') && (
          <Botao onClick={() => navegar('/plataforma/clientes/novo')}>
            <Plus /> Novo cliente
          </Botao>
        )
      }
    >
      <TabelaDados<LinhaCliente>
        tabela="plataforma.clientes"
        url="/api/plataforma/empresas"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        aoClicar={(c) => navegar(`/plataforma/clientes/${c.id}`)}
        podeExportar={pode(s, 'plataforma.clientes', 'exportar')}
        filtros={(f, definir) => (
          <Selecao
            aria-label="Situação"
            className="w-44"
            value={f.situacao ?? ''}
            onChange={(e) => definir('situacao', e.target.value)}
          >
            <option value="">Todas as situações</option>
            {SITUACOES_EMPRESA.map((x) => (
              <option key={x} value={x}>
                {NOMES_SITUACAO_EMPRESA[x]}
              </option>
            ))}
          </Selecao>
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Cliente',
            ordenavel: true,
            celula: (c) => c.nomeFantasia || c.nome,
            exportar: (c) => c.nome,
          },
          {
            id: 'documento',
            titulo: 'CNPJ/CPF',
            ordenavel: true,
            celula: (c) =>
              c.documento
                ? formatarDocumento(c.tipoPessoa === 'fisica' ? 'cpf' : 'cnpj', c.documento)
                : '—',
            exportar: (c) => c.documento,
          },
          {
            id: 'usuarios',
            titulo: 'Usuários',
            className: 'text-right',
            celula: (c) => c.usuarios,
            exportar: (c) => c.usuarios,
          },
          {
            id: 'criadoEm',
            titulo: 'Cliente desde',
            ordenavel: true,
            celula: (c) => formatarDataHora(c.criadoEm),
            exportar: (c) => c.criadoEm,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            ordenavel: true,
            celula: (c) => (
              <Etiqueta tom={TOM[c.situacao]}>{NOMES_SITUACAO_EMPRESA[c.situacao]}</Etiqueta>
            ),
            exportar: (c) => c.situacao,
          },
        ]}
      />
    </Pagina>
  );
}

export function NovoCliente() {
  const navegar = useNavigate();
  const planos = useQuery({
    queryKey: ['planos'],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          nome: string;
          descricao: string | null;
          precos: Partial<Record<Periodicidade, string>>;
          formasPagamento: FormaPagamento[];
        }>
      >('/api/plataforma/planos'),
  });
  const form = useFormulario(novaEmpresa, {
    ficha: { ...FICHA_VAZIA_PJ },
    emailMaster: '',
    planoId: '',
    periodicidade: 'mensal',
    inicio: new Date().toISOString().slice(0, 10),
    emTeste: false,
    diaVencimento: null,
    formaPagamento: null,
    contatoFinanceiroNome: '',
    contatoFinanceiroEmail: '',
    contatoFinanceiroTelefone: '',
  });
  const [enviando, setEnviando] = useState(false);
  const v = form.valores as Record<string, unknown>;
  const plano = planos.data?.find((p) => p.id === v.planoId);
  const preco = plano?.precos[v.periodicidade as Periodicidade];

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const d = form.validar();
    if (!d) return;
    setEnviando(true);
    try {
      const r = await api.post<{ id: string }>('/api/plataforma/empresas', d);
      navegar(`/plataforma/clientes/${r.id}`, { replace: true });
    } catch (e) {
      form.erroDaApi(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pagina titulo="Novo cliente" trilha={['Administração', 'Clientes']}>
      <Aviso tom="info">
        A plataforma cadastra só o cliente. Estabelecimentos, registro no MAPA e responsável técnico
        são preenchidos pelo próprio cliente no primeiro acesso.
      </Aviso>
      <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
        {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
        <Cartao>
          <CabecalhoCartao titulo="Dados do cliente" />
          <CorpoCartao>
            <FichaCadastral form={form} documentoObrigatorio />
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Contato financeiro" />
          <CorpoCartao className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Nome" id="cfn">
              <Entrada
                id="cfn"
                value={(v.contatoFinanceiroNome as string) ?? ''}
                onChange={(e) => form.definir('contatoFinanceiroNome', e.target.value)}
              />
            </Campo>
            <Campo rotulo="E-mail" id="cfe" erro={form.erro('contatoFinanceiroEmail')}>
              <Entrada
                id="cfe"
                type="email"
                value={(v.contatoFinanceiroEmail as string) ?? ''}
                onChange={(e) => form.definir('contatoFinanceiroEmail', e.target.value)}
                onBlur={() => form.tocar('contatoFinanceiroEmail')}
              />
            </Campo>
            <Campo rotulo="Telefone" id="cft">
              <CampoTelefone
                id="cft"
                valor={(v.contatoFinanceiroTelefone as string) ?? ''}
                aoMudar={(x) => form.definir('contatoFinanceiroTelefone', x)}
              />
            </Campo>
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao
            titulo="Master e assinatura"
            descricao="O Master recebe o convite por e-mail. O preço do plano fica congelado na contratação; adicionais e descontos são incluídos depois, na ficha do cliente."
          />
          <CorpoCartao className="grid gap-4 sm:grid-cols-3">
            <Campo
              rotulo="E-mail do Master"
              id="emailMaster"
              erro={form.erro('emailMaster')}
              obrigatorio
              className="sm:col-span-3"
            >
              <Entrada
                id="emailMaster"
                type="email"
                placeholder="nome@exemplo.com.br"
                value={v.emailMaster as string}
                onChange={(e) => form.definir('emailMaster', e.target.value)}
                onBlur={() => form.tocar('emailMaster')}
              />
            </Campo>
            <Campo rotulo="Plano" id="plano" erro={form.erro('planoId')} obrigatorio>
              <Selecao
                id="plano"
                value={v.planoId as string}
                onChange={(e) => form.definir('planoId', e.target.value)}
              >
                <option value="">Escolha</option>
                {planos.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo
              rotulo="Ciclo de cobrança"
              id="periodicidade"
              ajuda={
                plano
                  ? preco
                    ? `Preço: ${formatarMoeda(paraCentavos(preco))} por ciclo`
                    : 'O plano não é vendido neste ciclo'
                  : undefined
              }
            >
              <Selecao
                id="periodicidade"
                value={v.periodicidade as string}
                onChange={(e) => form.definir('periodicidade', e.target.value)}
              >
                {PERIODICIDADES.map((p) => (
                  <option key={p} value={p}>
                    {NOMES_PERIODICIDADE[p]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Início" id="inicio" erro={form.erro('inicio')}>
              <Entrada
                id="inicio"
                type="date"
                value={v.inicio as string}
                onChange={(e) => form.definir('inicio', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Dia do vencimento"
              id="diaVencimento"
              erro={form.erro('diaVencimento')}
              ajuda="30 = último dia em fevereiro."
            >
              <Selecao
                id="diaVencimento"
                value={(v.diaVencimento as number | null) ?? ''}
                onChange={(e) =>
                  form.definir('diaVencimento', e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">O primeiro a partir do dia do início</option>
                {DIAS_VENCIMENTO.map((d) => (
                  <option key={d} value={d}>
                    Dia {d}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Forma de pagamento" id="formaPagamento">
              <Selecao
                id="formaPagamento"
                value={(v.formaPagamento as string | null) ?? ''}
                onChange={(e) => form.definir('formaPagamento', e.target.value || null)}
              >
                <option value="">Não definida</option>
                {plano?.formasPagamento.map((f) => (
                  <option key={f} value={f}>
                    {NOMES_FORMA_PAGAMENTO[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Caixa
              rotulo="Começa em teste de 7 dias"
              checked={!!v.emTeste}
              onChange={(e) => form.definir('emTeste', e.target.checked)}
            />
          </CorpoCartao>
        </Cartao>
        <div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar cliente e enviar convite'}
          </Botao>
        </div>
      </form>
    </Pagina>
  );
}

interface FichaCliente {
  id: string;
  situacao: SituacaoEmpresa;
  criadoEm: string;
  ficha: {
    nome: string;
    nomeFantasia: string | null;
    documento: string | null;
    tipoPessoa: string;
  };
  assinatura: {
    plano: string;
    periodicidade: string;
    inicio: string;
    emTeste: boolean;
    fimTeste: string | null;
  } | null;
  usuarios: Array<{
    vinculoId: string;
    usuarioId: string;
    email: string;
    nome: string;
    perfil: string;
    eMaster: boolean;
    ativo: boolean;
  }>;
  convites: Array<{
    id: string;
    email: string;
    perfil: string;
    eMaster: boolean;
    situacao: string;
    expiraEm: string;
    enviadoEm: string;
  }>;
  estabelecimentos: Array<{ id: string; nome: string; documento: string | null; ativo: boolean }>;
  historico: Array<{
    id: string;
    situacao: SituacaoEmpresa;
    desde: string;
    motivo: string | null;
    origem: string;
  }>;
}

interface BastaoCliente {
  pendente: null | {
    escolhido: string;
    escolhidoEmail: string;
    perfilAnterior: string | null;
    iniciadoPor: 'master' | 'suporte';
    expiraEm: string;
  };
  perfis: Array<{ id: string; nome: string }>;
}

/**
 * Troca do Master pelo suporte (administracao.md): Master desaparecido, falecimento, desligamento.
 * Exige motivo e comprovante (P15); o designado aceita pelo e-mail, em 48 horas.
 */
function TrocaDoMaster({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['cliente-bastao', empresaId],
    queryFn: () => api.get<BastaoCliente>(`/api/plataforma/empresas/${empresaId}/bastao`),
  });
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [perfilAnteriorId, setPerfilAnteriorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podeTrocar = pode(s, 'plataforma.troca_master', 'criar');
  if (!q.data) return null;
  const p = q.data.pendente;
  const recarregar = () => qc.invalidateQueries({ queryKey: ['cliente-bastao', empresaId] });
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Troca do Master"
        descricao="Feita pelo próprio Master em Usuários. Aqui, só quando o cliente pede ao suporte."
      />
      <CorpoCartao className="flex flex-col gap-3 text-sm">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {p ? (
          <>
            <p>
              Pedido {p.iniciadoPor === 'suporte' ? 'do suporte' : 'do Master'} para{' '}
              <strong>{p.escolhido}</strong>, aguardando o aceite até {formatarDataHora(p.expiraEm)}
              .{' '}
              {p.perfilAnterior
                ? `O Master atual passará a ${p.perfilAnterior}.`
                : 'O acesso do Master atual será inativado.'}
            </p>
            {podeTrocar && (
              <div>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={async () => {
                    try {
                      await api.post(`/api/plataforma/empresas/${empresaId}/bastao/cancelar`);
                      await recarregar();
                    } catch (e) {
                      setErro((e as Error).message);
                    }
                  }}
                >
                  Cancelar o pedido
                </Botao>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground">Nenhum pedido pendente.</p>
            {podeTrocar && (
              <div>
                <Botao variante="secundario" tamanho="pequeno" onClick={() => setAberto(true)}>
                  Designar novo Master
                </Botao>
              </div>
            )}
          </>
        )}
      </CorpoCartao>
      <Dialogo
        aberto={aberto}
        aoMudar={setAberto}
        titulo="Designar novo Master"
        descricao="O designado recebe um e-mail para aceitar em 48 horas; nada muda antes disso. O Master atual é avisado."
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              disabled={!email || motivo.trim().length < 10 || !arquivo}
              onClick={async () => {
                setErro(null);
                const dados = new FormData();
                // Os campos vão antes do arquivo: o servidor lê na ordem.
                dados.set('email', email);
                dados.set('perfilAnteriorId', perfilAnteriorId);
                dados.set('motivo', motivo);
                dados.set('comprovante', arquivo!);
                try {
                  await api.post(`/api/plataforma/empresas/${empresaId}/bastao`, dados);
                  setAberto(false);
                  setEmail('');
                  setMotivo('');
                  setArquivo(null);
                  await recarregar();
                } catch (e) {
                  setErro((e as Error).message);
                  setAberto(false);
                }
              }}
            >
              Enviar o pedido
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Campo
            rotulo="E-mail do novo Master"
            id="bastao-email"
            ajuda="Um usuário da empresa ou um e-mail novo, que se cadastra ao aceitar."
            obrigatorio
          >
            <Entrada
              id="bastao-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>
          <Campo rotulo="O Master atual passa a" id="bastao-perfil">
            <Selecao
              id="bastao-perfil"
              value={perfilAnteriorId}
              onChange={(e) => setPerfilAnteriorId(e.target.value)}
            >
              <option value="">Inativar o acesso dele</option>
              {q.data.perfis.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Motivo" id="bastao-motivo" obrigatorio ajuda="Mínimo de 10 caracteres.">
            <AreaTexto
              id="bastao-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
          <Campo
            rotulo="Comprovante"
            id="bastao-comprovante"
            ajuda="Pedido assinado, certidão, contrato social… (PDF ou imagem, até 25 MB)."
            obrigatorio
          >
            <Entrada
              id="bastao-comprovante"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </Campo>
        </div>
      </Dialogo>
    </Cartao>
  );
}

/** Personificação (P28): assumir a visão do usuário, com motivo, por até 60 minutos. */
function Personificar({
  empresaId,
  usuario,
  aoFechar,
}: {
  empresaId: string;
  usuario: { usuarioId: string; nome: string };
  aoFechar: () => void;
}) {
  const atualizar = useAtualizarSessao();
  const navegar = useNavigate();
  const chamados = useQuery({
    queryKey: ['chamados-cliente', empresaId],
    queryFn: () =>
      api.get<{ itens: Array<{ id: string; numero: number; assunto: string }> }>(
        `/api/plataforma/chamados?empresaId=${empresaId}&situacao=abertos&tamanho=20`,
      ),
  });
  const [motivo, setMotivo] = useState('');
  const [chamadoId, setChamadoId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={`Personificar ${usuario.nome}`}
      descricao="Você passa a ver e agir com as permissões desse usuário, sem a senha dele, por no máximo 60 minutos. O Master é avisado por e-mail, e tudo fica na auditoria com o seu nome. Senha, e-mail, perfis, segredos e exportação ficam bloqueados."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={motivo.trim().length < 5}
            onClick={async () => {
              try {
                await api.post('/api/plataforma/personificacoes', {
                  empresaId,
                  usuarioId: usuario.usuarioId,
                  motivo,
                  chamadoId: chamadoId || null,
                });
                atualizar(await api.get<EstadoSessao>('/api/auth/sessao'));
                navegar('/inicio');
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          >
            Começar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Chamado" id="pers-chamado">
          <Selecao
            id="pers-chamado"
            value={chamadoId}
            onChange={(e) => {
              setChamadoId(e.target.value);
              const c = chamados.data?.itens.find((x) => x.id === e.target.value);
              if (c && !motivo) setMotivo(`Chamado ${c.numero}: ${c.assunto}`);
            }}
          >
            <option value="">Sem chamado</option>
            {chamados.data?.itens.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} · {c.assunto}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Motivo" id="pers-motivo" obrigatorio>
          <AreaTexto id="pers-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  );
}

function Personificacoes({ empresaId }: { empresaId: string }) {
  const q = useQuery({
    queryKey: ['personificacoes', empresaId],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          membro: string;
          usuario: string;
          motivo: string;
          inicio: string;
          fim: string | null;
          formaEncerramento: string | null;
        }>
      >(`/api/plataforma/empresas/${empresaId}/personificacoes`),
  });
  if (!q.data?.length) return null;
  return (
    <Cartao>
      <CabecalhoCartao titulo="Personificações" descricao="As 50 mais recentes." />
      <CorpoCartao className="flex flex-col gap-1 text-sm">
        {q.data.map((p) => (
          <p key={p.id}>
            {formatarDataHora(p.inicio)} · {p.membro} como {p.usuario} · {p.motivo}
            {p.fim ? ` · até ${formatarDataHora(p.fim)}` : ' · em curso'}
          </p>
        ))}
      </CorpoCartao>
    </Cartao>
  );
}

function FaturasDoCliente({ empresaId }: { empresaId: string }) {
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['faturas', 'plataforma', empresaId],
    queryFn: () =>
      api.get<{ itens: LinhaFatura[] }>(
        `/api/plataforma/faturas?empresaId=${empresaId}&tamanho=50&ordem=vencimento&direcao=desc`,
      ),
    enabled: pode(s, 'plataforma.faturas', 'visualizar'),
  });
  const [aberta, setAberta] = useState<string | null>(null);
  const [avulsa, setAvulsa] = useState(false);
  if (!pode(s, 'plataforma.faturas', 'visualizar')) return null;
  return (
    <Cartao>
      <CabecalhoCartao
        titulo="Faturas"
        descricao="As 50 mais recentes. Clique para ver, dar baixa ou estornar."
        acoes={
          pode(s, 'plataforma.faturas', 'criar') && (
            <Botao variante="secundario" tamanho="pequeno" onClick={() => setAvulsa(true)}>
              Fatura avulsa
            </Botao>
          )
        }
      />
      <CorpoCartao>
        <ListaFaturas faturas={q.data?.itens ?? []} aoAbrir={setAberta} />
      </CorpoCartao>
      {aberta && (
        <DetalheFatura
          id={aberta}
          plataforma
          podeEditar={pode(s, 'plataforma.faturas', 'editar')}
          podeEstornar={pode(s, 'plataforma.faturas', 'estornar')}
          aoFechar={() => setAberta(null)}
        />
      )}
      {avulsa && <NovaFaturaAvulsa empresaId={empresaId} aoFechar={() => setAvulsa(false)} />}
    </Cartao>
  );
}

export function Cliente() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api.get<FichaCliente>(`/api/plataforma/empresas/${id}`),
  });
  const [situacao, setSituacao] = useState<SituacaoEmpresa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [novoMaster, setNovoMaster] = useState('');
  const [personificar, setPersonificar] = useState<{ usuarioId: string; nome: string } | null>(
    null,
  );
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const c = q.data;
  const temMaster = c.usuarios.some((u) => u.eMaster && u.ativo);
  const podeEditar = pode(s, 'plataforma.clientes', 'editar');

  return (
    <Pagina titulo={c.ficha.nomeFantasia || c.ficha.nome} trilha={['Administração', 'Clientes']}>
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao>
          <CabecalhoCartao titulo="Cliente" />
          <CorpoCartao className="flex flex-col gap-2 text-sm">
            <p>
              <strong>{c.ficha.nome}</strong>
            </p>
            {c.ficha.documento && (
              <p>
                {formatarDocumento(
                  c.ficha.tipoPessoa === 'fisica' ? 'cpf' : 'cnpj',
                  c.ficha.documento,
                )}
              </p>
            )}
            <p>
              Situação:{' '}
              <Etiqueta tom={TOM[c.situacao]}>{NOMES_SITUACAO_EMPRESA[c.situacao]}</Etiqueta>
            </p>
            {c.assinatura && (
              <p>
                Plano {c.assinatura.plano}, {c.assinatura.periodicidade}, desde{' '}
                {formatarData(c.assinatura.inicio)}
                {c.assinatura.emTeste &&
                  c.assinatura.fimTeste &&
                  `; em teste até ${formatarData(c.assinatura.fimTeste)}`}
              </p>
            )}
            {podeEditar && (
              <div className="mt-2">
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() => setSituacao(c.situacao)}
                >
                  Mudar situação
                </Botao>
              </div>
            )}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Usuários" />
          <CorpoCartao className="flex flex-col gap-3 text-sm">
            {c.usuarios.map((u) => (
              <div key={u.vinculoId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {u.nome} · {u.email} · {u.perfil}{' '}
                  {u.eMaster && <Etiqueta tom="primario">Master</Etiqueta>}{' '}
                  {!u.ativo && <Etiqueta>Inativo</Etiqueta>}
                </span>
                {u.ativo && pode(s, 'plataforma.personificacao', 'criar') && (
                  <Botao variante="secundario" tamanho="pequeno" onClick={() => setPersonificar(u)}>
                    Personificar
                  </Botao>
                )}
              </div>
            ))}
            {c.convites.map((x) => (
              <p key={x.id} className="text-muted-foreground">
                Convite para {x.email} ({x.perfil}) ·{' '}
                {x.situacao === 'expirado'
                  ? 'expirado'
                  : `vale até ${formatarDataHora(x.expiraEm)}`}
              </p>
            ))}
            {!temMaster && podeEditar && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <Campo
                  rotulo="E-mail do Master (vazio = reenviar ao mesmo)"
                  id="novoMaster"
                  className="min-w-64 flex-1"
                >
                  <Entrada
                    id="novoMaster"
                    type="email"
                    value={novoMaster}
                    onChange={(e) => setNovoMaster(e.target.value)}
                  />
                </Campo>
                <Botao
                  variante="secundario"
                  onClick={async () => {
                    try {
                      await api.post(
                        `/api/plataforma/empresas/${id}/convite-master`,
                        novoMaster ? { email: novoMaster } : {},
                      );
                      setMensagem({ tom: 'sucesso', texto: 'Convite do Master enviado.' });
                      setNovoMaster('');
                      await qc.invalidateQueries({ queryKey: ['cliente', id] });
                    } catch (e) {
                      setMensagem({ tom: 'erro', texto: (e as Error).message });
                    }
                  }}
                >
                  Enviar convite do Master
                </Botao>
              </div>
            )}
          </CorpoCartao>
        </Cartao>
        {temMaster && <TrocaDoMaster empresaId={id} />}
        <Cartao>
          <CabecalhoCartao
            titulo="Estabelecimentos"
            descricao="Cadastrados pelo próprio cliente."
          />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {c.estabelecimentos.length ? (
              c.estabelecimentos.map((e) => (
                <p key={e.id}>
                  {e.nome} {e.documento && `· ${formatarDocumento('cnpj', e.documento)}`}{' '}
                  {!e.ativo && <Etiqueta>Inativo</Etiqueta>}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">Nenhum ainda.</p>
            )}
          </CorpoCartao>
        </Cartao>
        <Cartao>
          <CabecalhoCartao titulo="Histórico de situações" />
          <CorpoCartao className="flex flex-col gap-1 text-sm">
            {c.historico.map((h) => (
              <p key={h.id}>
                {formatarDataHora(h.desde)} · {NOMES_SITUACAO_EMPRESA[h.situacao]}
                {h.motivo && ` · ${h.motivo}`}
              </p>
            ))}
          </CorpoCartao>
        </Cartao>
      </div>
      <FaturasDoCliente empresaId={id} />
      <Personificacoes empresaId={id} />
      {personificar && (
        <Personificar
          empresaId={id}
          usuario={personificar}
          aoFechar={() => setPersonificar(null)}
        />
      )}
      <h2 className="mt-2 text-lg font-semibold">Assinatura</h2>
      <PainelAssinatura
        url={`/api/plataforma/empresas/${id}/assinatura`}
        opcoesUrl="plataforma"
        podeMudar={podeEditar}
        plataforma
      />
      <Dialogo
        aberto={!!situacao}
        aoMudar={(x) => !x && setSituacao(null)}
        titulo="Mudar situação do cliente"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setSituacao(null)}>
              Cancelar
            </Botao>
            <Botao
              onClick={async () => {
                try {
                  await api.post(`/api/plataforma/empresas/${id}/situacao`, { situacao, motivo });
                  setSituacao(null);
                  setMotivo('');
                  await qc.invalidateQueries({ queryKey: ['cliente', id] });
                } catch (e) {
                  setMensagem({ tom: 'erro', texto: (e as Error).message });
                  setSituacao(null);
                }
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Situação" id="situacao">
            <Selecao
              id="situacao"
              value={situacao ?? ''}
              onChange={(e) => setSituacao(e.target.value as SituacaoEmpresa)}
            >
              {SITUACOES_EMPRESA.map((x) => (
                <option key={x} value={x}>
                  {NOMES_SITUACAO_EMPRESA[x]}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Motivo" id="motivo-situacao" obrigatorio>
            <AreaTexto
              id="motivo-situacao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Campo>
        </div>
      </Dialogo>
    </Pagina>
  );
}
