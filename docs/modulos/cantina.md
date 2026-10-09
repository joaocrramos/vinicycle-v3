# Módulo Cantina (enologia)

> **Situação:** rascunho em especificação. As decisões tomadas estão marcadas como **Decidido**; o resto é
> **Proposta** ou **Pendente**. Vale para todo o módulo a premissa **P29**: o cliente decide, o sistema
> informa. Práticas de vinificação são opções, nunca imposições.

## Objetivo

Registrar tudo o que acontece com o vinho dentro da cantina, da entrada da uva até a garrafa vendida, para dois fins:
- **gestão:** o que há em cada recipiente, em que estágio e com qual histórico;
- **conformidade:** os registros sistematizados e auditáveis exigidos pelo Decreto 12.709/2025 (arts. 119–123), base das declarações ao MAPA.

## Conceitos

| Conceito | Definição |
|---|---|
| **Recipiente** | Tanque, barrica, tonel, autoclave, ovo, ânfora. Controlado **um a um**, com código, capacidade e indicação de sistema de frio (**Decidido**) |
| **Projeto de vinho** | O vinho que se pretende fazer (ex.: "Grenache 2026"). É o ponto de partida e o centro do módulo: recebe as uvas, contém os lotes de produção e termina no engarrafamento |
| **Lote de produção** | Porção física de mosto ou vinho dentro de um projeto, para **rastreio interno**. Um projeto pode ter vários. Tem uma **composição** (% por variedade, safra e origem) calculada pelo sistema. Neste documento, "lote" sem qualificação significa lote de produção |
| **Titular do lote** | Dono do vinho de um lote: a própria empresa (vinificação própria) ou um terceiro (vinificação para terceiro) |
| **Lote comercial** | Número gerado na **finalização** (engarrafamento), impresso no **contrarrótulo**. É o lote que o consumidor e a fiscalização veem. No sistema, liga-se ao projeto e aos lotes de produção de origem |
| **Livro de movimentos** | Lançamentos de litros (+ entra, − sai) de um lote num recipiente. **O volume de um recipiente é a soma dos lançamentos; nunca é digitado** |
| **Operação** | Evento da cantina (trasfega, corte, prensagem…) que gera lançamentos no livro e/ou registros associados (insumos, análises, perdas) |
| **Genealogia** | Ligação entre lotes de origem e lotes resultantes, com os litros de cada um. Permite responder "de onde veio este vinho" e "para onde foi este lote" |
| **Estorno** | Operação que anula outra. Registros confirmados não são editados (P13) |

## Projeto de vinho (Decidido)

**Princípio:** o fluxo da cantina **começa pela criação de um projeto de vinho**, e tudo gira em torno dele, inclusive o recebimento de uvas.

**Projeto e lotes (Decidido: opção B).** Um projeto **contém vários lotes de produção**.
- **Exemplo:** o projeto "Grenache 2026" tem um lote fermentado com a levedura X no tanque 1 e outro com a levedura Y no tanque 2, cada um rastreado à parte.
- **Lotes de produção:** servem **só para rastreio interno**.
- **Lote comercial:** ao **finalizar** (engarrafamento), o sistema gera um **número de lote comercial**, que vai para o contrarrótulo.

**Dados do projeto** (Decidido em 03/10/2026):
- **código** `PRJ-AAAA-NNN`, gerado pelo sistema, e **nome** (ex.: "Grenache 2026");
- **estabelecimento** onde o vinho é elaborado (o registro no MAPA é por estabelecimento);
- **safra e ciclo previstos.** Um projeto pode receber uva dos dois ciclos da safra (ex.: 2026 Verão e 2026 Inverno). A safra e o ciclo **reais** saem da composição dos lotes;
- **produto pretendido:** classe oficial (fino, nobre, espumante, suco…), cor, **classificação quanto ao teor de açúcar** (nature, extra-brut, brut, seco, meio doce/meio seco/demi-sec, suave, doce) e, se for espumante, o método. A denominação do vinho é a classe, a cor e o teor de açúcar, nessa ordem (Lei 7.678/1988, art. 8º, III; IN MAPA 14/2018, art. 26, parágrafo único; espumantes: arts. 41, §1º, e 42, §1º) (Decidido em 03/10/2026);
  - **Faixas em g/L de cada classificação:** ficavam no Decreto 8.198/2014, arts. 31 a 38, revogado pelo Decreto 12.709/2025 (art. 240, IV), que remete os padrões a atos do MAPA (art. 7º). Nenhum ato novo com as faixas foi encontrado até 03/10/2026. Por isso, as faixas são **regras versionadas e configuráveis** (P16). **Valores iniciais (Decidido em 03/10/2026): os mesmos do Decreto 8.198/2014**, com a fonte marcada como "Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA";
- **teor alcoólico pretendido** (% vol), opcional (Decidido em 03/10/2026);
- **variedades previstas:** só a lista, **sem percentual**. O percentual real é calculado pelo sistema a partir dos litros de cada origem (composição do lote), inclusive nos cortes;
- volume ou quilos previstos;
- enólogo responsável;
- **projeto de origem**, quando o projeto nasce de um corte, e **"incorporado ao projeto X"**, quando é encerrado por um corte;
- observações e anexos (P15);
- situação (abaixo).

**Situações do projeto (Decidido em 03/10/2026):**

| Situação | Como muda |
|---|---|
| Planejado | Ao criar o projeto |
| Em produção | Automática, na primeira recepção ou operação. Cada lote do projeto tem a sua etapa (abaixo) |
| Pronto para envase | Marcada pelo enólogo. Dispara o **cálculo de materiais** do envase (ver "Engarrafamento") |
| Envase planejado | Automática, quando existe uma ordem de engarrafamento planejada para o projeto |
| Engarrafado | Automática, quando o saldo zera depois de um engarrafamento |
| Encerrado | Pelo enólogo, ou automática quando o projeto é incorporado num corte |
| Cancelado | Só para projeto **sem nenhum movimento**. O projeto não é apagado (P26) |

