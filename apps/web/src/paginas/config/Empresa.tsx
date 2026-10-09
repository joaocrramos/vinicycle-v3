// Configurações › Empresa (ambiente-cliente.md). O Master atualiza os dados; o documento só é
// trocado pelo suporte.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dadosEmpresa } from '@vinicycle/shared';
import { type FormEvent, useState } from 'react';
import { Anexos } from '@/componentes/Anexos';
import { CampoTelefone } from '@/componentes/campos-especiais';
import { FichaCadastral } from '@/componentes/FichaCadastral';
import { Historico } from '@/componentes/Historico';
import { Aba, Abas, ConteudoAba, ListaAbas } from '@/componentes/ui/abas';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Cartao, CorpoCartao } from '@/componentes/ui/cartao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';

type DadosEmpresa = {
  id: string;
  versao: number;
  corMarca: string | null;
  contatoFinanceiroNome: string | null;
  contatoFinanceiroEmail: string | null;
  contatoFinanceiroTelefone: string | null;
  regimeTributario: 'simples' | 'presumido' | 'real' | null;
  ficha: Record<string, unknown>;
};

function Formulario({ e, podeEditar }: { e: DadosEmpresa; podeEditar: boolean }) {
  const qc = useQueryClient();
  const form = useFormulario(dadosEmpresa, e as never);
  const [salvo, setSalvo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const v = form.valores as unknown as DadosEmpresa;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setSalvo(false);
    const d = form.validar();
    if (!d) return;
    setEnviando(true);
    try {
      await api.put('/api/empresa', d);
      setSalvo(true);
      await qc.invalidateQueries({ queryKey: ['empresa'] });
      await qc.invalidateQueries({ queryKey: ['sessao'] });
    } catch (err) {
      form.erroDaApi(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
      {salvo && <Aviso tom="sucesso">Dados salvos.</Aviso>}
      <fieldset disabled={!podeEditar} className="flex flex-col gap-6">
        <FichaCadastral form={form} documentoBloqueado documentoObrigatorio />
        <h3 className="font-semibold">Contato financeiro</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Nome" id="cfNome">
            <Entrada
              id="cfNome"
              value={v.contatoFinanceiroNome ?? ''}
              onChange={(x) => form.definir('contatoFinanceiroNome', x.target.value || null)}
            />
          </Campo>
          <Campo rotulo="E-mail" id="cfEmail" erro={form.erro('contatoFinanceiroEmail')}>
            <Entrada
              id="cfEmail"
              type="email"
              placeholder="financeiro@exemplo.com.br"
              value={v.contatoFinanceiroEmail ?? ''}
              onChange={(x) => form.definir('contatoFinanceiroEmail', x.target.value || null)}
              onBlur={() => form.tocar('contatoFinanceiroEmail')}
            />
          </Campo>
          <Campo rotulo="Telefone" id="cfTel">
            <CampoTelefone
              id="cfTel"
              valor={v.contatoFinanceiroTelefone ?? ''}
              aoMudar={(x) => form.definir('contatoFinanceiroTelefone', x || null)}
            />
          </Campo>
        </div>
        <h3 className="font-semibold">Outros dados</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            rotulo="Cor da marca nos impressos"
            id="corMarca"
            ajuda="Relatórios e documentos impressos (P9). A tela segue a paleta de cada usuário."
          >
            <div className="flex items-center gap-2">
              <input
                id="corMarca"
                type="color"
                className="h-9 w-14 cursor-pointer rounded border bg-card"
                value={v.corMarca ?? '#6b1f3a'}
                onChange={(x) => form.definir('corMarca', x.target.value)}
              />
              {v.corMarca && (
                <Botao
                  variante="link"
                  tamanho="pequeno"
                  onClick={() => form.definir('corMarca', null)}
                >
                  Usar a padrão
                </Botao>
              )}
            </div>
          </Campo>
          <Campo rotulo="Regime tributário" id="regime" ajuda="Guardado para a fase fiscal.">
            <Selecao
              id="regime"
              value={v.regimeTributario ?? ''}
              onChange={(x) => form.definir('regimeTributario', x.target.value || null)}
            >
              <option value="">Não informado</option>
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </Selecao>
          </Campo>
        </div>
      </fieldset>
      {podeEditar && (
        <div>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      )}
    </form>
  );
}

export function PaginaEmpresa() {
  const { data: s } = useSessao();
  const q = useQuery({
    queryKey: ['empresa'],
    queryFn: () => api.get<DadosEmpresa>('/api/empresa'),
  });
  const podeEditar = pode(s, 'gestao.config.empresa', 'editar');
  return (
    <Pagina titulo="Empresa" trilha={['Configurações']}>
      {q.isError && <Aviso tom="erro">{(q.error as Error).message}</Aviso>}
      {q.data && (
        <Abas defaultValue="dados">
          <ListaAbas>
            <Aba value="dados">Dados</Aba>
            <Aba value="anexos">Anexos</Aba>
            <Aba value="historico">Histórico</Aba>
          </ListaAbas>
          <ConteudoAba value="dados">
            <Cartao>
              <CorpoCartao>
                <Formulario key={q.data.versao} e={q.data} podeEditar={podeEditar} />
              </CorpoCartao>
            </Cartao>
          </ConteudoAba>
          <ConteudoAba value="anexos">
            <Anexos
              entidade="empresa"
              registroId={q.data.id}
              podeAlterar={podeEditar}
              fuso={fusoAtivo(s)}
            />
          </ConteudoAba>
          <ConteudoAba value="historico">
            <Historico entidade="empresa" registroId={q.data.id} fuso={fusoAtivo(s)} />
          </ConteudoAba>
        </Abas>
      )}
    </Pagina>
  );
}
