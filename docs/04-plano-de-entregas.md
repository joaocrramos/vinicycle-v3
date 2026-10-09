# Plano de entregas

> **Situação:** **aprovado pelo João Carlos em 03/10/2026**, junto com o [modelo de dados](03-modelo-de-dados.md). O código começou no mesmo dia, antes de 06/10; as datas finais dos ciclos não mudam e os dias a mais viram folga.

## Marco (Decidido em 03/10/2026)

- **Início do uso real: 01/01/2027.** A vinícola do João Carlos começa 2027 já registrando tudo no sistema.
- **Carga inicial:** só o **saldo de abertura em 31/12/2026** (granel por recipiente e lote; garrafas por produto e lote comercial; insumos e embalagens). Os movimentos de 2026 **não** entram no sistema.
- **Declarações:**
  - a declaração anual de janeiro de 2027 (ano de 2026) é feita fora do sistema, como hoje;
  - a primeira **declaração mensal** pelo sistema é a de janeiro de 2027, entregue em fevereiro;
  - a primeira **declaração anual** pelo sistema é a de 2027, entregue de 1º a 10/01/2028.
- **Escopo até dezembro:** fases 0 a 3. A parte comercial e os extras ficam para 2027. Tudo o que foi especificado continua valendo; muda só a ordem de entrega.
- **Ritmo:** uma versão publicada no servidor **a cada duas semanas**, com a lista do que testar. O João Carlos testa com dados reais.

## Ciclos de duas semanas (Decidido em 03/10/2026)

| Ciclo | Datas | Entrega |
|---|---|---|
| 1 | 06/10 a 17/10 | **Base:** banco no servidor, publicação automática, login, empresa, estabelecimentos, locais, usuários, convites, perfis e grade, auditoria, anexos |
| 2 | 20/10 a 31/10 | **Gestão e cadastros:** pessoas e papéis, busca de CEP e CNPJ, documentos com vencimento, cadastros da cantina (recipientes, variedades, insumos, produtos, marcas, motivos, parâmetros) |
| 3 | 03/11 a 14/11 | **Cantina 1:** projeto e plano, recepção (romaneio, itens, pesagens, XML da nota), livro de volumes, desengace, prensagem, composição por recipiente |
| 4 | 17/11 a 28/11 | **Cantina 2:** trasfega, corte, atesto (com evaporação), adição de insumo, chaptalização, perdas, inventário, estorno, rascunho, fermentações, painel de recipientes |
| 5 | 01/12 a 12/12 | **Estoque e envase:** importação de XML no estoque (o livro de insumos vem no ciclo 4), entrada e saída de granel, laboratório básico (análises, laudos, curvas), engarrafamento com lote comercial, saídas com importação de XML |
| 6 | 15/12 a 30/12 | **Conformidade e virada:** carga do saldo de abertura, fechamento mensal, relatório da declaração mensal, alertas, relatório de história do lote, ensaio geral |
| — | **01/01/2027** | **Início do uso real** |

## Roteiro do ciclo 1

Ordem sugerida, para a primeira sessão de código depois da aprovação:

1. **Monorepositório** TypeScript com `api`, `web` e `shared` (02-arquitetura.md), com lint, formatação e testes (Vitest, P24).
2. **Banco local** no Mac (PostgreSQL) para desenvolvimento e testes; nada de dados reais (P6).
3. **Esquema da base** com Drizzle, seguindo as seções 1 e 2 de [03-modelo-de-dados.md](03-modelo-de-dados.md): convenções comuns, empresa, estabelecimento, locais, usuário, vínculo, perfis e grade, auditoria, anexos, sequências e formatos de código. **RLS** desde a primeira tabela.
4. **API:** autenticação (sessão em cookie `__Host-`, P21), convite (P8), troca de senha por token, permissões (P27), auditoria automática (P14).
5. **Interface:** login, escolha de empresa e estabelecimento, estrutura de tela (ambiente-cliente.md), usuários e perfis, componentes padrão de formulário e listagem (P2, P3, P4, P9).
6. **Verificação automática** no GitHub a cada envio (lint, testes).
7. **Servidor:** preparar os comandos com `sudo` para o João Carlos (banco e papéis, diretórios em `/srv/vinicycle`, serviços systemd, bloco do Caddy) e publicar a primeira versão.
8. **Fim do ciclo:** lista do que testar, enviada ao João Carlos.

## Roteiro do ciclo 2

Aprovado pelo João Carlos em 03/10/2026; começou no mesmo dia, logo depois da entrega do ciclo 1.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Catálogos globais | Papéis de pessoa, tipos de documento, tipos de recipiente, unidades, classes oficiais de produto, variedades, tipos de insumo, parâmetros de análise, listas simples (motivos de perda, cargos, frações de prensa, métodos de trasfega…), IG Vale do São Francisco |
| 2 | Pessoas | Cadastro único com papéis e extensões; contatos da pessoa jurídica; busca de CEP e CNPJ |
| 3 | Estabelecimento completo | Responsável técnico, IGs e produtos elaborados |
| 4 | Documentos | Tipos, versões, vencimento (em dia, vencendo, vencido), responsável pela renovação, etiquetas, anexos |
| 5 | Cadastros da cantina | Recipientes, variedades da empresa, insumos, itens de embalagem, marcas, produtos (rótulos, formatos, ficha de embalagem), motivos de perda, parâmetros de análise e faixas ideais, rendimento padrão, ciclos da safra, periodicidade de higienização |
| 6 | Parâmetros | Configurações simples da Gestão |
| 7 | Pendências do ciclo 1 | Passagem de bastão do Master; troca de e-mail do usuário |
| 8 | Entrega | Publicação e lista do que testar |

**Decidido em 03/10/2026:**
- **Busca de CEP e CNPJ:** gratuita, com cadeia de reserva atrás de uma camada trocável (P29).
  - CEP: ViaCEP → BrasilAPI → OpenCEP. O ViaCEP vem primeiro porque traz o código IBGE do município; sem ele, o código é completado pela tabela do IBGE.
  - CNPJ: BrasilAPI → CNPJ.ws pública.
  - Os dados só pré-preenchem o formulário.
- **Catálogo de variedades:** tabela de cultivares do SISDEVIN, de 30/03/2023, com código oficial, cor e tipo ([pesquisa](pesquisa/2026-10-declaracoes-vinicolas.md)).
- **Documentos:** organizados por **etiquetas** (várias por documento), sem pastas.
- **Fora do ciclo 2:**
  - autocontrole, diário e etiqueta com QR dos recipientes ficam para 2027;
  - os avisos de vencimento vêm com a central de alertas, no ciclo 6;
  - propriedades e parcelas do produtor de uva entram com a recepção, no ciclo 3.
- **Cadastros da cantina (bloco 5):**
  - **Ficha de embalagem:** só itens de embalagem (ou "outro") entram como material; insumos enológicos vão nas operações.
  - **Rendimento padrão:** pode ser geral, por variedade, por estilo (cor do vinho) ou pelos dois. No esmagamento (ciclo 3), vale a regra mais específica. Sem regra, o usuário digita a estimativa.
  - **Formato:** cada volume vira um item de estoque de produto acabado ("Produto 750 mL"). Inativar o formato inativa o item.
- **Parâmetros da Gestão (bloco 6):** em Configurações › Parâmetros, os valores simples:
  - formatos de código (P19), gravados na tabela `formato_codigo` do modelo, com os marcadores {AAAA}, {AA}, {CC} e {NNN}. Exigem uma sequência e o ano. Sem ciclos, {CC} vale 01. Mudar o formato não altera códigos já emitidos;
  - de qual lote sai cada garrafa;
  - recipiente vazio fica "aguardando higienização" (ligado por padrão);
  - antecedência dos avisos de validade (padrão: 60, 30 e 7 dias).
  - A página leva também aos parâmetros com tela própria. Os do laboratório, das aprovações e dos bloqueios chegam com o ciclo que os usa.
- **Passagem de bastão e troca de e-mail (bloco 7):**
  - o link do bastão funciona como o do convite: quem tem cadastro confirma a senha, quem não tem se cadastra. Com a sessão do escolhido aberta, basta aceitar;
  - recusar só exige o link, que prova o acesso ao e-mail;
  - se o Master mudar ou o escolhido perder o acesso depois do pedido, o aceite é recusado;
  - na troca pelo suporte, o comprovante é obrigatório e fica anexado ao pedido. Perfil vazio inativa o acesso do Master anterior;
  - a troca de e-mail pede a senha atual. A confirmação é um clique na página do link, não a abertura do link: leitores de e-mail abrem links sozinhos.

## Roteiro do ciclo 3

