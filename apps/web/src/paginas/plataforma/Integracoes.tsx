// Administração › Integrações (administracao.md, Integração de pagamentos): provedor de pagamento
// (Asaas), com a chave cifrada, o endereço e o token do aviso, a nota de serviço e os avisos
// recebidos. A chave nunca volta para a tela.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FORMAS_PROVEDOR,
  integracaoPagamentoEntrada,
  integracaoWhatsappEntrada,
  NOMES_ADAPTADOR,
  NOMES_FORMA_PAGAMENTO,
} from '@vinicycle/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';

type Forma = (typeof FORMAS_PROVEDOR)[number];
interface Integracao {
  id: string;
  tipo: 'pagamento' | 'whatsapp' | 'sms';
  adaptador: 'asaas' | 'meta';
  numeroId: string | null;
  modelo: string | null;
  idioma: string | null;
  nome: string;
  ambiente: 'teste' | 'producao';
  formas: Forma[];
  nfse: {
    ativa: boolean;
    codigoServico: string | null;
    descricao: string | null;
    aliquotaIss: string | null;
  };
  ativo: boolean;
  chaveConfigurada: boolean;
  urlAviso: string;
}
interface AvisoRecebido {
  id: string;
  integracao: string;
  tipoOriginal: string;
  tipoPadrao: string;
  recebidoEm: string;
  resultado: string | null;
}

