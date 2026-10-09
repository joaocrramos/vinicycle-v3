// Locais de recipientes e estoques, por estabelecimento (gestao.md; ambiente-cliente.md).
import { useQueryClient } from '@tanstack/react-query';
import { dadosLocal, MODULOS, NOMES_USO_LOCAL, USOS_LOCAL } from '@vinicycle/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AcoesLinha, colunaAcoes } from '@/componentes/AcoesLinha';
import { Historico } from '@/componentes/Historico';
import { PedirMotivo } from '@/componentes/PedirMotivo';
import { TabelaDados } from '@/componentes/TabelaDados';
import { Botao } from '@/componentes/ui/botao';
import { Aviso, Etiqueta } from '@/componentes/ui/cartao';
import { AreaTexto, Caixa, Campo, Entrada, Selecao } from '@/componentes/ui/campos';
import { Dialogo } from '@/componentes/ui/dialogo';
import { Pagina } from '@/layout/Estrutura';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { fusoAtivo, pode, useSessao } from '@/lib/sessao';

interface Local {
  id: string;
  nome: string;
  uso: (typeof USOS_LOCAL)[number];
  moduloEstoque: string | null;
  refrigerado: boolean;
  externo: boolean;
  observacoes: string | null;
  ativo: boolean;
  versao: number;
  estabelecimento: string;
}

const NOME_MODULO = Object.fromEntries(MODULOS.map((m) => [m.codigo, `${m.nome} · ${m.funcao}`]));

