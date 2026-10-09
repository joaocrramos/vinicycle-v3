# Andamento do projeto

> Leia este arquivo primeiro ao retomar o trabalho. Ele diz onde paramos e o que vem a seguir.
> Última atualização: 04/10/2026, ao fim do ciclo 12. Pontos de decisão: [PENDENCIAS.md](PENDENCIAS.md).

## Ponto de retomada (05/10/2026)

- **Ajustes dos testes, lote 1 (05/10/2026):** selo que não aparecia na lista, dia do vencimento pelo Master do cliente (uma vez a cada 90 dias; dias 5, 10, 15, 20, 25 e 30), tanque de PP, Administração › Catálogos (todos os catálogos, inclusive os oficiais) e coluna "Ações" com ícones nos cadastros. Feitos e conferidos no navegador local, com `pnpm verificar` em 0; último commit: o do registro da publicação do menu, logo depois de `6eaae0a`. **Publicados em 05/10/2026** (versão `20261005-092854-3e728da`), depois do backup `~/backups/antes-ajustes1-20261005-1226.sql.gz`; as ações por ícone com dica, na versão `20261005-094323-861ff19` (backup `~/backups/antes-ajustes2-20261005-1240.sql.gz`); o estorno por ícone, na versão `20261005-095258-3650955` (backup `~/backups/antes-ajustes3-20261005-1249.sql.gz`); o menu reorganizado, na versão `20261005-105834-6eaae0a` (backup `~/backups/antes-menu2-20261005-1353.sql.gz`); migração `0025_ajustes_vencimento` aplicada. Na produção, o João Carlos trocou pela tela o vencimento da vinícola do dia 3 para o dia 5 em 05/10/2026 (nova troca pelo Master liberada em 03/01/2027). Detalhes em "Ajustes dos testes", abaixo.
- **Onde paramos:** publicados em `https://app.vinicycle.com` os seis ciclos do plano e os ciclos 7 a 12 (itens 2 a 6 da lista de 2027). O **ciclo 12** (integrações e atendimento: pagamentos pelo Asaas com a nota de serviço, WhatsApp pela Meta e a camada de SMS, pacotes de mensagens, Envios e Modelos de mensagem, chamados com a página pública, personificação) foi publicado em 04/10/2026 (versão `20261004-204032-46215c1`), depois do backup `~/backups/antes-ciclo12-20261004-2337.sql.gz`. Último commit: o da finalização dos documentos (CLAUDE.md, índice da documentação e roteiro de virada com a parte comercial), logo depois de `df3ca8f`; nada pendente no repositório. Pagamentos e WhatsApp foram testados com respostas simuladas e ligam de verdade quando as contas forem cadastradas em Administração › Integrações. A vinícola do João Carlos está no ciclo anual de 03/10/2026 a 02/10/2027, com preço contratado zero; vai pagar pelo reajuste na renovação (ou trocando de plano). O João Carlos pediu para **acumular os testes** e seguir; **o sistema é genérico: nunca perguntar se a vinícola faz algo, prever todas as opções** (ponto 22).
- **Ao abrir a próxima sessão:** antes de qualquer outra coisa, apresentar ao João Carlos, na conversa, o roteiro de testes abaixo, com o resumo de cada lista (ele pediu em 04/10/2026, noite). Ordem sugerida, do uso real para o comercial:
  1. ciclos 4 a 6 (cantina 2, estoque e envase, conformidade e virada): o que ele usa a partir de 01/01/2027 ([4](entregas/ciclo-4.md), [5](entregas/ciclo-5.md), [6](entregas/ciclo-6.md));
  2. ciclo 7 (declarações) e ciclo 8 (autocontrole, aprovações, diário, relatórios por e-mail) ([7](entregas/ciclo-7.md), [8](entregas/ciclo-8.md));
  3. ciclos 9 e 10 (simulador de corte, espumante, selos, álcool; vinificação para terceiros) ([9](entregas/ciclo-9.md), [10](entregas/ciclo-10.md));
  4. ciclo 11 (assinatura e cobrança), começando por dar preço ao plano Completo e cadastrar os adicionais, com um cliente de teste ([11](entregas/ciclo-11.md));
  5. ciclo 12 (chamados e personificação já testáveis; pagamentos e WhatsApp só com as contas das pendências 26 e 27) ([12](entregas/ciclo-12.md)).
  Os ajustes que ele pedir entram com prioridade, antes do item 7.
- **Esperando o João Carlos:**
  1. testar os ciclos publicados pelas listas em `docs/entregas/` (ciclos 4 a 12 ainda não testados por ele); no ciclo 11, antes de tudo, dar preço ao plano Completo e cadastrar os adicionais;
  2. **contas no Asaas (pendência 26) e na Meta para o WhatsApp (pendência 27)**, e cadastrá-las em Administração › Integrações (a lista do ciclo 12 explica);
  3. escolher o provedor de SMS, quando quiser (a camada está pronta);
  4. revisão das minutas legais pelo advogado (pendência 6);
  5. revisar as decisões dos ciclos 5 a 7 (pendências 17, 18 e 19), se quiser;
  6. pergunta ao RT sobre a declaração de quem contrata a elaboração (perguntas-externas.md, ponto 2).
- **Próximo passo:**
  1. ajustes pedidos nos testes, com prioridade;
  2. o item 7 da lista de 2027 (uso sem internet, etiquetas com QR dos recipientes, ficha técnica em PDF): começa com o roteiro no 04 e as perguntas de comportamento;
  3. pendentes da parte comercial, quando o João Carlos pedir: autocadastro pelo site, cobrança recorrente no cartão, alertas da central por WhatsApp e SMS (Configurações › Notificações), aviso de entrega do WhatsApp.
