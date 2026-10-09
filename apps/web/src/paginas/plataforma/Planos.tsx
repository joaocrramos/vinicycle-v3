// Administração › Planos e Adicionais (administracao.md, Planos, adicionais e assinaturas; P25).
// O preço vale a partir de uma data; as assinaturas em vigor guardam o preço contratado.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adicionalEntrada,
  FORMAS_PAGAMENTO,
  formatarMoeda,
  MODULO_SEMPRE_PRESENTE,
  NOMES_FORMA_PAGAMENTO,
  NOMES_PERIODICIDADE,
  NOMES_TIPO_ADICIONAL,
  paraCentavos,
  PERIODICIDADES,
  type Periodicidade,
  planoEntrada,
  TIPOS_ADICIONAL,
  type TipoAdicional,
} from '@vinicycle/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AcoesLinha } from '@/componentes/AcoesLinha';
import { CampoNumero } from '@/componentes/campos-especiais';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { pode, useSessao } from '@/lib/sessao';
import { formatarData } from '@/lib/utils';

type Precos = Partial<Record<Periodicidade, string>>;
interface PrecoFuturo {
  periodicidade: Periodicidade;
  valor: string;
  vigenteDesde: string;
}

export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  motivoInativacao: string | null;
  limiteEstabelecimentos: number | null;
  limiteUsuarios: number | null;
  limiteArmazenamentoGb: string | null;
  formasPagamento: Array<(typeof FORMAS_PAGAMENTO)[number]>;
  modulos: string[];
  assinaturas: number;
  precos: Precos;
  precosFuturos: PrecoFuturo[];
}

export interface Adicional {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: TipoAdicional;
  moduloCodigo: string | null;
  quantidadePorUnidade: number;
  ativo: boolean;
  motivoInativacao: string | null;
  precos: Precos;
  precosFuturos: PrecoFuturo[];
}

interface Modulo {
  codigo: string;
  nome: string;
  funcao: string;
  situacao: 'disponivel' | 'em_breve';
}

const hoje = () => new Date().toISOString().slice(0, 10);
export const moeda = (v: string | null | undefined) => formatarMoeda(paraCentavos(v));

function listaPrecos(precos: Precos): string {
  const partes = PERIODICIDADES.filter((p) => precos[p]).map(
    (p) => `${NOMES_PERIODICIDADE[p]} ${moeda(precos[p])}`,
  );
  return partes.length ? partes.join(' · ') : 'Sem preço';
}

function Futuros({ lista }: { lista: PrecoFuturo[] }) {
  if (!lista.length) return null;
  return (
    <p className="text-muted-foreground">
      A partir de:{' '}
      {lista
        .map(
          (f) =>
            `${formatarData(f.vigenteDesde)}, ${NOMES_PERIODICIDADE[f.periodicidade].toLowerCase()} ${moeda(f.valor)}`,
        )
        .join(' · ')}
    </p>
  );
}

/** Preço por periodicidade: vazio = a periodicidade não é vendida. */
function CamposPrecos({
  precos,
  aoMudar,
  erro,
  prefixo,
}: {
  precos: Precos;
  aoMudar: (p: Precos) => void;
  erro?: string;
  prefixo: string;
}) {
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
      {PERIODICIDADES.map((p) => (
        <Campo key={p} rotulo={NOMES_PERIODICIDADE[p]} id={`${prefixo}-${p}`}>
          <CampoNumero
            id={`${prefixo}-${p}`}
            casas={2}
            unidade="R$"
            valor={precos[p] ?? ''}
            aoMudar={(v) => aoMudar({ ...precos, [p]: v ?? undefined })}
          />
        </Campo>
      ))}
      {erro && <p className="text-sm text-destructive sm:col-span-4">{erro}</p>}
    </div>
  );
}

const paraLista = (precos: Precos) =>
  PERIODICIDADES.filter((p) => precos[p]).map((p) => ({ periodicidade: p, valor: precos[p]! }));

