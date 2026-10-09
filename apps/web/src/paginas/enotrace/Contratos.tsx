// EnoTrace › Terceiros › Contratos de terceirização (cantina.md, Vinificação para terceiros e em
// terceiros; IN MAPA 72/2018, arts. 14, 25, 27, 28 e 30; 04, roteiro do ciclo 10, bloco 1).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ATIVIDADES_CONTRATO,
  type AtividadeContrato,
  dadosContrato,
  FORMAS_TEXTO_ROTULO,
  formatarDecimal,
  REGISTROS_PRODUTO,
  SENTIDOS_CONTRATO,
  TIPOS_PERDA_TOLERADA,
  UNIDADES_PAGAMENTO_PRODUTO,
} from '@vinicycle/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha';
import { Anexos } from '@/componentes/Anexos';
import { CampoNumero } from '@/componentes/campos-especiais';
import { Historico } from '@/componentes/Historico';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarData } from '@/lib/utils';

type Sentido = keyof typeof SENTIDOS_CONTRATO;

const SITUACOES: Record<string, { rotulo: string; tom: 'sucesso' | 'alerta' | 'erro' | 'neutro' }> =
  {
    vigente: { rotulo: 'Vigente', tom: 'sucesso' },
    vencendo: { rotulo: 'Vencendo', tom: 'alerta' },
    vencido: { rotulo: 'Vencido', tom: 'erro' },
    futuro: { rotulo: 'Ainda não vigente', tom: 'neutro' },
  };

interface LinhaContrato {
  id: string;
  sentido: Sentido;
  numero: string | null;
  contraparte: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  situacaoVigencia: string;
  marcas: string[];
  ativo: boolean;
}