- **Como cada ciclo é feito:** roteiro em blocos no 04 → perguntas ao João Carlos (ou decisões registradas, quando ele autoriza) → um commit por bloco, sempre com `pnpm verificar` saindo com código 0 → conferência no navegador → `docs/entregas/ciclo-N.md` → migrações do ciclo consolidadas antes de publicar (P6), ensaiadas sobre uma base no estado do ciclo anterior → backup da base do servidor → `scripts/publicar.sh` (sem `--recriar-base`) → push.
- **Mapa do código (API em `apps/api/src/modulos`, interface em `apps/web/src/paginas`):**
  - Cantina: `producao/motor.ts` (confirmação, prévia, bloqueios, composição, estorno, trava do mês fechado), `producao/operacoes.ts` (rotas de todas as operações, mapa `tipos`), `producao/movimentos.ts`, `tratamentos.ts`, `fermentacoes.ts`, `granel.ts`, `painel.ts` (painel e higienização), `inventarios.ts`, `laboratorio.ts`, `engarrafamento.ts` (ordem, produção, lote comercial), `historia.ts`, `recepcao.ts`, `projetos.ts`, `consultas.ts`.
  - Estoque e notas: `estoque.ts` (livro, `lancarEstoque`), `notas.ts` (importação comum de NF-e), `estoque-nfe.ts` (notas de compra e de venda), `saidas.ts` (saídas, baixa por lote, devolução, recolhimento), `carga-inicial.ts`.
  - Conformidade: `alertas.ts` (central, varredura), `fechamento.ts`, `declaracoes.ts` (declaração anual, SIVIBE, entrega e retificação), `nucleo/periodo.ts` (trava do mês fechado e do ano declarado), `inicio.ts`.
  - Gestão: `autocontrole.ts`, `aprovacoes.ts` (com `nucleo/aprovacoes.ts`), `diario.ts`, `relatorios-agendados.ts` (tarefa de fundo, com `comoUsuario` em `nucleo/requisicao.ts`).
  - Ciclo 9: `producao/simulacoes.ts`, `producao/espumantes.ts`, `selos.ts`, `alcool.ts`.
  - Ciclo 10: `contratos.ts` (contrato de terceirização, texto do rótulo, pendências da IN 72), `producao/titularidade.ts` e `titularidade.ts` (transferência de titularidade a granel e no estoque), `conta-cliente.ts` (conta do cliente e perda tolerada), `dossie.ts` (dossiê do lote), `producao-terceiro.ts` (remessa e retorno do vinho cigano).
  - Ciclo 12: `integracoes.ts`, `mensagens.ts`, `chamados.ts`, `personificacao.ts`; `nucleo/pagamentos.ts` e `nucleo/mensageria.ts`; testes em `integracoes`, `mensagens`, `chamados` e `personificacao` (`apps/api/test`).
  - Ciclo 11: `planos.ts`, `assinaturas.ts`, `cobranca.ts` (com a tarefa de hora em hora), `regua.ts`, `exportacao.ts`, `painel-comercial.ts`; regras comuns em `packages/shared/src/comercial.ts`; testes em `apps/api/test/comercial.test.ts`.
  - Testes em `apps/api/test` (um arquivo por assunto; `cantina.ts` é o cenário comum; `ensaio-geral.test.ts` percorre o caminho inteiro).
- **Ambiente local:** bancos `vinicycle` e `vinicycle_teste` (`scripts/banco-local.sh`). Depois de puxar migrações novas: `pnpm db:migrar` e `pnpm db:referencia` em `apps/api`. Quando as migrações de um ciclo são consolidadas, a base local precisa do registro de migrações realinhado (apagar as linhas de `drizzle.__drizzle_migrations` depois da última do ciclo anterior e inserir o sha256 e o `when` das novas) ou ser recriada. A base local tem a empresa de demonstração (`demo@vinicycle.local`, senha de `DEMO_SENHA`) com dados de teste dos ciclos 4 a 7. Pré-visualização: servidores `api` (3000) e `web` (5173) em `.claude/launch.json`. O campo numérico da interface digita em centavos (para 1.350,00 L, digite 135000).
- **Permissão do Claude:** o João Carlos liberou em `~/.claude/settings.json` (04/10/2026) a publicação com `scripts/publicar.sh` e o trabalho de rotina no repositório no modo automático.
- **Fora do ciclo, sugerido como tarefa à parte:** a situação "vencido" dos documentos e o "hoje" dos alertas usam o fuso do servidor do banco, não o do estabelecimento (`apps/api/src/modulos/documentos.ts`, `alertas.ts`); o anexo da NF-e usa a permissão da Recepção também para as notas de compra e de venda (`nucleo/entidades.ts`).

## Ciclos

**Ciclo 1 (Base):** publicado em 03/10/2026. Lista: [entregas/ciclo-1.md](entregas/ciclo-1.md). Decisões técnicas: [decisoes/0002-implementacao-da-base.md](decisoes/0002-implementacao-da-base.md).

| Passo | Situação |
|---|---|
| 1. Monorepositório (api, web, shared), lint, formatação, testes | Feito |
| 2. Banco local (dev e testes) | Feito: `scripts/banco-local.sh` |
| 3. Esquema com Drizzle, seções 1 e 2 do modelo, RLS desde a primeira tabela | Feito: 28 tabelas, RLS em todas |
| 4. API: autenticação, convite, troca de senha, permissões, auditoria | Feito: 33 testes da API, 25 do `shared`, 3 da interface |
| 5. Interface: login, empresa e estabelecimento, estrutura de tela, usuários e perfis, componentes padrão | Feito e conferido no navegador (claro, escuro, celular) |
| 6. Verificação automática no GitHub | Pronta ([.github/workflows/verificar.yml](../.github/workflows/verificar.yml)); roda a partir do primeiro envio |
| 7. Servidor: comandos com `sudo`, serviço, publicação | Feito: servidor preparado pelo João Carlos e primeira versão publicada em 03/10/2026 |
| 8. Lista do que testar | Pronta: [entregas/ciclo-1.md](entregas/ciclo-1.md) |

**Ciclo 2 (Gestão e cadastros):** publicado em 03/10/2026 (versão 20261003-173847-4fdf18f). Lista: [entregas/ciclo-2.md](entregas/ciclo-2.md). Roteiro e decisões: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-2).

| Bloco | Situação |
|---|---|
| 1. Catálogos globais | Pronto |
| 2. Pessoas, CEP e CNPJ | Pronto |
| 3. Estabelecimento completo | Pronto |
| 4. Documentos | Pronto |
| 5. Cadastros da cantina | Pronto: menu EnoTrace com Recipientes, Produtos, Marcas, Insumos e embalagens, Catálogos e Parâmetros técnicos |
| 6. Parâmetros da Gestão | Pronto: Configurações › Parâmetros |
| 7. Passagem de bastão e troca de e-mail | Pronto: Usuários › Passar o bastão; link de aceite; troca pelo suporte no painel; Meu perfil › Trocar e-mail |
| 8. Publicação e lista de testes | Publicado em `app.vinicycle.com`; lista em [entregas/ciclo-2.md](entregas/ciclo-2.md) |

**Ciclo 3 (Cantina 1):** publicado em 03/10/2026 (versão 20261003-191354-eb24d21). Lista: [entregas/ciclo-3.md](entregas/ciclo-3.md). Roteiro e decisões: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-3).