**Aprovado em 03/10/2026**, logo depois da publicação do ciclo 2. Segue cantina.md e as seções 2.5, 4 e 5 do modelo de dados.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Motor do livro | Lote de produção, livro de volumes, genealogia, composição por recipiente (versões), operação e linhas, consumo de uva. Confirmação atômica com trava por recipiente, linha do tempo e bloqueios físicos (modelo, 4.3 e 4.4). Numeração na confirmação (P19). Testes com os exemplos 1 a 3 do modelo (5.4) |
| 2 | Regras versionadas | Regras regulatórias com vigência e fonte (P16) e ocorrência com "ciente" auditado (P29). Regras iniciais: fornecedor irregular no SIVIBE, rendimento acima de 4/5, varietal e safra no rótulo |
| 3 | Projeto de vinho | Cadastro, situações, variedades previstas, etapas dos lotes, plano com insumos previstos, modelos de plano com dias relativos; lista e ficha em abas |
| 4 | Propriedades e parcelas | Cadastro mínimo do vinhedo próprio e do produtor (número do SIVIBE, parcelas com variedade) |
| 5 | Recepção | Romaneio em rascunho até a confirmação, itens por variedade, várias pesagens, origem, titular, nota fiscal, transporte e opcionais; importação do XML da nota |
| 6 | Desengace e prensagem | Desengace/esmagamento consumindo um ou mais romaneios, com litros estimados; prensagem a partir do recipiente ou direta da uva, com frações, destinos, ajuste de prensagem, rendimento real e resíduos |
| 7 | Consultas | Recipiente (saldo, lote, composição, movimentos), lote (partes, composição, genealogia, etapas, o que o rótulo pode declarar) e as abas Recepções e Operações do projeto |
| 8 | Entrega | Publicação e lista do que testar |

**Decidido em 03/10/2026 (João Carlos):**
- **Lançamento retroativo** que muda a composição de um recipiente com operação posterior: **bloqueia** e pede o estorno das posteriores (modelo, 5.5).
- **Desengace com vários destinos:** o usuário pode indicar quanto de cada item do romaneio vai para cada recipiente; sem indicação, todos recebem a mesma mistura (modelo, 5.2).
- **XML da nota na recepção:** preenche o romaneio, a nota fica guardada com o arquivo, e o sistema lembra qual variedade corresponde a cada produto do fornecedor (como na P11).
- **Decisões do ciclo 2** (rendimento, ficha de embalagem, avisos, ciclo 01, bastão, troca de e-mail): aceitas ao seguir para o ciclo 3.

**Fica para o ciclo 4, como já previsto:** rascunho e estorno de operações, adição de insumo (inclusive no desengace), trasfega, corte, atesto, perdas, inventário e painel de recipientes.

## Roteiro do ciclo 4

**Aprovado em 03/10/2026**, com as respostas abaixo. Segue cantina.md (Operações, Fermentação, Inventário, Trasfega e corte, Recipientes) e as seções 2.4, 2.5, 4 e 5 do modelo de dados.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Rascunho e estorno | Toda operação (inclusive desengace e prensagem do ciclo 3) pode ser salva em rascunho, retomada, descartada ou confirmada; no rascunho não mexe em volume nem em estoque. Estorno com motivo e data original: lançamentos inversos, uva volta ao saldo a processar, composição de cada recipiente volta à versão anterior, lote criado pela operação fica sem saldo. Operações dependentes listadas e estornadas antes, da mais nova para a mais antiga (modelo, 4.5 e 5.5) |
| 2 | Trasfega e perda | Várias origens e destinos do mesmo lote; litros que chegaram; perda (borra) com "esvaziar origem" e valor corrigível; método (lista configurável). Destino com outro lote: aviso de mistura, incorporar ou lote novo, e sugestão de corte quando as composições diferem. Perda avulsa com motivo (vazamento, descarte, amostra…) |
| 3 | Corte | Lotes de origem com os litros de cada um, um ou mais destinos, incorporar ou lote novo. Prévia da composição e do que o rótulo pode declarar (varietal e safra). Lote novo com vinhos de projetos diferentes cria projeto novo; projeto de origem sem saldo encerrado como "incorporado ao projeto X". Titulares diferentes: bloqueio |
| 4 | Atesto | Atesto em lote: uma origem, várias barricas, com os litros de cada uma; evaporação lançada em cada barrica igual aos litros repostos, corrigível. Atesto com outro lote: incorporar ou lote novo. Relatório de evaporação por barrica e período |
| 5 | Livro de estoque de insumos | Lote de item (código, fabricação, validade), movimentos por local, saldo, entrada manual (com número da nota, sem XML) e ajuste. Saldo negativo de insumo aceito com alerta e pendência de estoque, resolvida quando o saldo volta a zero ou mais (modelo, 2.4). A entrada pelo XML da NF-e continua no ciclo 5 |
| 6 | Adição de insumo, chaptalização e tratamentos | Adição avulsa ou dentro de outra operação (desengace, trasfega, atesto): item, lote (obrigatório se o item controla lote), dose, volume tratado, hora, temperatura; baixa do lote do insumo; lote vencido alerta; insumo não estocado com descrição livre. Consulta inversa: em quais lotes de vinho entrou o lote X do insumo Y. SO₂ acumulado com alerta a 300 mg/L (IN Anvisa 211/2023). Chaptalização: açúcar e lote, ganho estimado em % vol, alerta pelo limite da classe (regra versionada, "Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA"), parte marcada como chaptalizada, com a marca viajando com os litros. Tratamentos (clarificação, filtração, estabilização) com insumos, perdas e parâmetros técnicos configuráveis |
| 7 | Fermentações | Alcoólica e malolática: início e fim por lote; leituras de densidade e temperatura com curva; sugestão de fim por critério configurável (padrão: 3 leituras iguais abaixo de 0,995), confirmada pelo enólogo |
| 8 | Inventário da cantina | Tela de contagem com todos os recipientes e o volume do livro; o cantineiro digita o medido; os ajustes das diferenças saem de uma vez, com motivo, numa só operação; permissão específica (P27) |
| 9 | Painel de recipientes e higienização | Ocupação de cada recipiente: lote, volume, % da capacidade, etapa, dias no recipiente, situação; filtros por localização, tipo e situação; atalhos para registrar operações. Recipiente que esvazia passa a "aguardando higienização" (parâmetro do ciclo 2). Higienização e manutenção como operação sem volume, que devolve o recipiente a "ativo" |
| 10 | Entrega | Migrações consolidadas, publicação e lista do que testar |

**Decidido em 03/10/2026 (João Carlos):**
- **Livro de estoque de insumos no ciclo 4** (bloco 5): lotes de item, movimentos, entrada manual e ajuste. Evita lançar as baixas depois, com data passada. A entrada pelo XML da NF-e continua no ciclo 5.
- **SO₂ adicionado** (bloco 6): o cadastro do insumo ganha o **teor de SO₂ (%)** (ex.: metabissulfito de potássio, cerca de 57%). Cada adição soma mg/L na parte do lote, e o acumulado viaja com os litros, em média ponderada, como a composição. Alerta ao passar de 300 mg/L (IN Anvisa 211/2023). É o adicionado, não o medido: o SO₂ total medido entra com o laboratório (ciclo 5).
- **Leituras da fermentação no ciclo 4** (bloco 7): densidade e temperatura, na tabela de análise do modelo (2.5, Análise), que o ciclo 5 completa.
- **Inventário acima do limite** (bloco 8): aviso com "ciente", e só confirma quem tem a permissão de ajuste de inventário. O fluxo de aprovação (P27) fica para 2027.
- **Tratamentos e higienização no ciclo 4** (blocos 6 e 9), com o recipiente vazio passando sozinho a "aguardando higienização" quando o parâmetro estiver ligado.
- **Granel** (entrada e saída, com GLT) no ciclo 5, junto com as saídas.

