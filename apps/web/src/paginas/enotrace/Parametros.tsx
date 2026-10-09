// EnoTrace › Parâmetros técnicos (cantina.md: Análises, Quilos → litros, Códigos, Recipientes).
// Cada aba lê e grava a lista inteira de uma vez (PUT), como as preferências.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AcoesLinha } from '@/componentes/AcoesLinha';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useReferencia } from '@/lib/referencia';
import { pode, useSessao } from '@/lib/sessao';
import { useParametrosTratamento } from './operacoes/Tratamentos';

type Mensagem = { tom: 'sucesso' | 'erro'; texto: string } | null;

/** Estado local de uma lista vinda da API, com salvar e aviso. */
function useEdicao<T>(url: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['parametros', url], queryFn: () => api.get<T[]>(url) });
  const [rascunho, setRascunho] = useState<T[] | null>(null);
  const [msg, setMsg] = useState<Mensagem>(null);
  const itens = rascunho ?? q.data ?? [];
  return {
    carregando: !q.data,
    erroCarga: q.isError ? (q.error as Error).message : null,
    itens,
    alterado: rascunho !== null,
    definir: (novos: T[]) => {
      setMsg(null);
      setRascunho(novos);
    },
    alterar: (i: number, parcial: Partial<T>) => {
      setMsg(null);
      setRascunho(itens.map((x, j) => (j === i ? { ...x, ...parcial } : x)));
    },
    msg,
    salvar: async (corpo: unknown) => {
      try {
        await api.put(url, corpo);
        await qc.invalidateQueries({ queryKey: ['parametros', url] });
        setRascunho(null);
        setMsg({ tom: 'sucesso', texto: 'Parâmetros salvos.' });
      } catch (e) {
        setMsg({ tom: 'erro', texto: (e as Error).message });
      }
    },
    descartar: () => {
      setRascunho(null);
      setMsg(null);
    },
  };
}