| Bloco | Situação |
|---|---|
| 1. Motor do livro | Pronto: esquema da produção, confirmação atômica, bloqueios, linha do tempo, composição por recipiente, numeração; testado com os exemplos do modelo |
| 2. Regras versionadas | Pronto: regras iniciais com fonte (rendimento 4/5, varietal 75% e 85% na IP, safra 85%, produtor no SIVIBE), versão vigente pela data e abrangência, "ciente" gravado; Administração › Regras regulatórias |
| 3. Projeto de vinho | Pronto: código PRJ pela safra, situações (cancelar só sem movimento, encerrar sem saldo), variedades previstas, plano com insumos e previsto × executado, modelos de plano pelo dia 0, etapa do lote |
| 4. Propriedades e parcelas | Pronto: EnoTrace › Vinhedos, próprios ou do produtor, com SIVIBE e parcelas (a que sai da lista fica inativa) |
| 5. Recepção | Pronto: romaneio em rascunho, pesagens, SIVIBE com ciente, código na confirmação; XML da nota preenche e fica guardado, emitente cadastrado, variedade memorizada (P11) |
| 6. Desengace e prensagem | Pronto: telas com prévia antes e depois por recipiente, repartição por item, frações, ajuste ao medido, rendimento real e alerta de 4/5; lista e ficha das operações |
| 7. Consultas | Pronto: recipiente (conteúdo, composição, livro com saldo), ficha do lote (partes, composição ponderada, genealogia, uva de origem, etapas, rótulo), projeto (composição real, rótulo, recepções e operações) |
| 8. Entrega | Lista pronta ([entregas/ciclo-3.md](entregas/ciclo-3.md)); migrações do ciclo consolidadas em 0004 e 0005 (P6); publicado |

**Ciclo 4 (Cantina 2):** publicado em 03/10/2026 (versão 20261003-234927-695692a). Lista: [entregas/ciclo-4.md](entregas/ciclo-4.md). Roteiro e decisões: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-4).

| Bloco | Situação |
|---|---|
| 1. Rascunho e estorno | Pronto: rascunho de qualquer operação (salvo, retomado, descartado, confirmado com o mesmo identificador); estorno com motivo, data original, dependentes, volume, uva, composição, genealogia e rendimento de volta; estorno do romaneio sem uva processada (a nota volta à conferência). Conferido no navegador |
| 2. Trasfega e perda | Pronto: trasfega com várias origens e destinos (cada destino recebe a mistura das origens), borra com "esvaziar", método, mistura com outro lote (incorporar ou lote novo) com sugestão de corte e a marca "é corte"; perda avulsa com motivo; perdas na prévia; menu "Nova operação". Conferido no navegador |
| 3. Corte | Pronto: corte com origens de lotes diferentes, incorporar ou lote novo em cada destino, genealogia de corte, prévia com a composição e o que o rótulo declara por lote; lote novo entre projetos cria projeto novo (nome informado, safra e ciclo predominantes, projeto de origem); projetos de origem sem saldo encerrados "incorporados" (o estorno reabre e cancela o novo); trasfega também incorpora vinho de outro projeto. Conferido no navegador |
| 4. Atesto | Pronto: atesto em lote (uma origem, várias barricas, botão "todas do lote"), evaporação por barrica igual aos litros repostos e corrigível, outro lote incorporado ao da barrica (ou lote novo); EnoTrace › Relatórios com a evaporação por recipiente e período. Conferido no navegador |
| 5. Livro de estoque de insumos | Pronto: EnoTrace › Estoque com saldos por item (filtros: com saldo, abaixo do mínimo, lote vencendo, saldo negativo), ficha com saldo por local e por lote, validade, movimentos e pendências; entrada manual com número da nota e lote do fabricante; ajuste e descarte com motivo; transferência entre locais; estorno de cada lançamento; saldo negativo de insumo com aviso e pendência que se resolve sozinha. Conferido no navegador |
| 6. Adição de insumo, chaptalização e tratamentos | Pronto: insumos em qualquer operação (adição avulsa, desengace, trasfega, corte, atesto, tratamento), com baixa do lote do insumo, lote vencido, insumo não estocado e consulta inversa; SO₂ adicionado acumulado por recipiente (teor no cadastro do insumo), viajando com os litros, com alerta de 300 mg/L; chaptalização com ganho estimado e alerta pela classe; tratamentos com parâmetros técnicos configuráveis (Parâmetros técnicos › Tratamentos). Conferido no navegador |
| 7. Fermentações | Pronto: EnoTrace › Fermentações com as em andamento, início e fim por operação (alcoólica e malolática, independentes), leituras de densidade e temperatura (tabela de análise do modelo), curvas e sugestão de fim por leituras estáveis, com o critério em Configurações › Parâmetros; o estorno do fim reabre a fermentação. Conferido no navegador |
| 8. Inventário da cantina | Pronto: EnoTrace › Inventário com a contagem (livro na hora da contagem, medido, motivo, filtro por local), salva e retomada; os ajustes saem de uma vez numa operação "ajuste de inventário" (composição igual); diferença acima do percentual (Configurações › Parâmetros, padrão 2%) pede "ciente"; confirmar com diferença exige a permissão nova "Ajuste de inventário" (enólogo e RT nos modelos); sem diferença, confirma sem operação. Conferido no navegador |
| 9. Painel de recipientes e higienização | Pronto: EnoTrace › Painel da cantina (ocupação, lote, etapa, dias no recipiente, composição, fermentações em andamento, higienização vencida pela periodicidade do tipo; filtros; atalhos que abrem a operação com o recipiente escolhido); recipiente que esvazia passa a "aguardando higienização" na confirmação (parâmetro), com aviso na prévia; higienização/manutenção como operação sem volume, em vários recipientes, que devolve a "ativo" (o estorno volta à situação de antes; higienizar com vinho bloqueia). Conferido no navegador |
| 10. Entrega | Pronto: migrações consolidadas em 0006 e 0007 (ensaiadas sobre o ciclo 3 publicado), lista fechada, código no GitHub; publicado em 03/10/2026 (versão `20261003-234927-695692a`) |

**Ciclo 5 (Estoque e envase):** publicado em 04/10/2026 (versão 20261004-005420-1fe961f); roteiro montado e decidido pelo Claude em 03/10/2026, com a autorização do João Carlos (revisão: [PENDENCIAS.md](PENDENCIAS.md), ponto 17). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-5).