**Decisões técnicas deste roteiro (seguem o modelo; o João Carlos pode rever):**
- **Mês fechado:** o fechamento mensal chega no ciclo 6. Até lá, a data de execução não tem trava de período; a trava e a ação "reabrir período" entram com o fechamento.
- **Resumo de saldo por recipiente** (modelo, 4.4, proposta técnica): só se o painel ficar lento com os dados de demonstração. O livro continua sendo a fonte da verdade.
- **Estorno do estorno não existe:** errou o estorno, lança-se a operação de novo (P13).
- **Rascunho (bloco 1):** o rascunho guarda o formulário da tela como foi deixado, com data, projeto e observação à parte para a lista. A validação completa é na confirmação; confirmado, o rascunho vira a operação, com o mesmo identificador.
- **Composição depois do estorno (bloco 1):** as versões criadas pela operação estornada deixam de valer, e a versão gravada pelo estorno (igual à anterior, modelo 5.5) fica como registro da volta. Assim, estornos sucessivos nunca deixam vigente uma composição de operação já desfeita.
- **Estorno do romaneio (bloco 1):** só sem uva processada; com uva processada, o sistema lista as operações a estornar antes. A nota ligada volta à conferência, para o romaneio certo. O romaneio guarda quando, quem e o motivo.
- **Trasfega (bloco 2):** com várias origens, cada destino recebe a mistura delas na proporção do que saiu de cada uma. Os litros que saíram precisam fechar com os que chegaram; a diferença se lança como borra na origem. Com "esvaziar", a borra é a sobra do recipiente na data da execução; para corrigir, desmarca-se "esvaziar" e digita-se a borra. Origens de lotes diferentes, ou destino com lote de outro projeto, vão para o corte (bloco 3).
- **"É corte" (bloco 2):** na mistura com outro lote, o enólogo marca "registrar como corte"; a operação guarda a marca (modelo, 2.5, Operação: "é corte"). Sem a marca e com composições diferentes, o sistema pede "ciente" da sugestão.
- **Corte (bloco 3):** cada destino recebe a mistura das origens e incorpora ao lote que já está nele, a um lote das origens (destino vazio) ou forma lote novo. Todos os vínculos da genealogia são de corte. A prévia mostra, por lote que recebe vinho, a composição e o que o rótulo pode declarar, incluindo as partes do lote que a operação não toca.
- **Projeto novo do corte (bloco 3):** o nome é informado na tela; a safra e o ciclo são os predominantes nos lotes novos; o "projeto de origem" é o que mais contribuiu em litros, e o enólogo vem do responsável ou desse projeto. Os projetos de origem sem saldo se encerram "incorporados ao projeto X"; o estorno do corte reabre-os e cancela o projeto novo, que fica sem saldo.
- **Trasfega entre projetos (bloco 3):** a trasfega pode incorporar vinho de outro projeto ao lote do destino (fica no projeto do destino); lote novo que juntaria projetos diferentes exige o corte.
- **Hora da execução (bloco 3):** o campo vai até o minuto; se o minuto escolhido é o atual, vale o instante atual, para a operação não ficar antes de outra lançada segundos antes.
- **Atesto (bloco 4):** uma origem para várias barricas. A evaporação de cada barrica é lançada antes da entrada do vinho, igual aos litros repostos, e pode ser corrigida (inclusive para zero, com alerta de capacidade). Barrica com outro lote: o padrão é incorporar ao lote da barrica. O relatório de evaporação fica em EnoTrace › Relatórios, por recipiente e período, pela data da execução, sem as operações estornadas.
- **Estoque (bloco 5):** o saldo é por item e local; o local de estoque é do módulo do item (Configurações › Locais, "módulo do estoque"). O lote do fabricante é único por item e estabelecimento: o mesmo código reaproveita o lote. Lote "vencendo" é o que vence dentro da maior antecedência dos avisos de validade (Parâmetros, padrão 60 dias). Os movimentos lançados juntos (uma entrada inteira, uma transferência) formam um lançamento, que se estorna inteiro, com a data original; o consumo das operações se estorna com a operação. A pendência de saldo negativo é por item e local. Inventário do estoque (contagem) fica para quando o estoque ganhar a NF-e, no ciclo 5; até lá, o ajuste lança a diferença.
- **Insumos (bloco 6):** o insumo pode ser lançado em qualquer operação; sem recipiente escolhido, vai para os destinos dela. A dose em g/hL, mg/L, g/L ou mL/hL é multiplicada pelo volume tratado (padrão: o do recipiente depois da operação); em g, kg, mL, L ou un, é a quantidade total. A quantidade baixa do lote do insumo no local de estoque (o único do EnoTrace, ou o escolhido). O estorno da operação devolve o insumo ao estoque.
- **SO₂ (bloco 6):** o SO₂ adicionado é a quantidade × o teor de SO₂ do cadastro do insumo ÷ o volume tratado, somado na parte do lote e levado com os litros (média ponderada) nas trasfegas, cortes e atestos. O alerta de 300 mg/L (IN Anvisa 211/2023) pede "ciente". A fonte da regra registra que a data de publicação da IN no DOU deve ser conferida.
- **Chaptalização (bloco 6):** ganho estimado de 1% vol a cada 17 g/L de açúcar. O limite vem da classe e da cor do projeto (regras "chaptalizacao_maxima_<classe>[_<cor>]"); sem classe no projeto, o sistema avisa que não conferiu. Uma chaptalização por recipiente.
- **Tratamentos (bloco 6):** tipos na lista "tipo_tratamento" (clarificação, filtração, estabilização tartárica e proteica, centrifugação, outro); os parâmetros técnicos de cada tipo se configuram em Parâmetros técnicos › Tratamentos, e os obrigatórios são exigidos na confirmação.
- **Fermentações (bloco 7):** a fermentação é do lote; começa e termina por uma operação sem volume, lançada no recipiente onde o lote está, e o estorno do fim a reabre. As leituras vão para a tabela de análise do modelo (2.5), como análise interna do lote; o laboratório do ciclo 5 usa a mesma tabela. A sugestão de fim (só na alcoólica) aparece quando as últimas N leituras de densidade são iguais em três casas e abaixo do máximo (padrão: 3 leituras, 0,995 g/mL; Configurações › Parâmetros). Densidade e temperatura ficam em gráficos separados.
- **Fora do ciclo 4:** simulador de corte e aprovações (2027), transferência de titularidade, granel (ciclo 5).

## Roteiro do ciclo 5

**Montado e decidido pelo Claude em 03/10/2026**, com a autorização do João Carlos para seguir sem esperar respostas ("fique à vontade para decidir por mim"). Todas as decisões abaixo podem ser revistas; estão também em [PENDENCIAS.md](PENDENCIAS.md), ponto 17. Segue cantina.md (Análises, Laboratório, Granel e GLT, Engarrafamento, Lote comercial, Saídas), ambiente-cliente.md (Estoque, Entrada por NF-e) e o modelo, 2.4 e 2.5.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Laboratório básico | Análise interna e laudo externo de um lote (e recipiente), com os parâmetros que a empresa mede; valor digitado em outra unidade é convertido e o original fica guardado; fora da faixa da empresa (ou do projeto) fica marcado. Pedido de análise externa (amostra com código, coletada → enviada → laudo recebido, prazo pelo laboratório, laudo anexo). Laboratório = pessoa com papel "laboratório" e credenciamento. Histórico do lote por parâmetro, com curva |
| 2 | NF-e no estoque | Importar o XML da nota de compra em EnoTrace › Estoque; conferência: cada item da nota associado a um item do estoque (sugerido pela associação memorizada), conversão para a unidade base, local, lote e validade (do grupo de rastreabilidade do XML, quando houver), ou descartado; lançar gera as entradas; estorno da nota inteira |
| 3 | Granel | Entrada de granel (compra, retorno de terceiro, outra) num recipiente, com a composição informada, e saída de granel (venda, remessa, devolução ao titular, outra), com nota, remetente ou destinatário, transportador, embalagem e GLT; saída sem GLT pede "ciente" |
| 4 | Engarrafamento | Pronto para envase no projeto, com garrafas e materiais previstos e o que falta no estoque; ordem de engarrafamento (planejada, em execução, encerrada, cancelada) com formatos e recipientes de origem; produção parcial por dia (litros dos recipientes, perda de vinho, garrafas por formato, materiais previsto × real); lote comercial `L26-0001` com a composição dos recipientes engarrafados; alerta de laudo fora do teor declarado (±0,5% vol) e de laboratório sem credenciamento |
| 5 | Saídas | Saída manual (venda, degustação e cortesia, quebra e avaria, consumo interno, doação: lista configurável) e pela importação do XML da nota de venda (NF-e ou NFC-e), com associação memorizada dos itens aos produtos; baixa por lote (lote do documento, mais antigo primeiro, escolha ou sem lote, pelo parâmetro "De qual lote sai cada garrafa"); devolução ao lote de origem ou como avariada; relatório de recolhimento ("quem recebeu o lote X") |
| 6 | Entrega | Migrações consolidadas, lista do que testar e publicação |

