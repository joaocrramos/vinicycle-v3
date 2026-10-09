// Ajuda e suporte (administracao.md, Suporte): os chamados do cliente (menu do avatar) e a página
// pública para quem não consegue entrar.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chamadoPublico,
  NOMES_PRIORIDADE,
  NOMES_SITUACAO_CHAMADO,
  novoChamado,
  PRIORIDADES_CHAMADO,
  type PrioridadeChamado,
  type SituacaoChamado,
  TOM_SITUACAO_CHAMADO,
} from '@vinicycle/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';
import { TelaPublica } from './publicas';

interface LinhaChamado {
  id: string;
  numero: number;
  assunto: string;
  categoria: string;
  prioridade: PrioridadeChamado;
  situacao: SituacaoChamado;
  solicitante: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Conversa {
  id: string;
  numero: number;
  assunto: string;
  categoria: string;
  prioridade: PrioridadeChamado;
  situacao: SituacaoChamado;
  solicitanteNome: string;
  solicitanteEmail: string;
  criadoEm: string;
  mensagens: Array<{
    id: string;
    autorTipo: 'cliente' | 'equipe';
    autor: string | null;
    texto: string;
    interna: boolean;
    criadoEm: string;
  }>;
  anexos: Array<{ id: string; nomeOriginal: string; criadoEm: string }>;
}

export function EtiquetaSituacaoChamado({ situacao }: { situacao: SituacaoChamado }) {
  return (
    <Etiqueta tom={TOM_SITUACAO_CHAMADO[situacao]}>{NOMES_SITUACAO_CHAMADO[situacao]}</Etiqueta>
  );
}

export function Mensagens({ c }: { c: Conversa }) {
  return (
    <div className="flex flex-col gap-3">
      {c.mensagens.map((m) => (
        <div
          key={m.id}
          className={
            m.interna
              ? 'rounded-md border border-dashed bg-muted/40 p-3'
              : m.autorTipo === 'equipe'
                ? 'rounded-md bg-accent/40 p-3'
                : 'rounded-md border p-3'
          }
        >
          <p className="mb-1 text-xs text-muted-foreground">
            {m.autorTipo === 'equipe'
              ? `Equipe ViniCycle${m.autor ? ` · ${m.autor}` : ''}`
              : (m.autor ?? c.solicitanteNome)}
            {' · '}
            {formatarDataHora(m.criadoEm)}
            {m.interna && ' · nota interna (o cliente não vê)'}
          </p>
          <p className="text-sm whitespace-pre-wrap">{m.texto}</p>
        </div>
      ))}
    </div>
  );
}

function NovoChamado({
  aoFechar,
  aoCriar,
}: {
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const categorias = useQuery({
    queryKey: ['chamado-categorias'],
    queryFn: () => api.get<string[]>('/api/chamados/categorias'),
  });
  const form = useFormulario(novoChamado, {
    assunto: '',
    categoria: '',
    prioridade: 'normal',
    descricao: '',
  });
  const v = form.valores;
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo="Novo chamado"
      descricao="Conte o que aconteceu, onde e o que esperava. Depois de abrir, dá para anexar telas e arquivos."
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
                const r = await api.post<{ id: string }>('/api/chamados', d);
                aoCriar(r.id);
              } catch (e) {
                form.erroDaApi(e);
              }
            }}
          >
            Abrir chamado
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
        <Campo
          rotulo="Assunto"
          id="ch-assunto"
          erro={form.erro('assunto')}
          obrigatorio
          className="sm:col-span-2"
        >
          <Entrada
            id="ch-assunto"
            value={v.assunto}
            onChange={(e) => form.definir('assunto', e.target.value)}
          />
        </Campo>
        <Campo rotulo="Categoria" id="ch-cat" erro={form.erro('categoria')} obrigatorio>
          <Selecao
            id="ch-cat"
            value={v.categoria}
            onChange={(e) => form.definir('categoria', e.target.value)}
          >
            <option value="">Escolha</option>
            {categorias.data?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Prioridade" id="ch-pri">
          <Selecao
            id="ch-pri"
            value={v.prioridade}
            onChange={(e) => form.definir('prioridade', e.target.value)}
          >
            {PRIORIDADES_CHAMADO.map((p) => (
              <option key={p} value={p}>
                {NOMES_PRIORIDADE[p]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          rotulo="Descrição"
          id="ch-desc"
          erro={form.erro('descricao')}
          obrigatorio
          className="sm:col-span-2"
        >
          <AreaTexto
            id="ch-desc"
            rows={6}
            value={v.descricao}
            onChange={(e) => form.definir('descricao', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

function DetalheChamado({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['chamado', id],
    queryFn: () => api.get<Conversa>(`/api/chamados/${id}`),
  });
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['chamado', id] }),
      qc.invalidateQueries({ queryKey: ['chamados'] }),
    ]);
  const c = q.data;
  const fechado = c?.situacao === 'fechado';
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={c ? `Chamado ${c.numero}: ${c.assunto}` : 'Chamado'}
      descricao={
        c
          ? `${c.categoria} · prioridade ${NOMES_PRIORIDADE[c.prioridade].toLowerCase()} · aberto em ${formatarDataHora(c.criadoEm)}`
          : undefined
      }
      rodape={
        c &&
        !fechado && (
          <Botao
            variante="secundario"
            onClick={async () => {
              await api.post(`/api/chamados/${id}/fechar`, {});
              await recarregar();
            }}
          >
            Fechar o chamado
          </Botao>
        )
      }
    >
      {!c ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p>
            <EtiquetaSituacaoChamado situacao={c.situacao} />
          </p>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <Mensagens c={c} />
          {c.anexos.length > 0 && (
            <p>
              Anexos:{' '}
              {c.anexos.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <a className="underline" href={`/api/chamados/${id}/anexos/${a.id}`}>
                    {a.nomeOriginal}
                  </a>
                </span>
              ))}
            </p>
          )}
          {fechado ? (
            <Aviso tom="info">
              Chamado fechado. Para continuar, abra um novo citando o número {c.numero}.
            </Aviso>
          ) : (
            <div className="flex flex-col gap-2">
              <AreaTexto
                aria-label="Sua mensagem"
                rows={3}
                placeholder="Escreva para a equipe…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Botao
                  disabled={!texto.trim()}
                  onClick={async () => {
                    try {
                      await api.post(`/api/chamados/${id}/mensagens`, { texto });
                      setTexto('');
                      await recarregar();
                    } catch (e) {
                      setErro((e as Error).message);
                    }
                  }}
                >
                  Enviar
                </Botao>
                <label className="cursor-pointer text-sm text-primary hover:underline">
                  Anexar arquivo
                  <input
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/*,.xlsx,.csv,.xml,.zip,.docx"
                    onChange={async (e) => {
                      const arquivo = e.target.files?.[0];
                      if (!arquivo) return;
                      const dados = new FormData();
                      dados.set('arquivo', arquivo);
                      try {
                        await api.post(`/api/chamados/${id}/anexos`, dados);
                        await recarregar();
                      } catch (x) {
                        setErro((x as Error).message);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialogo>
  );
}

export function PaginaChamados() {
  const { data: s } = useSessao();
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: ['chamados'],
    queryFn: () => api.get<LinhaChamado[]>('/api/chamados'),
  });
  const [novo, setNovo] = useState(false);
  const aberto = params.get('chamado');
  const abrir = (id: string | null) => setParams(id ? { chamado: id } : {}, { replace: true });
  return (
    <Pagina
      titulo="Ajuda e suporte"
      acoes={
        <Botao onClick={() => setNovo(true)}>
          <Plus /> Novo chamado
        </Botao>
      }
    >
      <p className="text-sm text-muted-foreground">
        {s?.empresa?.eMaster
          ? 'Os chamados da empresa. A equipe do ViniCycle responde por aqui e por e-mail.'
          : 'Os seus chamados. A equipe do ViniCycle responde por aqui e por e-mail.'}
      </p>
      <Cartao>
        <CorpoCartao className="flex flex-col divide-y text-sm">
          {q.data && !q.data.length && <p className="text-muted-foreground">Nenhum chamado.</p>}
          {q.data?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => abrir(c.id)}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-left hover:bg-muted/40"
            >
              <span>
                <strong>{c.numero}</strong> · {c.assunto}
                <span className="block text-xs text-muted-foreground">
                  {c.categoria} · {c.solicitante} · atualizado em {formatarDataHora(c.atualizadoEm)}
                </span>
              </span>
              <EtiquetaSituacaoChamado situacao={c.situacao} />
            </button>
          ))}
        </CorpoCartao>
      </Cartao>
      {novo && (
        <NovoChamado
          aoFechar={() => setNovo(false)}
          aoCriar={(id) => {
            setNovo(false);
            void q.refetch();
            abrir(id);
          }}
        />
      )}
      {aberto && <DetalheChamado id={aberto} aoFechar={() => abrir(null)} />}
    </Pagina>
  );
}

/** Página pública (sem entrar): quem não consegue acessar o sistema. */
export function SuportePublico() {
  const form = useFormulario(chamadoPublico, {
    nome: '',
    email: '',
    cnpj: '',
    assunto: '',
    descricao: '',
  });
  const [numero, setNumero] = useState<number | null>(null);
  const v = form.valores;
  const campo = (k: 'nome' | 'email' | 'cnpj' | 'assunto', rotulo: string, ajuda?: string) => (
    <Campo rotulo={rotulo} id={`pub-${k}`} erro={form.erro(k)} ajuda={ajuda} obrigatorio>
      <Entrada
        id={`pub-${k}`}
        type={k === 'email' ? 'email' : 'text'}
        value={v[k]}
        onChange={(e) => form.definir(k, e.target.value)}
        onBlur={() => form.tocar(k)}
      />
    </Campo>
  );
  return (
    <TelaPublica titulo="Falar com o suporte" largo>
      {numero ? (
        <>
          <Aviso tom="sucesso">
            Chamado {numero} registrado. A resposta chega no e-mail informado.
          </Aviso>
          <Link to="/entrar" className="text-sm text-primary hover:underline">
            Voltar para a entrada
          </Link>
        </>
      ) : (
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={async (ev) => {
            ev.preventDefault();
            const d = form.validar();
            if (!d) return;
            try {
              const r = await api.post<{ numero: number }>('/api/suporte/publico', d);
              setNumero(r.numero);
            } catch (e) {
              form.erroDaApi(e);
            }
          }}
        >
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Para quem não consegue entrar no ViniCycle. Quem já entra abre o chamado pelo menu do
            seu nome, em "Ajuda e suporte".
          </p>
          {form.erroGeral && (
            <Aviso tom="erro" className="sm:col-span-2">
              {form.erroGeral}
            </Aviso>
          )}
          {campo('nome', 'Seu nome')}
          {campo('email', 'Seu e-mail')}
          {campo('cnpj', 'CNPJ ou CPF da empresa', 'O documento da empresa cliente do ViniCycle.')}
          {campo('assunto', 'Assunto')}
          <Campo
            rotulo="O que aconteceu"
            id="pub-desc"
            erro={form.erro('descricao')}
            obrigatorio
            className="sm:col-span-2"
          >
            <AreaTexto
              id="pub-desc"
              rows={5}
              value={v.descricao}
              onChange={(e) => form.definir('descricao', e.target.value)}
            />
          </Campo>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Link to="/entrar" className="text-sm text-primary hover:underline">
              Voltar para a entrada
            </Link>
            <Botao type="submit">Enviar</Botao>
          </div>
        </form>
      )}
    </TelaPublica>
  );
}
