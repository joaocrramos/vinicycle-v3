// Configurações › Parâmetros (gestao.md, Configurações): os valores simples aqui, e o caminho para
// os parâmetros que têm tela própria.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ChaveParametro,
  ESTRATEGIAS_BAIXA,
  CHAVES_TIPO_APROVACAO,
  erroDoFormatoCodigo,
  MARCADORES_CODIGO,
  montarCodigo,
  TIPOS_APROVACAO,
  TIPOS_CODIGO,
  type TipoCodigo,
  type ValorParametro,
} from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Link } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { pode, useSessao } from '@/lib/sessao';

type Parametros = { [C in ChaveParametro]: { valor: ValorParametro<C>; padrao: boolean } };

/** Cartão de um parâmetro: rascunho local, salvar e aviso. */
function CartaoParametro<C extends ChaveParametro>({
  chave,
  titulo,
  descricao,
  atual,
  podeEditar,
  invalido,
  children,
}: {
  chave: C;
  titulo: string;
  descricao: ReactNode;
  atual: ValorParametro<C>;
  podeEditar: boolean;
  /** Rascunho com erro: o botão Salvar fica desligado. */
  invalido?: (valor: ValorParametro<C>) => boolean;
  children: (valor: ValorParametro<C>, mudar: (v: ValorParametro<C>) => void) => ReactNode;
}) {
  const qc = useQueryClient();
  const [rascunho, setRascunho] = useState<ValorParametro<C> | null>(null);
  const [msg, setMsg] = useState<{ tom: 'sucesso' | 'erro'; texto: string } | null>(null);
  const valor = rascunho ?? atual;
  return (
    <Cartao>
      <CabecalhoCartao titulo={titulo} descricao={descricao} />
      <CorpoCartao className="flex flex-col gap-4">
        {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
        <fieldset disabled={!podeEditar} className="flex flex-col gap-4">
          {children(valor, (v) => {
            setMsg(null);
            setRascunho(v);
          })}
        </fieldset>
        {podeEditar && (
          <div className="flex gap-2">
            <Botao
              disabled={!rascunho || invalido?.(rascunho)}
              onClick={async () => {
                try {
                  await api.put(`/api/parametros/${chave}`, valor);
                  await qc.invalidateQueries({ queryKey: ['parametros-gestao'] });
                  setRascunho(null);
                  setMsg({ tom: 'sucesso', texto: 'Parâmetro salvo.' });
                } catch (e) {
                  setMsg({ tom: 'erro', texto: (e as Error).message });
                }
              }}
            >
              Salvar
            </Botao>
            {rascunho && (
              <Botao
                variante="secundario"
                onClick={() => {
                  setRascunho(null);
                  setMsg(null);
                }}
              >
                Descartar alterações
              </Botao>
            )}
          </div>
        )}
      </CorpoCartao>
    </Cartao>
  );
}

function FormatosCodigo({
  atual,
  podeEditar,
}: {
  atual: ValorParametro<'formatos_codigo'>;
  podeEditar: boolean;
}) {
  const tipos = Object.keys(TIPOS_CODIGO) as TipoCodigo[];
  const ano = new Date().getFullYear();
  return (
    <CartaoParametro
      chave="formatos_codigo"
      titulo="Formatos de código"
      descricao={
        <>
          Numeração sequencial por estabelecimento, por tipo e por ano, sem buracos nem repetição
          (P19). Marcadores:{' '}
          {Object.entries(MARCADORES_CODIGO)
            .map(([m, d]) => `${m} ${d}`)
            .join('; ')}
          . Mudar o formato não altera códigos já emitidos; a sequência do ano continua.
        </>
      }
      atual={atual}
      podeEditar={podeEditar}
      invalido={(v) => tipos.some((k) => erroDoFormatoCodigo(v[k]))}
    >
      {(valor, mudar) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {tipos.map((k) => {
            const erro = erroDoFormatoCodigo(valor[k]);
            return (
              <Campo
                key={k}
                rotulo={TIPOS_CODIGO[k].nome}
                id={`codigo-${k}`}
                erro={erro ?? undefined}
                ajuda={erro ? undefined : `Exemplo: ${montarCodigo(valor[k], { ano, numero: 1 })}`}
              >
                <Entrada
                  id={`codigo-${k}`}
                  className="font-mono"
                  value={valor[k]}
                  onChange={(e) => mudar({ ...valor, [k]: e.target.value })}
                />
              </Campo>
            );
          })}
        </div>
      )}
    </CartaoParametro>
  );
}

const repetidos = (dias: number[]) => new Set(dias).size !== dias.length;