**Etapas de produção (Decidido em 03/10/2026):**
- **A etapa é do lote de produção,** não do projeto. Num mesmo projeto, um lote pode estar em maturação na barrica enquanto outro ainda está em maceração. O projeto mostra as etapas dos seus lotes.
- **Lista padrão:** Desengace, Prensa programada, Maceração, Maturação.
- **Configurável** pelo cliente (P29): incluir, renomear, ordenar e inativar etapas.
- **Como muda (Decidido em 03/10/2026): manualmente, pelo enólogo, por enquanto.** Toda mudança fica no histórico do lote, com quem e quando (P14).
- *Futuro:* a etapa poderá mudar sozinha quando o enólogo registrar uma operação ligada a ela. Ideia inicial, ainda não aprovada:

  | Etapa | Disparada por |
  |---|---|
  | Desengace | Desengace / esmagamento |
  | Maceração | Início da fermentação alcoólica com casca (tintos) |
  | Prensa programada | Prensagem agendada no plano do projeto |
  | Maturação | Fim da fermentação alcoólica, ou da malolática quando houver |

**Plano do projeto (Decidido).**
- **Roteiro planejado:** o projeto tem etapas previstas (desengace, fermentação, trasfegas, cortes, engarrafamento…). Cada etapa do plano tem:
  - tipo de operação;
  - data prevista;
  - recipiente previsto;
  - insumos com **dose prevista** (ex.: g/hL);
  - observação.
- **Previsto × executado:** cada operação registrada pode ser ligada à etapa do plano. O sistema compara o previsto com o executado: datas, doses e volumes.
- **Modelos de plano (Decidido em 03/10/2026):** reutilizáveis (ex.: "Tinto de guarda padrão"), com **datas relativas**: dia 0 = desengace, dia 21 = 1ª trasfega… Ao aplicar o modelo, o usuário escolhe a data do dia 0 e o sistema calcula as demais.
- **Etapa atrasada (Decidido em 03/10/2026):** etapa do plano que passou da data sem execução gera aviso na **Central de alertas** (P20). o aviso vai para o **enólogo responsável** do projeto (Decidido em 03/10/2026).

**Telas do projeto (Decidido em 03/10/2026):**
- **Lista de projetos** (P4): código, nome, safra, produto, situação, etapas dos lotes, volume atual, enólogo.
- **Ficha do projeto,** em abas:
  - Resumo: composição real, lotes, recipientes e volume atual;
  - Plano: previsto ao lado do executado;
  - Recepções, Operações, Análises;
  - Genealogia, Anexos, Histórico (auditoria, P14).
- **Criação rápida** dentro da recepção de uva: nome, produto, safra e ciclo. O resto se completa depois.

## Fluxo geral

```
Projeto de vinho (plano)
 └─> Recepção da uva (kg)
   └─> Desengace/esmagamento ──> recipiente com mosto (litros ESTIMADOS)
          └─> [tinto: fermentação com casca]
          └─> Prensagem ──> litros MEDIDOS (corrige a estimativa)
                 └─> Fermentações (alcoólica, malolática) ─> trasfegas, atestos, tratamentos
                        └─> Cortes ─> estabilização ─> filtração
                               └─> Ordem de engarrafamento ─> produto acabado (lote comercial)
                               └─> [espumante: tomada de espuma, conforme o método]
                                      └─> Saída (venda, transferência, perda)
```

## Recepção da uva

**Princípio (Decidido em 03/10/2026):** o sistema é comercial. A recepção atende qualquer vinícola, e não só o caso do primeiro cliente:
- uva **própria** e uva **comprada**;
- vinificação **própria** e vinificação **para terceiros** (prestação de serviço);
- produção **em cantina de terceiro**, o "vinho cigano" (ver "Vinificação para terceiros e em terceiros").

**Romaneio (Decidido em 03/10/2026):**
- **Cabeçalho:** código `ROM-AAAA-NNNN`, data e hora de chegada, estabelecimento e projeto. O projeto pode ser criado na própria tela.
- **Uma carga pode trazer várias variedades.** O romaneio tem **itens por variedade**. Cada item tem as suas pesagens, o seu °Brix e o seu lote de destino.
- **Várias pesagens:** cada item pode ter várias pesagens, cada uma com peso bruto e tara. O peso líquido do item é a soma das pesagens. A pesagem é digitada; a integração com a balança fica para o futuro.

**Origem (Decidido em 03/10/2026: as duas previstas):**
- **Vinhedo próprio:** parcela e número do SIVIBE da propriedade. Em 2026, só o cadastro mínimo de parcelas; o resto fica para o VitiTrack.
- **Fornecedor:** cadastro de pessoas (P2), com número do SIVIBE e situação. Fornecedor irregular no SIVIBE (sem cadastro ou sem a declaração do ano anterior) gera **alerta**. O usuário confirma ciente e a confirmação fica auditada (P29; IN MAPA 59/2020, art. 13; Decreto 12.709/2025, art. 203).

**Dados de cada item:**
- **Uva:** variedade (com código oficial, tipo, vinífera ou americana/híbrida, e **cor**: tinta, branca ou rosada), data da colheita, safra (calculada pela data da colheita) e ciclo.
- **Qualidade:** °Brix com 2 casas, obrigatório. pH, acidez total, sanidade (% de podridão) e temperatura são opcionais, e o conjunto é configurável por cliente.
- **Destino:** lote de produção, novo ou existente, e **titular** do lote (ver abaixo).

**Nota fiscal:** número, série e data de emissão, quando a uva é comprada ou vem de terceiro. **Importação do XML (Decidido em 03/10/2026):** o XML da nota pode preencher o romaneio, como na P11. A digitação manual continua sempre disponível.

**Opcionais (Decidido em 03/10/2026):**
- transporte: transportador, placa e número de caixas. É exigido no RS (Nota Técnica DIPOV 005/2018) e opcional nos demais estados;
- uva orgânica, candidata à IP e data da poda.

## Vinificação para terceiros e em terceiros

> **Situação:** decidido em 03/10/2026. As questões fiscais ficam em [FISCAL.md](../FISCAL.md), para a fase fiscal.

**Titular do lote (Decidido em 03/10/2026).** Todo lote de produção registra se é de **vinificação própria** ou **para terceiro**. No segundo caso, o lote tem um **titular**: o dono da uva e do vinho, cadastrado como pessoa (P2).

**Três situações previstas (Decidido em 03/10/2026):**