**Decisões deste roteiro (Claude, 03/10/2026; o João Carlos pode rever):**
- **Ordem dos blocos:** o laboratório vem primeiro porque o engarrafamento usa o laudo (alerta do teor alcoólico).
- **Laboratório:** a análise interna e o laudo usam a mesma tabela de análise do ciclo 4. As conversões de unidade ficam numa tabela no código, com a fonte: acidez total em g/L de ácido tartárico (1 mEq/L = 0,075 g/L), acidez volátil em g/L de ácido acético (1 mEq/L = 0,060 g/L), pressão em bar (1 atm = 1,01325 bar). A faixa vale pelo nível mais específico (lote, projeto, empresa). **Ficam para depois:** importação de planilha de laudo (P23), análise pendente por periodicidade e o alerta na central (a central chega no ciclo 6; até lá, o laudo atrasado aparece marcado na lista).
- **NF-e no estoque:** a nota de uva continua na recepção; a do estoque é de insumos, embalagens e outros itens do EnoTrace. O emitente vira pessoa com papel "fornecedor", como na recepção. Item sem associação e não descartado impede lançar a nota. Busca na SEFAZ com certificado A1 continua fora (fase fiscal). Implementado no bloco 2: a conversão é sugerida quando a unidade da nota e a do item são da mesma grandeza (KG → g = 1000); nas outras (caixa, fardo), o usuário informa. O local é por item e memorizado com a associação. Item com mais de um lote na nota entra pelo primeiro, com aviso para ajustar. O estorno da nota devolve-a à conferência (para corrigir e lançar de novo), como o estorno do romaneio; a entrada da nota não se estorna pelo lançamento avulso do estoque.
- **Granel:** a composição do vinho que entra é informada na tela (variedades e %, safra) e entra como origem "granel"; sem ela, "não informada". Entrada sempre forma lote novo ou incorpora a um lote existente do mesmo titular, como as outras operações. O retorno de terceiro a granel é uma entrada de granel com o tipo "retorno de terceiro". **Confirmação de recebimento** é uma marca na entrada, com data (a confirmação da chegada na GLT), que se marca ou desmarca depois, na ficha da operação. Implementado no bloco 3: a lista de variedades da composição é a das variedades em uso da empresa; o remetente e o destinatário podem ser qualquer pessoa cadastrada; o titular, um cliente de vinificação. Na devolução ao titular, avisos quando o vinho é da própria empresa ou o destinatário não é o titular.
- **Engarrafamento:** a ordem não reserva estoque. Cada produção parcial é uma operação "engarrafamento" no livro de volumes (sai do recipiente; o estorno devolve). O produto acabado entra no local de estoque escolhido, com um lote de item por formato com o código do lote comercial. Materiais: previsto pela ficha de embalagem e real editável; o consumo baixa no local escolhido e aceita saldo negativo com pendência (como os insumos). **Ficam para 2027:** selos de IG, espumante tradicional (tiragem e garrafas em processo) e engarrafado por prestador com contrato. Implementado no bloco 4:
  - o lote comercial nasce na **primeira produção** da ordem (o ano do código é o do envase), não na criação da ordem;
  - a produção informa os **litros tirados** de cada recipiente e as garrafas; a **perda de vinho** é a diferença (tirado − engarrafado) e fica na produção. No livro de volumes vai um lançamento "engarrafamento" pelo total tirado. Garrafas que somam mais que o tirado bloqueiam (impossível);
  - a ordem tem um local para o produto acabado e outro para os materiais; o prestador é uma pessoa com o papel "engarrafadora";
  - o laudo conferido é a análise mais recente do lote com a graduação alcoólica; a empresa liga o bloqueio em Configurações › Parâmetros › Envase (padrão: alerta). A classificação quanto ao açúcar fica para quando o laudo tiver os parâmetros de açúcar ligados ao rótulo;
  - a situação do projeto anda sozinha: ordem aberta → "envase planejado"; sem vinho → "engarrafado"; sem ordem aberta e com vinho → "pronto para envase";
  - a ordem com produção não se cancela (estorna-se cada produção pela operação, ou encerra-se).
- **Saídas:** a transferência entre estabelecimentos fica para depois (a vinícola tem um estabelecimento); entre locais, já existe no estoque. Comprador identificado é dado da saída, não vira cadastro (LGPD, P21). Implementado no bloco 5:
  - a saída é só de **produto acabado**; insumos e embalagens saem pelo Estoque (ajuste, descarte). O tipo "transferência" da lista não é aceito como saída: para mover entre locais, Estoque › Transferência;
  - o produto acabado não fica negativo **nem no lote**: saída maior que o saldo do lote no local bloqueia;
  - "sem lote" (pelo parâmetro) pede "ciente" com o aviso do recall; o relatório de recolhimento avisa quantas saídas do mesmo produto foram sem lote desde o envase;
  - a **devolução** parte da saída: cada baixa volta ao mesmo lote, no local escolhido (o de venda ou um local de avariadas), até o que saiu. A importação do XML da nota de devolução fica para depois; a saída com devolução não se estorna;
  - a **nota de venda** usa a mesma conferência da nota de compra (Saídas › Notas de venda): cada item vai a um produto acabado, com a conversão (caixa com 6 = 6), o local e o lote da nota; a associação fica memorizada pelo código do produto no emissor da própria vinícola. Emitente que não é a vinícola gera aviso.

## Roteiro do ciclo 6

**Montado e decidido pelo Claude em 04/10/2026**, com a autorização do João Carlos para seguir sem esperar respostas. As decisões podem ser revistas ([PENDENCIAS.md](PENDENCIAS.md), ponto 18). Segue P20 (Central de alertas), P23 (Importação), cantina.md (Declarações e fechamento; Carga inicial; Lote comercial, Relatório de história) e o modelo, 2.2 (Alerta), 2.5 (Fechamento mensal) e 3 (Importação).

| # | Bloco | O que entra |
|---|---|---|
| 1 | Central de alertas | Alertas abertos por chave, que se resolvem sozinhos quando a causa some: documentos vencendo e vencidos, lotes de estoque vencendo e vencidos, estoque mínimo, saldo negativo de insumo, laudo atrasado, higienização vencida, saída a granel sem GLT, fim de fermentação provável, etapa do plano atrasada, prazo da declaração anual. Sino com contador e painel na barra superior; tela Alertas com filtros; "marcar como lido" por usuário; cada alerta com link para o registro e visível só a quem vê a tela de origem (P27) |
| 2 | Carga do saldo de abertura | Importação por planilha (P23), tudo ou nada, com modelo para baixar e relatório de erros por linha antes de gravar: granel (recipiente, projeto, lote, litros, composição), garrafas (produto e formato, lote comercial, local, quantidade) e insumos e embalagens (item, local, lote, validade, quantidade). Tudo marcado "carga inicial", ligado à importação, com estorno enquanto não houver movimento posterior |
| 3 | Fechamento mensal | Lista de conferência do mês (rascunhos, notas em conferência, saídas sem lote, pendências de estoque negativo, laudos atrasados, alertas abertos); o mês não fecha com pendência de estoque aberta (P29). Relatório do mês: granel (estoque inicial, entradas, saídas, final) e produto acabado por produto e formato, em garrafas e litros, base da declaração mensal (Lei 7.678/1988, art. 31). Mês fechado trava os lançamentos com data nele (operações, recepção, estoque, saídas); reabrir pede a permissão própria, com motivo (P27) |
| 4 | História do lote | Relatório para a fiscalização e o recolhimento, a partir do lote comercial, do lote de produção ou do projeto: recepções e uvas de origem, operações e recipientes, insumos aplicados, análises e laudos, cortes e genealogia, envases e saídas. Página para imprimir ou salvar em PDF pelo navegador |
| 5 | Ensaio geral e entrega | Roteiro de virada para 01/01/2027 (recriar a base, carga de abertura, perfis, conferências); migrações do ciclo consolidadas; lista do que testar; publicação |

**Decisões deste roteiro (Claude, 04/10/2026; o João Carlos pode rever):**
- **Alertas:** calculados a partir dos dados (não há tarefa agendada no servidor ainda): a central refaz a varredura quando alguém a abre, no máximo a cada poucos minutos por empresa. Um alerta por chave (ex.: um por documento); resolve-se sozinho quando a causa some. **Canais:** só na tela neste ciclo; e-mail, WhatsApp e SMS ficam para 2027 (a camada plugável de envio, P20). **Quem recebe:** todos os usuários que veem a tela de origem; a configuração de destinatários e antecedências por tipo (2.2, Configuração de notificação) fica para 2027, com as antecedências já existentes em Parâmetros. Alertas de "limite legal ultrapassado" e "leitura fora da faixa" continuam no momento do lançamento (o "ciente"), sem item na central.
- **Saída a granel sem GLT:** a GLT pode ser informada depois, na ficha da operação; o alerta some quando ela é informada.
- **Planilha:** CSV (separado por ponto e vírgula, como o Excel em português salva), com modelo para baixar. Projeto que não existe é criado pela carga, com o nome da planilha; a composição do granel vem em linhas (uma por variedade e safra).
- **Fechamento:** por estabelecimento e mês; fecha quem tem a ação "confirmar" em Fechamento e declarações (RT e Master por padrão). Análises, cadastros e anexos não são travados (não são lançamentos de volume ou estoque). O relatório do mês fica guardado como instantâneo no fechamento. Fluxo de aprovação da reabertura: fica para 2027 (como as demais aprovações); por ora, reabrir exige a permissão e o motivo, auditado.
- **História do lote:** em tela, com versão para impressão; o PDF sai pela impressão do navegador.
- **Virada:** o roteiro de 01/01/2027 fica em [virada-2027.md](virada-2027.md).