function Formulario({ atual, aoFechar }: { atual: Integracao | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const form = useFormulario(integracaoPagamentoEntrada, {
    nome: atual?.nome ?? 'Asaas',
    adaptador: 'asaas',
    ambiente: atual?.ambiente ?? 'teste',
    chave: '',
    formas: atual?.formas ?? [...FORMAS_PROVEDOR],
    nfse: atual?.nfse ?? { ativa: false, codigoServico: '', descricao: '', aliquotaIss: '' },
    ativo: atual?.ativo ?? true,
  });
  const v = form.valores;
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={atual ? `Editar ${atual.nome}` : 'Nova integração de pagamento'}
      descricao="As faturas com forma de pagamento atendida (ou sem forma definida) ganham a cobrança no provedor; o cliente escolhe como pagar na página dele. Transferência, débito e dinheiro seguem na baixa manual."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const d = form.validar();
              if (!d) return;
              try {
                if (atual) await api.put(`/api/plataforma/integracoes/${atual.id}`, d);
                else await api.post('/api/plataforma/integracoes', d);
                await qc.invalidateQueries({ queryKey: ['integracoes'] });
                aoFechar();
              } catch (e) {
                form.erroDaApi(e);
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
        <Campo rotulo="Nome" id="int-nome" erro={form.erro('nome')}>
          <Entrada
            id="int-nome"
            value={v.nome}
            onChange={(e) => form.definir('nome', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Ambiente" id="int-amb" ajuda="Teste usa o sandbox do provedor.">
          <Selecao
            id="int-amb"
            value={v.ambiente}
            onChange={(e) => form.definir('ambiente', e.target.value)}
          >
            <option value="teste">Teste (sandbox)</option>
            <option value="producao">Produção</option>
          </Selecao>
        </Campo>
        <Campo
          rotulo="Chave de acesso (API)"
          id="int-chave"
          className="sm:col-span-2"
          erro={form.erro('chave')}
          ajuda={
            atual?.chaveConfigurada
              ? 'Configurada. Deixe vazio para manter; a chave guardada não é mostrada.'
              : 'Gerada no painel do provedor. Fica cifrada e não volta para a tela.'
          }
        >
          <Entrada
            id="int-chave"
            type="password"
            autoComplete="off"
            value={v.chave ?? ''}
            onChange={(e) => form.definir('chave', e.target.value)}
          />
        </Campo>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Formas cobradas pelo provedor</legend>
          <div className="flex flex-wrap gap-4">
            {FORMAS_PROVEDOR.map((f) => (
              <Caixa
                key={f}
                rotulo={NOMES_FORMA_PAGAMENTO[f]}
                checked={v.formas.includes(f)}
                onChange={() =>
                  form.definir(
                    'formas',
                    v.formas.includes(f) ? v.formas.filter((x) => x !== f) : [...v.formas, f],
                  )
                }
              />
            ))}
          </div>
          {form.erro('formas') && <p className="text-sm text-destructive">{form.erro('formas')}</p>}
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border p-3 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Nota fiscal de serviço</legend>
          <Caixa
            rotulo="Emitir a nota pelo provedor quando a fatura for paga"
            checked={v.nfse.ativa}
            onChange={(e) => form.definir('nfse.ativa', e.target.checked)}
          />
          <Campo rotulo="Código do serviço (município)" id="int-cod">
            <Entrada
              id="int-cod"
              value={v.nfse.codigoServico ?? ''}
              onChange={(e) => form.definir('nfse.codigoServico', e.target.value)}
            />
          </Campo>
          <Campo rotulo="Alíquota do ISS" id="int-iss">
            <CampoNumero
              id="int-iss"
              casas={2}
              unidade="%"
              valor={v.nfse.aliquotaIss ?? ''}
              aoMudar={(x) => form.definir('nfse.aliquotaIss', x ?? '')}
            />
          </Campo>
          <Campo rotulo="Descrição do serviço" id="int-desc" className="sm:col-span-3">
            <Entrada
              id="int-desc"
              placeholder="Licença de uso do sistema ViniCycle"
              value={v.nfse.descricao ?? ''}
              onChange={(e) => form.definir('nfse.descricao', e.target.value)}
            />
          </Campo>
        </fieldset>
        <Caixa
          rotulo="Ativa"
          checked={v.ativo}
          onChange={(e) => form.definir('ativo', e.target.checked)}
        />
      </div>
    </Dialogo>
  );
}

function FormularioWhatsapp({
  atual,
  aoFechar,
}: {
  atual: Integracao | null;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const form = useFormulario(integracaoWhatsappEntrada, {
    nome: atual?.nome ?? 'WhatsApp',
    adaptador: 'meta',
    numeroId: atual?.numeroId ?? '',
    modelo: atual?.modelo ?? 'aviso_vinicycle',
    idioma: atual?.idioma ?? 'pt_BR',
    chave: '',
    ativo: atual?.ativo ?? true,
  });
  const v = form.valores;
  const texto = (
    campo: 'nome' | 'numeroId' | 'modelo' | 'idioma',
    rotulo: string,
    ajuda?: string,
  ) => (
    <Campo rotulo={rotulo} id={`wa-${campo}`} erro={form.erro(campo)} ajuda={ajuda}>
      <Entrada
        id={`wa-${campo}`}
        value={v[campo]}
        onChange={(e) => form.definir(campo, e.target.value)}
      />
    </Campo>
  );
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={atual ? `Editar ${atual.nome}` : 'WhatsApp pela Meta'}
      descricao="API oficial do WhatsApp (Meta). A mensagem que a empresa inicia usa um modelo aprovado pela Meta, com uma variável no corpo ({{1}}), que recebe o texto do aviso."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              const d = form.validar();
              if (!d) return;
              try {
                if (atual) await api.put(`/api/plataforma/integracoes/${atual.id}/whatsapp`, d);
                else await api.post('/api/plataforma/integracoes/whatsapp', d);
                await qc.invalidateQueries({ queryKey: ['integracoes'] });
                aoFechar();
              } catch (e) {
                form.erroDaApi(e);
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
        {texto('nome', 'Nome')}
        {texto(
          'numeroId',
          'Identificador do número (phone number ID)',
          'No painel da Meta, em WhatsApp › Configuração da API.',
        )}
        {texto(
          'modelo',
          'Nome do modelo aprovado',
          'Categoria "utilidade", com uma variável no corpo.',
        )}
        {texto('idioma', 'Idioma do modelo', 'Ex.: pt_BR')}
        <Campo
          rotulo="Token de acesso"
          id="wa-chave"
          className="sm:col-span-2"
          erro={form.erro('chave')}
          ajuda={
            atual?.chaveConfigurada
              ? 'Configurado. Deixe vazio para manter.'
              : 'Token permanente do usuário do sistema na Meta. Fica cifrado.'
          }
        >
          <Entrada
            id="wa-chave"
            type="password"
            autoComplete="off"
            value={v.chave ?? ''}
            onChange={(e) => form.definir('chave', e.target.value)}
          />
        </Campo>
        <Caixa
          rotulo="Ativa"
          checked={v.ativo}
          onChange={(e) => form.definir('ativo', e.target.checked)}
        />
      </div>
    </Dialogo>
  );
}

function MensagemTeste({ integracao, aoFechar }: { integracao: Integracao; aoFechar: () => void }) {
  const [telefone, setTelefone] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Mensagem de teste"
      descricao="Envia agora uma mensagem pelo modelo aprovado. Não conta na franquia de nenhum cliente."
      rodape={
        <Botao
          disabled={telefone.replace(/\D/g, '').length < 10}
          onClick={async () =>
            setResultado(
              await api.post<{ ok: boolean; mensagem: string }>(
                `/api/plataforma/integracoes/${integracao.id}/mensagem-teste`,
                { telefone },
              ),
            )
          }
        >
          Enviar
        </Botao>
      }
    >
      <div className="flex flex-col gap-3">
        {resultado && <Aviso tom={resultado.ok ? 'sucesso' : 'erro'}>{resultado.mensagem}</Aviso>}
        <Campo rotulo="Telefone com DDD" id="wa-teste">
          <Entrada
            id="wa-teste"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

function Token({ integracao, aoFechar }: { integracao: Integracao; aoFechar: () => void }) {
  const q = useQuery({
    queryKey: ['integracao-token', integracao.id],
    queryFn: () => api.get<{ token: string }>(`/api/plataforma/integracoes/${integracao.id}/token`),
  });
  const [token, setToken] = useState<string | null>(null);
  const valor = token ?? q.data?.token;
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo="Aviso de pagamento (webhook)"
      descricao="Cadastre no painel do provedor o endereço e o token abaixo, com os eventos de cobrança e de nota fiscal. Cada aviso é conferido pelo token."
    >
      <div className="flex flex-col gap-3 text-sm">
        <Campo rotulo="Endereço" id="tok-url">
          <Entrada
            id="tok-url"
            readOnly
            value={integracao.urlAviso}
            onFocus={(e) => e.target.select()}
          />
        </Campo>
        <Campo rotulo="Token (cabeçalho asaas-access-token)" id="tok-valor">
          <Entrada
            id="tok-valor"
            readOnly
            value={valor ?? 'Carregando…'}
            onFocus={(e) => e.target.select()}
          />
        </Campo>
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={async () => {
              const r = await api.post<{ token: string }>(
                `/api/plataforma/integracoes/${integracao.id}/token`,
                {},
              );
              setToken(r.token);
            }}
          >
            Gerar outro token
          </Botao>
          <p className="mt-1 text-muted-foreground">
            O token anterior deixa de valer na hora: atualize no provedor em seguida.
          </p>
        </div>
      </div>
    </Dialogo>
  );
}

export function PaginaIntegracoes() {
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['integracoes'],
    queryFn: () => api.get<Integracao[]>('/api/plataforma/integracoes'),
  });
  const avisos = useQuery({
    queryKey: ['integracoes-avisos'],
    queryFn: () => api.get<AvisoRecebido[]>('/api/plataforma/integracoes/avisos'),
  });
  const [editar, setEditar] = useState<Integracao | 'nova' | null>(null);
  const [editarWa, setEditarWa] = useState<Integracao | 'nova' | null>(null);
  const [teste, setTeste] = useState<Integracao | null>(null);
  const [token, setToken] = useState<Integracao | null>(null);
  const [mensagem, setMensagem] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const podeEditar = pode(s, 'plataforma.integracoes', 'editar');
  return (
    <Pagina
      titulo="Integrações"
      trilha={['Administração']}
      acoes={
        pode(s, 'plataforma.integracoes', 'criar') && (
          <div className="flex gap-2">
            <Botao onClick={() => setEditar('nova')}>
              <Plus /> Pagamento
            </Botao>
            <Botao variante="secundario" onClick={() => setEditarWa('nova')}>
              <Plus /> WhatsApp
            </Botao>
          </div>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Provedores plugáveis: o ViniCycle cria a cobrança de cada fatura no provedor, recebe o aviso
        de pagamento e dá a baixa sozinho; a baixa manual continua para o que for pago por fora.
        WhatsApp pela Meta; SMS espera a escolha do provedor.
      </p>
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      {q.data && !q.data.length && <Aviso tom="info">Nenhuma integração cadastrada.</Aviso>}
      <div className="grid gap-5 lg:grid-cols-2">
        {q.data?.map((i) => (
          <Cartao key={i.id}>
            <CabecalhoCartao
              titulo={i.nome}
              descricao={`${NOMES_ADAPTADOR[i.adaptador] ?? i.adaptador} · ${i.ambiente === 'teste' ? 'teste (sandbox)' : 'produção'}`}
              acoes={!i.ativo && <Etiqueta>Inativa</Etiqueta>}
            />
            <CorpoCartao className="flex flex-col gap-2 text-sm">
              {i.tipo === 'pagamento' ? (
                <>
                  <p>Formas: {i.formas.map((f) => NOMES_FORMA_PAGAMENTO[f]).join(', ')}</p>
                  <p>
                    Nota de serviço:{' '}
                    {i.nfse.ativa
                      ? `emitida pelo provedor (serviço ${i.nfse.codigoServico ?? '—'})`
                      : 'não emitida'}
                  </p>
                </>
              ) : (
                <p>
                  Número {i.numeroId} · modelo {i.modelo} ({i.idioma})
                </p>
              )}
              <p>
                {i.tipo === 'pagamento' ? 'Chave' : 'Token'}:{' '}
                {i.chaveConfigurada ? 'configurado' : 'falta configurar'}
              </p>
              {podeEditar && (
                <div className="mt-1 flex flex-wrap gap-2">
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={() => (i.tipo === 'pagamento' ? setEditar(i) : setEditarWa(i))}
                  >
                    Editar
                  </Botao>
                  {i.tipo === 'pagamento' ? (
                    <Botao variante="secundario" tamanho="pequeno" onClick={() => setToken(i)}>
                      Aviso (webhook)
                    </Botao>
                  ) : (
                    <Botao variante="secundario" tamanho="pequeno" onClick={() => setTeste(i)}>
                      Mensagem de teste
                    </Botao>
                  )}
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    onClick={async () => {
                      const r = await api.post<{ ok: boolean; mensagem: string }>(
                        `/api/plataforma/integracoes/${i.id}/testar`,
                        {},
                      );
                      setMensagem({ tom: r.ok ? 'sucesso' : 'erro', texto: r.mensagem });
                    }}
                  >
                    Testar conexão
                  </Botao>
                </div>
              )}
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
      <Cartao>
        <CabecalhoCartao
          titulo="Últimos avisos recebidos"
          descricao="Cada aviso é registrado e processado uma vez só."
        />
        <CorpoCartao className="flex flex-col gap-1 text-sm">
          {avisos.data && !avisos.data.length && (
            <p className="text-muted-foreground">Nenhum aviso ainda.</p>
          )}
          {avisos.data?.map((a) => (
            <p key={a.id}>
              {formatarDataHora(a.recebidoEm)} · {a.integracao} · {a.tipoOriginal}
              {a.resultado && ` · ${a.resultado}`}
            </p>
          ))}
        </CorpoCartao>
      </Cartao>
      {editar && (
        <Formulario atual={editar === 'nova' ? null : editar} aoFechar={() => setEditar(null)} />
      )}
      {token && <Token integracao={token} aoFechar={() => setToken(null)} />}
      {editarWa && (
        <FormularioWhatsapp
          atual={editarWa === 'nova' ? null : editarWa}
          aoFechar={() => setEditarWa(null)}
        />
      )}
      {teste && <MensagemTeste integracao={teste} aoFechar={() => setTeste(null)} />}
    </Pagina>
  );
}