| Situação | Quem usa o ViniCycle | Como o sistema trata |
|---|---|---|
| **Vinificação própria** | A vinícola | Lote com titular = a própria empresa. Entra no estoque e nas declarações dela |
| **Vinificação para terceiro** (a cantina presta serviço) | A cantina prestadora | Lote com titular = o cliente do serviço. Passa pelas mesmas operações, análises e genealogia, mas fica **separado do estoque próprio**. Termina na **devolução** ao titular, a granel ou engarrafado |
| **Produção em terceiro** ("vinho cigano") | O produtor que contrata | Ver abaixo |

**Produção em terceiro (Decidido em 03/10/2026).** Dois jeitos, à escolha do produtor:
- **Entrega simples (padrão):** o produtor registra só a **uva que entregou** à cantina: cantina (pessoa jurídica cadastrada, P2), data, variedade, kg e nota fiscal de remessa. Não registra as operações feitas pela cantina.
  - **Retorno (Decidido em 03/10/2026):** quando o vinho volta, a granel ou engarrafado, o produtor faz **um registro único** da chegada: projeto, cantina, data, quantidade (litros ou garrafas por produto e formato), nota fiscal de retorno e, se for granel, GLT. O vinho entra no estoque ligado ao projeto, o que permite vender, dar baixa por lote e rastrear num recolhimento.
- **Acompanhamento próprio:** o produtor só usa os equipamentos da cantina e conduz o vinho ele mesmo. Trata-se como um **projeto normal**, com todas as operações registradas por ele.
  - Os recipientes da cantina usada são cadastrados normalmente, com a **localização** indicando onde estão (ex.: "Cantina X"). Não há tipo especial de "recipiente de terceiro" (Decidido em 03/10/2026).

**Mistura entre titulares (Decidido em 03/10/2026): bloqueada.** Um corte ou atesto entre lotes de titulares diferentes deixaria o lote sem dono definido, o que quebra a integridade dos dados (P29). Para misturar, registra-se antes uma **transferência de titularidade** (ex.: a cantina compra o vinho do cliente).

**Pagamento em produto (Decidido em 03/10/2026): previsto.** A cantina pode ficar com parte do vinho do cliente como pagamento do serviço. Isso é registrado como **transferência de titularidade parcial**: os litros passam do lote do cliente para um lote da cantina, com genealogia.

**Regras da vinificação por terceiros (Decidido em 03/10/2026).** Fontes em [pesquisa/2026-10-elaboracao-por-terceiros.md](../pesquisa/2026-10-elaboracao-por-terceiros.md). O tratamento fiscal (notas, CFOP, ICMS, IPI) fica para a fase fiscal: ver [FISCAL.md](../FISCAL.md).
- **Base legal:** a terceirização é permitida (Lei 7.678/1988, art. 47; Decreto 12.709/2025, art. 116).
- **A transação, na prática:** o cliente faz uma **remessa para industrialização** da uva ou do mosto, e a cantina faz o **retorno do produto pronto**, que entra no estoque do cliente.
- **Quem registra o produto:** a **cantina que produz**, com o registro MAPA dela e a marca do cliente. O cliente "cigano" não precisa de registro próprio. A IN MAPA 72/2018 (arts. 14, 25 e 30) também prevê o produto registrado em nome do contratante; o sistema aceita os dois arranjos (P29).
- **Rótulo:** "Produzido por" e "envasilhado por" indicam quem produziu de fato, a cantina. Formato usual: **"Produzido por [cantina], CNPJ X, para [razão social do cliente], CNPJ Y"**. O sistema monta esse texto a partir do contrato.
- **Quem declara ao MAPA:** quem **produziu e guarda** o vinho, ou seja, a cantina. A declaração dela inclui o vinho de terceiros, separado por cliente e marca (Portaria MAPA 615/2023, arts. 4º e 5º). O cliente só recebe o produto pronto para vender.
- **Registros:** ficam com os dois. A cantina guarda o histórico de produção; o cliente guarda o que precisa para a fiscalização do que vende. O **dossiê do lote** (abaixo) é como a cantina entrega os registros ao cliente, que o anexa ao retorno.
- **Zona de produção e envio de vinho em elaboração:** decididos caso a caso pelas partes. O sistema **não** valida nem alerta.
- **Contrato de terceirização (cadastro novo):** partes, registros MAPA, produtos e marcas, vigência, condições do serviço (preço, insumos de cada parte, perdas, pagamento em dinheiro ou em produto) e anexos (IN 72/2018, art. 27). Alerta para certificado ou contrato vencido.
- **Recepção para terceiro:** guarda o número e a chave da nota de remessa, como referência. A checagem do SIVIBE vale também para o dono da uva (Decreto 12.709/2025, art. 203, V).
- **Devolução ao titular:** registra a nota de retorno e, se o vinho voltar a granel, a **GLT** (Decreto 12.709/2025, arts. 203, IV, e 235).
- **Dossiê do lote para o cliente:** operações, análises, insumos e doses, rendimento e recipientes, exportável.

**Futuro:** se a cantina prestadora também usar o ViniCycle, o titular poderá ver o lote dele direto, sem redigitar. Isso exige compartilhamento entre empresas e fica fora do escopo de 2026.

## Quilos → litros (Decidido)

1. **Desengace/esmagamento.** O mosto entra no recipiente com volume **estimado**.
   - O usuário pode **digitar a estimativa** diretamente, ou deixar o sistema calcular kg × rendimento estimado.
   - O rendimento padrão é configurável por estabelecimento, opcionalmente por variedade e estilo. Sem configuração, o usuário informa a estimativa na operação (P29).
2. **Prensagem.** O volume **medido** substitui a estimativa.
   - O sistema lança a diferença como ajuste de prensagem.
   - Registra o **rendimento real** (L/kg) do lote.
3. **Limite legal.** Se o rendimento real passar de 4/5 após a separação das borras (Decreto 12.709, art. 93), o sistema **alerta**.

## Recipientes e lotes