## Roteiro do ciclo 7: declarações (2027, item 2, adiantado)

**Montado e decidido pelo Claude em 04/10/2026**, com a autorização do João Carlos para seguir enquanto os testes dos ciclos 4 a 6 ficam acumulados. As decisões podem ser revistas ([PENDENCIAS.md](PENDENCIAS.md), ponto 19). Segue cantina.md (Declarações e fechamento; Vinificação para terceiros), o modelo, 2.5 (Declaração, Retificação) e a pesquisa de declarações (2.3 e 2.4). A primeira declaração anual pelo sistema é a de 2027, entregue de 1º a 10/01/2028.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Relatório da declaração anual | Números do ano civil por estabelecimento (Portaria MAPA 615/2023, art. 4º): **estoque em 31/12 do ano anterior, produção do ano e estoque em 31/12**, mais a conta que liga um ao outro (outras entradas, saídas, perdas e ajustes). Duas partes: **granel** (vinho e mosto nos recipientes, por titular, classe e cor do projeto) e **engarrafado** (por titular, marca, produto, classe e registro no MAPA, em litros e garrafas). Vinho de terceiros separado por cliente e marca (art. 5º). Avisos: meses não fechados, produto sem registro no MAPA, projeto sem classe, variedade sem código oficial na uva recebida ou no vinho em estoque em 31/12 |
| 2 | Declaração entregue e ano travado | "Marcar como entregue" pede o protocolo do gov.br (e o recibo em anexo, opcional), guarda o instantâneo dos números e **trava o ano** como um mês fechado (nenhum lançamento com data nele). **Retificação registrada:** abrir pede a permissão de reabrir período e o motivo, e destrava o ano; concluir pede o novo protocolo e guarda os novos números. O alerta do prazo passa a ser por estabelecimento e some quando a declaração do ano é marcada |
| 3 | Apoio ao SIVIBE | Relatórios da uva do ano (vindima = ano civil, IN MAPA 59/2020, art. 8º, redação da Portaria MAPA 824/2025): **uva própria** por propriedade, parcela e cultivar (com o código oficial e a área); **uva comprada** por fornecedor (número no SIVIBE, situação do cadastro, cultivar, kg, notas); **uva de terceiros** (vinificação para terceiro) por dono. Aviso de fornecedor sem número no SIVIBE ou sem a declaração do ano anterior (IN 59/2020, art. 13) |
| 4 | Tela de declarações | EnoTrace › Declarações: escolha do ano, abas "Declaração anual" e "SIVIBE", situação (não entregue, entregue, em retificação, retificada) e retificações, impressão pelo navegador e planilha CSV de cada tabela |
| 5 | Entrega | Migrações do ciclo consolidadas; lista do que testar; publicação |

**Situação:** os cinco blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-7.md](entregas/ciclo-7.md)).

**Decisões deste roteiro (Claude, 04/10/2026; o João Carlos pode rever):**
- **Produção do ano:**
  - no granel, é o vinho elaborado no ano: os litros que entram nos recipientes pelo desengace e pela prensagem (entrada de mosto). Granel comprado, carga inicial e retorno não contam como produção (vão em "outras entradas");
  - no engarrafado, são os litros engarrafados no ano. O vinho engarrafado sai do granel na linha "engarrafado".
- **Estornos** contam no tipo da operação original: um desengace estornado não soma na produção.
- **Agrupamento:** o granel vai por titular, classe e cor do **projeto** (o vinho ainda não tem produto); o engarrafado vai pelo produto. Projeto sem classe aparece como "sem classe", com aviso.
- **Meses não fechados** pedem "ciente" para marcar a declaração (o sistema informa, não impede, P29).
- **Ano declarado:** trava os mesmos lançamentos que o mês fechado. A retificação reabre o ano inteiro até ser concluída, com auditoria.
- **Formulário do gov.br:** os números saem na ordem do art. 4º. A ordem exata dos campos do formulário será conferida com o João Carlos na primeira declaração (ponto 19).
- **Uva enviada para processamento por terceiros** ("vinho cigano", entrega simples): o relatório entra junto com a vinificação para terceiros completa (2027, item 5), porque o registro da entrega ainda não existe.
- **Formato:** tela, impressão pelo navegador e CSV. Não há envio automático: o gov.br e o SIVIBE são formulários web sem API pública.

## Roteiro do ciclo 8: autocontrole, aprovações, diário e relatórios agendados (2027, item 3)

**Proposto pelo Claude e decidido pelo João Carlos em 04/10/2026.** Segue gestao.md (Autocontrole), P27 (Fluxo de aprovação), P20 (Central de alertas), ambiente-cliente.md (Diário) e o modelo, 2.2 (Controle e evidência de autocontrole, Nota do diário, Relatório agendado, Regra e solicitação de aprovação).

| # | Bloco | O que entra |
|---|---|---|
| 1 | Autocontrole | Gestão › Documentos › Autocontrole, por estabelecimento (Decreto 12.709/2025, arts. 117 a 120). O programa começa com os **controles da norma**, que o cliente inclui, altera ou inativa (P29): fornecedores, água, pragas, higienização, manutenção, temperatura, produtos químicos, treinamento, reclamações e recolhimento. Cada controle tem periodicidade, responsável e evidências (data, quem fez, descrição, anexos). A higienização de recipientes e as leituras de temperatura viram **evidência automática**. Controle atrasado gera alerta |
| 2 | Aprovações | A empresa escolhe quais ações exigem aprovação (P27). A ação pedida fica "aguardando aprovação" na tela Gestão › Aprovações até alguém com a ação "aprovar" aprovar ou recusar (a recusa pede motivo). Quem pode aprovar recebe alerta na central. Tudo fica na auditoria |
| 3 | Diário | Notas datadas por estabelecimento, com autor, texto, anexos e vínculo opcional a projeto, recipiente ou parcela. As notas aparecem na ficha do que foi vinculado. Base da etapa 2 da declaração de uvas no SIVIBE ("condições que afetaram a produtividade"). O uso sem internet fica para o item 7 |
| 4 | Relatórios agendados e e-mail | Primeira tarefa periódica do sistema. Cada usuário agenda relatórios por e-mail (semanal, quinzenal ou mensal), sempre com as permissões dele no momento do envio (P27). O resumo dos alertas por e-mail é opcional, por usuário (P20); WhatsApp e SMS ficam para o item 6 |
| 5 | Entrega | Migrações do ciclo; lista do que testar; publicação |

**Decidido pelo João Carlos em 04/10/2026 (ponto 20):**
1. **Ações que podem exigir aprovação:** ajuste de inventário acima do limite, estorno de operação, reabertura de mês e abertura de retificação da declaração. Todas desligadas por padrão; a empresa liga as que quiser.
2. **Como se aprova:** a tela de aprovações é uma **lista de pendências com uma caixa de marcar ao lado** de cada uma. Marcou, está aprovada e sai da tela. A recusa fica como ação secundária, com motivo.
   - Aprovada, a ação é feita na hora, com os dados do pedido. Se algo mudou nesse meio-tempo, a ação não é feita e quem pediu é avisado.
   - Quem pediu não aprova o próprio pedido, exceto o Master.
3. **Relatórios agendáveis:** todos os propostos:
   - resumo dos alertas abertos;
   - relatório do mês;
   - painel da cantina;
   - estoque abaixo do mínimo e lotes vencendo.

   O e-mail leva o resumo e o link para o relatório no sistema.
4. **Autocontrole totalmente maleável e configurável:**
   - o modelo da norma é só o ponto de partida, com periodicidades sugeridas;
   - o cliente inclui, altera, inativa e muda a periodicidade de qualquer controle, em dias, semanas, meses ou "sob demanda";
   - o cliente escolhe o responsável e se o controle recebe evidência automática (higienização ou temperatura).

**Situação:** os cinco blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-8.md](entregas/ciclo-8.md)).

**Decisões técnicas (Claude, 04/10/2026):**
- O modelo do autocontrole é uma lista no código, e as regras de aprovação são um parâmetro da empresa; nenhuma das duas tem tabela própria. O modelo de dados (03, 2.2) foi ajustado.
- A evidência automática do autocontrole não é copiada: é lida das higienizações confirmadas e das leituras de temperatura, e o estorno da operação a tira.
- O programa de autocontrole tem permissão própria ("Programa de autocontrole"). Lançar e anular evidências continuam na permissão "Autocontrole" (o cantineiro lança).
- Aprovar exige a ação "aprovar" em Aprovações.
- **Decidido pelo João Carlos em 04/10/2026 (ponto 21):** as duas permissões não vêm marcadas em nenhum perfil, nem nos perfis-modelo. Só o Master as tem, e ele atribui a quem quiser. A ação aprovada é feita com a permissão de quem aprovou, dentro de um ponto de retorno: se falhar, só ela é desfeita.
- **Relatórios por e-mail:** ficam em Preferências, por usuário. A frequência "todo dia" foi incluída para o resumo dos alertas, que faz as vezes do envio de alertas por e-mail (P20).