function FormularioPlano({ plano, aoFechar }: { plano: Plano | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const modulos = useQuery({
    queryKey: ['modulos-plataforma'],
    queryFn: () => api.get<Modulo[]>('/api/plataforma/modulos'),
  });
  const [precos, setPrecos] = useState<Precos>(plano?.precos ?? {});
  const form = useFormulario(planoEntrada, {
    nome: plano?.nome ?? '',
    descricao: plano?.descricao ?? '',
    modulos: plano?.modulos.filter((m) => m !== MODULO_SEMPRE_PRESENTE) ?? [],
    limiteEstabelecimentos: plano?.limiteEstabelecimentos ?? null,
    limiteUsuarios: plano?.limiteUsuarios ?? null,
    limiteArmazenamentoGb: plano?.limiteArmazenamentoGb ?? null,
    formasPagamento: plano?.formasPagamento ?? [...FORMAS_PAGAMENTO],
    precos: paraLista(plano?.precos ?? {}),
    precosDesde: hoje(),
  });
  const v = form.valores;
  const alternar = (campo: 'modulos' | 'formasPagamento', item: string) => {
    const atual = v[campo] as string[];
    form.definir(campo, atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item]);
  };
  const limite = (campo: 'limiteEstabelecimentos' | 'limiteUsuarios', rotulo: string) => (
    <Campo rotulo={rotulo} id={`plano-${campo}`} ajuda="Vazio = sem limite.">
      <Entrada
        id={`plano-${campo}`}
        type="number"
        min={1}
        value={v[campo] ?? ''}
        onChange={(e) => form.definir(campo, e.target.value ? Number(e.target.value) : null)}
      />
    </Campo>
  );
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={plano ? `Editar ${plano.nome}` : 'Novo plano'}
      descricao="Módulos e limites valem para todas as assinaturas do plano. Preço novo vale a partir da data escolhida; quem já assina continua com o preço contratado."
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
                if (plano) await api.put(`/api/plataforma/planos/${plano.id}`, d);
                else await api.post('/api/plataforma/planos', d);
                await qc.invalidateQueries({ queryKey: ['planos-plataforma'] });
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
        <Campo rotulo="Nome" id="plano-nome" erro={form.erro('nome')} obrigatorio>
          <Entrada
            id="plano-nome"
            value={v.nome}
            onChange={(e) => form.definir('nome', e.target.value)}
            onBlur={() => form.tocar('nome')}
          />
        </Campo>
        <Campo rotulo="Descrição" id="plano-descricao">
          <Entrada
            id="plano-descricao"
            value={v.descricao ?? ''}
            onChange={(e) => form.definir('descricao', e.target.value)}
          />
        </Campo>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Módulos</legend>
          <Caixa rotulo="Gestão (sempre incluída)" checked disabled />
          {modulos.data
            ?.filter((m) => m.codigo !== MODULO_SEMPRE_PRESENTE)
            .map((m) => (
              <Caixa
                key={m.codigo}
                rotulo={`${m.nome} · ${m.funcao}${m.situacao === 'em_breve' ? ' (em breve)' : ''}`}
                checked={v.modulos.includes(m.codigo)}
                onChange={() => alternar('modulos', m.codigo)}
              />
            ))}
          {form.erro('modulos') && (
            <p className="text-sm text-destructive">{form.erro('modulos')}</p>
          )}
        </fieldset>
        {limite('limiteEstabelecimentos', 'Estabelecimentos')}
        {limite('limiteUsuarios', 'Usuários')}
        <Campo rotulo="Armazenamento de anexos" id="plano-gb" ajuda="Vazio = sem limite.">
          <CampoNumero
            id="plano-gb"
            casas={0}
            unidade="GB"
            placeholder="Sem limite"
            valor={v.limiteArmazenamentoGb ?? ''}
            aoMudar={(x) => form.definir('limiteArmazenamentoGb', x)}
          />
        </Campo>
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Formas de pagamento aceitas</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMAS_PAGAMENTO.map((f) => (
              <Caixa
                key={f}
                rotulo={NOMES_FORMA_PAGAMENTO[f]}
                checked={v.formasPagamento.includes(f)}
                onChange={() => alternar('formasPagamento', f)}
              />
            ))}
          </div>
          {form.erro('formasPagamento') && (
            <p className="text-sm text-destructive">{form.erro('formasPagamento')}</p>
          )}
        </fieldset>
        <p className="text-sm font-medium sm:col-span-2">
          Preço por ciclo de cobrança (vazio = não vendido nessa periodicidade)
        </p>
        <CamposPrecos
          prefixo="plano-preco"
          precos={precos}
          erro={form.erro('precos')}
          aoMudar={(p) => {
            setPrecos(p);
            form.definir('precos', paraLista(p));
          }}
        />
        <Campo
          rotulo="Preços valem a partir de"
          id="plano-desde"
          erro={form.erro('precosDesde')}
          ajuda="Só os preços alterados ganham uma nova versão."
        >
          <Entrada
            id="plano-desde"
            type="date"
            value={v.precosDesde}
            onChange={(e) => form.definir('precosDesde', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

function Inativos<T extends { id: string; ativo: boolean }>({
  itens,
  mostrar,
  aoMudar,
}: {
  itens: T[];
  mostrar: boolean;
  aoMudar: (v: boolean) => void;
}) {
  const n = itens.filter((i) => !i.ativo).length;
  if (!n) return null;
  return (
    <Caixa
      rotulo={`Mostrar inativos (${n})`}
      checked={mostrar}
      onChange={(e) => aoMudar(e.target.checked)}
    />
  );
}

function useAtivo(url: string, chave: string) {
  const qc = useQueryClient();
  return async (id: string, acao: 'inativar' | 'reativar', motivo?: string) => {
    await api.post(`${url}/${id}/${acao}`, motivo ? { motivo } : {});
    await qc.invalidateQueries({ queryKey: [chave] });
  };
}

export function PaginaPlanos() {
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['planos-plataforma'],
    queryFn: () => api.get<Plano[]>('/api/plataforma/planos?todos=1'),
  });
  const modulos = useQuery({
    queryKey: ['modulos-plataforma'],
    queryFn: () => api.get<Modulo[]>('/api/plataforma/modulos'),
  });
  const [editar, setEditar] = useState<Plano | 'novo' | null>(null);
  const [inativar, setInativar] = useState<Plano | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudarAtivo = useAtivo('/api/plataforma/planos', 'planos-plataforma');
  const podeEditar = pode(s, 'plataforma.planos', 'editar');
  const podeInativar = pode(s, 'plataforma.planos', 'inativar');
  const planos = (q.data ?? []).filter((p) => p.ativo || mostrarInativos);
  return (
    <Pagina
      titulo="Planos"
      trilha={['Administração']}
      acoes={
        pode(s, 'plataforma.planos', 'criar') && (
          <Botao onClick={() => setEditar('novo')}>
            <Plus /> Novo plano
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        O que se vende (P25): módulos, limites, formas de pagamento e preço por ciclo. Plano inativo
        não é vendido; as assinaturas dele seguem.
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {q.isError && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      <Inativos itens={q.data ?? []} mostrar={mostrarInativos} aoMudar={setMostrarInativos} />
      <div className="grid gap-5 lg:grid-cols-2">
        {planos.map((p) => (
          <Cartao key={p.id}>
            <CabecalhoCartao
              titulo={p.nome}
              descricao={p.descricao ?? undefined}
              acoes={
                <div className="flex items-center gap-2">
                  {!p.ativo && <Etiqueta>Inativo</Etiqueta>}
                  <AcoesLinha
                    ativo={p.ativo}
                    aoEditar={podeEditar && p.ativo ? () => setEditar(p) : undefined}
                    aoInativar={podeInativar ? () => setInativar(p) : undefined}
                    aoReativar={
                      podeInativar
                        ? () => mudarAtivo(p.id, 'reativar').catch((e) => setErro(e.message))
                        : undefined
                    }
                  />
                </div>
              }
            />
            <CorpoCartao className="flex flex-col gap-1 text-sm">
              <p>
                <strong>{listaPrecos(p.precos)}</strong>
              </p>
              <Futuros lista={p.precosFuturos} />
              <p>
                Módulos:{' '}
                {p.modulos
                  .map((c) => modulos.data?.find((m) => m.codigo === c)?.nome ?? c)
                  .join(', ')}
              </p>
              <p>
                Estabelecimentos: {p.limiteEstabelecimentos ?? 'sem limite'} · Usuários:{' '}
                {p.limiteUsuarios ?? 'sem limite'} · Anexos:{' '}
                {p.limiteArmazenamentoGb ? `${Number(p.limiteArmazenamentoGb)} GB` : 'sem limite'}
              </p>
              <p>
                Formas:{' '}
                {p.formasPagamento.length
                  ? p.formasPagamento.map((f) => NOMES_FORMA_PAGAMENTO[f]).join(', ')
                  : 'nenhuma escolhida'}
              </p>
              <p className="text-muted-foreground">
                {p.assinaturas} assinatura(s) em vigor
                {p.motivoInativacao && ` · inativado: ${p.motivoInativacao}`}
              </p>
            </CorpoCartao>
          </Cartao>
        ))}
      </div>
      {editar && (
        <FormularioPlano
          plano={editar === 'novo' ? null : editar}
          aoFechar={() => setEditar(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        descricao="O plano deixa de ser vendido. As assinaturas em vigor continuam nele."
        rotuloBotao="Inativar"
        aoConfirmar={(m) => mudarAtivo(inativar!.id, 'inativar', m)}
      />
    </Pagina>
  );
}

function FormularioAdicional({
  adicional,
  aoFechar,
}: {
  adicional: Adicional | null;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const modulos = useQuery({
    queryKey: ['modulos-plataforma'],
    queryFn: () => api.get<Modulo[]>('/api/plataforma/modulos'),
  });
  const [precos, setPrecos] = useState<Precos>(adicional?.precos ?? {});
  const form = useFormulario(adicionalEntrada, {
    nome: adicional?.nome ?? '',
    descricao: adicional?.descricao ?? '',
    tipo: adicional?.tipo ?? 'usuario',
    moduloCodigo: adicional?.moduloCodigo ?? '',
    quantidadePorUnidade: adicional?.quantidadePorUnidade ?? 1,
    precos: paraLista(adicional?.precos ?? {}),
    precosDesde: hoje(),
  });
  const v = form.valores;
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={adicional ? `Editar ${adicional.nome}` : 'Novo adicional'}
      descricao="O limite efetivo de cada empresa é o do plano mais os adicionais contratados (P25)."
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
                if (adicional) await api.put(`/api/plataforma/adicionais/${adicional.id}`, d);
                else await api.post('/api/plataforma/adicionais', d);
                await qc.invalidateQueries({ queryKey: ['adicionais-plataforma'] });
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
        <Campo rotulo="Nome" id="ad-nome" erro={form.erro('nome')} obrigatorio>
          <Entrada
            id="ad-nome"
            value={v.nome}
            onChange={(e) => form.definir('nome', e.target.value)}
            onBlur={() => form.tocar('nome')}
          />
        </Campo>
        <Campo
          rotulo="Tipo"
          id="ad-tipo"
          ajuda={adicional ? 'O tipo não muda depois de criado.' : undefined}
        >
          <Selecao
            id="ad-tipo"
            value={v.tipo}
            disabled={!!adicional}
            onChange={(e) => {
              form.definir('tipo', e.target.value);
              if (e.target.value !== 'modulo') form.definir('moduloCodigo', '');
            }}
          >
            {TIPOS_ADICIONAL.map((x) => (
              <option key={x} value={x}>
                {NOMES_TIPO_ADICIONAL[x]}
              </option>
            ))}
          </Selecao>
        </Campo>
        {v.tipo === 'modulo' ? (
          <Campo rotulo="Módulo" id="ad-modulo" erro={form.erro('moduloCodigo')} obrigatorio>
            <Selecao
              id="ad-modulo"
              value={v.moduloCodigo ?? ''}
              onChange={(e) => form.definir('moduloCodigo', e.target.value)}
            >
              <option value="">Escolha</option>
              {modulos.data
                ?.filter((m) => m.codigo !== MODULO_SEMPRE_PRESENTE)
                .map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nome} · {m.funcao}
                  </option>
                ))}
            </Selecao>
          </Campo>
        ) : (
          <Campo
            rotulo={
              v.tipo === 'armazenamento'
                ? 'GB por unidade'
                : v.tipo.startsWith('mensagens_')
                  ? 'Mensagens por mês, por unidade'
                  : 'Quantidade por unidade'
            }
            id="ad-qtd"
            ajuda="Quanto cada unidade contratada soma ao limite."
          >
            <Entrada
              id="ad-qtd"
              type="number"
              min={1}
              value={v.quantidadePorUnidade}
              onChange={(e) => form.definir('quantidadePorUnidade', Number(e.target.value) || 1)}
            />
          </Campo>
        )}
        <Campo rotulo="Descrição" id="ad-descricao" className="sm:col-span-2">
          <AreaTexto
            id="ad-descricao"
            value={v.descricao ?? ''}
            onChange={(e) => form.definir('descricao', e.target.value)}
          />
        </Campo>
        <p className="text-sm font-medium sm:col-span-2">
          Preço por unidade e ciclo de cobrança (vazio = não vendido nessa periodicidade)
        </p>
        <CamposPrecos
          prefixo="ad-preco"
          precos={precos}
          erro={form.erro('precos')}
          aoMudar={(p) => {
            setPrecos(p);
            form.definir('precos', paraLista(p));
          }}
        />
        <Campo rotulo="Preços valem a partir de" id="ad-desde" erro={form.erro('precosDesde')}>
          <Entrada
            id="ad-desde"
            type="date"
            value={v.precosDesde}
            onChange={(e) => form.definir('precosDesde', e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

export function PaginaAdicionais() {
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['adicionais-plataforma'],
    queryFn: () => api.get<Adicional[]>('/api/plataforma/adicionais?todos=1'),
  });
  const [editar, setEditar] = useState<Adicional | 'novo' | null>(null);
  const [inativar, setInativar] = useState<Adicional | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudarAtivo = useAtivo('/api/plataforma/adicionais', 'adicionais-plataforma');
  const podeInativar = pode(s, 'plataforma.planos', 'inativar');
  const lista = (q.data ?? []).filter((a) => a.ativo || mostrarInativos);
  return (
    <Pagina
      titulo="Adicionais"
      trilha={['Administração']}
      acoes={
        pode(s, 'plataforma.planos', 'criar') && (
          <Botao onClick={() => setEditar('novo')}>
            <Plus /> Novo adicional
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Itens vendidos à parte do plano: usuário, estabelecimento, armazenamento e módulo avulso.
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Inativos itens={q.data ?? []} mostrar={mostrarInativos} aoMudar={setMostrarInativos} />
      <Cartao>
        <CorpoCartao className="flex flex-col divide-y text-sm">
          {!lista.length && <p className="text-muted-foreground">Nenhum adicional cadastrado.</p>}
          {lista.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p>
                  <strong>{a.nome}</strong> · {NOMES_TIPO_ADICIONAL[a.tipo]}
                  {a.tipo === 'modulo'
                    ? ` ${a.moduloCodigo}`
                    : a.quantidadePorUnidade > 1
                      ? ` (${a.quantidadePorUnidade} por unidade)`
                      : ''}{' '}
                  {!a.ativo && <Etiqueta>Inativo</Etiqueta>}
                </p>
                <p className="text-muted-foreground">{listaPrecos(a.precos)}</p>
                <Futuros lista={a.precosFuturos} />
              </div>
              <AcoesLinha
                ativo={a.ativo}
                aoEditar={
                  pode(s, 'plataforma.planos', 'editar') && a.ativo ? () => setEditar(a) : undefined
                }
                aoInativar={podeInativar ? () => setInativar(a) : undefined}
                aoReativar={
                  podeInativar
                    ? () => mudarAtivo(a.id, 'reativar').catch((e) => setErro(e.message))
                    : undefined
                }
              />
            </div>
          ))}
        </CorpoCartao>
      </Cartao>
      {editar && (
        <FormularioAdicional
          adicional={editar === 'novo' ? null : editar}
          aoFechar={() => setEditar(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        descricao="O adicional deixa de ser vendido. As assinaturas que já o têm continuam com ele."
        rotuloBotao="Inativar"
        aoConfirmar={(m) => mudarAtivo(inativar!.id, 'inativar', m)}
      />
    </Pagina>
  );
}