**Regras dos recipientes:**
- Um recipiente guarda **um lote por vez**. Isso é identificação, não restrição de prática: o que estiver dentro do recipiente tem um código de lote.
- **Mistura (Decidido; P29).** Quando entra num recipiente vinho de outro lote (vinho de prensa juntado ao gota, atesto com outro lote, corte), o enólogo escolhe na operação:
  - **(a) incorporar** ao lote que já está no destino: o lote mantém o código e o sistema recalcula a composição;
  - **(b) formar um lote novo**, com novo código.
  - Nos dois casos, a **genealogia** registra quanto de cada lote de origem entrou.

**Bloqueios físicos:**
- volume negativo;
- volume acima da capacidade;
- recipiente em manutenção ou inativo recebendo vinho.

**Execução:** cada operação é atômica (tudo ou nada) e bloqueia os recipientes envolvidos enquanto grava.

**Composição por recipiente (Decidido em 03/10/2026):** a composição (% de variedade, safra e ciclo) é guardada **por recipiente**. Se um lote está num tanque e numa barrica e só a barrica recebe outro vinho, só a composição da barrica muda. A composição do lote é a média ponderada pelos litros das suas partes, e o lote comercial herda a composição dos recipientes efetivamente engarrafados.

**Composição e rótulo:** a composição do lote (% de variedade e % de safra) mostra o que o rótulo pode declarar:
- varietal: ≥ 75% (Lei 7.678/1988, art. 41), ou ≥ 85% em indicações geográficas que exijam mais, como a IP Vale do São Francisco (regulamento de uso da IP);
- safra: ≥ 85% (IN MAPA 14/2018, art. 28).
- Os percentuais ficam em regras versionadas (P16), porque cada IG pode ter o seu.

O sistema informa; não impede a operação.

## Operações (todas previstas — Decidido)

| Operação | Efeito no livro | Opções do cliente |
|---|---|---|
| Desengace / esmagamento | + litros estimados no recipiente de destino | Estimativa digitada ou calculada |
| Prensagem | Ajuste para o volume medido | Destino do vinho de prensa: mesmo recipiente/lote ou outro recipiente, incorporando a um lote ou formando lote separado |
| Fermentação alcoólica | Sem movimento de volume; marca início e fim | Curva por leituras de densidade e temperatura |
| Fermentação malolática | Sem movimento de volume; marca início e fim | Opcional por lote |
| **Chaptalização** | Sem movimento relevante de volume; baixa o açúcar do estoque | Ver "Fermentação, chaptalização, álcool e atesto" |
| Trasfega | − origem, + destino (mesmo lote); perda opcional (borra) | |
| Atesto | − origem, + recipiente atestado | Com o mesmo lote ou com outro (incorporar ou formar lote novo). Atesto em lote: uma origem, várias barricas |
| Corte (blend) | − de cada origem, + destino | Incorporar a um lote existente ou formar lote novo. Ver "Trasfega e corte" |
| Clarificação / filtração / estabilização | Tratamento com insumos; perdas opcionais | Insumos baixam do estoque com dose calculada |
| Adição de insumo | Sem volume (salvo quando relevante); baixa estoque **do lote do insumo** | Alerta de limite legal acumulado (ex.: SO₂ total ≤ 300 mg/L). Ver "Adição de insumo" abaixo |
| Perda | − litros, com motivo (borra, evaporação, vazamento, descarte, amostra…) | Motivos configuráveis |
| Transferência de titularidade | − lote do titular de origem, + lote do novo titular (mesmo recipiente ou outro) | Total ou parcial (ex.: pagamento do serviço em vinho) |
| Ajuste de inventário | ± diferença para o volume medido | Motivo obrigatório; permissão específica (P27) |
| Engarrafamento | − litros do recipiente; + garrafas no estoque de produto acabado | Ver "Engarrafamento" |
| Tomada de espuma | Conforme o método | Ver "Espumantes" |
| Estorno | Lançamentos inversos da operação estornada | Motivo obrigatório |
| **Entrada de granel** | + litros no recipiente de destino, vindos de fora (compra, retorno de terceiro) | Ver "Granel e GLT" abaixo |
| **Saída de granel** | − litros do recipiente, para fora (venda, remessa, devolução ao titular) | Ver "Granel e GLT" abaixo |
| **Higienização / manutenção de recipiente** | Sem volume | Tipo, data, produto e dose, responsável, anexo. Ver "Recipientes" |

**Regras comuns das operações (Decidido em 03/10/2026):**
- **Dados comuns:** código `OP-AAAA-NNNNN`, data e hora da execução, executado por, responsável, etapa do plano ligada (quando houver), observação e anexos (P15).
- **Duas datas:**
  - **data da execução**, informada pelo usuário. Pode ser no passado (ex.: a trasfega de ontem lançada hoje);
  - **data do lançamento**, gravada pelo sistema e sempre exibida ao lado.
  - Um mês já fechado só recebe lançamentos depois de **reaberto** (ação "reabrir período", P27), para não alterar o que já foi declarado.
- **Rascunho:** a operação pode ser salva pela metade e terminada depois.
  - O rascunho **não mexe em volume nem em estoque** e não entra em relatórios nem em declarações.
  - Ao confirmar, o sistema valida com os volumes do momento (capacidade, saldo, recipiente ativo).
  - Rascunho pode ser descartado. Depois de confirmada, a operação não se edita: só se estorna (P13).
- **Tela de registro em passos:** operação → origens e destinos → litros → perdas e insumos → **prévia** do volume de cada recipiente antes e depois → confirmar.
- **A partir do plano:** "executar" uma etapa planejada abre a operação já preenchida com o previsto. O usuário ajusta o que mudou.
- **Esvaziar origem:** numa trasfega ou num corte, o usuário pode marcar "esvaziar origem". O sistema calcula a sobra e lança como **perda (borra)**, e o usuário pode corrigir o valor antes de confirmar.

### Desengace, esmagamento e prensagem (Decidido em 03/10/2026)

**Uva a processar:**
- Cada item do romaneio tem um **saldo de uva a processar** (kg), que baixa a cada desengace ou prensagem direta.
- A uva pode ser processada **em partes** (metade hoje, metade amanhã).
- **Vários romaneios** podem ir juntos para o mesmo recipiente numa só operação. A composição do lote vem dos itens consumidos.

**Desengace / esmagamento:**
- consome kg dos itens do romaneio e põe o mosto no recipiente com litros **estimados** (ver "Quilos → litros");
- insumos aplicados nessa hora (SO₂, enzimas…) podem ser lançados na mesma tela e geram a adição ligada.

