// Gestão › Diário (ambiente-cliente.md, Diário; 04, roteiro do ciclo 8): notas datadas do
// estabelecimento, com autor, anexos e vínculo opcional a projeto, recipiente ou parcela. O mesmo
// bloco aparece na ficha do projeto, do recipiente e da propriedade, já filtrado.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Anexos } from '@/componentes/Anexos';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api, ErroApi } from '@/lib/api';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarData } from '@/lib/utils';
import { useProjetos, useRecipientes } from '../enotrace/operacoes/comum';

interface Nota {
  id: string;
  data: string;
  texto: string;
  autor: string | null;
  meu: boolean;
  editada: boolean;
  projeto: { id: string; nome: string } | null;
  recipiente: { id: string; codigo: string } | null;
  parcela: { id: string; nome: string } | null;
  anexos: number;
}
interface Vinculo {
  projetoId?: string | null;
  recipienteId?: string | null;
  parcelaId?: string | null;
}
type Filtro = {
  projeto?: string;
  recipiente?: string;
  propriedade?: string;
  busca?: string;
  de?: string;
  ate?: string;
};

const hoje = (fuso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
const msg = (e: unknown) => (e instanceof ErroApi ? e.message : (e as Error).message);

function useParcelas(ativo: boolean) {
  return useQuery({
    queryKey: ['propriedades-opcoes'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string; parcelas: Array<{ id: string; nome: string }> }>>(
        '/api/propriedades/opcoes',
      ),
    enabled: ativo,
    retry: false,
  });
}

export function PaginaDiario() {
  const [filtro, setFiltro] = useState<Filtro>({});
  return (
    <Pagina titulo="Diário" trilha={['Gestão']}>
      <p className="text-sm text-muted-foreground">
        Notas datadas do estabelecimento: o que aconteceu no vinhedo e na cantina. Vincule a nota a
        um projeto, a um recipiente ou a uma parcela para ela aparecer também na ficha deles. As
        notas das parcelas ajudam na declaração de uvas do SIVIBE (condições que afetaram a
        produtividade).
      </p>
      <div className="flex flex-wrap gap-2">
        <Entrada
          type="search"
          aria-label="Buscar no texto"
          placeholder="Buscar no texto…"
          className="w-60"
          value={filtro.busca ?? ''}
          onChange={(e) => setFiltro({ ...filtro, busca: e.target.value || undefined })}
        />
        <FiltroPropriedade
          valor={filtro.propriedade}
          aoMudar={(v) => setFiltro({ ...filtro, propriedade: v })}
        />
        <Entrada
          type="date"
          aria-label="De"
          className="w-40"
          value={filtro.de ?? ''}
          onChange={(e) => setFiltro({ ...filtro, de: e.target.value || undefined })}
        />
        <Entrada
          type="date"
          aria-label="Até"
          className="w-40"
          value={filtro.ate ?? ''}
          onChange={(e) => setFiltro({ ...filtro, ate: e.target.value || undefined })}
        />
      </div>
      <NotasDoDiario filtro={filtro} escolherVinculo />
    </Pagina>
  );
}

function FiltroPropriedade({
  valor,
  aoMudar,
}: {
  valor?: string;
  aoMudar: (v: string | undefined) => void;
}) {
  const p = useParcelas(true);
  if (!p.data?.length) return null;
  return (
    <Selecao
      aria-label="Propriedade"
      className="w-52"
      value={valor ?? ''}
      onChange={(e) => aoMudar(e.target.value || undefined)}
    >
      <option value="">Todas as notas</option>
      {p.data.map((x) => (
        <option key={x.id} value={x.id}>
          Parcelas de {x.nome}
        </option>
      ))}
    </Selecao>
  );
}

/** Lista de notas com o formulário de nova nota; com "vinculo", a nota nova já nasce vinculada. */
export function NotasDoDiario({
  filtro,
  vinculo,
  escolherVinculo,
  titulo,
}: {
  filtro: Filtro;
  vinculo?: Vinculo;
  escolherVinculo?: boolean;
  titulo?: string;
}) {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const qc = useQueryClient();
  const podeVer = pode(s, 'gestao.diario', 'visualizar');
  const podeCriar = pode(s, 'gestao.diario', 'criar');
  const params = new URLSearchParams(
    Object.entries(filtro).filter((x): x is [string, string] => !!x[1]),
  ).toString();
  const q = useQuery({
    queryKey: ['diario', params],
    queryFn: () => api.get<Nota[]>(`/api/diario${params ? `?${params}` : ''}`),
    enabled: podeVer,
  });
  const vazia = { data: hoje(fuso), texto: '', ...vinculo };
  const [nova, setNova] = useState<{ data: string; texto: string } & Vinculo>(vazia);
  const [editando, setEditando] = useState<string | null>(null);
  const [anexosDe, setAnexosDe] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const projetos = useProjetos();
  const recipientes = useRecipientes();
  const propriedades = useParcelas(!!escolherVinculo);
  const atualizar = () => qc.invalidateQueries({ queryKey: ['diario'] });
  if (!podeVer) return null;
  const salvar = async () => {
    setErro(null);
    try {
      if (editando) await api.put(`/api/diario/${editando}`, nova);
      else await api.post('/api/diario', nova);
      setNova(vazia);
      setEditando(null);
      await atualizar();
    } catch (e) {
      setErro(msg(e));
    }
  };
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo ?? 'Notas'} />
      <CorpoCartao className="flex flex-col gap-4">
        {podeCriar && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
              <Campo rotulo="Data" id="di-data">
                <Entrada
                  id="di-data"
                  type="date"
                  value={nova.data}
                  onChange={(e) => setNova({ ...nova, data: e.target.value })}
                />
              </Campo>
              <Campo rotulo={editando ? 'Alterar a nota' : 'Nova nota'} id="di-texto">
                <AreaTexto
                  id="di-texto"
                  rows={2}
                  value={nova.texto}
                  onChange={(e) => setNova({ ...nova, texto: e.target.value })}
                />
              </Campo>
            </div>
            {escolherVinculo && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Selecao
                  aria-label="Projeto"
                  value={nova.projetoId ?? ''}
                  onChange={(e) => setNova({ ...nova, projetoId: e.target.value || null })}
                >
                  <option value="">Sem projeto</option>
                  {projetos.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.nome}
                    </option>
                  ))}
                </Selecao>
                <Selecao
                  aria-label="Recipiente"
                  value={nova.recipienteId ?? ''}
                  onChange={(e) => setNova({ ...nova, recipienteId: e.target.value || null })}
                >
                  <option value="">Sem recipiente</option>
                  {recipientes.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.codigo}
                    </option>
                  ))}
                </Selecao>
                <Selecao
                  aria-label="Parcela"
                  value={nova.parcelaId ?? ''}
                  onChange={(e) => setNova({ ...nova, parcelaId: e.target.value || null })}
                >
                  <option value="">Sem parcela</option>
                  {propriedades.data?.map((p) => (
                    <optgroup key={p.id} label={p.nome}>
                      {p.parcelas.map((x) => (
                        <option key={x.id} value={x.id}>
                          {p.nome} · {x.nome}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Selecao>
              </div>
            )}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <div className="flex gap-2">
              <Botao disabled={nova.texto.trim().length < 2 || !nova.data} onClick={salvar}>
                {editando ? 'Salvar a alteração' : 'Registrar a nota'}
              </Botao>
              {editando && (
                <Botao
                  variante="secundario"
                  onClick={() => {
                    setEditando(null);
                    setNova(vazia);
                  }}
                >
                  Cancelar
                </Botao>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-col divide-y text-sm">
          {q.data?.map((n) => (
            <div key={n.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatarData(n.data)}</span>
                <span className="text-muted-foreground">
                  {n.autor}
                  {n.editada && ' · alterada'}
                </span>
                {n.projeto && (
                  <Link className="text-xs underline" to={`/enotrace/projetos/${n.projeto.id}`}>
                    {n.projeto.nome}
                  </Link>
                )}
                {n.recipiente && (
                  <Link
                    className="text-xs underline"
                    to={`/enotrace/recipientes/${n.recipiente.id}`}
                  >
                    {n.recipiente.codigo}
                  </Link>
                )}
                {n.parcela && <span className="text-xs">{n.parcela.nome}</span>}
                <span className="ml-auto flex gap-1">
                  <Botao
                    variante="secundario"
                    onClick={() => setAnexosDe(anexosDe === n.id ? null : n.id)}
                  >
                    <Paperclip /> {n.anexos || ''}
                  </Botao>
                  {(n.meu ? podeCriar : pode(s, 'gestao.diario', 'editar')) && (
                    <Botao
                      variante="secundario"
                      onClick={() => {
                        setEditando(n.id);
                        setNova({
                          data: n.data,
                          texto: n.texto,
                          projetoId: n.projeto?.id ?? null,
                          recipienteId: n.recipiente?.id ?? null,
                          parcelaId: n.parcela?.id ?? null,
                        });
                      }}
                    >
                      Alterar
                    </Botao>
                  )}
                  {(n.meu ? podeCriar : pode(s, 'gestao.diario', 'inativar')) && (
                    <Botao variante="secundario" onClick={() => setRemovendo(n.id)}>
                      Remover
                    </Botao>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{n.texto}</p>
              {anexosDe === n.id && (
                <Anexos
                  entidade="diario_nota"
                  registroId={n.id}
                  podeAlterar={podeCriar}
                  fuso={fuso}
                />
              )}
            </div>
          ))}
          {q.data && !q.data.length && (
            <p className="py-4 text-center text-muted-foreground">Nenhuma nota.</p>
          )}
        </div>
      </CorpoCartao>
      <PedirMotivo
        aberto={!!removendo}
        aoMudar={(v) => !v && setRemovendo(null)}
        titulo="Remover a nota"
        descricao="A nota sai do diário; o registro fica na auditoria."
        rotuloBotao="Remover"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/diario/${removendo}/inativar`, { motivo });
          setRemovendo(null);
          await atualizar();
        }}
      />
    </Cartao>
  );
}
