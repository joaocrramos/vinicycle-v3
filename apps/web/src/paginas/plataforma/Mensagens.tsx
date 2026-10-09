// Administração › Envios e Modelos de mensagem (administracao.md, Mapa de telas): a fila de
// e-mail, WhatsApp e SMS com tentativas e reenvio; os textos editáveis, com variáveis e versões.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CANAIS_MENSAGEM,
  type CanalMensagem,
  NOMES_CANAL,
  preencherModelo,
} from '@vinicycle/shared';
import { useState } from 'react';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';

interface LinhaEnvio {
  id: string;
  canal: CanalMensagem;
  destinatario: string;
  modelo: string;
  assunto: string | null;
  origem: string;
  situacao: 'pendente' | 'enviado' | 'falhou';
  tentativas: number;
  ultimoErro: string | null;
  provedor: string | null;
  criadoEm: string;
  enviadoEm: string | null;
}

const TOM = { pendente: 'alerta', enviado: 'sucesso', falhou: 'erro' } as const;
const NOME_SITUACAO = { pendente: 'Na fila', enviado: 'Enviado', falhou: 'Falhou' } as const;

function DetalheEnvio({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['envio', id],
    queryFn: () =>
      api.get<
        LinhaEnvio & {
          corpoTexto: string;
          tentativas: Array<{
            id: string;
            ocorridaEm: string;
            sucesso: boolean;
            resposta: unknown;
          }>;
        }
      >(`/api/plataforma/envios/${id}`),
  });
  const [erro, setErro] = useState<string | null>(null);
  const e = q.data;
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={e ? `${NOMES_CANAL[e.canal]} para ${e.destinatario}` : 'Envio'}
      descricao={e ? `${e.modelo} · ${formatarDataHora(e.criadoEm)}` : undefined}
      rodape={
        e &&
        e.situacao !== 'pendente' &&
        pode(s, 'plataforma.envios', 'editar') && (
          <Botao
            onClick={async () => {
              try {
                await api.post(`/api/plataforma/envios/${id}/reenviar`, {});
                await qc.invalidateQueries({ queryKey: ['envio', id] });
                await qc.invalidateQueries({ queryKey: ['lista'] });
              } catch (x) {
                setErro((x as Error).message);
              }
            }}
          >
            Reenviar
          </Botao>
        )
      }
    >
      {!e ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <p>
            <Etiqueta tom={TOM[e.situacao]}>{NOME_SITUACAO[e.situacao]}</Etiqueta>{' '}
            {e.ultimoErro && <span className="text-destructive">{e.ultimoErro}</span>}
          </p>
          {e.assunto && <p className="font-medium">{e.assunto}</p>}
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
            {e.corpoTexto}
          </pre>
          <p className="font-medium">Tentativas</p>
          {e.tentativas.map((x) => (
            <p key={x.id} className={x.sucesso ? '' : 'text-destructive'}>
              {formatarDataHora(x.ocorridaEm)} · {x.sucesso ? 'ok' : JSON.stringify(x.resposta)}
            </p>
          ))}
          {!e.tentativas.length && <p className="text-muted-foreground">Nenhuma ainda.</p>}
        </div>
      )}
    </Dialogo>
  );
}

export function PaginaEnvios() {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <Pagina titulo="Envios" trilha={['Administração']}>
      <p className="text-sm text-muted-foreground">
        A fila de e-mail, WhatsApp e SMS. Cada mensagem tenta de novo com espera crescente; a que
        falhou pode ser reenviada.
      </p>
      <TabelaDados<LinhaEnvio>
        tabela="plataforma.envios"
        url="/api/plataforma/envios"
        ordemPadrao={{ campo: 'criadoEm', direcao: 'desc' }}
        aoClicar={(e) => setAberto(e.id)}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Canal"
              className="w-36"
              value={f.canal ?? ''}
              onChange={(e) => definir('canal', e.target.value)}
            >
              <option value="">Todos os canais</option>
              {CANAIS_MENSAGEM.map((c) => (
                <option key={c} value={c}>
                  {NOMES_CANAL[c]}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Situação"
              className="w-36"
              value={f.situacao ?? ''}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="pendente">Na fila</option>
              <option value="enviado">Enviado</option>
              <option value="falhou">Falhou</option>
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'criadoEm',
            titulo: 'Quando',
            ordenavel: true,
            celula: (e) => formatarDataHora(e.criadoEm),
            exportar: (e) => e.criadoEm,
          },
          {
            id: 'canal',
            titulo: 'Canal',
            ordenavel: true,
            celula: (e) => NOMES_CANAL[e.canal],
            exportar: (e) => e.canal,
          },
          {
            id: 'destinatario',
            titulo: 'Para',
            celula: (e) => e.destinatario,
            exportar: (e) => e.destinatario,
          },
          {
            id: 'assunto',
            titulo: 'Assunto ou modelo',
            celula: (e) => e.assunto ?? e.modelo,
            exportar: (e) => e.assunto ?? e.modelo,
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            ordenavel: true,
            celula: (e) => (
              <span>
                <Etiqueta tom={TOM[e.situacao]}>{NOME_SITUACAO[e.situacao]}</Etiqueta>
                {e.tentativas > 1 && ` · ${e.tentativas} tentativas`}
              </span>
            ),
            exportar: (e) => e.situacao,
          },
        ]}
      />
      {aberto && <DetalheEnvio id={aberto} aoFechar={() => setAberto(null)} />}
    </Pagina>
  );
}