**Prensagem:**
- **parte de um recipiente com massa** (tintos, depois da maceração) **ou direto da uva do romaneio** (prensagem direta de cacho inteiro, comum em brancos e espumantes). Na prensagem direta, os litros já nascem **medidos**;
- **frações configuráveis** pelo cliente (ex.: flor/gota, 1ª prensa, 2ª prensa). Cada fração tem os seus litros, o seu recipiente de destino e, se o enólogo quiser, o seu lote;
- substitui a estimativa pelo volume medido, lança a diferença como ajuste de prensagem e calcula o **rendimento real** (L/kg), com alerta acima do limite legal.

**Resíduos (opcional):** engaço e bagaço em kg, com o destino (compostagem, destilação, venda, descarte). Relatório de resíduos por safra, útil para a licença ambiental.

### Fermentação, chaptalização, álcool e atesto (Decidido em 03/10/2026)

**Fermentações (alcoólica e malolática):**
- o enólogo marca o **início** e o **fim**;
- o sistema **sugere o fim** quando as leituras ficam estáveis (ex.: 3 leituras de densidade iguais abaixo de 0,995). O critério é configurável, e quem confirma é o enólogo;
- fermentação espontânea, sem levedura comercial, é só marcar o início sem adição de levedura.

**Chaptalização:** operação própria, porque tem limite legal por tipo de vinho.
- Registra o açúcar adicionado (kg ou g/L, com o lote do açúcar) e **calcula o ganho estimado em % vol**.
- **Alerta pelo limite da classe** do produto pretendido (P29). Valores iniciais: vedada no vinho nobre, no fino branco e rosé e na base de espumante; até 1,5% vol no fino tinto; até 40 g/L no moscatel espumante. Os limites estavam no Decreto 8.198/2014, revogado; ficam como **regras versionadas** (P16), com a fonte "Decreto 8.198/2014 (revogado), mantido até ato novo do MAPA", como as faixas de açúcar.
- O lote fica **marcado como chaptalizado**, e a marca acompanha a genealogia. Serve, por exemplo, para a menção "Gran Reserva", que não admite chaptalização.

**Livro de álcool etílico** (Lei 7.678/1988, art. 29, §3º: comunicar ao MAPA cada entrada de álcool etílico e manter livro de entradas e usos):
- o álcool entra no estoque como insumo, com nota e lote;
- cada uso numa operação (ex.: alcoolização de licoroso) baixa o lote do álcool;
- o relatório **"Livro de álcool etílico"** lista entradas e usos;
- cada entrada gera um alerta para **comunicar ao MAPA** (P20), com registro de quando foi comunicada.

**Atesto em lote:** uma origem completa **várias barricas** numa só operação, com os litros de cada uma.
- **Evaporação:** ao atestar, o sistema lança automaticamente, em cada barrica, uma **perda por evaporação** igual aos litros repostos, e a barrica volta ao volume cheio. Sem isso, a barrica passaria da capacidade no livro. O enólogo pode corrigir o valor antes de confirmar.
- O relatório de evaporação mostra a perda de cada barrica por período.

### Inventário, estorno e tratamentos (Decidido em 03/10/2026)

**Inventário da cantina (tela de contagem):**
- lista todos os recipientes com o volume do livro;
- o cantineiro digita o volume medido;
- o sistema gera **de uma vez** os ajustes de inventário das diferenças, com motivo;
- diferença acima do limite configurado passa pelo fluxo de aprovação (P27).

**Estorno de operação com dependentes:**
- se operações posteriores usaram o vinho da operação a estornar (ex.: um corte depois da trasfega), o sistema **mostra quais são** e exige estorná-las antes, da mais nova para a mais antiga;
- assim nunca surgem volumes impossíveis (P13, integridade dos dados).

**Tratamentos (clarificação, filtração, estabilização…):**
- além dos insumos e das perdas, **parâmetros técnicos opcionais** por tipo de tratamento, configuráveis pelo cliente (P29);
- exemplos: tipo de filtro e porosidade, temperatura e dias de frio na estabilização tartárica, equipamento usado.

### Trasfega e corte (Decidido em 03/10/2026)

**Trasfega:** move vinho de recipiente para recipiente.
- **Várias origens e vários destinos** numa só operação, desde que seja o mesmo lote. Ex.: um tanque de 1.000 L enchendo 4 barricas de 225 L, ou várias barricas voltando para um tanque.
- **Dados:** recipientes de origem e de destino, litros que chegaram em cada destino, perda (borra, com "esvaziar origem"), **método** (opcional, lista configurável: aberta com aeração, fechada, com gás inerte, por bomba, por gravidade…) e observação.
- **Bloqueios físicos:** capacidade do destino, saldo da origem, recipiente em manutenção ou inativo.

**Destino com outro lote (mistura):**
- O sistema **avisa que é uma mistura** e pergunta:
  - **incorporar** ao lote do destino: o lote de destino absorve o vinho e mantém o código. A **genealogia** registra que ele recebeu os dois lotes, com os litros de cada um;
  - ou **formar um lote novo**.
- **Quem diz se é corte é o enólogo.** Mesma uva, mesma safra e mesmas características não é corte: é só a junção de lotes iguais.
- **Sugestão de corte:** se as composições forem diferentes (ex.: variedades diferentes), o sistema **sugere** registrar como corte e mostra a composição resultante em %. O enólogo confirma ou não.

**Corte:** mistura de lotes diferentes.
- **Dados:** lotes de origem com os litros de cada um, destino ou destinos e o resultado: incorporar ao lote do destino ou formar lote novo.
- **Corte entre projetos:** quando forma um **lote novo** com vinhos de projetos diferentes, cria um projeto novo. Quando o vinho de outro projeto é **incorporado** a um lote existente (ex.: atesto), fica no projeto do destino (Decidido em 03/10/2026). Nos dois casos, o projeto de origem sem saldo é encerrado como "incorporado ao projeto X".
- **Prévia:** composição resultante (% de variedade e de safra) e o que o rótulo pode declarar (varietal ≥ 75%, ou ≥ 85% na IP Vale do São Francisco; safra ≥ 85%). O sistema informa; não impede.
- **Titulares diferentes:** bloqueado (ver "Vinificação para terceiros e em terceiros").