export function ListaContratos() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const [inativar, setInativar] = useState<LinhaContrato | null>(null);
  const podeInativar = pode(s, 'enotrace.cadastros', 'inativar');
  return (
    <Pagina
      titulo="Contratos de terceirização"
      trilha={['EnoTrace', 'Terceiros']}
      acoes={
        pode(s, 'enotrace.cadastros', 'criar') && (
          <Botao onClick={() => navegar('/enotrace/contratos/novo')}>
            <Plus /> Novo contrato
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Vinificação para terceiros (prestamos o serviço) e produção em terceiro (contratamos), com o
        texto do rótulo e as obrigações da IN MAPA 72/2018, art. 27.
      </p>
      <TabelaDados<LinhaContrato>
        tabela="contratos-terceirizacao"
        url="/api/contratos-terceirizacao"
        ordemPadrao={{ campo: 'vigenciaInicio', direcao: 'desc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        aoClicar={(c) => navegar(`/enotrace/contratos/${c.id}`)}
        podeExportar={pode(s, 'enotrace.cadastros', 'exportar')}
        colunas={[
          {
            id: 'contraparte',
            titulo: 'Contraparte',
            ordenavel: true,
            celula: (c) => (
              <span>
                {c.contraparte}
                <span className="block text-xs text-muted-foreground">
                  {c.sentido === 'prestamos' ? 'Prestamos o serviço' : 'Contratamos'}
                  {c.numero && ` · ${c.numero}`}
                </span>
              </span>
            ),
            exportar: (c) => c.contraparte,
          },
          {
            id: 'marcas',
            titulo: 'Marcas',
            celula: (c) => c.marcas.join(', ') || '—',
            exportar: (c) => c.marcas.join(', '),
          },
          {
            id: 'vigenciaInicio',
            titulo: 'Vigência',
            ordenavel: true,
            celula: (c) =>
              `${formatarData(c.vigenciaInicio)} a ${c.vigenciaFim ? formatarData(c.vigenciaFim) : 'indeterminado'}`,
            exportar: (c) => `${c.vigenciaInicio} ${c.vigenciaFim ?? ''}`,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (c) =>
              c.ativo ? (
                <Etiqueta tom={SITUACOES[c.situacaoVigencia]?.tom}>
                  {SITUACOES[c.situacaoVigencia]?.rotulo}
                </Etiqueta>
              ) : (
                <Etiqueta>Inativo</Etiqueta>
              ),
            exportar: (c) => (c.ativo ? c.situacaoVigencia : 'inativo'),
          },
          colunaAcoes<LinhaContrato>((c) => (
            <AcoesLinha
              ativo={c.ativo}
              aoEditar={
                pode(s, 'enotrace.cadastros', 'editar')
                  ? () => navegar(`/enotrace/contratos/${c.id}`)
                  : undefined
              }
              aoInativar={podeInativar ? () => setInativar(c) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/contratos-terceirizacao/${c.id}/reativar`);
                      await qc.invalidateQueries({
                        queryKey: ['lista', '/api/contratos-terceirizacao'],
                      });
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(x) => !x && setInativar(null)}
        titulo={`Inativar o contrato com ${inativar?.contraparte ?? ''}`}
        descricao="Use quando o contrato for encerrado; os alertas dele deixam de aparecer."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/contratos-terceirizacao/${inativar!.id}/inativar`, { motivo });
          await qc.invalidateQueries({ queryKey: ['lista', '/api/contratos-terceirizacao'] });
        }}
      />
    </Pagina>
  );
}

interface Opcao {
  id: string;
  nome: string;
}

const VAZIO = {
  sentido: 'prestamos' as Sentido,
  numero: '',
  atividades: ['elaboracao', 'envase'] as AtividadeContrato[],
  contraparteId: '',
  estabelecimentoId: '',
  registroMapaContraparte: '',
  registroMapaContraparteValidade: '',
  registroProduto: 'contratante' as keyof typeof REGISTROS_PRODUTO,
  vigenciaInicio: new Date().toISOString().slice(0, 10),
  vigenciaFim: '',
  precos: [] as Array<{ descricao: string; valor: string; unidade: string }>,
  insumosCantina: '',
  insumosCliente: '',
  perdaToleradaTipo: null as string | null,
  perdaToleradaValor: null as string | null,
  pagamentoDinheiro: true,
  pagamentoProdutoValor: null as string | null,
  pagamentoProdutoUnidade: null as string | null,
  prefixoLote: '',
  formaTexto: 'produzido_para' as keyof typeof FORMAS_TEXTO_ROTULO,
  textoRotulo: '',
  comunicadoSipeagroEm: '',
  protocoloSipeagro: '',
  documentoId: null as string | null,
  marcas: [] as string[],
  produtos: [] as string[],
  observacoes: '',
  versao: undefined as number | undefined,
};
type Valores = typeof VAZIO;

const alternar = <T,>(lista: T[], item: T) =>
  lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item];

function FormularioContrato({
  inicial,
  aoSalvar,
  somenteLeitura,
  textoMontado,
}: {
  inicial: Valores;
  aoSalvar: (d: unknown) => Promise<void>;
  somenteLeitura?: boolean;
  textoMontado?: string;
}) {
  const { data: s } = useSessao();
  const form = useFormulario(dadosContrato, inicial);
  const v = form.valores as Valores;
  const [salvo, setSalvo] = useState(false);
  const papel = v.sentido === 'prestamos' ? 'cliente_vinificacao' : 'cantina_prestadora';
  const contrapartes = useQuery({
    queryKey: ['pessoas-opcoes', papel],
    queryFn: () => api.get<Opcao[]>(`/api/pessoas/opcoes?papel=${papel}`),
  });
  const marcas = useQuery({
    queryKey: ['marcas-opcoes'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<Opcao & { donoId: string | null; ativo: boolean }> }>(
          '/api/marcas?tamanho=0',
        )
      ).itens,
  });
  const produtos = useQuery({
    queryKey: ['produtos-opcoes'],
    queryFn: async () =>
      (
        await api.get<{ itens: Array<Opcao & { marcaId: string; marca: string }> }>(
          '/api/produtos?tamanho=0',
        )
      ).itens,
  });
  const documentos = useQuery({
    queryKey: ['documentos-opcoes'],
    queryFn: async () =>
      (await api.get<{ itens: Array<{ id: string; titulo: string }> }>('/api/documentos?tamanho=0'))
        .itens,
  });
  // Marcas do dono certo: a contraparte quando prestamos; a própria empresa quando contratamos.
  const dono = v.sentido === 'prestamos' ? v.contraparteId || '-' : null;
  const marcasDoDono = (marcas.data ?? []).filter(
    (m) => m.donoId === dono && (m.ativo || v.marcas.includes(m.id)),
  );
  const produtosDoDono = (produtos.data ?? []).filter((p) =>
    marcasDoDono.some((m) => m.id === p.marcaId),
  );
  const omiteCantina =
    v.formaTexto === 'responsabilidade_produzido' ||
    v.formaTexto === 'responsabilidade_padronizado';
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
      {salvo && <Aviso tom="sucesso">Contrato salvo.</Aviso>}
      <fieldset disabled={somenteLeitura} className="flex flex-col gap-5">
        <Cartao>
          <CabecalhoCartao titulo="Partes e atividades" />
          <CorpoCartao className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Sentido" id="sentido" erro={form.erro('sentido')} obrigatorio>
              <Selecao
                id="sentido"
                value={v.sentido}
                onChange={(e) => {
                  form.definir('sentido', e.target.value);
                  form.definir('contraparteId', '');
                  form.definir('marcas', []);
                  form.definir('produtos', []);
                }}
              >
                {Object.entries(SENTIDOS_CONTRATO).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Número do contrato" id="numero">
              <Entrada
                id="numero"
                value={v.numero ?? ''}
                onChange={(e) => form.definir('numero', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo={v.sentido === 'prestamos' ? 'Cliente de vinificação' : 'Cantina prestadora'}
              id="contraparteId"
              erro={form.erro('contraparteId')}
              obrigatorio
              ajuda="Cadastre em Gestão › Pessoas, com o papel correspondente."
            >
              <Selecao
                id="contraparteId"
                value={v.contraparteId}
                onChange={(e) => {
                  form.definir('contraparteId', e.target.value);
                  if (v.sentido === 'prestamos') {
                    form.definir('marcas', []);
                    form.definir('produtos', []);
                  }
                }}
              >
                <option value="">Escolha</option>
                {contrapartes.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo
              rotulo="Nosso estabelecimento"
              id="estabelecimentoId"
              erro={form.erro('estabelecimentoId')}
              obrigatorio
            >
              <Selecao
                id="estabelecimentoId"
                value={v.estabelecimentoId}
                onChange={(e) => form.definir('estabelecimentoId', e.target.value)}
              >
                <option value="">Escolha</option>
                {s?.empresa?.estabelecimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Registro MAPA da contraparte" id="registroMapaContraparte">
              <Entrada
                id="registroMapaContraparte"
                value={v.registroMapaContraparte ?? ''}
                onChange={(e) => form.definir('registroMapaContraparte', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Validade do registro da contraparte"
              id="registroMapaContraparteValidade"
              ajuda="Vencendo ou vencido, gera alerta."
            >
              <Entrada
                id="registroMapaContraparteValidade"
                type="date"
                value={v.registroMapaContraparteValidade ?? ''}
                onChange={(e) => form.definir('registroMapaContraparteValidade', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Atividades contratadas"
              id="atividades"
              erro={form.erro('atividades')}
              obrigatorio
              ajuda="IN MAPA 72/2018, art. 25, §§4º e 6º (o padronizador só terceiriza o envase)."
            >
              <div className="flex flex-wrap gap-4 pt-1">
                {Object.entries(ATIVIDADES_CONTRATO).map(([k, n]) => (
                  <Caixa
                    key={k}
                    rotulo={n}
                    checked={v.atividades.includes(k as AtividadeContrato)}
                    onChange={() =>
                      form.definir('atividades', alternar(v.atividades, k as AtividadeContrato))
                    }
                  />
                ))}
              </div>
            </Campo>
            <Campo
              rotulo="Quem tem o registro do produto"
              id="registroProduto"
              obrigatorio
              ajuda="Define qual registro MAPA vai no produto e no rótulo (IN 72, arts. 14 e 30)."
            >
              <Selecao
                id="registroProduto"
                value={v.registroProduto}
                onChange={(e) => form.definir('registroProduto', e.target.value)}
              >
                {Object.entries(REGISTROS_PRODUTO).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </CorpoCartao>
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Vigência, produtos e marcas" />
          <CorpoCartao className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Início da vigência"
              id="vigenciaInicio"
              erro={form.erro('vigenciaInicio')}
              obrigatorio
            >
              <Entrada
                id="vigenciaInicio"
                type="date"
                value={v.vigenciaInicio}
                onChange={(e) => form.definir('vigenciaInicio', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Fim da vigência"
              id="vigenciaFim"
              erro={form.erro('vigenciaFim')}
              ajuda="Vazio = prazo indeterminado. Alerta 60 dias antes."
            >
              <Entrada
                id="vigenciaFim"
                type="date"
                value={v.vigenciaFim ?? ''}
                onChange={(e) => form.definir('vigenciaFim', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Marcas"
              id="marcas"
              erro={form.erro('marcas')}
              ajuda={
                v.sentido === 'prestamos'
                  ? 'Marcas da contraparte (Cadastros › Marcas, com ela como dona).'
                  : 'Marcas da própria empresa.'
              }
            >
              <div className="flex flex-col gap-1 pt-1">
                {marcasDoDono.map((m) => (
                  <Caixa
                    key={m.id}
                    rotulo={m.nome}
                    checked={v.marcas.includes(m.id)}
                    onChange={() => form.definir('marcas', alternar(v.marcas, m.id))}
                  />
                ))}
                {!marcasDoDono.length && (
                  <span className="text-sm text-muted-foreground">Nenhuma marca deste dono.</span>
                )}
              </div>
            </Campo>
            <Campo rotulo="Produtos" id="produtos" erro={form.erro('produtos')}>
              <div className="flex flex-col gap-1 pt-1">
                {produtosDoDono.map((p) => (
                  <Caixa
                    key={p.id}
                    rotulo={`${p.nome} (${p.marca})`}
                    checked={v.produtos.includes(p.id)}
                    onChange={() => form.definir('produtos', alternar(v.produtos, p.id))}
                  />
                ))}
                {!produtosDoDono.length && (
                  <span className="text-sm text-muted-foreground">
                    Nenhum produto dessas marcas.
                  </span>
                )}
              </div>
            </Campo>
          </CorpoCartao>
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Condições do serviço"
            descricao="O preço fica só registrado; a cobrança entra com a parte comercial e a fiscal."
          />
          <CorpoCartao className="flex flex-col gap-4">
            {v.precos.map((p, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_12rem_auto]">
                <Campo
                  rotulo="Item de preço"
                  id={`preco-${i}`}
                  erro={form.erro(`precos.${i}.descricao`)}
                >
                  <Entrada
                    id={`preco-${i}`}
                    placeholder="Elaboração, armazenagem, envase…"
                    value={p.descricao}
                    onChange={(e) => form.definir(`precos.${i}.descricao`, e.target.value)}
                  />
                </Campo>
                <Campo
                  rotulo="Valor (R$)"
                  id={`preco-valor-${i}`}
                  erro={form.erro(`precos.${i}.valor`)}
                >
                  <CampoNumero
                    id={`preco-valor-${i}`}
                    casas={2}
                    valor={p.valor}
                    aoMudar={(x) => form.definir(`precos.${i}.valor`, x ?? '')}
                  />
                </Campo>
                <Campo
                  rotulo="Unidade"
                  id={`preco-unidade-${i}`}
                  erro={form.erro(`precos.${i}.unidade`)}
                >
                  <Entrada
                    id={`preco-unidade-${i}`}
                    placeholder="por litro, por mês…"
                    value={p.unidade}
                    onChange={(e) => form.definir(`precos.${i}.unidade`, e.target.value)}
                  />
                </Campo>
                {!somenteLeitura && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover item de preço"
                    onClick={() =>
                      form.definir(
                        'precos',
                        v.precos.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 />
                  </Botao>
                )}
              </div>
            ))}
            {!somenteLeitura && (
              <div>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={() =>
                    form.definir('precos', [...v.precos, { descricao: '', valor: '', unidade: '' }])
                  }
                >
                  <Plus /> Item de preço
                </Botao>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Insumos fornecidos pela cantina" id="insumosCantina">
                <AreaTexto
                  id="insumosCantina"
                  value={v.insumosCantina ?? ''}
                  onChange={(e) => form.definir('insumosCantina', e.target.value)}
                />
              </Campo>
              <Campo rotulo="Insumos fornecidos pelo cliente" id="insumosCliente">
                <AreaTexto
                  id="insumosCliente"
                  value={v.insumosCliente ?? ''}
                  onChange={(e) => form.definir('insumosCliente', e.target.value)}
                />
              </Campo>
              <Campo
                rotulo="Perda tolerada"
                id="perdaToleradaTipo"
                erro={form.erro('perdaToleradaTipo')}
              >
                <Selecao
                  id="perdaToleradaTipo"
                  value={v.perdaToleradaTipo ?? ''}
                  onChange={(e) => form.definir('perdaToleradaTipo', e.target.value || null)}
                >
                  <option value="">Não definida</option>
                  {Object.entries(TIPOS_PERDA_TOLERADA).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              {v.perdaToleradaTipo && (
                <Campo
                  rotulo={
                    v.perdaToleradaTipo === 'percentual'
                      ? 'Perda máxima (%)'
                      : 'Rendimento mínimo (L/kg)'
                  }
                  id="perdaToleradaValor"
                  erro={form.erro('perdaToleradaValor')}
                >
                  <CampoNumero
                    id="perdaToleradaValor"
                    casas={v.perdaToleradaTipo === 'percentual' ? 2 : 4}
                    valor={v.perdaToleradaValor}
                    aoMudar={(x) => form.definir('perdaToleradaValor', x)}
                  />
                </Campo>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo
                rotulo="Pagamento"
                id="pagamentoDinheiro"
                erro={form.erro('pagamentoDinheiro')}
              >
                <Caixa
                  rotulo="Em dinheiro"
                  checked={v.pagamentoDinheiro}
                  onChange={(e) => form.definir('pagamentoDinheiro', e.target.checked)}
                />
              </Campo>
              <Campo
                rotulo="Em produto (unidade)"
                id="pagamentoProdutoUnidade"
                erro={form.erro('pagamentoProdutoUnidade')}
                ajuda="A conta do cliente mostra o previsto e o já transferido."
              >
                <Selecao
                  id="pagamentoProdutoUnidade"
                  value={v.pagamentoProdutoUnidade ?? ''}
                  onChange={(e) => form.definir('pagamentoProdutoUnidade', e.target.value || null)}
                >
                  <option value="">Sem pagamento em produto</option>
                  {Object.entries(UNIDADES_PAGAMENTO_PRODUTO).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              {v.pagamentoProdutoUnidade && (
                <Campo
                  rotulo="Quanto"
                  id="pagamentoProdutoValor"
                  erro={form.erro('pagamentoProdutoValor')}
                >
                  <CampoNumero
                    id="pagamentoProdutoValor"
                    casas={v.pagamentoProdutoUnidade === 'garrafa' ? 0 : 2}
                    valor={v.pagamentoProdutoValor}
                    aoMudar={(x) => form.definir('pagamentoProdutoValor', x)}
                  />
                </Campo>
              )}
            </div>
          </CorpoCartao>
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Rótulo e rastreabilidade"
            descricao="O texto é montado pelo sistema na forma escolhida e pode ser editado: a base das expressões é um decreto revogado (Decreto 8.198/2014)."
          />
          <CorpoCartao className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Forma do texto do rótulo" id="formaTexto" className="sm:col-span-2">
              <Selecao
                id="formaTexto"
                value={v.formaTexto}
                onChange={(e) => form.definir('formaTexto', e.target.value)}
              >
                {Object.entries(FORMAS_TEXTO_ROTULO).map(([k, n]) => (
                  <option key={k} value={k}>
                    {n}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {textoMontado && (
              <p className="text-sm sm:col-span-2">
                Texto montado: <strong>{textoMontado}</strong>
              </p>
            )}
            <Campo
              rotulo="Texto do rótulo (editado)"
              id="textoRotulo"
              className="sm:col-span-2"
              ajuda="Vazio = o texto montado pelo sistema."
            >
              <AreaTexto
                id="textoRotulo"
                value={v.textoRotulo ?? ''}
                placeholder={textoMontado}
                onChange={(e) => form.definir('textoRotulo', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Prefixo do lote comercial"
              id="prefixoLote"
              erro={form.erro('prefixoLote')}
              ajuda={
                omiteCantina
                  ? 'Recomendado: o rótulo omite a cantina, e o lote identifica quem elaborou (IN 72, art. 28, §2º).'
                  : 'Identifica quem elaborou no código do lote (IN 72, art. 28, §2º).'
              }
            >
              <Entrada
                id="prefixoLote"
                maxLength={6}
                value={v.prefixoLote ?? ''}
                onChange={(e) => form.definir('prefixoLote', e.target.value.toUpperCase())}
              />
            </Campo>
          </CorpoCartao>
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Comunicação e documentos"
            descricao="A unidade central comunica a terceirização no SIPEAGRO; quem presta o serviço guarda a via do contrato e a cópia do certificado do produto (IN 72, art. 27). Os arquivos vão na aba Anexos."
          />
          <CorpoCartao className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Comunicado no SIPEAGRO em"
              id="comunicadoSipeagroEm"
              erro={form.erro('comunicadoSipeagroEm')}
            >
              <Entrada
                id="comunicadoSipeagroEm"
                type="date"
                value={v.comunicadoSipeagroEm ?? ''}
                onChange={(e) => form.definir('comunicadoSipeagroEm', e.target.value)}
              />
            </Campo>
            <Campo rotulo="Protocolo no SIPEAGRO" id="protocoloSipeagro">
              <Entrada
                id="protocoloSipeagro"
                value={v.protocoloSipeagro ?? ''}
                onChange={(e) => form.definir('protocoloSipeagro', e.target.value)}
              />
            </Campo>
            <Campo
              rotulo="Documento da Gestão"
              id="documentoId"
              ajuda="Opcional: o contrato acompanhado em Gestão › Documentos."
            >
              <Selecao
                id="documentoId"
                value={v.documentoId ?? ''}
                onChange={(e) => form.definir('documentoId', e.target.value || null)}
              >
                <option value="">Nenhum</option>
                {documentos.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.titulo}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Observações" id="observacoes" className="sm:col-span-2">
              <AreaTexto
                id="observacoes"
                value={v.observacoes ?? ''}
                onChange={(e) => form.definir('observacoes', e.target.value)}
              />
            </Campo>
          </CorpoCartao>
        </Cartao>
      </fieldset>
      {!somenteLeitura && (
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      )}
    </form>
  );
}

export function NovoContrato() {
  const navegar = useNavigate();
  const { data: s } = useSessao();
  return (
    <Pagina titulo="Novo contrato" trilha={['EnoTrace', 'Terceiros', 'Contratos']}>
      <FormularioContrato
        inicial={{ ...VAZIO, estabelecimentoId: s?.empresa?.estabelecimentoId ?? '' }}
        aoSalvar={async (d) => {
          const r = await api.post<{ id: string }>('/api/contratos-terceirizacao', d);
          navegar(`/enotrace/contratos/${r.id}`, { replace: true });
        }}
      />
    </Pagina>
  );
}

type ContratoCompleto = Valores & {
  id: string;
  contraparte: string;
  situacaoVigencia: string;
  ativo: boolean;
  versao: number;
  textoMontado: string;
  textoFinal: string;
  registroMapaEmpresa: string | null;
  pendencias: Array<{ codigo: string; mensagem: string; fonte: string }>;
  romaneios: number;
  transferido: { litros: string; garrafas: number };
};

export function FichaContrato() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const [inativar, setInativar] = useState(false);
  const q = useQuery({
    queryKey: ['contrato', id],
    queryFn: () => api.get<ContratoCompleto>(`/api/contratos-terceirizacao/${id}`),
  });
  const podeEditar = pode(s, 'enotrace.cadastros', 'editar');
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const c = q.data;
  const recarregar = () => qc.invalidateQueries({ queryKey: ['contrato', id] });
  const situacao = SITUACOES[c.situacaoVigencia];
  return (
    <Pagina
      titulo={`Contrato com ${c.contraparte}`}
      trilha={['EnoTrace', 'Terceiros', 'Contratos']}
      acoes={
        pode(s, 'enotrace.cadastros', 'inativar') && (
          <AcoesLinha
            contorno
            ativo={c.ativo}
            aoInativar={() => setInativar(true)}
            aoReativar={async () => {
              await api.post(`/api/contratos-terceirizacao/${id}/reativar`);
              await recarregar();
            }}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {c.ativo ? (
          <Etiqueta tom={situacao?.tom}>{situacao?.rotulo}</Etiqueta>
        ) : (
          <Etiqueta>Inativo</Etiqueta>
        )}
        <span>{SENTIDOS_CONTRATO[c.sentido]}</span>
        {c.registroMapaEmpresa && <span>· nosso registro MAPA {c.registroMapaEmpresa}</span>}
        {c.romaneios > 0 && <span>· {c.romaneios} recepção(ões)</span>}
      </div>
      <Cartao>
        <CorpoCartao>
          <p className="text-xs text-muted-foreground">Texto do rótulo</p>
          <p className="font-medium">{c.textoFinal}</p>
          {((c.pagamentoProdutoUnidade && c.pagamentoProdutoValor) ||
            Number(c.transferido.litros) > 0) && (
            <p className="mt-2 text-sm text-muted-foreground">
              Pagamento em produto:{' '}
              {c.pagamentoProdutoUnidade && c.pagamentoProdutoValor
                ? `${formatarDecimal(c.pagamentoProdutoValor, 2)} ${
                    UNIDADES_PAGAMENTO_PRODUTO[
                      c.pagamentoProdutoUnidade as keyof typeof UNIDADES_PAGAMENTO_PRODUTO
                    ]
                  } previstos`
                : 'não previsto no contrato'}{' '}
              · já transferido: {formatarDecimal(c.transferido.litros, 2)} L
              {c.transferido.garrafas > 0 && ` (${c.transferido.garrafas} garrafas)`}
            </p>
          )}
        </CorpoCartao>
      </Cartao>
      {c.pendencias.map((p) => (
        <Aviso key={p.codigo}>
          {p.mensagem} <span className="text-muted-foreground">({p.fonte})</span>
        </Aviso>
      ))}
      <Abas defaultValue="dados">
        <ListaAbas>
          <Aba value="dados">Dados</Aba>
          <Aba value="anexos">Anexos</Aba>
          <Aba value="historico">Histórico</Aba>
        </ListaAbas>
        <ConteudoAba value="dados">
          <FormularioContrato
            key={c.versao}
            inicial={{
              ...VAZIO,
              ...c,
              numero: c.numero ?? '',
              registroMapaContraparte: c.registroMapaContraparte ?? '',
              registroMapaContraparteValidade: c.registroMapaContraparteValidade ?? '',
              vigenciaFim: c.vigenciaFim ?? '',
              insumosCantina: c.insumosCantina ?? '',
              insumosCliente: c.insumosCliente ?? '',
              prefixoLote: c.prefixoLote ?? '',
              textoRotulo: c.textoRotulo ?? '',
              comunicadoSipeagroEm: c.comunicadoSipeagroEm ?? '',
              protocoloSipeagro: c.protocoloSipeagro ?? '',
              observacoes: c.observacoes ?? '',
            }}
            textoMontado={c.textoMontado}
            somenteLeitura={!podeEditar}
            aoSalvar={async (d) => {
              await api.put(`/api/contratos-terceirizacao/${id}`, d);
              await recarregar();
            }}
          />
        </ConteudoAba>
        <ConteudoAba value="anexos">
          <Anexos
            entidade="contrato_terceirizacao"
            registroId={id}
            podeAlterar={podeEditar}
            fuso={fusoAtivo(s)}
          />
        </ConteudoAba>
        <ConteudoAba value="historico">
          <Historico entidade="contrato_terceirizacao" registroId={id} fuso={fusoAtivo(s)} />
        </ConteudoAba>
      </Abas>
      <PedirMotivo
        aberto={inativar}
        aoMudar={setInativar}
        titulo="Inativar o contrato"
        descricao="Use quando o contrato for encerrado; os alertas dele deixam de aparecer."
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/contratos-terceirizacao/${id}/inativar`, { motivo });
          await recarregar();
        }}
      />
    </Pagina>
  );
}
