// EnoTrace › Recipientes (cantina.md, Recipientes).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dadosRecipiente,
  formatarDecimal,
  NOMES_SITUACAO_RECIPIENTE,
  SITUACOES_RECIPIENTE,
} from '@vinicycle/shared';
import { Plus, Snowflake } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha';
import { Anexos } from '@/componentes/Anexos';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Historico } from '@/componentes/Historico';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { NotasDoDiario } from '@/paginas/gestao/Diario';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { useReferencia } from '@/lib/referencia';
import { ConteudoRecipiente } from './Lotes';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';

type Situacao = (typeof SITUACOES_RECIPIENTE)[number];
const TOM: Record<Situacao, 'sucesso' | 'alerta' | 'erro' | 'neutro'> = {
  ativo: 'sucesso',
  aguardando_higienizacao: 'alerta',
  manutencao: 'erro',
  inativo: 'neutro',
};

interface Linha {
  id: string;
  codigo: string;
  tipo: string;
  capacidadeLitros: string;
  possuiFrio: boolean;
  local: string;
  situacao: Situacao;
  volume: string;
  lote: { id: string; codigo: string } | null;
}

interface TipoRecipiente {
  id: string;
  nome: string;
  eBarrica: boolean;
}

function useTiposRecipiente() {
  return useQuery({
    queryKey: ['tipos-recipiente'],
    queryFn: async () =>
      (await api.get<{ itens: TipoRecipiente[] }>('/api/catalogos/tipo_recipiente?tamanho=0'))
        .itens,
  });
}

export function useLocaisRecipientes() {
  return useQuery({
    queryKey: ['locais-recipientes'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<{ id: string; nome: string; uso: string }> }>(
          '/api/locais?tamanho=0',
        )
      ).itens.filter((l) => l.uso !== 'estoque'),
  });
}