**Simulador de corte:**
- O enólogo testa proporções (ex.: 70% Grenache + 30% Malbec) e vê a composição e o que o rótulo pode declarar, **sem mexer no volume**.
- As simulações ficam salvas no projeto, com data e autor.
- Uma simulação aprovada vira o corte já preenchido. Os litros são conferidos com os saldos do momento.

**Em toda operação (Decidido em 03/10/2026):**
- **executado por:** pessoa que fez a operação (papel funcionário, P2), mesmo que não tenha login no sistema. É boa prática; a norma não exige o registro nominal;
- **responsável:** enólogo ou RT responsável. As práticas enológicas são feitas com o acompanhamento do RT (IN MAPA 49/2011, art. 6º);
- a auditoria continua registrando, à parte, quem digitou (P14).

**Adição de insumo (Decidido em 03/10/2026):**
- **lote do insumo**, obrigatório quando o item controla lote; dose, volume tratado, data e **hora**, temperatura do mosto (opcional). Base: registros auditáveis dos insumos (Decreto 12.709/2025, art. 119, III) e rastreabilidade (art. 122, §1º);
- **consulta inversa:** em quais lotes de vinho entrou o lote X do insumo Y. Serve ao recolhimento;
- **lote vencido:** alerta ao escolher (P29);
- **insumo não estocado:** permitido com descrição livre e sem baixa, por exemplo o insumo trazido pelo cliente na vinificação para terceiros. Fica sinalizado nos relatórios.

**Granel e GLT (Decidido em 03/10/2026).** Entradas e saídas de vinho a granel registram:
- nota fiscal, remetente, destinatário e transportador;
- **número da GLT** (Lei 7.678/1988, art. 2º, §1º; Decreto 12.709/2025, art. 235; emissão pela Portaria MAPA 690/2022). Transportar ou comercializar a granel sem GLT é infração leve (Decreto 12.709/2025, art. 203, IV);
- tipo de embalagem: carro-tanque, tambor, barril;
- confirmação de recebimento.
- **Saída a granel sem GLT informada:** alerta (P20).
- Entram no estoque da declaração anual (Portaria MAPA 615/2023, art. 4º).

## Espumantes (Decidido: todos os métodos previstos)

| Método | Onde ocorre a 2ª fermentação | Como o sistema controla |
|---|---|---|
| **Tradicional** (champenoise) | Na garrafa | O vinho-base sai do recipiente para **garrafas em processo**, um estoque de garrafas por lote e estágio. Estágios: tiragem → repouso sobre borras → remuage → dégorgement → licor de expedição → produto acabado. Perdas (garrafas quebradas) são registradas em cada estágio |
| **Charmat** | Em autoclave (recipiente pressurizado) | Igual a um vinho em recipiente: autoclave é um tipo de recipiente. Engarrafamento isobárico ao final |
| **Asti** (fermentação única, típico do moscatel espumante) | Em autoclave | Igual ao Charmat, numa só fermentação |
| **Ancestral** (pét-nat) | Na garrafa, terminando a 1ª fermentação | Garrafas em processo, com estágios próprios |

As declarações continuam em litros. As garrafas em processo são convertidas pelo formato (mL × garrafas).

## Recipientes (Decidido)

- **Controle:** um a um, tanques e barricas.
- **Campos:**
  - código único por estabelecimento;
  - tipo: tanque inox, tanque de fibra, tanque de polipropileno (PP), barrica, tonel, autoclave, ovo de concreto, ânfora, outro;
  - material e capacidade (L);
  - **possui sistema de frio** (sim/não);
  - **localização** (Decidido em 03/10/2026): onde o recipiente está, escolhida de um cadastro de locais do estabelecimento (ex.: "Galpão 1", "Galpão 2", "Cantina X"). Serve às vinícolas com mais de uma cantina ou galpão e à produção em cantina de terceiro. O painel e os relatórios filtram por localização;
  - situação: ativo, **aguardando higienização**, manutenção, inativo. Encher um recipiente "aguardando higienização" gera **alerta**, que a empresa pode transformar em bloqueio (P29);
  - **opcionais (Decidido em 03/10/2026):** dimensões, fabricante e data de aquisição.
  - **Barricas:** tanoaria, origem da madeira, tosta, ano do primeiro uso.
- **Painel:** ocupação de cada recipiente, com lote, volume, etapa e dias no recipiente.
- **Higienização e manutenção (Decidido em 03/10/2026).** Base: higiene e manutenção de equipamentos e utensílios (Decreto 12.709/2025, art. 120, IV).
  - Cada higienização ou manutenção é uma operação registrada (ver "Operações").
  - O recipiente que esvazia passa a "aguardando higienização". Configurável por cliente (P29).
  - Periodicidade configurável por tipo de recipiente, com alerta na central (P20).
- **Etiqueta com QR code (Decidido em 03/10/2026):** cada recipiente tem uma etiqueta interna, com código e QR. Ao ler, abre a ficha do recipiente, depois do login, com atalho para registrar operações. Reforça a identificação exigida pela Lei 7.678/1988, art. 48.
- **Relatório de uso:** por recipiente, com operações, tempo de uso e idade.

## Códigos (Decidido, configurável — P19)

| Registro | Formato padrão | Exemplo |
|---|---|---|
| Romaneio | `ROM-AAAA-NNNN` | `ROM-2026-0001` |
| Projeto de vinho | `PRJ-AAAA-NNN` + nome | `PRJ-2026-007` "Grenache 2026" |
| Lote de produção (interno) | `AAAA.CC-NNN` (safra.ciclo-sequência) | `2026.01-042` |
| Operação | `OP-AAAA-NNNNN` | `OP-2026-00125` |
| **Lote comercial** (contrarrótulo) | `L` + ano do envase (2 dígitos) + sequência do ano | `L26-0014` |

