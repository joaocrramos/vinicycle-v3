// Componente único de anexos (P15).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORIAS_ANEXO, NOMES_CATEGORIA_ANEXO, TAMANHO_MAXIMO_ANEXO } from '@vinicycle/shared';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatarDataHora } from '@/lib/utils';
import { PedirMotivo } from './PedirMotivo';
import { Botao } from './ui/botao';
import { Aviso } from './ui/cartao';
import { Selecao } from './ui/campos';

interface Anexo {
  id: string;
  categoria: keyof typeof NOMES_CATEGORIA_ANEXO;
  nomeOriginal: string;
  tamanhoBytes: number;
  descricao: string | null;
  criadoEm: string;
  enviadoPor: string | null;
}

function tamanho(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
}

export function Anexos({
  entidade,
  registroId,
  podeAlterar,
  fuso,
}: {
  entidade: string;
  registroId: string;
  podeAlterar: boolean;
  fuso?: string;
}) {
  const qc = useQueryClient();
  const chave = ['anexos', entidade, registroId];
  const q = useQuery({
    queryKey: chave,
    queryFn: () => api.get<Anexo[]>(`/api/anexos?entidade=${entidade}&registroId=${registroId}`),
  });
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_ANEXO)[number]>('outro');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [remover, setRemover] = useState<Anexo | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  async function enviar(f: File) {
    setErro(null);
    if (f.size > TAMANHO_MAXIMO_ANEXO) return setErro('Arquivo acima do tamanho máximo (25 MB).');
    const dados = new FormData();
    dados.set('entidade', entidade);
    dados.set('registroId', registroId);
    dados.set('categoria', categoria);
    dados.set('arquivo', f);
    setEnviando(true);
    try {
      await api.post('/api/anexos', dados);
      await qc.invalidateQueries({ queryKey: chave });
      await qc.invalidateQueries({ queryKey: ['historico', entidade, registroId] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {podeAlterar && (
        <div className="flex flex-wrap items-center gap-2">
          <Selecao
            className="w-44"
            aria-label="Categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as typeof categoria)}
          >
            {CATEGORIAS_ANEXO.map((c) => (
              <option key={c} value={c}>
                {NOMES_CATEGORIA_ANEXO[c]}
              </option>
            ))}
          </Selecao>
          <input
            ref={arquivo}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void enviar(e.target.files[0])}
          />
          <Botao variante="secundario" disabled={enviando} onClick={() => arquivo.current?.click()}>
            <Paperclip /> {enviando ? 'Enviando…' : 'Anexar arquivo'}
          </Botao>
        </div>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {q.data?.length ? (
        <ul className="divide-y rounded-md border">
          {q.data.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{a.nomeOriginal}</p>
                <p className="text-xs text-muted-foreground">
                  {NOMES_CATEGORIA_ANEXO[a.categoria]} · {tamanho(a.tamanhoBytes)} ·{' '}
                  {a.enviadoPor ?? '—'} · {formatarDataHora(a.criadoEm, fuso)}
                </p>
              </div>
              <div className="flex gap-1">
                <Botao comoFilho variante="fantasma" tamanho="icone" aria-label="Baixar">
                  <a href={`/api/anexos/${a.id}/arquivo`}>
                    <Download />
                  </a>
                </Botao>
                {podeAlterar && (
                  <Botao
                    variante="fantasma"
                    tamanho="icone"
                    aria-label="Remover"
                    onClick={() => setRemover(a)}
                  >
                    <Trash2 />
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? 'Carregando…' : 'Nenhum anexo.'}
        </p>
      )}
      <PedirMotivo
        aberto={!!remover}
        aoMudar={(v) => !v && setRemover(null)}
        titulo={`Remover ${remover?.nomeOriginal ?? ''}`}
        descricao="O arquivo sai da lista, mas fica guardado e registrado no histórico."
        rotuloBotao="Remover"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/anexos/${remover!.id}/inativar`, { motivo });
          await qc.invalidateQueries({ queryKey: chave });
        }}
      />
    </div>
  );
}
