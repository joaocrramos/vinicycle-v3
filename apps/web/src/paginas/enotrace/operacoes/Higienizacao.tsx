// EnoTrace › Operações › Higienização / manutenção (cantina.md, Recipientes): operação sem volume,
// em um ou mais recipientes, com o produto e a dose. Devolve o recipiente a "ativo". Base: higiene e
// manutenção de equipamentos e utensílios (Decreto 12.709/2025, art. 120, IV).
import { NOMES_SITUACAO_RECIPIENTE } from '@vinicycle/shared';
import { useState } from 'react';
import { CabecalhoCartao, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { litros } from '../Projetos';
import {
  agora,
  Cabecalho,
  ComRascunho,
  doCampo,
  type Rascunho,
  recipienteDaUrl,
  Rodape,
  useEnvio,
  useRecipientes,
} from './comum';

export function PaginaHigienizacao() {
  return <ComRascunho>{(r) => <Higienizacao rascunho={r} />}</ComRascunho>;
}

function Higienizacao({ rascunho }: { rascunho: Rascunho | null }) {
  const recipientes = useRecipientes();
  const envio = useEnvio('higienizacao', rascunho);
  const [d, setD] = useState(() => ({
    executadoEm: agora(),
    responsavelId: '',
    planoEtapaId: '',
    observacao: '',
    tipoHigienizacao: 'higienizacao' as 'higienizacao' | 'manutencao',
    recipientes: (recipienteDaUrl() ? [recipienteDaUrl()] : []) as string[],
    produto: '',
    dose: '',
    ...rascunho?.formulario,
  }));
  const set = (p: Partial<typeof d>) => {
    envio.limpar();
    setD({ ...d, ...p });
  };
  const higienizar = d.tipoHigienizacao === 'higienizacao';
  // A higienização é com o recipiente vazio; a manutenção, em qualquer um.
  const opcoes = (recipientes.data ?? []).filter((r) => !higienizar || !r.lote);
  const corpo = () => ({
    executadoEm: doCampo(d.executadoEm),
    responsavelId: d.responsavelId || null,
    observacao: d.observacao,
    tipoHigienizacao: d.tipoHigienizacao,
    recipientes: d.recipientes,
    produto: d.produto || null,
    dose: d.dose || null,
  });
  return (
    <Pagina titulo="Higienização / manutenção" trilha={['EnoTrace', 'Operações']}>
      <p className="text-sm text-muted-foreground">
        Registra o cuidado com o recipiente e o devolve a <strong>ativo</strong>. O recipiente que
        esvazia numa operação passa sozinho a “aguardando higienização” (Configurações ›
        Parâmetros).
      </p>
      <Cartao>
        <CabecalhoCartao titulo="Operação" />
        <CorpoCartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo" id="hg-tipo" obrigatorio>
            <Selecao
              id="hg-tipo"
              value={d.tipoHigienizacao}
              onChange={(e) =>
                set({
                  tipoHigienizacao: e.target.value as typeof d.tipoHigienizacao,
                  recipientes: [],
                })
              }
            >
              <option value="higienizacao">Higienização</option>
              <option value="manutencao">Manutenção</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Produto" id="hg-produto" ajuda="Ex.: ácido peracético, soda, vapor.">
            <Entrada
              id="hg-produto"
              value={d.produto}
              onChange={(e) => set({ produto: e.target.value })}
            />
          </Campo>
          <Campo rotulo="Dose" id="hg-dose" ajuda="Como foi usado: concentração, tempo…">
            <Entrada id="hg-dose" value={d.dose} onChange={(e) => set({ dose: e.target.value })} />
          </Campo>
          <Cabecalho d={d} set={set} projetoId="" tipo="higienizacao" />
        </CorpoCartao>
      </Cartao>
      <Cartao>
        <CabecalhoCartao
          titulo="Recipientes"
          descricao={
            higienizar
              ? 'Só os vazios: higieniza-se o recipiente sem vinho.'
              : 'Qualquer recipiente.'
          }
        />
        <CorpoCartao className="grid gap-2 sm:grid-cols-3">
          {opcoes.map((r) => (
            <Caixa
              key={r.id}
              rotulo={`${r.codigo} · ${r.lote ? litros(r.volume) : 'vazio'} · ${NOMES_SITUACAO_RECIPIENTE[r.situacao as keyof typeof NOMES_SITUACAO_RECIPIENTE] ?? r.situacao}`}
              checked={d.recipientes.includes(r.id)}
              onChange={(e) =>
                set({
                  recipientes: e.target.checked
                    ? [...d.recipientes, r.id]
                    : d.recipientes.filter((x) => x !== r.id),
                })
              }
            />
          ))}
          {!opcoes.length && (
            <p className="text-sm text-muted-foreground">Nenhum recipiente vazio.</p>
          )}
        </CorpoCartao>
      </Cartao>
      <Rodape envio={envio} corpo={corpo} formulario={() => d} />
    </Pagina>
  );
}