function AvisosValidade({
  atual,
  podeEditar,
}: {
  atual: ValorParametro<'avisos_validade'>;
  podeEditar: boolean;
}) {
  return (
    <CartaoParametro
      chave="avisos_validade"
      titulo="Antecedência dos avisos de validade"
      descricao={
        <>
          Quantos dias antes de vencer a validade de lotes de insumo, credenciamentos e ART a
          central de alertas avisa (P20, ciclo 6). O vencimento de documentos tem antecedência
          própria em{' '}
          <Link className="underline" to="/gestao/documentos/tipos">
            tipos de documento
          </Link>
          .
        </>
      }
      atual={atual}
      podeEditar={podeEditar}
      // 0 é campo vazio no rascunho.
      invalido={(v) => v.dias.includes(0) || repetidos(v.dias)}
    >
      {({ dias }, mudar) => (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {dias.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Entrada
                  aria-label={`Aviso ${i + 1}, em dias`}
                  className="w-24"
                  inputMode="numeric"
                  value={d || ''}
                  onChange={(e) => {
                    const n = Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, 365);
                    mudar({ dias: dias.map((x, j) => (j === i ? n : x)) });
                  }}
                />
                <span className="text-sm text-muted-foreground">dias</span>
                {podeEditar && dias.length > 1 && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label={`Remover aviso ${i + 1}`}
                    onClick={() => mudar({ dias: dias.filter((_, j) => j !== i) })}
                  >
                    <Trash2 />
                  </Botao>
                )}
              </div>
            ))}
            {podeEditar && dias.length < 3 && (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                onClick={() => mudar({ dias: [...dias, 0] })}
              >
                <Plus /> Aviso
              </Botao>
            )}
          </div>
          {repetidos(dias.filter(Boolean)) && <Aviso tom="erro">Há dias repetidos.</Aviso>}
        </>
      )}
    </CartaoParametro>
  );
}

const OUTROS: Array<{ nome: string; para: string; onde: string }> = [
  { nome: 'Locais', para: '/config/locais', onde: 'Configurações' },
  {
    nome: 'Tipos de documento e avisos de vencimento',
    para: '/gestao/documentos/tipos',
    onde: 'Documentos',
  },
  { nome: 'Cargos e categorias de fornecimento', para: '/gestao/listas/cargo', onde: 'Pessoas' },
  {
    nome: 'Análises e faixas, rendimento, ciclos da safra e higienização',
    para: '/enotrace/parametros',
    onde: 'EnoTrace',
  },
  {
    nome: 'Variedades, tipos e listas da cantina (etapas, frações de prensa, trasfega, perdas, saídas…)',
    para: '/enotrace/catalogos',
    onde: 'EnoTrace',
  },
];