**Lote comercial (Decidido).**
- **Um lote comercial por ordem de engarrafamento.** Se o mesmo projeto for engarrafado em março e em junho, saem dois lotes comerciais (ex.: `L26-0014` e `L26-0031`), cada um com data, materiais e análises próprios.
- É impresso no contrarrótulo.
- O código é curto e não precisa ser entendido pelo consumidor: é informação técnica, para a vinícola e a fiscalização.
- No sistema, o lote comercial liga-se ao projeto e aos lotes de produção de origem. Com ele se imprime a **história completa** do vinho.
- *Substitui a decisão anterior de embutir o código do lote de produção no lote da garrafa.*
- **Variedade fora do código (Decidido).** O código do lote é um identificador técnico, para a vinícola e a fiscalização. Ele não descreve o vinho:
  - a composição pode mudar (incorporação, corte) e um vinho pode ter várias variedades;
  - variedades, safra e composição aparecem ao lado do código na tela, nas etiquetas e nos relatórios.
- **Ciclo com 2 dígitos (Decidido):** `.01`, `.02`. Cada ciclo tem também um **nome**, configurável por estabelecimento (ex.: `01` = Verão, `02` = Inverno). O nome aparece nas telas ("Safra 2026 Verão"); o número vai no código.
- **Relatório de história:** a partir do lote comercial, do projeto ou de um lote de produção, o sistema imprime a história completa do vinho:
  - recepções de uva de origem;
  - todas as operações e recipientes por onde passou;
  - análises e laudos;
  - insumos aplicados;
  - cortes e genealogia;
  - envases e saídas.
  É o documento para a fiscalização e para o recolhimento (recall).
- **Ficha técnica (Decidido em 03/10/2026):** documento comercial em PDF do produto ou do lote comercial, para distribuidores, concursos e loja: composição, teor alcoólico, açúcar, acidez, pH e notas de elaboração. O usuário escolhe os campos exibidos.
- A data do envase e os demais dados ficam no sistema.
- **QR code do rótulo (Decidido em 03/10/2026):** a vinícola já usa QR para a **página comercial** do vinho. O sistema mantém isso:
  - cada versão de rótulo do produto guarda o endereço da página comercial;
  - o QR leva a esse endereço **identificado pelo lote comercial** (ex.: o código do lote vai no endereço), para a página saber de qual lote se trata;
  - o ViniCycle não cria uma página pública própria de rastreio.

## Análises (Decidido)

- **Na vinícola:** densidade, pH e SO₂ livre. O conjunto de parâmetros é configurável por cliente (P29).
- **Laboratório externo:**
  - o laudo vira anexo do lote (P15);
  - os valores são digitados para gerar histórico e alertas.
- **Vínculo:** cada análise liga-se ao lote e, opcionalmente, ao recipiente, com data e hora da amostra.
- **Curva de fermentação:** leituras de densidade e temperatura ao longo do tempo.
- **Açúcares totais (g/L)** entre os parâmetros, para conferir a classificação quanto ao açúcar (Decidido em 03/10/2026).
- **Temperatura fora da fermentação (Decidido em 03/10/2026):** leituras de temperatura, manuais por enquanto e por sensor quando o IoT entrar, em qualquer recipiente e nos locais de estoque refrigerados. Base: controle de temperatura do autocontrole (Decreto 12.709/2025, art. 120, V, conforme o risco).
- **Faixa ideal por parâmetro (Decidido em 03/10/2026):** definida pelo cliente e ajustável por projeto, lote ou modelo de plano. Leitura fora da faixa gera alerta (P20).
- **Análise pendente (Decidido em 03/10/2026):** periodicidade mínima por parâmetro e etapa (ex.: densidade diária na fermentação, SO₂ livre mensal na maturação). Lote sem análise no prazo gera alerta (P20).
- **Uso sem internet (Decidido em 03/10/2026):** leituras, análises e notas podem ser registradas sem conexão e enviadas depois, com contador de pendentes. **Lançamentos de volume exigem conexão**, por causa dos bloqueios e da gravação atômica.
- **Laudo fora do padrão (Decidido):** se o laudo estiver fora dos padrões de identidade e qualidade, do **teor alcoólico declarado** no rótulo (tolerância de ±0,5% vol, IN MAPA 14/2018, art. 11, §4º) ou da **classificação quanto ao açúcar** declarada, o engarrafamento mostra **alerta** (P29). Cada empresa pode ligar o **bloqueio** em vez do alerta.

### Laboratório (Decidido em 03/10/2026)

**Pedido de análise externa:**
- cada amostra tem **código e etiqueta**, ligada ao lote e ao recipiente, com data e hora da coleta;
- situação do pedido: coletada → enviada → laudo recebido;
- **laudo atrasado** (prazo configurável por laboratório) gera alerta (P20);
- o laudo, ao chegar, fecha o pedido e vira anexo do lote (P15).

**Entrada dos valores do laudo:**
- **digitação** num formulário por laboratório, já com os parâmetros que ele costuma enviar;
- **importação de planilha** (P23);
- a leitura automática do PDF fica para o futuro.

**Laboratório credenciado:**
- o laboratório é uma pessoa com papel "laboratório" (P2), com o **credenciamento MAPA** e a validade;
- laudo de laboratório sem credenciamento cadastrado, ou com ele vencido, gera **alerta** no engarrafamento (P29).

**Unidades:**
- cada parâmetro é guardado numa **unidade padrão** e exibido na unidade que o cliente prefere (ex.: densidade, °Brix ou °Baumé; acidez em ácido tartárico ou sulfúrico);
- o valor digitado em outra unidade é **convertido**, e o valor original fica guardado junto;
- as fórmulas de conversão ficam em tabela versionada (P16).

## Engarrafamento (Decidido: na própria vinícola, como ordem de produção)

O engarrafamento é uma **ordem de produção (ordem de engarrafamento)**.

**Consome:**
- os **litros** do lote de produção no recipiente;
- os **materiais de embalagem** do estoque: garrafa, rolha, cápsula, rótulo, contrarrótulo, caixa…

**Produz:** o **produto acabado** (vinho engarrafado), que entra no estoque de produto acabado.

**Ficha de embalagem do produto:** cada produto comercial tem a lista de materiais por unidade (ex.: 1 garrafa 750 mL, 1 rolha, 1 cápsula, 1 rótulo, 1 contrarrótulo; 1 caixa a cada 6 garrafas).
- A ordem de engarrafamento calcula o consumo a partir do número de garrafas.
- O usuário pode ajustar o consumo real (quebras, rótulos perdidos).