| Bloco | Situação |
|---|---|
| 1. Laboratório básico | Pronto: EnoTrace › Laboratório (análises internas e laudos, pedidos ao laboratório com código `AM-AAAA-NNNN`, prazo e laudo anexo), conversão de unidade com o original guardado, fora da faixa marcado (lote › projeto › empresa), valor impossível bloqueado, aviso de laboratório sem credenciamento; aba Análises na ficha do lote, com a curva de cada parâmetro. Conferido no navegador |
| 2. NF-e no estoque | Pronto: EnoTrace › Estoque › Notas de entrada: importar o XML (lote, fabricação e validade do grupo de rastreabilidade), conferir cada item (item do estoque, conversão sugerida pela unidade, local, lote, validade) ou descartar com motivo; lançar (entradas "Entrada por NF-e" ligadas à nota; lote vencido pede "ciente"); associação e descarte memorizados para o mesmo fornecedor; estorno da nota inteira, que volta à conferência; nota descartada e reaberta. A importação da recepção passou a usar o mesmo módulo (`modulos/notas.ts`). Conferido no navegador |
| 3. Granel | Pronto: Operações › Entrada de granel (compra, retorno de terceiro, outra; projeto, titular, composição informada ou "não informada", lote novo ou incorporado) e Saída de granel (venda, remessa, devolução ao titular, outra; esvaziar); nota, remetente ou destinatário, transportador, GLT e embalagem; saída sem GLT pede "ciente"; recebimento confirmado na ficha. Conferido no navegador |
| 4. Engarrafamento | Pronto: EnoTrace › Engarrafamento: previsão (garrafas pelos litros e pela perda média, materiais pela ficha de embalagem, o que falta no estoque), ordem com produto, rótulo, formatos, recipientes e locais (não reserva estoque), produção do dia (litros tirados por recipiente, garrafas por formato, materiais previsto × real, perda = tirado − engarrafado) como operação "engarrafamento" com baixa dos materiais e entrada do produto acabado no lote comercial `L26-0001` (um por ordem, criado na primeira produção, com a composição do que foi engarrafado e os lotes de origem); aviso do laudo fora de ±0,5% vol do rótulo (ou bloqueio, pelo parâmetro Envase) e de laboratório sem credenciamento; estorno da produção pela operação; encerrar e cancelar; situação do projeto automática; atalho "Planejar envase" no projeto; lista de lotes comerciais. Conferido no navegador |
| 5. Saídas | Pronto: EnoTrace › Saídas: saída manual (tipos da lista "tipo_saida"; destinatário opcional, "consumidor não identificado") e pela nota de venda (Saídas › Notas de venda: XML de NF-e ou NFC-e, conferência com associação memorizada e conversão, lote da nota); baixa por lote pela estratégia (lote do documento, escolha, mais antigo primeiro, sem lote com "ciente" do recall); produto acabado nunca negativo, nem no lote; devolução ao mesmo lote, no local escolhido (avariadas); estorno (a da nota volta à conferência); relatório "Quem recebeu o lote" a partir de Lotes comerciais. Conferido no navegador |
| 6. Entrega | Pronto: migrações do ciclo consolidadas em `0008_ciclo5` e `0009_seguranca_ciclo5` (ensaiadas sobre uma base no estado do ciclo 4 publicado; esquema idêntico ao montado passo a passo), lista fechada em [entregas/ciclo-5.md](entregas/ciclo-5.md); publicado em 04/10/2026 (versão `20261004-005420-1fe961f`), depois do backup `~/backups/antes-ciclo5-20261004-0352.sql.gz` |

**Ciclo 6 (Conformidade e virada):** publicado em 04/10/2026 (versão 20261004-013552-45c956a); roteiro montado e decidido pelo Claude em 04/10/2026 (revisão: [PENDENCIAS.md](PENDENCIAS.md), ponto 18). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-6). Uso real em 01/01/2027 ([roteiro de virada](virada-2027.md)).

| Bloco | Situação |
|---|---|
| 1. Central de alertas | Pronto: sino com contador de não lidos e painel na barra superior; tela Alertas (abertos e resolvidos, filtro por tipo, "marcar como lido", "atualizar agora"); alertas de documento, validade de lote, estoque mínimo, saldo negativo, laudo atrasado, higienização vencida, granel sem GLT (a GLT pode ser informada depois, na ficha da operação), fim de fermentação provável, etapa do plano atrasada e prazo da declaração anual; um por chave, resolvidos sozinhos quando a causa some; visíveis só a quem vê a tela de origem. Conferido no navegador |
| 2. Carga do saldo de abertura | Pronto: EnoTrace › Carga inicial: modelo CSV para baixar (granel, garrafas, insumos e embalagens), conferência linha a linha com os erros antes de gravar, tudo ou nada; granel numa operação "abertura de saldo" com lotes "carga inicial", composição informada e projeto criado quando não existe; garrafas com lote comercial de carga inicial; insumos com lote e validade; arquivo guardado; estorno (granel pelo motor; estoque só sem movimento posterior). Conferido no navegador |
| 3. Fechamento mensal | Pronto: EnoTrace › Fechamento do mês: meses do ano com a situação; lista de conferência (rascunhos, notas em conferência, saídas sem lote, laudos atrasados, alertas críticos com "ciente"; a pendência de estoque negativo impede); relatório do mês (granel por tipo de movimento: inicial, entradas, saídas, internos, ajustes, final; produto acabado por produto e formato em garrafas e litros), guardado ao fechar; trava de lançamentos no mês fechado (operações e estornos, recepção, estoque, saídas, notas, carga inicial); reabertura com a permissão própria e motivo; impressão. Conferido no navegador |
| 4. História do lote | Pronto: relatório a partir do lote comercial (Engarrafamento › Lotes comerciais › história), do lote de produção (botão na ficha) ou do projeto (link no cabeçalho): lotes de origem pela genealogia, uvas (romaneio, produtor, parcela, variedade, kg), operações e recipientes, insumos com lote, análises e laudos, cortes, envases e saídas com destinatário; impressão limpa (sem menu, cores claras) para salvar em PDF. Conferido no navegador |
| 5. Ensaio geral e entrega | Pronto: ensaio geral automatizado (`test/ensaio-geral.test.ts`: carga inicial, recepção, desengace com insumo, análise, trasfega, envase, venda, fechamento com trava e história); roteiro de virada em [virada-2027.md](virada-2027.md); Início refeito (alertas abertos, atalhos pela permissão, passos da implantação marcados pelo que existe); migrações do ciclo consolidadas em `0010_ciclo6` e `0011_seguranca_ciclo6` (ensaiadas sobre uma base no estado do ciclo 5; esquema idêntico); lista fechada em [entregas/ciclo-6.md](entregas/ciclo-6.md); publicado em 04/10/2026 (versão `20261004-013552-45c956a`), depois do backup `~/backups/antes-ciclo6-20261004-0433.sql.gz` |