export function PaginaParametrosGestao() {
  const { data: s } = useSessao();
  const podeEditar = pode(s, 'gestao.config.parametros', 'editar');
  const q = useQuery({
    queryKey: ['parametros-gestao'],
    queryFn: () => api.get<Parametros>('/api/parametros'),
  });
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const p = q.data;
  return (
    <Pagina titulo="Parâmetros" trilha={['Configurações']}>
      <p className="text-sm text-muted-foreground">
        Valores que mudam o comportamento do sistema para toda a empresa. Sem alteração, valem os
        padrões indicados.
      </p>
      <FormatosCodigo atual={p.formatos_codigo.valor} podeEditar={podeEditar} />
      <CartaoParametro
        chave="baixa_saidas"
        titulo="De qual lote sai cada garrafa"
        descricao="Estratégia usada nas saídas importadas (vendas e outras), a partir do ciclo 5."
        atual={p.baixa_saidas.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={v.usarLoteDoDocumento}
                onChange={(e) => mudar({ ...v, usarLoteDoDocumento: e.target.checked })}
              />
              Usar o lote informado na nota, quando houver (grupo de rastreabilidade da NF-e)
            </label>
            <Campo
              rotulo={v.usarLoteDoDocumento ? 'Na falta do lote na nota' : 'Estratégia'}
              id="estrategia"
            >
              <Selecao
                id="estrategia"
                className="sm:w-72"
                value={v.padrao}
                onChange={(e) => mudar({ ...v, padrao: e.target.value as typeof v.padrao })}
              >
                {Object.entries(ESTRATEGIAS_BAIXA).map(([k, nome]) => (
                  <option key={k} value={k}>
                    {nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {v.padrao === 'sem_lote' && (
              <Aviso tom="alerta">
                Sem lote na saída, não é possível saber quem recebeu cada lote num recolhimento
                (recall).
              </Aviso>
            )}
          </>
        )}
      </CartaoParametro>
      <CartaoParametro
        chave="higienizar_ao_esvaziar"
        titulo="Recipiente vazio"
        descricao="Encher um recipiente aguardando higienização gera alerta, não bloqueio (P29)."
        atual={p.higienizar_ao_esvaziar.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={v.ativo}
              onChange={(e) => mudar({ ativo: e.target.checked })}
            />
            Ao esvaziar, o recipiente passa a "aguardando higienização"
          </label>
        )}
      </CartaoParametro>
      <AvisosValidade atual={p.avisos_validade.valor} podeEditar={podeEditar} />
      <CartaoParametro
        chave="fim_fermentacao"
        titulo="Sugestão de fim da fermentação alcoólica"
        descricao="O sistema sugere o fim quando as últimas leituras de densidade ficam iguais (três casas) e abaixo do máximo. Quem confirma é o enólogo (cantina.md, Fermentações)."
        atual={p.fim_fermentacao.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <div className="flex flex-wrap items-end gap-4">
            <Campo rotulo="Leituras iguais" id="ff-leituras">
              <Entrada
                id="ff-leituras"
                className="w-24"
                inputMode="numeric"
                value={v.leituras || ''}
                onChange={(e) =>
                  mudar({
                    ...v,
                    leituras: Math.min(Number(e.target.value.replace(/\D/g, '')) || 0, 10),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Densidade abaixo de" id="ff-densidade">
              <CampoNumero
                id="ff-densidade"
                casas={4}
                unidade="g/mL"
                valor={v.densidadeMaxima.toFixed(4)}
                aoMudar={(x) => mudar({ ...v, densidadeMaxima: Number(x ?? 0) })}
              />
            </Campo>
          </div>
        )}
      </CartaoParametro>
      <CartaoParametro
        chave="inventario_cantina"
        titulo="Diferença do inventário da cantina"
        descricao="Diferença entre o medido e o livro acima deste percentual pede “ciente” na confirmação do ajuste, que só quem tem a permissão de ajuste de inventário faz (cantina.md, Inventário)."
        atual={p.inventario_cantina.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <Campo rotulo="Acima de" id="inv-percentual">
            <CampoNumero
              id="inv-percentual"
              casas={1}
              unidade="% do livro"
              valor={v.percentual.toFixed(1)}
              aoMudar={(x) => mudar({ ...v, percentual: Number(x ?? 0) })}
            />
          </Campo>
        )}
      </CartaoParametro>
      <CartaoParametro
        chave="envase"
        titulo="Envase"
        descricao="A perda média de vinho no envase entra na previsão das garrafas. O laudo com teor alcoólico fora de ±0,5% vol do rótulo gera alerta no engarrafamento; ligado, bloqueia (IN MAPA 14/2018, art. 11, §4º; cantina.md, Laudo fora do padrão)."
        atual={p.envase.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Perda média" id="env-perda">
              <CampoNumero
                id="env-perda"
                casas={1}
                unidade="%"
                valor={v.perdaPercentual.toFixed(1)}
                aoMudar={(x) => mudar({ ...v, perdaPercentual: Number(x ?? 0) })}
              />
            </Campo>
            <Caixa
              rotulo="Bloquear o envase com laudo fora do teor declarado"
              checked={v.bloquearLaudo}
              onChange={(e) => mudar({ ...v, bloquearLaudo: e.target.checked })}
            />
          </div>
        )}
      </CartaoParametro>
      <CartaoParametro
        chave="chaptalizacao"
        titulo="Chaptalização"
        descricao="O açúcar que dá 1% vol de álcool, para o ganho estimado na operação. O limite legal vem da classe e da cor do projeto (regra versionada); o limite da prática da vinícola, opcional, também pede “ciente” quando ultrapassado."
        atual={p.chaptalizacao.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Açúcar por 1% vol" id="chap-fator">
              <CampoNumero
                id="chap-fator"
                casas={1}
                unidade="g/L"
                valor={v.acucarPorGrau.toFixed(1)}
                aoMudar={(x) => mudar({ ...v, acucarPorGrau: Number(x ?? 0) })}
              />
            </Campo>
            <Campo rotulo="Limite da prática (opcional)" id="chap-limite">
              <CampoNumero
                id="chap-limite"
                casas={1}
                unidade="% vol"
                valor={v.limitePratica === null ? null : v.limitePratica.toFixed(1)}
                aoMudar={(x) => mudar({ ...v, limitePratica: x ? Number(x) : null })}
              />
            </Campo>
          </div>
        )}
      </CartaoParametro>
      <CartaoParametro
        chave="aprovacoes"
        titulo="Ações que exigem aprovação"
        descricao="Ligada, a ação vira um pedido em Gestão › Aprovações e só é feita quando alguém com a permissão de aprovar marcar o pedido (P27). Quem pediu não aprova o próprio pedido, exceto o Master."
        atual={p.aprovacoes.valor}
        podeEditar={podeEditar}
      >
        {(v, mudar) => (
          <div className="grid gap-2 sm:grid-cols-2">
            {CHAVES_TIPO_APROVACAO.map((k) => (
              <Caixa
                key={k}
                rotulo={TIPOS_APROVACAO[k]}
                checked={v[k]}
                onChange={(e) => mudar({ ...v, [k]: e.target.checked })}
              />
            ))}
          </div>
        )}
      </CartaoParametro>
      <Cartao>
        <CabecalhoCartao
          titulo="Outros parâmetros"
          descricao="Têm tela própria. Os do laboratório, das aprovações e dos alertas que viram bloqueio chegam com o ciclo que os usa."
        />
        <ul className="divide-y">
          {OUTROS.map((o) => (
            <li key={o.para}>
              <Link
                to={o.para}
                className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm hover:bg-muted/50"
              >
                <span>{o.nome}</span>
                <span className="text-muted-foreground">{o.onde}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Cartao>
    </Pagina>
  );
}