**Decisão técnica (Claude):** a tarefa periódica roda dentro do próprio serviço da API (uma única instância no servidor), sem `cron` nem serviço novo. Assim não precisa de comando com `sudo`. Se um dia houver mais de uma instância, ela passa para um serviço próprio.

## Roteiro do ciclo 9: simulador de corte, espumante na garrafa, selos de IG e álcool etílico (2027, item 4)

**Proposto pelo Claude e decidido pelo João Carlos em 04/10/2026** (ponto 22). Segue cantina.md (Trasfega e corte, Simulador de corte; Espumantes; Engarrafamento, Selos de indicação geográfica; Fermentação, chaptalização, álcool e atesto, Livro de álcool etílico) e o modelo (2.4 e 2.5). O cadastro já tem as marcas "controla numeração" (selos) e "é álcool etílico" no item de estoque.

| # | Bloco | O que entra |
|---|---|---|
| 1 | Simulador de corte | No projeto: o enólogo escolhe lotes e proporções e vê a composição resultante (variedade, safra, orgânica, IP) e o que o rótulo pode declarar (varietal ≥ 75%, ou ≥ 85% na IP; safra ≥ 85%), **sem mexer no volume**. As simulações ficam salvas, com data e autor. A aprovada vira o corte já preenchido, com os litros conferidos com os saldos do momento |
| 2 | Livro de álcool etílico | Lei 7.678/1988, art. 29, §3º. O álcool entra no estoque como insumo marcado "é álcool etílico", com nota e lote, e cada uso numa operação baixa o lote. O relatório **Livro de álcool etílico** lista entradas e usos. Cada entrada gera o alerta **comunicar ao MAPA**, que some quando a comunicação é registrada (data e protocolo) |
| 3 | Espumante na garrafa (tradicional e ancestral) | O vinho-base sai do recipiente na **tiragem** para as **garrafas em processo**, um estoque por lote de tiragem e estágio. Estágios: repouso sobre borras, remuage, dégorgement, licor de expedição. Em cada estágio se registram a data, as garrafas e as perdas (quebradas). No fim, viram produto acabado com lote comercial, como no envase. Charmat e Asti seguem como hoje (autoclave é recipiente). As declarações continuam em litros (garrafas × formato) |
| 4 | Selos de IG | Selo numerado como item de estoque com numeração: entrada por faixa (do nº X ao Y). Cada produção do engarrafamento registra a faixa usada e os selos perdidos (com o número). Saldo e faixas disponíveis; numeração sem buraco nem repetição (integridade, P29) |
| 5 | Entrega | Migrações do ciclo; lista do que testar; publicação |

**Situação:** os cinco blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-9.md](entregas/ciclo-9.md)).

**Decidido pelo João Carlos em 04/10/2026 (ponto 22): o sistema é genérico e prevê todas as opções.**
- **Espumante:** todos os métodos. Tradicional e ancestral (pét-nat) com garrafas em processo, cada um com os seus estágios, numa lista configurável. Charmat e Asti em autoclave, que já é recipiente.
- **Simulador de corte:** em % sobre um volume desejado e direto em litros; os dois modos se alternam na mesma tela.
- **Selos de IG:** faixa digitada (do nº X ao Y) na produção do engarrafamento, com os perdidos pelo número.
- **Álcool etílico:** livro completo para quem usar (entradas, usos, alerta "comunicar ao MAPA" e registro manual da comunicação). Quem não usa não vê nada.

## Roteiro do ciclo 10: vinificação para terceiros e "vinho cigano" (2027, item 5)

**Proposto pelo Claude e decidido pelo João Carlos em 04/10/2026** (ponto 23). Segue cantina.md (Vinificação para terceiros e em terceiros; Granel e GLT; SIVIBE), o modelo (2.4, Terceirização) e a pesquisa [2026-10-elaboracao-por-terceiros.md](pesquisa/2026-10-elaboracao-por-terceiros.md). O tratamento fiscal (CFOP, ICMS, IPI) continua na fase fiscal ([FISCAL.md](FISCAL.md)).

**O que já existe:** o lote tem titular (própria ou para terceiro), a recepção registra o dono da uva, a mistura entre titulares é bloqueada, a entrada de granel tem o tipo "retorno de terceiro" e a saída de granel tem "devolução ao titular" (ciclo 5), a declaração anual separa o vinho de terceiros por cliente e marca (ciclo 7).

| # | Bloco | O que entra |
|---|---|---|
| 1 | Contrato de terceirização | Cadastro novo (EnoTrace › Terceiros › Contratos), IN MAPA 72/2018, art. 27: **sentido** (prestamos o serviço ou contratamos); **atividades contratadas** (elaboração, padronização, envase, guarda; uma ou mais, art. 25, §§4º e 6º); contraparte (pessoa), com o registro MAPA e a validade dele; **quem tem o registro do produto** (o contratante, "unidade central", ou a cantina com a marca do cliente; arts. 14 e 30); produtos e marcas; vigência; **preço em itens livres** (descrição, valor e unidade: serviço, armazenagem por mês, envase por garrafa…), só registrado; insumos de cada parte; **perda tolerada** (% ou rendimento mínimo em L/kg); pagamento em dinheiro e/ou **em produto, com a unidade explícita** (%, litros ou garrafas); **prefixo do lote comercial** (identifica quem elaborou quando o rótulo omite a cantina, art. 28, §2º); documento da Gestão e anexos (com a categoria nova "contrato"). **Texto do rótulo em três formas**, montado pelo sistema e **editável** (a base das expressões é um decreto revogado): "Produzido por [cantina], CNPJ X, para [cliente], CNPJ Y"; "Produzido (ou Padronizado) e envasilhado sob responsabilidade de" + nome e endereço da unidade central (art. 28); a cantina como produtora e o cliente como dono da marca. **Comunicação no SIPEAGRO** (data e protocolo; art. 27, caput e §1º). **Alertas:** contrato vencendo (60 dias) e vencido; registro da contraparte vencendo e vencido; quando prestamos o serviço, falta da via do contrato ou da cópia do certificado do produto anexadas (art. 27, §§2º e 3º: embaraço à fiscalização); quando a empresa tem o registro do produto e outro produz, comunicação no SIPEAGRO não registrada, e lembrete quando o contrato muda depois dela; padronizador contratando além do envase (art. 25, §6º). Na recepção e na entrada de granel de um titular, o contrato vigente é sugerido; sem contrato vigente, aviso com "ciente" (P29) |
| 2 | Transferência de titularidade | Operação nova da cantina, para a compra do vinho do cliente e o **pagamento em produto**: os litros passam do lote de um titular para um lote de outro (novo ou existente, do mesmo projeto), com genealogia e motivo (compra, pagamento do serviço, outro). **Total** no próprio recipiente, ou **parcial** para outro recipiente (parcial no mesmo recipiente misturaria titulares: bloqueado, P29). Para garrafas: transferência de titularidade no estoque de produto acabado, por lote comercial. O contrato mostra quanto o pagamento em produto prevê e quanto já foi transferido |
| 3 | Devolução, conta do cliente e insumos do cliente | **Entrada de granel "recebido do cliente para elaboração ou envase"** (mosto ou vinho do titular, para terminar ou só engarrafar). **Devolução ao titular engarrafada:** tipo de saída novo, com nota de retorno, baixando o lote comercial do titular; avisos quando o produto é da própria empresa ou o destinatário não é o titular. **Entrega por ordem do titular:** tipo de saída reconhecido (a cantina entrega direto ao comprador do cliente), sem o aviso de destinatário, com o titular que ordenou. **Prefixo do contrato** no código do lote comercial do titular. **Estoque de insumos do cliente:** entrada com o titular, saldo por titular, fora do estoque próprio, baixa por lote quando usado num lote desse titular (usar insumo de um titular no vinho de outro pede "ciente"), e **devolução ao cliente da sobra** (saída do estoque do cliente). **Conta do cliente** (relatório por titular e safra): uva, mosto e vinho recebidos, vinho elaborado, em elaboração e engarrafado em estoque, devolvido (granel e garrafas), retido como pagamento, **rendimento e perdas comparados com a perda tolerada do contrato** (acima dela, alerta), insumos do cliente (recebidos, usados, devolvidos, saldo) e o que falta devolver |
| 4 | Dossiê do lote para o cliente | Relatório de um lote de produção ou de um lote comercial de terceiro, exportável em PDF (impressão pelo navegador) e CSV, e **enviado por e-mail ao cliente** pelo sistema (registro de quando e para quem): contrato e texto do rótulo, recepção (uva, kg, notas de remessa), operações em ordem, análises, insumos e doses (com os do cliente), rendimento, recipientes, engarrafamento e devoluções. O dossiê gerado fica guardado (data e autor) |
| 5 | Produção em terceiro ("vinho cigano") | Lado de quem contrata. **Remessa para terceiro** (entrega simples): projeto, cantina, data, nota de remessa e itens de **uva** (variedade, kg e a origem: parcela própria, romaneio recebido ou fornecedor que entregou direto) ou de **mosto ou vinho a granel** (saída de granel dos recipientes, com GLT). **Remessa de insumos e embalagens** para a cantina (garrafas, rolhas, rótulos, selos): tipo de saída novo do estoque, com o **saldo em poder do terceiro**. **Retornos parciais**, vários para a mesma remessa, cada um com as perdas informadas pela cantina: nota de retorno, GLT no granel, dossiê da cantina anexado; itens a granel (litros, recipiente e lote, gerando a entrada de granel "retorno de terceiro") ou engarrafados (produto, formato, garrafas e o lote comercial informado pela cantina, gerando lote comercial com origem "retorno de terceiro" e a entrada no estoque). A composição do vinho que volta vem sugerida da remessa e pode ser corrigida. Por projeto: rendimento (litros ÷ kg) e **o que ainda está na cantina** (uva, mosto e vinho enviados menos o que voltou e as perdas; insumos em poder do terceiro). Relatório SIVIBE **uva enviada para processamento por terceiros**, que ficou de fora do ciclo 7 |
| 6 | Entrega | Migrações do ciclo; lista do que testar; publicação |