**Ciclo 7 (Declarações; 2027, item 2, adiantado):** publicado em 04/10/2026 (versão 20261004-075914-5ede6d3); roteiro montado e decidido pelo Claude em 04/10/2026 (revisão: [PENDENCIAS.md](PENDENCIAS.md), ponto 19). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-7-declarações-2027-item-2-adiantado). Lista: [entregas/ciclo-7.md](entregas/ciclo-7.md).

| Bloco | Situação |
|---|---|
| 1. Relatório da declaração anual | Pronto: números do ano por estabelecimento (Portaria MAPA 615/2023, arts. 4º e 5º): granel por titular, classe e cor do projeto (estoque em 31/12 anterior, produção = desengace e prensagem, outras entradas, engarrafado, saídas, perdas, ajustes, internos, estoque em 31/12) e engarrafado por produto e formato (garrafas e litros, marca, classe, registro MAPA); estorno contado no tipo original; totais por titular; avisos (meses não fechados, projeto sem classe, produto sem registro, variedade sem código oficial) |
| 2. Entrega e ano travado | Pronto: "Marcar como entregue" com protocolo e "ciente" dos avisos guarda o instantâneo; a anual trava o ano em `nucleo/periodo.ts` (como o mês fechado); retificação aberta com a permissão de reabrir período e motivo (destrava) e concluída com o novo protocolo e os novos números; recibo em anexo; alerta do prazo por estabelecimento e alerta de retificação aberta |
| 3. Apoio ao SIVIBE | Pronto: uva própria por propriedade, parcela, cultivar e ciclo; comprada por fornecedor (CPF/CNPJ, número no SIVIBE, situação, declaração do ano anterior, notas); de terceiros por dono; avisos de produtor irregular, propriedade sem número e uva sem parcela |
| 4. Tela | Pronto: EnoTrace › Declarações (ano, abas MAPA e SIVIBE, avisos com "ciente", entrega, recibo, retificações, CSV por tabela, impressão). Conferido no navegador (desktop e celular) |
| 5. Entrega | Pronto: migrações `0012_ciclo7` e `0013_seguranca_ciclo7`; lista em [entregas/ciclo-7.md](entregas/ciclo-7.md); publicado em 04/10/2026 (versão `20261004-075914-5ede6d3`), depois do backup `~/backups/antes-ciclo7-20261004-1057.sql.gz`. Ajuste no relatório do mês: prensagem como entrada e estorno pelo tipo original |

**Ciclo 8 (autocontrole, aprovações, diário e relatórios agendados; 2027, item 3):** publicado em 04/10/2026 (versão 20261004-093029-b599432); roteiro proposto pelo Claude e decidido pelo João Carlos em 04/10/2026 (ponto 20). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-8-autocontrole-aprovações-diário-e-relatórios-agendados-2027-item-3). Lista: [entregas/ciclo-8.md](entregas/ciclo-8.md).

| Bloco | Situação |
|---|---|
| 1. Autocontrole | Pronto: Gestão › Autocontrole; programa pelo modelo da norma (lista no código), totalmente configurável (periodicidade em dias, semanas, meses, anos ou sob demanda; responsável; evidência automática); evidências com anexos e anulação; evidência automática lida das higienizações e leituras de temperatura; prazo, situação e alerta de atraso; permissão própria do programa. Conferido no navegador |
| 2. Aprovações | Pronto: parâmetro com as quatro ações; `nucleo/aprovacoes.ts` (pedido) e `modulos/aprovacoes.ts` (lista, aprovar com ponto de retorno, recusar, cancelar, visto); inventário, estorno, reabertura e retificação viram pedido quando ligados; alertas para quem aprova e para quem pediu; aviso "pedido enviado" global (sonner). Conferido no navegador |
| 3. Diário | Pronto: Gestão › Diário com filtros; aba Diário nas fichas do projeto e do recipiente; anexos; autor altera e remove. Conferido no navegador |
| 4. Relatórios por e-mail | Pronto: Preferências › Relatórios por e-mail; quatro relatórios e quatro frequências às 7h do fuso; tarefa de fundo no serviço da API (`iniciarTarefaRelatorios`), com o contexto do usuário (`comoUsuario`) e a fila de e-mails. Conferido no navegador |
| 5. Entrega | Pronto: migrações `0014_ciclo8` e `0015_seguranca_ciclo8` (com a política "tarefa" de leitura dos envios devidos); lista em [entregas/ciclo-8.md](entregas/ciclo-8.md); modelo de dados atualizado (03, 2.2); publicado em 04/10/2026 (versão `20261004-093029-b599432`), depois do backup `~/backups/antes-ciclo8-20261004-1228.sql.gz` |

**Ciclo 9 (simulador de corte, espumante na garrafa, selos de IG, álcool etílico; 2027, item 4):** publicado em 04/10/2026 (versão 20261004-104234-fa669db); decidido pelo João Carlos em 04/10/2026 (ponto 22: o sistema é genérico e prevê todas as opções). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-9-simulador-de-corte-espumante-na-garrafa-selos-de-ig-e-álcool-etílico-2027-item-4). Lista: [entregas/ciclo-9.md](entregas/ciclo-9.md).

| Bloco | Situação |
|---|---|
| 1. Simulador de corte | Pronto: aba na ficha do projeto (`Simulador.tsx`; `producao/simulacoes.ts`); em % sobre um volume ou em litros; salvar, aprovar e abrir o corte já preenchido (`?simulacao=`). Conferido no navegador |
| 2. Livro de álcool etílico | Pronto: `modulos/alcool.ts` e `Alcool.tsx`; entradas e usos dos itens "é álcool etílico"; alerta até registrar a comunicação. Conferido no navegador |
| 3. Espumante na garrafa | Pronto: `producao/espumantes.ts` e `Espumantes.tsx`; tiragem (operação "tiragem"), estágios da lista "estagio_espumante", anulação, finalização em lote comercial; espumante em elaboração na declaração anual. Conferido no navegador |
| 4. Selos numerados | Pronto: `modulos/selos.ts` e `Selos.tsx`; item tipo selo; entrada por faixa (trava no `lancarEstoque`); faixas usadas e perdidos por produção; o estorno da produção devolve. Conferido no navegador |
| 5. Entrega | Pronto: migrações `0016_ciclo9` e `0017_seguranca_ciclo9`; lista em [entregas/ciclo-9.md](entregas/ciclo-9.md); modelo de dados atualizado (03, 2.5); publicado em 04/10/2026 (versão `20261004-104234-fa669db`), depois do backup `~/backups/antes-ciclo9-20261004-1340.sql.gz` |