export function ListaRecipientes() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const tipos = useTiposRecipiente();
  const locais = useLocaisRecipientes();
  const estab = s?.empresa?.estabelecimentoId;
  return (
    <Pagina
      titulo="Recipientes"
      trilha={['EnoTrace', 'Cadastros']}
      acoes={
        pode(s, 'enotrace.cadastros', 'criar') &&
        estab && (
          <Botao onClick={() => navegar('/enotrace/recipientes/novo')}>
            <Plus /> Novo recipiente
          </Botao>
        )
      }
    >
      {!estab && (
        <Aviso tom="info">
          Para cadastrar recipientes, escolha o estabelecimento no topo da tela.
        </Aviso>
      )}
      <TabelaDados<Linha>
        key={estab ?? 'todos'}
        tabela="recipientes"
        url="/api/recipientes"
        ordemPadrao={{ campo: 'codigo', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'em_uso' }}
        podeExportar={pode(s, 'enotrace.cadastros', 'exportar')}
        aoClicar={(r) => navegar(`/enotrace/recipientes/${r.id}`)}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Situação"
              className="w-48"
              value={f.situacao ?? 'em_uso'}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="em_uso">Em uso (todos menos inativos)</option>
              {SITUACOES_RECIPIENTE.map((x) => (
                <option key={x} value={x}>
                  {NOMES_SITUACAO_RECIPIENTE[x]}
                </option>
              ))}
              <option value="todos">Todos</option>
            </Selecao>
            <Selecao
              aria-label="Tipo"
              className="w-44"
              value={f.tipo ?? ''}
              onChange={(e) => definir('tipo', e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {tipos.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Local"
              className="w-40"
              value={f.local ?? ''}
              onChange={(e) => definir('local', e.target.value)}
            >
              <option value="">Todos os locais</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'codigo',
            titulo: 'Código',
            ordenavel: true,
            celula: (r) => <strong>{r.codigo}</strong>,
            exportar: (r) => r.codigo,
          },
          {
            id: 'tipo',
            titulo: 'Tipo',
            ordenavel: true,
            celula: (r) => r.tipo,
            exportar: (r) => r.tipo,
          },
          {
            id: 'capacidadeLitros',
            titulo: 'Volume',
            ordenavel: true,
            className: 'text-right',
            celula: (r) => (
              <span>
                {formatarDecimal(r.volume, 2)} L
                <span className="block text-xs text-muted-foreground">
                  de {formatarDecimal(r.capacidadeLitros, 2)} L
                </span>
              </span>
            ),
            exportar: (r) => r.capacidadeLitros,
          },
          {
            id: 'lote',
            titulo: 'Lote',
            celula: (r) =>
              r.lote ? (
                <Link
                  className="underline"
                  to={`/enotrace/lotes/${r.lote.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.lote.codigo}
                </Link>
              ) : (
                '—'
              ),
            exportar: (r) => r.lote?.codigo ?? '',
          },
          {
            id: 'frio',
            titulo: 'Frio',
            celula: (r) =>
              r.possuiFrio ? <Snowflake className="size-4" aria-label="com frio" /> : '',
            exportar: (r) => (r.possuiFrio ? 'sim' : 'não'),
          },
          {
            id: 'local',
            titulo: 'Local',
            ordenavel: true,
            celula: (r) => r.local,
            exportar: (r) => r.local,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (r) => (
              <Etiqueta tom={TOM[r.situacao]}>{NOMES_SITUACAO_RECIPIENTE[r.situacao]}</Etiqueta>
            ),
            exportar: (r) => NOMES_SITUACAO_RECIPIENTE[r.situacao],
          },
          colunaAcoes<Linha>((r) => (
            <AcoesLinha
              aoEditar={
                pode(s, 'enotrace.cadastros', 'editar')
                  ? () => navegar(`/enotrace/recipientes/${r.id}`)
                  : undefined
              }
            />
          )),
        ]}
      />
    </Pagina>
  );
}

const VAZIO = {
  codigo: '',
  tipoRecipienteId: '',
  material: null as string | null,
  capacidadeLitros: '' as string | null,
  possuiFrio: false,
  localId: '',
  dimensoes: '',
  fabricante: '',
  dataAquisicao: '',
  tanoaria: '',
  origemMadeira: null as string | null,
  tosta: null as string | null,
  anoPrimeiroUso: null as number | null,
  observacoes: '',
  versao: undefined as number | undefined,
};

function FormularioRecipiente({
  inicial,
  aoSalvar,
  somenteLeitura,
}: {
  inicial: typeof VAZIO;
  aoSalvar: (d: unknown) => Promise<void>;
  somenteLeitura?: boolean;
}) {
  const form = useFormulario(dadosRecipiente, inicial);
  const { data: ref } = useReferencia();
  const tipos = useTiposRecipiente();
  const locais = useLocaisRecipientes();
  const [salvo, setSalvo] = useState(false);
  const v = form.valores as typeof VAZIO;
  const barrica = tipos.data?.find((t) => t.id === v.tipoRecipienteId)?.eBarrica;
  const opcoes = (lista: string) =>
    (ref?.listas[lista] ?? []).map((o) => (
      <option key={o.codigo} value={o.codigo}>
        {o.nome}
      </option>
    ));
  const texto = (
    c: keyof typeof VAZIO,
    rotulo: string,
    { obrigatorio, ...props }: Record<string, unknown> = {},
  ) => (
    <Campo rotulo={rotulo} id={c} erro={form.erro(c)} obrigatorio={!!obrigatorio}>
      <Entrada
        id={c}
        value={(v[c] as string | null) ?? ''}
        onChange={(e) => form.definir(c, e.target.value)}
        onBlur={() => form.tocar(c)}
        {...props}
      />
    </Campo>
  );
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={async (ev: FormEvent) => {
        ev.preventDefault();
        setSalvo(false);
        const d = form.validar();
        if (!d) return;
        try {
          await aoSalvar(d);
          setSalvo(true);
        } catch (e) {
          form.erroDaApi(e);
        }
      }}
    >
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <fieldset disabled={somenteLeitura} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {texto('codigo', 'Código', {
            obrigatorio: true,
            placeholder: 'T1, B12…',
            autoFocus: !inicial.codigo,
          })}
          <Campo
            rotulo="Tipo"
            id="tipoRecipienteId"
            erro={form.erro('tipoRecipienteId')}
            obrigatorio
          >
            <Selecao
              id="tipoRecipienteId"
              value={v.tipoRecipienteId}
              onChange={(e) => form.definir('tipoRecipienteId', e.target.value)}
            >
              <option value="">Escolha</option>
              {tipos.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Capacidade"
            id="capacidadeLitros"
            erro={form.erro('capacidadeLitros')}
            obrigatorio
          >
            <CampoNumero
              id="capacidadeLitros"
              casas={2}
              unidade="L"
              valor={v.capacidadeLitros}
              aoMudar={(x) => form.definir('capacidadeLitros', x ?? '')}
              onBlur={() => form.tocar('capacidadeLitros')}
            />
          </Campo>
          <Campo
            rotulo="Local"
            id="localId"
            erro={form.erro('localId')}
            obrigatorio
            ajuda={
              locais.data && !locais.data.length
                ? 'Cadastre um local de recipientes em Gestão › Locais.'
                : undefined
            }
          >
            <Selecao
              id="localId"
              value={v.localId}
              onChange={(e) => form.definir('localId', e.target.value)}
            >
              <option value="">Escolha</option>
              {locais.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Material" id="material">
            <Selecao
              id="material"
              value={v.material ?? ''}
              onChange={(e) => form.definir('material', e.target.value || null)}
            >
              <option value="">Não informado</option>
              {opcoes('material_recipiente')}
            </Selecao>
          </Campo>
          <div className="flex items-end pb-2">
            <Caixa
              rotulo="Possui sistema de frio"
              checked={v.possuiFrio}
              onChange={(e) => form.definir('possuiFrio', e.target.checked)}
            />
          </div>
        </div>
        {barrica && (
          <fieldset className="grid gap-4 rounded-md border p-4 sm:grid-cols-4">
            <legend className="px-1 text-sm font-semibold">Madeira</legend>
            {texto('tanoaria', 'Tanoaria')}
            <Campo rotulo="Origem da madeira" id="origemMadeira">
              <Selecao
                id="origemMadeira"
                value={v.origemMadeira ?? ''}
                onChange={(e) => form.definir('origemMadeira', e.target.value || null)}
              >
                <option value="">Não informada</option>
                {opcoes('origem_madeira')}
              </Selecao>
            </Campo>
            <Campo rotulo="Tosta" id="tosta">
              <Selecao
                id="tosta"
                value={v.tosta ?? ''}
                onChange={(e) => form.definir('tosta', e.target.value || null)}
              >
                <option value="">Não informada</option>
                {opcoes('tosta')}
              </Selecao>
            </Campo>
            <Campo
              rotulo="Ano do primeiro uso"
              id="anoPrimeiroUso"
              erro={form.erro('anoPrimeiroUso')}
            >
              <Entrada
                id="anoPrimeiroUso"
                type="number"
                inputMode="numeric"
                value={v.anoPrimeiroUso ?? ''}
                onChange={(e) =>
                  form.definir(
                    'anoPrimeiroUso',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
              />
            </Campo>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {texto('dimensoes', 'Dimensões')}
          {texto('fabricante', 'Fabricante')}
          {texto('dataAquisicao', 'Data de aquisição', { type: 'date' })}
        </div>
        <Campo rotulo="Observações" id="observacoes">
          <AreaTexto
            id="observacoes"
            value={v.observacoes ?? ''}
            onChange={(e) => form.definir('observacoes', e.target.value)}
          />
        </Campo>
      </fieldset>
      {!somenteLeitura && (
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      )}
    </form>
  );
}

export function NovoRecipiente() {
  const navegar = useNavigate();
  return (
    <Pagina titulo="Novo recipiente" trilha={['EnoTrace', 'Cadastros', 'Recipientes']}>
      <Cartao>
        <CorpoCartao>
          <FormularioRecipiente
            inicial={VAZIO}
            aoSalvar={async (d) => {
              const r = await api.post<{ id: string }>('/api/recipientes', d);
              navegar(`/enotrace/recipientes/${r.id}`, { replace: true });
            }}
          />
        </CorpoCartao>
      </Cartao>
    </Pagina>
  );
}

function DialogoSituacao({
  id,
  atual,
  aoFechar,
}: {
  id: string;
  atual: Situacao;
  aoFechar: () => void;
}) {
  const qc = useQueryClient();
  const { data: s } = useSessao();
  const [situacao, setSituacao] = useState<Situacao>(atual);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Mudar a situação"
      descricao="Encher um recipiente aguardando higienização gera alerta; em manutenção ou inativo, não recebe vinho."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              try {
                await api.post(`/api/recipientes/${id}/situacao`, {
                  situacao,
                  motivo: motivo || null,
                });
                await qc.invalidateQueries({ queryKey: ['recipiente', id] });
                await qc.invalidateQueries({ queryKey: ['historico', 'recipiente', id] });
                aoFechar();
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Situação" id="sit">
          <Selecao
            id="sit"
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as Situacao)}
          >
            {SITUACOES_RECIPIENTE.filter(
              (x) => x !== 'inativo' || pode(s, 'enotrace.cadastros', 'inativar'),
            ).map((x) => (
              <option key={x} value={x}>
                {NOMES_SITUACAO_RECIPIENTE[x]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Motivo" id="mot" obrigatorio={situacao !== 'ativo'}>
          <AreaTexto id="mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      </div>
    </Dialogo>
  );
}

export function FichaRecipiente() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const [mudar, setMudar] = useState(false);
  const q = useQuery({
    queryKey: ['recipiente', id],
    queryFn: () =>
      api.get<
        typeof VAZIO & {
          id: string;
          situacao: Situacao;
          motivoSituacao: string | null;
          versao: number;
        }
      >(`/api/recipientes/${id}`),
  });
  const podeEditar = pode(s, 'enotrace.cadastros', 'editar');
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const r = q.data;
  return (
    <Pagina
      titulo={`Recipiente ${r.codigo}`}
      trilha={['EnoTrace', 'Cadastros', 'Recipientes']}
      acoes={
        podeEditar && (
          <Botao variante="secundario" onClick={() => setMudar(true)}>
            Mudar situação
          </Botao>
        )
      }
    >
      <p className="flex items-center gap-2 text-sm">
        Situação: <Etiqueta tom={TOM[r.situacao]}>{NOMES_SITUACAO_RECIPIENTE[r.situacao]}</Etiqueta>
        {r.motivoSituacao && <span className="text-muted-foreground">({r.motivoSituacao})</span>}
      </p>
      <Abas defaultValue="conteudo">
        <ListaAbas>
          <Aba value="conteudo">Conteúdo</Aba>
          <Aba value="dados">Dados</Aba>
          <Aba value="diario">Diário</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="conteudo">
          <ConteudoRecipiente id={id} />
        </ConteudoAba>
        <ConteudoAba value="dados">
          <Cartao>
            <CorpoCartao>
              <FormularioRecipiente
                key={r.versao}
                inicial={{ ...VAZIO, ...r }}
                somenteLeitura={!podeEditar}
                aoSalvar={async (d) => {
                  await api.put(`/api/recipientes/${id}`, d);
                  await qc.invalidateQueries({ queryKey: ['recipiente', id] });
                  await qc.invalidateQueries({ queryKey: ['historico', 'recipiente', id] });
                }}
              />
            </CorpoCartao>
          </Cartao>
        </ConteudoAba>
        <ConteudoAba value="diario">
          <NotasDoDiario
            filtro={{ recipiente: id }}
            vinculo={{ recipienteId: id }}
            titulo="Notas do diário"
          />
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos
            entidade="recipiente"
            registroId={id}
            podeAlterar={podeEditar}
            fuso={fusoAtivo(s)}
          />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="recipiente" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      {mudar && <DialogoSituacao id={id} atual={r.situacao} aoFechar={() => setMudar(false)} />}
    </Pagina>
  );
}