**Decidido pelo João Carlos em 04/10/2026 (ponto 23):**
- **Dossiê:** impressão em PDF e planilha CSV, e **envio por e-mail ao cliente** pelo próprio sistema, com o registro de quando e para quem foi enviado. O acesso do cliente com login fica para quando houver compartilhamento entre empresas.
- **Pagamento em produto:** o contrato calcula quanto cabe à cantina e a conta do cliente mostra o previsto e o já transferido; **o usuário registra a transferência de titularidade**, já preenchida com a sugestão. Nada é separado sozinho.
- **Insumos do cliente:** as duas formas. Continua a descrição livre sem baixa e passa a existir o **estoque de insumos do cliente**: entrada com o titular, saldo por titular, fora do estoque próprio, e baixa por lote quando usado num lote desse titular (usar insumo de um titular no vinho de outro pede "ciente"). Entra no bloco 3.

**Situação:** os seis blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-10.md](entregas/ciclo-10.md)).

**Completado em 04/10/2026** com a revisão das opções trazida pelo João Carlos de outra sessão (ponto 24): atividades contratadas, quem tem o registro do produto, três formas de texto do rótulo (editável), alertas da IN 72/2018 (cópia do certificado e do contrato, SIPEAGRO, padronizador, registro da contraparte), prefixo do lote comercial, granel recebido do cliente, devolução de insumos do cliente, entrega por ordem do titular, preço em itens livres, remessa de granel e de insumos e retornos parciais no vinho cigano. Fontes conferidas na [pesquisa](pesquisa/2026-10-elaboracao-por-terceiros.md). **Fica para a fase fiscal:** o prazo de 180 dias da industrialização por encomenda (RICMS-BA, art. 280, §1º, III). A zona de produção continua sem validação.

**Decisões técnicas propostas (Claude), sem pergunta:**
- O contrato não é obrigatório para nada: o titular continua podendo existir sem contrato, com o aviso.
- O preço do serviço fica só registrado; cobrança e contas a receber entram com a parte comercial e a fiscal.
- **Declaração anual de quem contrata:** o vinho que volta da cantina entra no estoque do estabelecimento do contratante, e a conta da declaração precisa fechar; entra como "outras entradas (retorno de terceiro)", numa linha própria. Pergunta ao RT registrada ([perguntas-externas.md](perguntas-externas.md), ponto 2 em aberto).
- O "acompanhamento próprio" (o produtor conduz o vinho na cantina do outro) continua como um projeto normal, com os recipientes num local externo, como já decidido; nada novo.

## Roteiro dos ciclos 11 e 12: parte comercial (2027, item 6)

**Proposto pelo Claude e aprovado pelo João Carlos em 04/10/2026.** As perguntas do ponto 25 foram respondidas no mesmo dia (abaixo). Segue administracao.md (Planos, adicionais e assinaturas; Faturas; Inadimplência e bloqueio; Período de teste; Suporte; Integração de pagamentos), ambiente-cliente.md (Módulos; Configurações › Assinatura e Notificações), o modelo (2.1) e as premissas P15, P20, P21, P25 e P28. O item é grande e fica dividido em dois ciclos: primeiro a assinatura e a cobrança, que funcionam sozinhas com a baixa manual; depois as integrações externas e o atendimento.

**O que já existe:** módulos, plano com módulos e limites de usuários e estabelecimentos (aplicados no convite e na criação de estabelecimento), assinatura simples (plano, periodicidade, vigência, teste), situação da empresa com histórico, travas de somente leitura e de bloqueio (`nucleo/permissoes.ts`), fila de envio com tentativas (só e-mail, pelo Resend), parâmetros da plataforma (prazos do teste e da tolerância), auditoria com as colunas da personificação.

### Ciclo 11: assinatura e cobrança

| # | Bloco | O que entra |
|---|---|---|
| 1 | Planos e adicionais | Na Administração: plano com **preço por periodicidade** (mensal, trimestral, semestral e anual), com vigência (mudar o preço não muda assinatura em vigor, P25), **formas de pagamento aceitas**, limite de armazenamento e situação. **Adicionais** (usuário, estabelecimento, armazenamento, módulo avulso) com preço por unidade e periodicidade |
| 2 | Assinatura completa | Itens adicionais com quantidade, **preço congelado** na contratação, dia de vencimento, forma de pagamento, **descontos** por cliente (valor ou %, motivo obrigatório, validade). **Limite efetivo = plano + adicionais**, aplicado a usuários, estabelecimentos e, agora também, ao armazenamento de anexos; módulo avulso libera o módulo. **Mudanças:** upgrade e inclusão de adicional valem na hora, com o proporcional dos dias na próxima fatura; downgrade e retirada ficam agendados para a renovação, sem reembolso, com aviso ao Master se o uso passar dos limites do plano menor |
| 3 | Faturas e recebimentos | Geração automática a cada ciclo (tarefa de fundo), número sequencial da plataforma, itens (plano, adicionais, proporcionais, descontos), situações (aberta, paga, parcial, vencida, cancelada). Fatura avulsa e cancelamento com motivo. **Baixa manual** com data, valor, forma, referência e comprovante; paga quando os recebimentos somam o total. Tela Faturas e recebimentos e aba na ficha do cliente |
| 4 | Régua do teste e da inadimplência | **Teste:** avisos D-3 e D-1 ao Master e bloqueio direto no fim, sem contratação. **Inadimplência:** avisos D-3 e no dia ao Master e ao contato financeiro; tolerância de 5 dias; **somente leitura** do 6º ao 20º dia, com faixa de aviso e prazo; **bloqueio** a partir do 21º (só o Master entra e vê o que está em aberto); **desbloqueio na hora** da baixa. Bloqueio manual com motivo continua. **Exportação completa dos dados** (P15), que ainda não existe e é o botão da tela de bloqueio: pacote com os dados da empresa em CSV e os anexos, gerado em segundo plano, link com validade, só o Master |
| 5 | Lado do cliente e painel | **Configurações › Assinatura** (só o Master): plano, adicionais, uso × limites, faturas com o comprovante, contratar adicional ou mudar de plano. **Vitrine "Conheça e contrate"** com os módulos não contratados e os "em breve", registro de interesse que chega à plataforma como oportunidade. **Painel da plataforma:** clientes por situação, receita recorrente mensal, faturas abertas e vencidas, previsão de 6 meses, clientes perto dos limites |
| 6 | Entrega | Migrações do ciclo; lista do que testar; publicação |

### Ciclo 12: integrações e atendimento