**Ciclo 10 (vinificação para terceiros e "vinho cigano"; 2027, item 5):** publicado em 04/10/2026 (versão 20261004-175104-05b3d3c); decidido pelo João Carlos em 04/10/2026 (ponto 23) e completado com a revisão das opções (ponto 24). Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-do-ciclo-10-vinificação-para-terceiros-e-vinho-cigano-2027-item-5).

| Bloco | Situação |
|---|---|
| 1. Contrato de terceirização | Pronto: `modulos/contratos.ts`, `db/schema/terceiros.ts`, `packages/shared/src/terceiros.ts` e `Contratos.tsx` (EnoTrace › Terceiros › Contratos); sentido, atividades, registro do produto, itens de preço, perda tolerada, pagamento em produto (%, litros, garrafas), prefixo do lote, três formas do texto do rótulo (editável), SIPEAGRO com lembrete quando o contrato muda; pendências da IN 72 (via do contrato, certificado do produto, SIPEAGRO, padronizador) e alertas (contrato e registro da contraparte vencendo ou vencidos); anexo com a categoria nova "contrato"; contrato sugerido na recepção (coluna `romaneio.contrato_id`) e "ciente" sem contrato na recepção e na entrada de granel; texto do rótulo na ficha do produto. Conferido no navegador |
| 2. Transferência de titularidade | Pronto: operação "titularidade" (`producao/titularidade.ts`, `operacoes/Titularidade.tsx`): total no próprio recipiente ou parcial para outro recipiente vazio ou com vinho do novo titular, lote novo ou existente do mesmo projeto, genealogia, motivo (compra ou venda, pagamento do serviço, outro) e contrato; o motor deixa de bloquear a troca de titular só nessa operação. No estoque (`modulos/titularidade.ts`, Estoque › Titularidade): o lote passa a outro titular com o mesmo código; o código do lote do estoque passou a ser único por item, código e titular, e o engarrafamento e o espumante gravam o titular no lote das garrafas (antes ficava vazio). Tabela `transferencia_titularidade` (granel e estoque); o contrato mostra o pagamento em produto previsto e o já transferido; estornos deixam de contar. Conferido no navegador |
| 3. Devolução, conta do cliente e insumos do cliente | Pronto: entrada de granel "recebido do cliente para elaboração ou envase" (exige o titular); saída com o dono do produto (`saida.titular_id`): a baixa usa só os lotes desse titular, a venda própria não pega garrafas do cliente; tipos "devolução ao titular" (avisos de produto próprio e destinatário diferente) e "entrega por ordem do titular" (exige o titular); devolução da sobra de insumo do cliente pela saída; entrada de estoque com titular (lote obrigatório), saldo de clientes separado na lista e fora do estoque mínimo; insumo de um cliente no vinho de outro titular pede "ciente"; prefixo do contrato no código do lote comercial do cliente (engarrafamento e espumante); Terceiros › Conta do cliente (`modulos/conta-cliente.ts`, `ContaCliente.tsx`) por cliente e safra, com o alerta de perda acima da tolerada. Conferido no navegador |
| 4. Dossiê do lote (PDF, CSV e e-mail) | Pronto: Terceiros › Dossiês (`modulos/dossie.ts`, `Dossies.tsx`): só do vinho de cliente (lote de produção ou lote comercial); fotografia guardada já em seções (identificação com cliente, cantina, contrato e texto do rótulo; lotes, recepção com nota de remessa, granel, operações, análises, insumos com quem forneceu, recipientes, genealogia, envase, devoluções e transferências); impressão em PDF pelo navegador, CSV, envio por e-mail com o conteúdo no corpo (o e-mail do sistema não leva anexo) e registro de cada envio. Tabelas `dossie` e `dossie_envio`. Conferido no navegador (sem enviar e-mail real) |
| 5. Produção em terceiro (remessa, retorno, SIVIBE) | Pronto: Terceiros › Produção em terceiro (`modulos/producao-terceiro.ts`, `ProducaoTerceiro.tsx`): remessa à cantina com uva (parcela própria, uva de romaneio, que sai do saldo do romaneio, ou fornecedor que entregou direto), granel (liga a saída de granel "remessa a terceiro") e insumos e embalagens (transferência para o local externo da cantina, com o saldo em poder dela); retornos parciais com perdas informadas: granel (cria a entrada de granel "retorno de terceiro", com a composição sugerida pela uva remetida), engarrafado (lote comercial informado pela cantina, origem "retorno de terceiro") e insumos consumidos pela cantina; resumo por remessa (enviado, voltou, perdas, rendimento, andamento) e "marcar como concluída"; estornos; anexos no retorno (dossiê da cantina). SIVIBE: uva enviada para processamento por terceiros. Declaração anual: linha informativa dos retornos de terceiro (já nas entradas). Conferido no navegador |
| 6. Entrega | Pronto: migrações do ciclo consolidadas em `0018_ciclo10` e `0019_seguranca_ciclo10` (ensaiadas sobre uma base no estado do ciclo 9; esquema idêntico ao montado passo a passo); lista em [entregas/ciclo-10.md](entregas/ciclo-10.md); modelo de dados atualizado (03, 2.5, Terceirização e Saída); publicado em 04/10/2026 (versão `20261004-175104-05b3d3c`), depois do backup `~/backups/antes-ciclo10-20261004-2048.sql.gz` |