function Moldura({
  descricao,
  edicao,
  podeEditar,
  aoSalvar,
  children,
}: {
  descricao: ReactNode;
  edicao: ReturnType<typeof useEdicao<unknown>>;
  podeEditar: boolean;
  aoSalvar: () => void;
  children: ReactNode;
}) {
  return (
    <Cartao>
      <CorpoCartao className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{descricao}</p>
        {edicao.erroCarga && <Aviso tom="erro">{edicao.erroCarga}</Aviso>}
        {edicao.msg && <Aviso tom={edicao.msg.tom}>{edicao.msg.texto}</Aviso>}
        {edicao.carregando && !edicao.erroCarga ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          children
        )}
        {podeEditar && (
          <div className="flex gap-2">
            <Botao disabled={!edicao.alterado} onClick={aoSalvar}>
              Salvar
            </Botao>
            {edicao.alterado && (
              <Botao variante="secundario" onClick={edicao.descartar}>
                Descartar alterações
              </Botao>
            )}
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  );
}

// Análises -----------------------------------------------------------------------------------

interface ParametroAnalise {
  parametroId: string;
  nome: string;
  unidadePadrao: string;
  unidadesAceitas: string[];
  casas: number;
  ativo: boolean;
  unidadePreferida: string | null;
  minimo: string | null;
  maximo: string | null;
}

function AbaAnalises({ podeEditar }: { podeEditar: boolean }) {
  const e = useEdicao<ParametroAnalise>('/api/cantina/parametros-analise');
  return (
    <Moldura
      edicao={e as never}
      podeEditar={podeEditar}
      descricao="Marque as análises que a vinícola faz: só elas aparecem no laboratório. A faixa de referência é da empresa; fora dela, o laudo mostra alerta (não bloqueia). Valores na unidade padrão."
      aoSalvar={() =>
        e.salvar({
          parametros: e.itens.map((p) => ({
            parametroId: p.parametroId,
            ativo: p.ativo,
            unidadePreferida: p.unidadePreferida,
            minimo: p.minimo,
            maximo: p.maximo,
          })),
        })
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Usa</th>
              <th className="py-2 pr-3 font-medium">Análise</th>
              <th className="py-2 pr-3 font-medium">Unidade na tela</th>
              <th className="py-2 pr-3 font-medium">Mínimo</th>
              <th className="py-2 font-medium">Máximo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {e.itens.map((p, i) => (
              <tr key={p.parametroId}>
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    className="size-4"
                    aria-label={`Usar ${p.nome}`}
                    disabled={!podeEditar}
                    checked={p.ativo}
                    onChange={(ev) => e.alterar(i, { ativo: ev.target.checked })}
                  />
                </td>
                <td className="py-2 pr-3">{p.nome}</td>
                <td className="py-2 pr-3">
                  {p.unidadesAceitas.length > 1 ? (
                    <Selecao
                      aria-label={`Unidade de ${p.nome}`}
                      className="w-32"
                      disabled={!podeEditar || !p.ativo}
                      value={p.unidadePreferida ?? p.unidadePadrao}
                      onChange={(ev) =>
                        e.alterar(i, {
                          unidadePreferida:
                            ev.target.value === p.unidadePadrao ? null : ev.target.value,
                        })
                      }
                    >
                      {p.unidadesAceitas.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </Selecao>
                  ) : (
                    p.unidadePadrao
                  )}
                </td>
                <td className="py-2 pr-3">
                  <CampoNumero
                    aria-label={`Mínimo de ${p.nome}`}
                    className="w-32"
                    casas={p.casas}
                    permitirNegativo
                    disabled={!podeEditar || !p.ativo}
                    valor={p.minimo}
                    aoMudar={(v) => e.alterar(i, { minimo: v })}
                  />
                </td>
                <td className="py-2">
                  <CampoNumero
                    aria-label={`Máximo de ${p.nome}`}
                    className="w-32"
                    casas={p.casas}
                    permitirNegativo
                    disabled={!podeEditar || !p.ativo}
                    valor={p.maximo}
                    aoMudar={(v) => e.alterar(i, { maximo: v })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Moldura>
  );
}

// Rendimento ---------------------------------------------------------------------------------

interface Rendimento {
  variedadeId: string | null;
  estilo: string | null;
  litrosPorKg: string | null;
}

function AbaRendimentos({ podeEditar }: { podeEditar: boolean }) {
  const e = useEdicao<Rendimento>('/api/cantina/rendimentos');
  const { data: ref } = useReferencia();
  const variedades = useQuery({
    queryKey: ['variedades-em-uso'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string }> }>(
          '/api/catalogos/variedade?emUso=sim&tamanho=0',
        )
      ).itens,
  });
  return (
    <Moldura
      edicao={e as never}
      podeEditar={podeEditar}
      descricao={
        <>
          Litros estimados por kg de uva no esmagamento, para este estabelecimento. A regra mais
          específica vence (variedade e estilo, depois só variedade, só estilo, geral). Sem regra, o
          usuário digita a estimativa. A prensagem mede o volume real; acima de 0,8 L/kg após as
          borras, o sistema alerta (Decreto 12.709, art. 93).
        </>
      }
      aoSalvar={() => e.salvar({ itens: e.itens })}
    >
      {e.itens.map((r, i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
          <Campo rotulo="Variedade" id={`rend-var-${i}`}>
            <Selecao
              id={`rend-var-${i}`}
              disabled={!podeEditar}
              value={r.variedadeId ?? ''}
              onChange={(ev) => e.alterar(i, { variedadeId: ev.target.value || null })}
            >
              <option value="">Todas</option>
              {variedades.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Estilo" id={`rend-estilo-${i}`}>
            <Selecao
              id={`rend-estilo-${i}`}
              disabled={!podeEditar}
              value={r.estilo ?? ''}
              onChange={(ev) => e.alterar(i, { estilo: ev.target.value || null })}
            >
              <option value="">Todos</option>
              {ref?.listas.cor_vinho?.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Litros por kg" id={`rend-l-${i}`}>
            <CampoNumero
              id={`rend-l-${i}`}
              casas={4}
              disabled={!podeEditar}
              valor={r.litrosPorKg}
              aoMudar={(v) => e.alterar(i, { litrosPorKg: v })}
            />
          </Campo>
          {podeEditar && (
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover regra"
              onClick={() => e.definir(e.itens.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Botao>
          )}
        </div>
      ))}
      {!e.itens.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma regra. O usuário informa a estimativa a cada esmagamento.
        </p>
      )}
      {podeEditar && (
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() =>
              e.definir([...e.itens, { variedadeId: null, estilo: null, litrosPorKg: null }])
            }
          >
            <Plus /> Regra
          </Botao>
        </div>
      )}
    </Moldura>
  );
}

// Ciclos -------------------------------------------------------------------------------------

interface Ciclo {
  numero: string;
  nome: string;
}

function AbaCiclos({ podeEditar }: { podeEditar: boolean }) {
  const e = useEdicao<Ciclo>('/api/cantina/ciclos');
  const proximo = () =>
    String(Math.max(0, ...e.itens.map((c) => Number(c.numero) || 0)) + 1).padStart(2, '0');
  return (
    <Moldura
      edicao={e as never}
      podeEditar={podeEditar}
      descricao="Ciclos da safra deste estabelecimento. Onde há mais de uma safra por ano (regiões tropicais), o número do ciclo entra no código do lote de produção (ex.: 2026.01-042). Com um ciclo só, deixe vazio: o código usa 01."
      aoSalvar={() => e.salvar({ ciclos: e.itens })}
    >
      {e.itens.map((c, i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[6rem_1fr_auto]">
          <Campo rotulo="Número" id={`ciclo-n-${i}`}>
            <Entrada
              id={`ciclo-n-${i}`}
              inputMode="numeric"
              maxLength={2}
              disabled={!podeEditar}
              value={c.numero}
              onChange={(ev) => e.alterar(i, { numero: ev.target.value })}
            />
          </Campo>
          <Campo rotulo="Nome" id={`ciclo-nome-${i}`}>
            <Entrada
              id={`ciclo-nome-${i}`}
              placeholder="1º semestre"
              disabled={!podeEditar}
              value={c.nome}
              onChange={(ev) => e.alterar(i, { nome: ev.target.value })}
            />
          </Campo>
          {podeEditar && (
            <Botao
              variante="fantasma"
              tamanho="icone"
              aria-label="Remover ciclo"
              onClick={() => e.definir(e.itens.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Botao>
          )}
        </div>
      ))}
      {podeEditar && (
        <div>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() => e.definir([...e.itens, { numero: proximo(), nome: '' }])}
          >
            <Plus /> Ciclo
          </Botao>
        </div>
      )}
    </Moldura>
  );
}

// Higienização -------------------------------------------------------------------------------

interface Periodicidade {
  tipoRecipienteId: string;
  intervaloDias: number | null;
}

function AbaHigienizacao({ podeEditar }: { podeEditar: boolean }) {
  const e = useEdicao<Periodicidade>('/api/cantina/higienizacao');
  const tipos = useQuery({
    queryKey: ['tipos-recipiente'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string }> }>(
          '/api/catalogos/tipo_recipiente?tamanho=0',
        )
      ).itens,
  });
  // Uma linha por tipo; vazio = sem periodicidade.
  const linhas = (tipos.data ?? []).map((t) => ({
    tipo: t,
    dias: e.itens.find((x) => x.tipoRecipienteId === t.id)?.intervaloDias ?? null,
  }));
  const definirDias = (tipoId: string, dias: number | null) =>
    e.definir([
      ...e.itens.filter((x) => x.tipoRecipienteId !== tipoId),
      ...(dias ? [{ tipoRecipienteId: tipoId, intervaloDias: dias }] : []),
    ]);
  return (
    <Moldura
      edicao={e as never}
      podeEditar={podeEditar}
      descricao="De quanto em quanto tempo cada tipo de recipiente vazio precisa ser higienizado. Vencido o prazo, o recipiente aparece como aguardando higienização e recebe vinho com alerta."
      aoSalvar={() => e.salvar({ itens: e.itens })}
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {linhas.map(({ tipo, dias }) => (
          <Campo key={tipo.id} rotulo={tipo.nome} id={`hig-${tipo.id}`}>
            <div className="flex items-center gap-2">
              <Entrada
                id={`hig-${tipo.id}`}
                className="w-28"
                inputMode="numeric"
                placeholder="—"
                disabled={!podeEditar}
                value={dias ?? ''}
                onChange={(ev) => {
                  const n = Number(ev.target.value.replace(/\D/g, ''));
                  definirDias(tipo.id, n > 0 ? Math.min(n, 3650) : null);
                }}
              />
              <span className="text-sm text-muted-foreground">dias</span>
            </div>
          </Campo>
        ))}
      </div>
    </Moldura>
  );
}

const ABAS = {
  analises: 'Análises',
  rendimento: 'Rendimento',
  ciclos: 'Ciclos da safra',
  higienizacao: 'Higienização',
  tratamentos: 'Tratamentos',
} as const;

/**
 * Parâmetros técnicos por tipo de tratamento (cantina.md, Tratamentos; P29): o que a tela do
 * tratamento pede, como "porosidade (µm)" na filtração ou "dias de frio" na estabilização.
 */
function AbaTratamentos({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const { data: ref } = useReferencia();
  const q = useParametrosTratamento();
  const [novo, setNovo] = useState({
    tipoTratamento: '',
    nome: '',
    unidade: '',
    obrigatorio: false,
  });
  const [msg, setMsg] = useState<Mensagem>(null);
  const tipos = ref?.listas.tipo_tratamento ?? [];
  const recarregar = () => qc.invalidateQueries({ queryKey: ['parametros-tratamento'] });
  type Parametro = NonNullable<typeof q.data>[number];
  const alterar = async (p: Parametro, mudanca: Partial<Parametro>) => {
    try {
      await api.put(`/api/cantina/parametros-tratamento/${p.id}`, { ...p, ...mudanca });
      await recarregar();
    } catch (e) {
      setMsg({ tom: 'erro', texto: (e as Error).message });
    }
  };
  return (
    <Cartao>
      <CorpoCartao className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Os campos técnicos que a tela de cada tratamento pede. Ex.: na filtração, tipo de filtro e
          porosidade; na estabilização tartárica, temperatura e dias de frio.
        </p>
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        {tipos.map((tipo) => {
          const lista = (q.data ?? []).filter((p) => p.tipoTratamento === tipo.codigo);
          if (!lista.length) return null;
          return (
            <div key={tipo.codigo}>
              <p className="text-sm font-medium">{tipo.nome}</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {lista.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3">
                    <span className={p.ativo ? '' : 'text-muted-foreground line-through'}>
                      {p.nome}
                      {p.unidade && ` (${p.unidade})`}
                      {p.obrigatorio && ' · obrigatório'}
                    </span>
                    {podeEditar && (
                      <>
                        <Botao
                          variante="fantasma"
                          tamanho="pequeno"
                          onClick={() => alterar(p, { obrigatorio: !p.obrigatorio })}
                        >
                          {p.obrigatorio ? 'Tornar opcional' : 'Tornar obrigatório'}
                        </Botao>
                        <AcoesLinha
                          ativo={p.ativo}
                          aoInativar={() => alterar(p, { ativo: false })}
                          aoReativar={() => alterar(p, { ativo: true })}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {q.data && !q.data.length && (
          <p className="text-sm text-muted-foreground">Nenhum parâmetro configurado.</p>
        )}
        {podeEditar && (
          <div className="grid items-end gap-2 border-t pt-4 sm:grid-cols-[14rem_1fr_8rem_auto_auto]">
            <Campo rotulo="Tratamento" id="pt-tipo">
              <Selecao
                id="pt-tipo"
                value={novo.tipoTratamento}
                onChange={(e) => setNovo({ ...novo, tipoTratamento: e.target.value })}
              >
                <option value="">Escolha</option>
                {tipos.map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Parâmetro" id="pt-nome">
              <Entrada
                id="pt-nome"
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Unidade" id="pt-un">
              <Entrada
                id="pt-un"
                value={novo.unidade}
                onChange={(e) => setNovo({ ...novo, unidade: e.target.value })}
              />
            </Campo>
            <div className="pb-2">
              <Caixa
                rotulo="Obrigatório"
                checked={novo.obrigatorio}
                onChange={(e) => setNovo({ ...novo, obrigatorio: e.target.checked })}
              />
            </div>
            <Botao
              onClick={async () => {
                setMsg(null);
                try {
                  await api.post('/api/cantina/parametros-tratamento', {
                    ...novo,
                    unidade: novo.unidade || null,
                  });
                  setNovo({ ...novo, nome: '', unidade: '', obrigatorio: false });
                  await recarregar();
                } catch (e) {
                  setMsg({ tom: 'erro', texto: (e as Error).message });
                }
              }}
            >
              <Plus /> Incluir
            </Botao>
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  );
}

export function PaginaParametros() {
  const { aba = 'analises' } = useParams();
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const podeEditar = pode(s, 'enotrace.cadastros', 'editar');
  return (
    <Pagina titulo="Parâmetros técnicos" trilha={['EnoTrace', 'Cadastros']}>
      <Abas
        value={aba in ABAS ? aba : 'analises'}
        onValueChange={(v) => navegar(`/enotrace/parametros/${v}`, { replace: true })}
      >
        <ListaAbas>
          {Object.entries(ABAS).map(([k, nome]) => (
            <Aba key={k} value={k}>
              {nome}
            </Aba>
          ))}
        </ListaAbas>
        <ConteudoAba value="analises">
          <AbaAnalises podeEditar={podeEditar} />
        </ConteudoAba>
        <ConteudoAba value="rendimento">
          <AbaRendimentos podeEditar={podeEditar} />
        </ConteudoAba>
        <ConteudoAba value="ciclos">
          <AbaCiclos podeEditar={podeEditar} />
        </ConteudoAba>
        <ConteudoAba value="higienizacao">
          <AbaHigienizacao podeEditar={podeEditar} />
        </ConteudoAba>
        <ConteudoAba value="tratamentos">
          <AbaTratamentos podeEditar={podeEditar} />
        </ConteudoAba>
      </Abas>
    </Pagina>
  );
}