| # | Bloco | O que entra |
|---|---|---|
| 1 | Camada de pagamentos | Interface única (cliente no provedor, cobrança recorrente, cobrança avulsa, cancelamento, consulta), **adaptadores plugáveis**, mais de um provedor por forma de pagamento; **primeiro adaptador: Asaas** (boleto, PIX e cartão). Endereço de retorno (webhook) com a **assinatura verificada**, registro de todo aviso e processamento **idempotente** (eventos padrão: pago, vencido, estornado, recusado). Cartão só pela página do provedor (nada de cartão no ViniCycle). Link de pagamento na fatura e no e-mail de cobrança. **Nota fiscal de serviço emitida pelo provedor** (Asaas), com o número e o link guardados na fatura. Credenciais cifradas na Administração (P21). Baixa manual continua |
| 2 | WhatsApp e SMS | Canais na mesma camada do e-mail, com adaptadores: **WhatsApp pela Meta** (API oficial, com os modelos de mensagem aprovados por ela); **SMS com provedor a definir** (a camada fica pronta e o canal só liga quando houver o adaptador). **Franquia mensal vendida como pacote adicional, um por canal** (pacote de WhatsApp e pacote de SMS, cada um com quantidade e preço); **acabou a franquia, os avisos seguem só por e-mail e na tela até virar o mês**, e o Master é avisado. **Preferência por usuário** (P20) para os alertas e o resumo, com o telefone do cadastro. Tela **Envios** (fila, tentativas, reenvio) e **Modelos de mensagem** editáveis, com variáveis e versões (convite, bastão, cobrança, alertas) |
| 3 | Chamados | Cliente abre pelo menu do avatar ("Meus chamados") e, sem acesso, pela **página pública** (e-mail e CNPJ). Protocolo, categoria, prioridade, conversa, anexos, situações com cor e histórico; **prazo de atendimento** por plano ou cliente com semáforo; avisos à equipe e ao cliente; relatório por categoria e por prazo |
| 4 | Personificação (P28) | Já aprovada e ainda não feita; entra aqui por depender do chamado: motivo ou número do chamado, faixa fixa, 60 minutos, ações bloqueadas, auditoria com as duas identidades, aviso por e-mail ao Master |
| 5 | Entrega | Migrações do ciclo; lista do que testar; publicação |

**Decisões técnicas propostas (Claude), sem pergunta:**
- O proporcional do upgrade é calculado por dias: (preço novo − preço antigo) × dias restantes ÷ dias do ciclo.
- A fatura do ciclo é gerada 10 dias antes do vencimento (parâmetro da plataforma) e a renovação é automática; a assinatura só termina por cancelamento.
- O Master contrata adicionais e faz upgrade direto pela tela (vale na hora); a plataforma é avisada. Downgrade e retirada ficam agendados e podem ser cancelados até a renovação.
- O limite de armazenamento avisa a 80% e bloqueia novos anexos acima de 100% (integridade do contrato, P25); nada já guardado é apagado.
- Os valores ficam em reais (moeda da empresa) e a fatura da plataforma não é documento fiscal; a nota de serviço depende da pergunta 2.

**Decidido pelo João Carlos em 04/10/2026 (ponto 25):**
- **Pagamentos:** primeiro adaptador **Asaas**; a **nota fiscal de serviço** das faturas sai **pelo provedor**.
- **Mensagens:** WhatsApp pela **Meta**; SMS com provedor a definir. A franquia mensal é vendida como **pacote adicional, um por canal**; acabada a franquia, os avisos seguem **só por e-mail** (e na tela) até o mês seguinte, e o Master é avisado.
- **Autocadastro pelo site:** depois (fora do ciclo 12).
- **Assinatura da vinícola do João Carlos:** ela **paga** como os demais clientes; o desconto é **editável**. Para sair do preço contratado zero, a Administração ganhou o **reajuste do preço contratado**, que vale na renovação (preço de tabela ou valor digitado, com motivo); serve também aos reajustes anuais. Os dois ajustes entraram no ciclo 11 (versão publicada depois do ciclo).

**Situação do ciclo 11:** os seis blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-11.md](entregas/ciclo-11.md)). O ciclo 12 espera as respostas da pendência 25.

**Decisões técnicas tomadas na construção do ciclo 11 (Claude):**
- A fatura do ciclo atual cobra o que vale no início dele; a do próximo ciclo, emitida antes, já sai com o que estiver agendado para a renovação. Com a próxima fatura emitida, um novo agendamento fica para a renovação seguinte (a fatura emitida não muda). Uma mudança que vale na hora cancela e refaz a fatura futura ainda não paga.
- O desconto vale sobre o plano e os adicionais do ciclo (não sobre os proporcionais) e nunca deixa a fatura negativa; fatura de total zero nasce paga.
- Recebimento é livro: o erro se corrige pelo estorno, com motivo. Fatura com recebimento não se cancela.
- A régua só muda a situação que ela mesma pôs (ou a da empresa ativa): bloqueio manual e o bloqueio do fim do teste não são desfeitos pelo pagamento de fatura. A contratação tira do bloqueio do teste.
- Empresa bloqueada: o Master acessa só a assinatura e a exportação; os demais veem o aviso.
- A exportação completa é montada no próprio download (ZIP em fluxo), sem guardar arquivo nem link com validade; cada exportação fica na auditoria.
- Assinaturas que já existiam ficaram com preço contratado zero e o ciclo atual começando no início delas; a Administração ajusta pelo desconto ou pela troca de plano.
- Os prazos do teste e da régua ficam em Administração › Configurações.
- Não há encerramento de assinatura pelo cliente neste ciclo: a saída é a situação "Inativo", pela Administração.

**Situação do ciclo 12:** os cinco blocos prontos em 04/10/2026 ([ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-12.md](entregas/ciclo-12.md)). Pagamentos e WhatsApp testados com respostas simuladas; ligam de verdade com as contas no Asaas e na Meta (pendências 26 e 27).

**Decisões técnicas tomadas na construção do ciclo 12 (Claude):**
- Uma cobrança no provedor por fatura (o cliente paga na página do provedor, por boleto, PIX ou cartão); a cobrança recorrente no cartão fica para depois. Fatura vencida ganha cobrança com vencimento no dia.
- Nada de chamada ao provedor dentro da transação: a tarefa (a cada 2 minutos) reserva a linha, chama o provedor e grava o resultado; até 5 tentativas.
- O aviso do provedor (/api/avisos/:id) é conferido pelo token, registrado sempre e processado uma vez (pelo identificador do evento). Pago sem saldo na fatura fica registrado para conferência, sem baixa.
- A franquia de mensagens conta as mensagens do mês de cada canal (as que falharam não contam). O WhatsApp usa um modelo aprovado pela Meta com uma variável no corpo, que recebe o assunto do aviso e o link.
- Modelos editáveis: convite e os avisos de cobrança; a versão ativa troca o texto padrão no envio, com as mesmas variáveis e o mesmo botão.
- Chamados: situações fixas (aberto, em atendimento, aguardando o cliente, resolvido, fechado); categorias configuráveis; prazo da primeira resposta em horas corridas; a página pública não diz se o CNPJ é cliente.
- Personificação: além do que a P28 lista, ficam bloqueados a exportação completa, passar o bastão e trocar de empresa ou de área.

## 2027 (em ordem de prioridade proposta)

1. Correções do início do uso e ajustes pedidos pelo João Carlos.
2. Relatório da declaração anual (necessário até 10/01/2028) e apoio ao SIVIBE: adiantado como [ciclo 7](#roteiro-do-ciclo-7-declarações-2027-item-2-adiantado).
3. Autocontrole completo, aprovações, diário, relatórios agendados: [roteiro do ciclo 8](#roteiro-do-ciclo-8-autocontrole-aprovações-diário-e-relatórios-agendados-2027-item-3), decidido em 04/10/2026 e pronto (ciclo 8).
4. Simulador de corte, espumante tradicional (garrafas em processo), selos de IG, livro de álcool etílico: [roteiro do ciclo 9](#roteiro-do-ciclo-9-simulador-de-corte-espumante-na-garrafa-selos-de-ig-e-álcool-etílico-2027-item-4), decidido em 04/10/2026 e pronto (ciclo 9).
5. Vinificação para terceiros e "vinho cigano" completos (contratos, dossiê, devolução): [roteiro do ciclo 10](#roteiro-do-ciclo-10-vinificação-para-terceiros-e-vinho-cigano-2027-item-5), decidido em 04/10/2026 e pronto (ciclo 10).
6. Parte comercial: planos, assinaturas, faturas, integração de pagamentos, chamados, envios por WhatsApp e SMS, vitrine de módulos: [roteiro dos ciclos 11 e 12](#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6), aprovado em 04/10/2026; ciclos 11 (assinatura e cobrança) e 12 (integrações e atendimento) prontos; o autocadastro pelo site fica para depois.
7. Uso sem internet, etiquetas com QR dos recipientes, ficha técnica em PDF.
8. Fase fiscal ([FISCAL.md](FISCAL.md)) e os próximos módulos (VitiTrack, EnoTur, EnoMesa).

## Riscos

- **Prazo curto:** seis ciclos para a base e a cantina inteira. Se um ciclo atrasar, o que sai primeiro do ciclo 6 é o relatório de história do lote, nunca a carga de abertura nem o fechamento mensal.
- **Servidor compartilhado** com o ObraGrid: acompanhar memória e disco.
- **Ações com `sudo`** (banco, serviços, Caddy) dependem do João Carlos executar os comandos preparados.