function FormularioLocal({ local, aoFechar }: { local: Local | null; aoFechar: () => void }) {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const form = useFormulario(dadosLocal, {
    nome: local?.nome ?? '',
    uso: local?.uso ?? 'recipientes',
    moduloEstoque: (local?.moduloEstoque as 'ENOTRACE' | null) ?? null,
    refrigerado: local?.refrigerado ?? false,
    externo: local?.externo ?? false,
    observacoes: local?.observacoes ?? '',
    versao: local?.versao,
  });
  const [aba, setAba] = useState<'dados' | 'historico'>('dados');
  const v = form.valores;
  const modulosComEstoque = (s?.empresa?.modulos ?? []).filter((m) => m !== 'GESTAO');
  const podeAlterar = pode(s, 'gestao.config.locais', local ? 'editar' : 'criar');

  async function salvar() {
    const d = form.validar();
    if (!d) return;
    try {
      if (local) await api.put(`/api/locais/${local.id}`, d);
      else await api.post('/api/locais', d);
      await qc.invalidateQueries({ queryKey: ['lista', '/api/locais'] });
      aoFechar();
    } catch (e) {
      form.erroDaApi(e);
    }
  }

  return (
    <Dialogo
      aberto
      aoMudar={(x) => !x && aoFechar()}
      titulo={local ? local.nome : 'Novo local'}
      rodape={
        aba === 'dados' &&
        podeAlterar && (
          <>
            <Botao variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao onClick={() => void salvar()}>Salvar</Botao>
          </>
        )
      }
    >
      {local && (
        <div className="mb-4 flex gap-2">
          <Botao
            tamanho="pequeno"
            variante={aba === 'dados' ? 'primario' : 'secundario'}
            onClick={() => setAba('dados')}
          >
            Dados
          </Botao>
          <Botao
            tamanho="pequeno"
            variante={aba === 'historico' ? 'primario' : 'secundario'}
            onClick={() => setAba('historico')}
          >
            Histórico
          </Botao>
        </div>
      )}
      {aba === 'historico' && local ? (
        <Historico entidade="local" registroId={local.id} fuso={fusoAtivo(s)} />
      ) : (
        <fieldset disabled={!podeAlterar} className="flex flex-col gap-4">
          {form.erroGeral && <Aviso tom="erro">{form.erroGeral}</Aviso>}
          <Campo rotulo="Nome" id="nome" erro={form.erro('nome')} obrigatorio>
            <Entrada
              id="nome"
              autoFocus
              placeholder="Adega, Almoxarifado da cantina…"
              value={v.nome}
              onChange={(e) => form.definir('nome', e.target.value)}
              onBlur={() => form.tocar('nome')}
            />
          </Campo>
          <Campo rotulo="Uso" id="uso">
            <Selecao id="uso" value={v.uso} onChange={(e) => form.definir('uso', e.target.value)}>
              {USOS_LOCAL.map((u) => (
                <option key={u} value={u}>
                  {NOMES_USO_LOCAL[u]}
                </option>
              ))}
            </Selecao>
          </Campo>
          {v.uso !== 'recipientes' && (
            <Campo
              rotulo="Estoque de qual módulo"
              id="moduloEstoque"
              erro={form.erro('moduloEstoque')}
              obrigatorio
              ajuda="Cada módulo tem o seu estoque."
            >
              <Selecao
                id="moduloEstoque"
                value={v.moduloEstoque ?? ''}
                onChange={(e) => form.definir('moduloEstoque', e.target.value || null)}
              >
                <option value="">Escolha</option>
                {modulosComEstoque.map((m) => (
                  <option key={m} value={m}>
                    {NOME_MODULO[m]}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <div className="flex flex-wrap gap-5">
            <Caixa
              rotulo="Refrigerado"
              checked={!!v.refrigerado}
              onChange={(e) => form.definir('refrigerado', e.target.checked)}
            />
            <Caixa
              rotulo="Externo (cantina de terceiro)"
              checked={!!v.externo}
              onChange={(e) => form.definir('externo', e.target.checked)}
            />
          </div>
          <Campo rotulo="Observações" id="obs">
            <AreaTexto
              id="obs"
              value={v.observacoes ?? ''}
              onChange={(e) => form.definir('observacoes', e.target.value)}
            />
          </Campo>
        </fieldset>
      )}
    </Dialogo>
  );
}

export function PaginaLocais() {
  const { data: s } = useSessao();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Local | null | 'novo'>(null);
  const [inativar, setInativar] = useState<Local | null>(null);
  const podeInativar = pode(s, 'gestao.config.locais', 'inativar');
  const estabAtivo = s?.empresa?.estabelecimentoId;
  const nomeEstab = s?.empresa?.estabelecimentos.find((e) => e.id === estabAtivo)?.nome;
  return (
    <Pagina
      titulo="Locais"
      trilha={['Configurações']}
      acoes={
        pode(s, 'gestao.config.locais', 'criar') &&
        estabAtivo && (
          <Botao onClick={() => setEditando('novo')}>
            <Plus /> Novo local
          </Botao>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        {estabAtivo
          ? `Locais de ${nomeEstab}.`
          : 'Locais de todos os estabelecimentos. Para criar um local, escolha o estabelecimento no topo da tela.'}
      </p>
      <TabelaDados<Local>
        key={estabAtivo ?? 'todos'}
        tabela="locais"
        url="/api/locais"
        ordemPadrao={{ campo: 'nome', direcao: 'asc' }}
        filtrosIniciais={{ situacao: 'ativos' }}
        podeExportar={pode(s, 'gestao.config.locais', 'exportar')}
        aoClicar={(l) => setEditando(l)}
        filtros={(f, definir) => (
          <>
            <Selecao
              aria-label="Uso"
              className="w-44"
              value={f.uso ?? ''}
              onChange={(e) => definir('uso', e.target.value)}
            >
              <option value="">Todos os usos</option>
              {USOS_LOCAL.map((u) => (
                <option key={u} value={u}>
                  {NOMES_USO_LOCAL[u]}
                </option>
              ))}
            </Selecao>
            <Selecao
              aria-label="Situação"
              className="w-32"
              value={f.situacao ?? 'ativos'}
              onChange={(e) => definir('situacao', e.target.value)}
            >
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos</option>
            </Selecao>
          </>
        )}
        colunas={[
          {
            id: 'nome',
            titulo: 'Nome',
            ordenavel: true,
            celula: (l) => l.nome,
            exportar: (l) => l.nome,
          },
          {
            id: 'uso',
            titulo: 'Uso',
            ordenavel: true,
            celula: (l) => NOMES_USO_LOCAL[l.uso],
            exportar: (l) => NOMES_USO_LOCAL[l.uso],
          },
          {
            id: 'modulo',
            titulo: 'Estoque',
            celula: (l) => (l.moduloEstoque ? NOME_MODULO[l.moduloEstoque] : '—'),
            exportar: (l) => l.moduloEstoque,
          },
          {
            id: 'caracteristicas',
            titulo: 'Características',
            celula: (l) =>
              [l.refrigerado && 'Refrigerado', l.externo && 'Externo'].filter(Boolean).join(', ') ||
              '—',
            exportar: (l) =>
              [l.refrigerado && 'Refrigerado', l.externo && 'Externo'].filter(Boolean).join(', '),
          },
          ...(!estabAtivo
            ? [
                {
                  id: 'estabelecimento',
                  titulo: 'Estabelecimento',
                  ordenavel: true,
                  celula: (l: Local) => l.estabelecimento,
                  exportar: (l: Local) => l.estabelecimento,
                },
              ]
            : []),
          {
            id: 'situacao',
            titulo: 'Situação',
            celula: (l) => (
              <Etiqueta tom={l.ativo ? 'sucesso' : 'neutro'}>
                {l.ativo ? 'Ativo' : 'Inativo'}
              </Etiqueta>
            ),
          },
          colunaAcoes<Local>((l) => (
            <AcoesLinha
              ativo={l.ativo}
              aoEditar={
                pode(s, 'gestao.config.locais', 'editar') ? () => setEditando(l) : undefined
              }
              aoInativar={podeInativar ? () => setInativar(l) : undefined}
              aoReativar={
                podeInativar
                  ? async () => {
                      await api.post(`/api/locais/${l.id}/reativar`);
                      await qc.invalidateQueries({ queryKey: ['lista', '/api/locais'] });
                    }
                  : undefined
              }
            />
          )),
        ]}
      />
      {editando && (
        <FormularioLocal
          local={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
        />
      )}
      <PedirMotivo
        aberto={!!inativar}
        aoMudar={(v) => !v && setInativar(null)}
        titulo={`Inativar ${inativar?.nome ?? ''}`}
        rotuloBotao="Inativar"
        aoConfirmar={async (motivo) => {
          await api.post(`/api/locais/${inativar!.id}/inativar`, { motivo });
          await qc.invalidateQueries({ queryKey: ['lista', '/api/locais'] });
        }}
      />
    </Pagina>
  );
}
