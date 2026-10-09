// EnoTrace › Terceiros › Dossiês (cantina.md, Dossiê do lote para o cliente; 04, roteiro do ciclo 10,
// bloco 4): o registro do vinho do cliente, guardado como foi gerado; imprime em PDF pelo navegador,
// baixa em CSV e vai por e-mail ao cliente, com o registro de cada envio.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { baixarCsv, type CelulaCsv } from '@/lib/csv';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';
import { formatarDataHora } from '@/lib/utils';

interface SecaoDossie {
  titulo: string;
  cabecalho: string[];
  linhas: string[][];
  vazio: string;
}
interface Dossie {
  id: string;
  titulo: string;
  titularId: string;
  geradoEm: string;
  conteudo: {
    titulo: string;
    geradoPor: string | null;
    identificacao: Array<[string, string]>;
    secoes: SecaoDossie[];
  };
  envios: Array<{ para: string; enviadoEm: string; por: string | null }>;
  emailCliente: string | null;
}

function useClientes() {
  return useQuery({
    queryKey: ['pessoas-opcoes', 'cliente_vinificacao'],
    queryFn: () =>
      api.get<Array<{ id: string; nome: string }>>('/api/pessoas/opcoes?papel=cliente_vinificacao'),
  });
}

function NovoDossie({ titular, aoFechar }: { titular: string; aoFechar: () => void }) {
  const navegar = useNavigate();
  const clientes = useClientes();
  const [cliente, setCliente] = useState(titular);
  const [partida, setPartida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const lotes = useQuery({
    queryKey: ['lotes-do-cliente', cliente],
    queryFn: () =>
      api.get<{
        lotes: Array<{ id: string; codigo: string; projeto: string; saldo: string }>;
        comerciais: Array<{ id: string; codigo: string; produto: string | null }>;
      }>(`/api/terceiros/lotes-do-cliente?titularId=${cliente}`),
    enabled: !!cliente,
  });
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Novo dossiê"
      descricao="O dossiê guarda o registro do vinho do cliente como está agora."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            disabled={!partida}
            onClick={async () => {
              setErro(null);
              try {
                const [tipo, id] = partida.split(':');
                const r = await api.post<{ id: string }>(
                  '/api/terceiros/dossies',
                  tipo === 'lote' ? { loteId: id } : { loteComercialId: id },
                );
                navegar(`/enotrace/terceiros/dossies/${r.id}`);
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          >
            Gerar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Cliente" id="nd-cliente">
          <Selecao
            id="nd-cliente"
            value={cliente}
            onChange={(e) => {
              setCliente(e.target.value);
              setPartida('');
            }}
          >
            <option value="">Escolha</option>
            {clientes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo
          rotulo="Lote"
          id="nd-lote"
          ajuda="Um lote de produção ou um lote comercial do cliente."
        >
          <Selecao id="nd-lote" value={partida} onChange={(e) => setPartida(e.target.value)}>
            <option value="">Escolha</option>
            {!!lotes.data?.lotes.length && (
              <optgroup label="Lotes de produção">
                {lotes.data.lotes.map((l) => (
                  <option key={l.id} value={`lote:${l.id}`}>
                    {l.codigo} · {l.projeto}
                  </option>
                ))}
              </optgroup>
            )}
            {!!lotes.data?.comerciais.length && (
              <optgroup label="Lotes comerciais">
                {lotes.data.comerciais.map((l) => (
                  <option key={l.id} value={`comercial:${l.id}`}>
                    {l.codigo}
                    {l.produto ? ` · ${l.produto}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </Selecao>
        </Campo>
      </div>
    </Dialogo>
  );
}

export function ListaDossies() {
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const [busca, setBusca] = useSearchParams();
  const titular = busca.get('titular') ?? '';
  const [novo, setNovo] = useState(false);
  const clientes = useClientes();
  const lista = useQuery({
    queryKey: ['dossies', titular],
    queryFn: () =>
      api.get<
        Array<{ id: string; titulo: string; geradoEm: string; titular: string; envios: number }>
      >(`/api/terceiros/dossies${titular ? `?titularId=${titular}` : ''}`),
  });
  return (
    <Pagina
      titulo="Dossiês"
      trilha={['EnoTrace', 'Terceiros']}
      acoes={
        pode(s, 'enotrace.relatorios', 'exportar') && (
          <Botao onClick={() => setNovo(true)}>
            <Plus /> Novo dossiê
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        O registro do vinho de cada cliente de vinificação: contrato, recepção, operações, análises,
        insumos, rendimento, recipientes, envase e devoluções. Imprima em PDF, baixe em CSV ou envie
        por e-mail.
      </p>
      <Campo rotulo="Cliente" id="ds-cliente" className="max-w-sm">
        <Selecao
          id="ds-cliente"
          value={titular}
          onChange={(e) => setBusca(e.target.value ? { titular: e.target.value } : {})}
        >
          <option value="">Todos os clientes</option>
          {clientes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Cartao>
        <ul className="divide-y">
          {lista.data?.map((d) => (
            <li key={d.id}>
              <Link
                className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm hover:bg-muted/50"
                to={`/enotrace/terceiros/dossies/${d.id}`}
              >
                <span>
                  <strong>{d.titulo}</strong>
                  <span className="block text-xs text-muted-foreground">{d.titular}</span>
                </span>
                <span className="text-muted-foreground">
                  {formatarDataHora(d.geradoEm, fuso)}
                  {d.envios > 0 && ` · enviado ${d.envios}×`}
                </span>
              </Link>
            </li>
          ))}
          {lista.data && !lista.data.length && (
            <li className="px-5 py-6 text-sm text-muted-foreground">Nenhum dossiê.</li>
          )}
        </ul>
      </Cartao>
      {novo && <NovoDossie titular={titular} aoFechar={() => setNovo(false)} />}
    </Pagina>
  );
}

function DialogoEnvio({ d, aoFechar }: { d: Dossie; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [para, setPara] = useState(d.emailCliente ?? '');
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo="Enviar o dossiê por e-mail"
      descricao="O dossiê vai no corpo do e-mail, como está guardado."
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            onClick={async () => {
              setErro(null);
              try {
                await api.post(`/api/terceiros/dossies/${d.id}/enviar`, { para });
                await qc.invalidateQueries({ queryKey: ['dossie', d.id] });
                aoFechar();
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          >
            Enviar
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Campo rotulo="Para" id="de-para" obrigatorio>
          <Entrada
            id="de-para"
            type="email"
            value={para}
            onChange={(e) => setPara(e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

export function FichaDossie() {
  const { id = '' } = useParams();
  const { data: s } = useSessao();
  const fuso = fusoAtivo(s);
  const [enviar, setEnviar] = useState(false);
  const q = useQuery({
    queryKey: ['dossie', id],
    queryFn: () => api.get<Dossie>(`/api/terceiros/dossies/${id}`),
  });
  if (!q.data)
    return (
      <p className="text-sm text-muted-foreground">
        {q.isError ? (q.error as Error).message : 'Carregando…'}
      </p>
    );
  const d = q.data;
  const c = d.conteudo;
  const csv = () => {
    const linhas: CelulaCsv[][] = [[c.titulo], [`Gerado em ${formatarDataHora(d.geradoEm, fuso)}`]];
    for (const [k, v] of c.identificacao) linhas.push([k, v]);
    for (const sec of c.secoes) {
      linhas.push([], [sec.titulo]);
      if (sec.linhas.length) linhas.push(sec.cabecalho, ...sec.linhas);
      else linhas.push([sec.vazio]);
    }
    baixarCsv(c.titulo.replace(/[^\w\-. ]+/g, '_'), linhas);
  };
  const podeEnviar = pode(s, 'enotrace.relatorios', 'exportar');
  return (
    <Pagina
      titulo={c.titulo}
      trilha={['EnoTrace', 'Terceiros', 'Dossiês']}
      acoes={
        <div className="flex flex-wrap gap-2 print:hidden">
          <Botao variante="secundario" onClick={() => window.print()}>
            <Printer /> Imprimir
          </Botao>
          <Botao variante="secundario" onClick={csv}>
            <Download /> CSV
          </Botao>
          {podeEnviar && (
            <Botao onClick={() => setEnviar(true)}>
              <Mail /> Enviar por e-mail
            </Botao>
          )}
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Gerado em {formatarDataHora(d.geradoEm, fuso)}
        {c.geradoPor ? ` por ${c.geradoPor}` : ''}.
      </p>
      <Cartao className="print:border-0 print:shadow-none">
        <CorpoCartao>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            {c.identificacao.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CorpoCartao>
      </Cartao>
      {c.secoes.map((sec) => (
        <Cartao key={sec.titulo} className="break-inside-avoid print:border-0 print:shadow-none">
          <CabecalhoCartao titulo={`${sec.titulo} (${sec.linhas.length})`} />
          <CorpoCartao className="overflow-x-auto text-sm">
            {sec.linhas.length ? (
              <table className="w-full">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {sec.cabecalho.map((h) => (
                      <th key={h} className="py-1 pr-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.linhas.map((l, n) => (
                    <tr key={n} className="border-t align-top">
                      {l.map((x, i) => (
                        <td key={i} className="py-1 pr-4">
                          {x}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted-foreground">{sec.vazio}</p>
            )}
          </CorpoCartao>
        </Cartao>
      ))}
      <Cartao className="print:hidden">
        <CabecalhoCartao titulo="Envios por e-mail" />
        <CorpoCartao className="text-sm">
          {d.envios.length ? (
            <ul className="flex flex-col gap-1">
              {d.envios.map((x, n) => (
                <li key={n}>
                  {formatarDataHora(x.enviadoEm, fuso)} · para {x.para}
                  {x.por ? ` · por ${x.por}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Ainda não enviado.</p>
          )}
        </CorpoCartao>
      </Cartao>
      {enviar && <DialogoEnvio d={d} aoFechar={() => setEnviar(false)} />}
    </Pagina>
  );
}