interface Modelo {
  codigo: string;
  nome: string;
  variaveis: string[];
  padrao: { assunto: string; corpo: string };
  versoes: Array<{
    id: string;
    versao: number;
    assunto: string;
    corpo: string;
    ativa: boolean;
    criadoEm: string;
  }>;
}

const EXEMPLO: Record<string, string> = {
  empresa: 'Vinícola Exemplo',
  quem: 'Maria',
  dias: '3',
  link: 'https://app.vinicycle.com/config/assinatura',
  numero: '42',
  valor: 'R$ 300,00',
  vencimento: '10/01/2027',
  fim: '10/01/2027',
  somenteLeituraEm: '16/01/2027',
  bloqueioEm: '31/01/2027',
  renovacao: '01/02/2027',
  excessos: '3 usuários para 2',
  canal: 'WhatsApp',
  mes: '01/2027',
};

function EditarModelo({ modelo, aoFechar }: { modelo: Modelo; aoFechar: () => void }) {
  const qc = useQueryClient();
  const ativa = modelo.versoes.find((v) => v.ativa);
  const [assunto, setAssunto] = useState(ativa?.assunto ?? modelo.padrao.assunto);
  const [corpo, setCorpo] = useState(ativa?.corpo ?? modelo.padrao.corpo);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialogo
      aberto
      largo
      aoMudar={(x) => !x && aoFechar()}
      titulo={`Modelo: ${modelo.nome}`}
      descricao={`Variáveis: ${modelo.variaveis.map((v) => `{{${v}}}`).join(', ')}. Linha em branco separa os parágrafos; o botão do e-mail continua igual. Salvar cria uma nova versão.`}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              try {
                await api.post(`/api/plataforma/modelos/${modelo.codigo}`, { assunto, corpo });
                await qc.invalidateQueries({ queryKey: ['modelos'] });
                aoFechar();
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          >
            Salvar nova versão
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Assunto" id="mod-assunto">
          <Entrada id="mod-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </Campo>
        <Campo rotulo="Texto" id="mod-corpo">
          <AreaTexto
            id="mod-corpo"
            rows={8}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
          />
        </Campo>
        <div className="rounded-md border p-3 text-sm">
          <p className="mb-2 text-xs text-muted-foreground">Prévia com dados de exemplo</p>
          <p className="font-medium">{preencherModelo(assunto, EXEMPLO)}</p>
          {preencherModelo(corpo, EXEMPLO)
            .split(/\n\s*\n/)
            .map((p, i) => (
              <p key={i} className="mt-2">
                {p}
              </p>
            ))}
        </div>
      </div>
    </Dialogo>
  );
}

export function PaginaModelos() {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['modelos'],
    queryFn: () => api.get<Modelo[]>('/api/plataforma/modelos'),
  });
  const [editar, setEditar] = useState<Modelo | null>(null);
  const podeEditar = pode(s, 'plataforma.envios', 'editar');
  return (
    <Pagina titulo="Modelos de mensagem" trilha={['Administração']}>
      <p className="text-sm text-muted-foreground">
        Textos do convite e dos avisos de cobrança. Sem versão editada, vale o texto padrão do
        sistema. No WhatsApp e no SMS sai o assunto com o link.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {q.data?.map((m) => {
          const ativa = m.versoes.find((v) => v.ativa);
          return (
            <Cartao key={m.codigo}>
              <CabecalhoCartao
                titulo={m.nome}
                descricao={
                  ativa
                    ? `Versão ${ativa.versao}, de ${formatarDataHora(ativa.criadoEm)}`
                    : 'Texto padrão'
                }
                acoes={
                  podeEditar && (
                    <div className="flex gap-2">
                      <Botao variante="secundario" tamanho="pequeno" onClick={() => setEditar(m)}>
                        Editar
                      </Botao>
                      {ativa && (
                        <Botao
                          variante="secundario"
                          tamanho="pequeno"
                          onClick={async () => {
                            await api.post(`/api/plataforma/modelos/${m.codigo}/padrao`, {});
                            await qc.invalidateQueries({ queryKey: ['modelos'] });
                          }}
                        >
                          Voltar ao padrão
                        </Botao>
                      )}
                    </div>
                  )
                }
              />
              <CorpoCartao className="flex flex-col gap-1 text-sm">
                <p className="font-medium">{ativa?.assunto ?? m.padrao.assunto}</p>
                <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">
                  {ativa?.corpo ?? m.padrao.corpo}
                </p>
                {m.versoes.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {m.versoes.length} versão(ões) no histórico
                  </p>
                )}
              </CorpoCartao>
            </Cartao>
          );
        })}
      </div>
      {editar && <EditarModelo modelo={editar} aoFechar={() => setEditar(null)} />}
    </Pagina>
  );
}