**Do "pronto para envase" ao envase (Decidido em 03/10/2026):**
1. **Pronto para envase:** o enólogo marca o projeto e indica o produto e o formato (ou formatos). O sistema calcula na hora:
   - garrafas previstas, pelos litros disponíveis e pela perda média de envase;
   - **materiais necessários** pela ficha de embalagem (garrafas, rolhas, cápsulas, rótulos, caixas, selos);
   - o que **falta no estoque**, com alerta (P20) para dar tempo de comprar.
2. **Envase planejado:** a ordem de engarrafamento é criada com data prevista. O sistema refaz a conferência. Não há reserva de estoque.
3. **Execução:** **uma ordem pode durar vários dias.** Cada dia lança uma **produção parcial** (garrafas, perdas de vinho e de materiais) no **mesmo lote comercial**. A ordem é encerrada no fim.

**Engarrafado por:** a própria vinícola ou um prestador cadastrado (ex.: engarrafadora móvel). Entra no histórico do lote.

**Selos de indicação geográfica:** só para quem usa IG. Os selos numerados são item de estoque com numeração; cada ordem registra a **faixa usada** (ex.: do nº 001.201 ao 002.400) e os selos perdidos.

**Dados da ordem:**
- projeto e lote(s) de produção de origem;
- recipiente(s);
- produto (registro MAPA, versão do rótulo, com o **teor alcoólico declarado**);
- formato ou formatos (mL). **Uma ordem pode ter vários formatos com um só lote comercial**; no estoque, cada formato é um item com o mesmo código de lote (Decidido em 03/10/2026);
- número de garrafas;
- perdas de vinho e de materiais;
- data.

**Resultado:**
- gera o **lote comercial** daquela ordem;
- baixa os litros e os materiais;
- dá entrada no produto acabado com o lote comercial.

## Saídas de produto (Decidido: genérico, sem amarra a um PDV)

**Entradas aceitas:**
- qualquer XML de NF-e ou NFC-e, do PDV Legal ou de qualquer outro emissor;
- planilha (P23);
- digitação manual.

- **Integrações:** por API, com o PDV Legal e outros, são opcionais e ficam para depois.
- **Entrada externa sempre aberta:** existem centenas de PDVs no mercado. Mesmo que no futuro exista um **PDV próprio do ViniCycle**, a entrada externa continua disponível.

**Associação de itens:** cada item da nota é associado a um produto acabado, e a associação é memorizada (como na P11).

**De qual lote sai cada garrafa (Decidido: configurável por cliente):**

| Estratégia | Como funciona |
|---|---|
| Lote informado no documento | Usa o lote do XML quando o emissor informar (grupo de rastreabilidade da NF-e) |
| Mais antigo primeiro | Baixa automaticamente do lote de envase mais antigo com saldo |
| Escolha na conferência | O usuário indica o lote na tela de conferência da importação |
| Sem lote | Baixa só o produto, sem lote. **Atenção:** o sistema avisa que, sem lote na saída, não é possível saber quem recebeu cada lote num recolhimento (recall) |

O cliente define a estratégia padrão. As estratégias podem ser combinadas: usar o lote do documento quando houver e, na falta, a estratégia padrão.

**Tipos de saída (Decidido em 03/10/2026).** Além da venda, todos com motivo e lote, numa lista configurável (P29):
- degustação e cortesia (visitas, imprensa, concursos, brindes);
- quebra e avaria;
- transferência entre estabelecimentos ou locais da empresa (ex.: cantina → loja);
- consumo interno e doação.

**Devolução (Decidido em 03/10/2026):** entrada pelo XML da nota de devolução ou por digitação. As garrafas voltam ao **lote comercial de origem** ou, se não servirem para venda, a um local "avariadas".

**Quem recebeu cada lote (Decidido em 03/10/2026):**
- na venda com lote, o **destinatário da nota** (CPF/CNPJ e nome, quando houver) fica ligado à saída e ao lote;
- venda ao consumidor sem identificação fica como "consumidor não identificado";
- o **relatório de recolhimento** responde "quem recebeu o lote X", com quantidades e datas;
- os dados pessoais dos compradores seguem a P21 (LGPD).

## Declarações e fechamento (Decidido em 03/10/2026)

**Fechamento do mês (manual, com conferência):**
- quem fecha: o RT ou o Master (permissão própria, P27);
- **lista de conferência** antes de fechar: rascunhos pendentes, inventário do mês, saídas sem lote, **pendências de estoque negativo** de insumos e embalagens (P29), laudos e alertas abertos do mês. O mês não fecha com pendência de estoque aberta;
- gera o **relatório do mês**: estoque inicial, entradas, saídas e estoque final, por produto, base da declaração mensal (Lei 7.678/1988, art. 31), feita no portal do MAPA;
- mês fechado só recebe lançamentos depois de **reaberto**, com aprovação (P27).

**Declaração anual (Portaria MAPA 615/2023):**
- o sistema gera os números **na ordem do formulário do portal**: estoque em 31/12 do ano anterior, produção do ano e estoque em 31/12, por produto, marca e classe, com o vinho de terceiros separado (ver "Vinificação para terceiros e em terceiros");
- alerta do prazo de 1º a 10 de janeiro (P20);
- depois de enviada, o usuário anexa o **recibo** (protocolo) e o ano fica **marcado como declarado**;
- ano declarado fica travado. Mudanças só por **retificação registrada**, com motivo e novo recibo.

**SIVIBE:** relatórios de apoio à declaração de uvas: uva própria por cultivar e parcela; uva comprada por fornecedor; uva enviada para processamento por terceiros.

**Carga inicial:**
- importação de planilha (P23) com o **saldo de abertura** numa data: por recipiente e lote (granel) e por produto e lote comercial (garrafas);
- opcionalmente, importação de **movimentos anteriores** ao início do uso, para quem tiver esses registros. A vinícola do João Carlos começa em 01/01/2027 só com o saldo de abertura (Decidido em 03/10/2026);
- tudo marcado como **"carga inicial"**, com a origem do dado, para separar do que foi lançado no dia a dia.

## Pendências deste módulo

*Nenhuma pendência de decisão no momento.*

Próximo passo: modelo de dados ([03-modelo-de-dados.md](../03-modelo-de-dados.md)).