**Ciclo 11 (assinatura e cobrança; 2027, item 6, primeira metade):** publicado em 04/10/2026 (versão 20261004-192614-43838fa; ajustes da pendência 25 na versão 20261004-193934-870457e); roteiro proposto pelo Claude e aprovado pelo João Carlos em 04/10/2026. Roteiro: [04-plano-de-entregas.md](04-plano-de-entregas.md#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6). Lista: [entregas/ciclo-11.md](entregas/ciclo-11.md).

| Bloco | Situação |
|---|---|
| 1. Planos e adicionais | Pronto: `modulos/planos.ts`, `packages/shared/src/comercial.ts` (listas, validações e as contas de ciclo, vencimento e proporcional), `paginas/plataforma/Planos.tsx` (Administração › Planos e Adicionais). Preço por periodicidade com vigência (`plano_preco`, `adicional_preco`), formas aceitas no plano. Demonstração local ganhou `equipe@vinicycle.local` com segundo fator fixo (`pnpm --filter @vinicycle/api demo codigo`). Conferido no navegador |
| 2. Assinatura completa | Pronto: `modulos/assinaturas.ts` (limites efetivos, uso, troca de plano e de ciclo, adicionais, descontos, resumo; as ações do Master elevam o contexto para a plataforma depois de conferir o Master), `componentes/Assinatura.tsx` (ficha do cliente e Configurações › Assinatura). Limites de estabelecimentos, usuários e anexos e o módulo avulso passaram a somar os adicionais. A criação do cliente exige preço do plano no ciclo. Conferido no navegador |
| 3. Faturas e recebimentos | Pronto: `modulos/cobranca.ts` (renovação com o agendado, fatura do ciclo e do próximo, refazer fatura futura, avulsa, baixa com comprovante opcional, estorno, cancelamento, contratação no teste, tarefa de hora em hora), `componentes/Faturas.tsx`, `paginas/plataforma/Faturas.tsx`. Comprovante como anexo da entidade `recebimento` (o cliente baixa). Conferido no navegador |
| 4. Régua e exportação | Pronto: `modulos/regua.ts` (teste, vencimento, tolerância, somente leitura, bloqueio, liberação na baixa, aviso de limite antes da renovação; `aviso_cobranca` evita repetição), `modulos/exportacao.ts` (ZIP em fluxo com `yazl`), `paginas/config/Exportar.tsx`; empresa bloqueada só deixa o Master na assinatura e na exportação (`nucleo/permissoes.ts`, `rotas.tsx`); faixa com a fatura vencida e os prazos (sessão: `empresa.cobranca`). Conferido no navegador |
| 5. Vitrine, painel e prazos | Pronto: `modulos/painel-comercial.ts`, `paginas/gestao/Vitrine.tsx` (Conheça e contrate), `paginas/plataforma/Painel.tsx` e `Configuracoes.tsx`. Conferido no navegador |
| 6. Entrega | Pronto: migrações do ciclo consolidadas em `0020_ciclo11` e `0021_seguranca_ciclo11` (ensaiadas sobre uma base no estado do ciclo 10 com uma assinatura ativa e uma em teste; esquema idêntico ao montado passo a passo); lista em [entregas/ciclo-11.md](entregas/ciclo-11.md); modelo de dados (03, 2.1) e administracao.md atualizados; publicado em 04/10/2026 (versão `20261004-192614-43838fa`), depois do backup `~/backups/antes-ciclo11-20261004-2223.sql.gz` |

**Ciclo 12 (integrações e atendimento; 2027, item 6, segunda metade):** publicado em 04/10/2026 (versão 20261004-204032-46215c1); roteiro aprovado e respostas da pendência 25 em 04/10/2026. Lista: [entregas/ciclo-12.md](entregas/ciclo-12.md).

| Bloco | Situação |
|---|---|
| 1. Camada de pagamentos (Asaas) | Pronto: `nucleo/pagamentos.ts` (interface e adaptador do Asaas, API v3, sandbox e produção), `modulos/integracoes.ts` (Administração › Integrações, aviso em `/api/avisos/:id` liberado da checagem de origem e conferido pelo token, tarefa de 2 em 2 minutos que cria e cancela cobranças e pede a nota), `paginas/plataforma/Integracoes.tsx`; na fatura, link de pagamento, PIX e nota. Testado com o Asaas simulado (`definirBuscarProvedor`). Conferido no navegador |
| 2. WhatsApp, SMS e mensagens | Pronto: `nucleo/mensageria.ts` (Meta), `modulos/mensagens.ts` (franquia por pacote, fila de WhatsApp e SMS, Envios, Modelos de mensagem, integração do WhatsApp), preferência em Preferências, canal nos relatórios agendados, régua também por WhatsApp; funções `mensagens_no_mes` e `canal_ativo` no banco; a fila de e-mail passou a pegar só e-mail. Conferido no navegador |
| 3. Chamados | Pronto: `modulos/chamados.ts`, `paginas/Suporte.tsx` (cliente e página pública `/suporte`), `paginas/plataforma/Suporte.tsx`; função `emails_equipe_suporte` no banco; categorias em Configurações da plataforma. Conferido no navegador |
| 4. Personificação | Pronto: `nucleo/sessoes.ts` (sessão personificada, fim por tempo), `nucleo/requisicao.ts` (as duas identidades e os bloqueios), `modulos/personificacao.ts`, faixa em `layout/Estrutura.tsx`, botão na ficha do cliente, acessos do suporte na auditoria da empresa. Conferido no navegador |
| 5. Entrega | Pronto: migrações consolidadas em `0023_ciclo12` e `0024_seguranca_ciclo12` (ensaiadas sobre uma base no estado publicado; esquema idêntico ao passo a passo); lista em [entregas/ciclo-12.md](entregas/ciclo-12.md); modelo de dados (2.1) e administracao.md atualizados |
## Ajustes dos testes

**Lote 1 (05/10/2026)**, pedido pelo João Carlos ao testar; decisões no ponto 28 do [PENDENCIAS.md](PENDENCIAS.md).

| Ajuste | Situação |
|---|---|
| Selo gravava mas não aparecia em Cadastros › Selos (a listagem recusava o filtro "selo") | Corrigido em `itens-estoque.ts`; teste em `selos.test.ts` |
| Dia do vencimento pelo Master do cliente (Configurações › Assinatura › Vencimento e forma); vale para as próximas faturas; o Master muda o dia uma vez a cada 90 dias (a Administração quando precisar); dias oferecidos 5, 10, 15, 20, 25 e 30 | Pronto: `mudarCobranca` em `assinaturas.ts`, rota `PUT /api/assinatura/cobranca`, coluna `assinatura.dia_vencimento_alterado_em` (migração `0025_ajustes_vencimento`), `DIAS_VENCIMENTO` e `diaVencimentoPadrao` em `packages/shared/src/comercial.ts`; teste em `comercial.test.ts` |
| "Tanque de polipropileno (PP)" no tipo de recipiente e "Polipropileno (PP)" no material; a fibra continua | Pronto na carga dos dados de referência |
| Administração › Catálogos: itens globais de todos os catálogos simples, inclusive os oficiais | Pronto: rotas `/api/plataforma/catalogos/*` e `/api/plataforma/referencia` em `catalogos.ts`, `paginas/plataforma/Catalogos.tsx`, modo `plataforma` em `componentes/Catalogo.tsx`; a carga só inclui o que falta nesses catálogos (`carregar-catalogos.ts`); testes em `catalogos.test.ts` |
| Coluna "Ações" nos cadastros: lápis (editar), bloquear (inativar), seta (reativar) | Pronto: `componentes/AcoesLinha.tsx`, aplicado em Catálogos, Locais, Estabelecimentos, Usuários, Pessoas, Documentos, Autocontrole, Insumos e embalagens, Produtos e Marcas, Vinhedos, Recipientes, Contratos, Modelos de plano e, na Administração, Planos e Adicionais. Fora: Perfis (lista de botões), Parâmetros técnicos (lista de configuração em linha) |
| Ações só por ícone, com dica própria (aparece na hora, também pelo teclado), em toda a interface: coluna Ações, Inativar/Reativar das fichas (Pessoas, Produtos, Documentos, Estabelecimentos, Perfis, Autocontrole, Contratos), tratamentos em Parâmetros técnicos, formatos do produto, descontos da assinatura e os "Estornar" de linha (faixa de selos, carga inicial, recebimento de fatura) | Pronto (05/10/2026, pedido de novo pelo João Carlos): `componentes/ui/dica.tsx` (Tooltip do Radix), `BotaoIcone` e `AcoesLinha contorno` em `componentes/AcoesLinha.tsx`. Depois, a pedido (melhor no celular), também os "Estornar" do topo das fichas (operação, recepção, saída, nota, remessa) e das linhas (lançamento do estoque, retorno do vinho cigano); só o botão que confirma o estorno no diálogo fica em texto |
| Menu lateral reorganizado pelo uso: topo (Início, Aprovações com contador), EnoTrace com o dia a dia solto e seções Envase e expedição, Estoque, Conformidade, Terceiros e Cadastros; Gestão depois; Configurações no fim (Empresa e acesso, Conta e dados); Conheça e contrate no rodapé; atalhos novos para Lotes comerciais e Notas de entrada; ícones sem repetição | Pronto (05/10/2026, aprovado pelo João Carlos): `layout/Estrutura.tsx` (`grupos`, `itemAtivo`, contador por `/api/aprovacoes/resumo`); trilhas das configurações; [ambiente-cliente.md](modulos/ambiente-cliente.md#menu-lateral) |

Uma migração: `0025_ajustes_vencimento` (coluna da última mudança do dia do vencimento). O banco já permitia à Administração alterar os itens globais.

## O que já está decidido

| Tema | Onde está |
|---|---|
| Propósito, marco (uso real em 01/01/2027), prioridades, perfil da vinícola, glossário | [00-visao-geral.md](00-visao-geral.md) |
| 29 premissas transversais, todas aprovadas (P1–P29) | [01-premissas.md](01-premissas.md) |
| Stack (PostgreSQL + Node/TypeScript/Fastify/Drizzle + React/Vite/Tailwind/shadcn) e servidor | [02-arquitetura.md](02-arquitetura.md), [decisoes/0001-stack.md](decisoes/0001-stack.md) |
| Administração da plataforma (criação de cliente, convite, Master e passagem de bastão, planos, teste de 7 dias, inadimplência, integração de pagamentos, autocadastro) | [modulos/administracao.md](modulos/administracao.md): sem pendências |
| Ambiente do cliente (barra superior, avatar, menus, Gestão, estoque por módulo, configurações, menu do EnoTrace) | [modulos/ambiente-cliente.md](modulos/ambiente-cliente.md) |
| Gestão (pessoas e papéis, documentos com versões e avisos, autocontrole, parâmetros) | [modulos/gestao.md](modulos/gestao.md) |
| Cantina / EnoTrace (projeto de vinho com campos, situações, etapas, plano e telas; lotes de produção, lote comercial, operações, espumantes, engarrafamento como ordem de produção, saídas) | [modulos/cantina.md](modulos/cantina.md): sem pendências de decisão |
| Pesquisa regulatória com fontes (SISDEVIN, MAPA, Bahia, IP Vale do São Francisco) | [pesquisa/](pesquisa/) |
| Lacunas em relação à v1 e à v2: as 6 obrigatórias por lei e 21 das 22 úteis entram; já distribuídas nos módulos | [LACUNAS-V1-V2.md](LACUNAS-V1-V2.md) |

## Módulos e nomes

| Módulo | Situação |
|---|---|
| **Gestão** (bloco comum, todos os planos) | Especificado |
| **EnoTrace** (Enologia) | Primeiro módulo, especificado |
| **VitiTrack** (Campo) | Depois |
| **EnoTur** (Enoturismo) | Futuro |
| **EnoMesa** (Gastronomia) | Futuro |

**Produto:** **ViniCycle**. Site em `vinicycle.com`; aplicação em `app.vinicycle.com`; `vinicycle.app` redireciona para a aplicação.

## Princípios de trabalho com o João Carlos

1. **Planejar antes de codar.** Apresentar síntese e perguntas; só implementar com aprovação explícita.
2. **O cliente decide, o sistema informa** (P29). O sistema bloqueia só impossibilidades físicas e quebras de integridade. Limite legal gera alerta. Prática de vinificação é opção do cliente. Nada fica amarrado a um fornecedor (ex.: PDV Legal).
3. **Base limpa** (P6): nada de remendos. Antes do lançamento, um único script cria a base.
4. **Mostrar o conteúdo na conversa.** O João Carlos às vezes não consegue abrir arquivos; resumir decisões e perguntas no chat.
5. Documentação em pt-BR; toda regra regulatória cita a norma.
6. **Sistema comercial e nacional, não só para a vinícola do João Carlos nem só para a Bahia.** Especificar para todas as situações de mercado (uva própria e comprada, vinificação para terceiros, produção em terceiro); a vinícola dele serve de caso de validação. Regras de cada UF entram como parâmetros, conforme surgirem.
7. **Fiscal fica para depois** (decidido em 03/10/2026): o sistema só guarda referências e lê XML; não calcula imposto, não escolhe CFOP nem emite nota. Ver [FISCAL.md](FISCAL.md).

## Infraestrutura

- **Servidor:** VM `vm-joao` (Cirion, Cotia/SP), só acessível pela VPN; Ubuntu 26.04, PostgreSQL 18.6, Caddy. Compartilhada com o ObraGrid.
- **Aplicação:** `https://app.vinicycle.com`, serviço systemd do usuário `vinicycle`, publicação por `scripts/publicar.sh` ([operacao.md](operacao.md)). E-mail pelo Resend. Anexos no disco da VM, atrás da interface compatível com S3.
- **Atalhos SSH no Mac:** `ssh vinicycle` (chave `~/.ssh/id_ed25519_vinicycle`, usada pelo Claude); `ssh vm-joao` (usuário `joao.carlos`, com `sudo`). Ações com `sudo` são preparadas em comandos para o João Carlos.
- **Repositório:** `joaocrramos/vinicycle` (GitHub, privado, `main`), com verificação automática a cada envio. Commits com autor João Carlos <joao.carlos@jcrtecnologia.com>. Os antigos ficaram como `vinicycle-v1` e `vinicycle-v2`; antes de renomear repositórios, verificar quem envia para eles (o projeto da v1 no Skip enviava para `vinicycle`).
- **Pendências de infraestrutura:** DNS de `vinicycle.app` e backup ([PENDENCIAS.md](PENDENCIAS.md), pontos 7 e 8).
