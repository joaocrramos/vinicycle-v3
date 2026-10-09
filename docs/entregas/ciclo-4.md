# Ciclo 4: Cantina 2

> Período previsto: 17/11 a 28/11/2026. Começou antes, em 03/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-4)): rascunho e estorno, trasfega, corte, atesto, livro de estoque de insumos, adição de insumo, chaptalização e tratamentos, fermentações, inventário, painel de recipientes e higienização.
> **Publicado em 03/10/2026** (versão `20261003-234927-695692a`). Migrações do ciclo consolidadas em `0006_ciclo4` e `0007_seguranca_ciclo4`, ensaiadas sobre uma cópia do ciclo 3 publicado.

## O que foi entregue

| Item | Situação |
|---|---|
| Rascunho de operação: salvar pela metade, retomar, descartar; confirmar com os volumes do momento | Pronto |
| Estorno de operação: motivo, data original, operações posteriores estornadas antes, volume, uva, composição, genealogia e rendimento de volta | Pronto |
| Estorno do romaneio: só sem uva processada; a nota volta à conferência | Pronto |
| Trasfega: várias origens e destinos, borra com "esvaziar", método, mistura com outro lote (incorporar ou lote novo) e sugestão de corte | Pronto |
| Perda avulsa com motivo, em um ou mais recipientes | Pronto |
| Corte: lotes diferentes, incorporar ou lote novo, prévia com composição e rótulo; projeto novo entre projetos e encerramento dos projetos de origem sem saldo | Pronto |
| Atesto em lote com evaporação por barrica; relatório de evaporação | Pronto |
| Estoque de insumos: entrada manual com lote e validade, saldos por local e lote, ajuste, descarte, transferência, estorno e pendência de saldo negativo | Pronto |
| Insumos em qualquer operação, SO₂ acumulado com alerta de 300 mg/L, chaptalização com alerta pela classe, tratamentos com parâmetros técnicos, consulta inversa do lote do insumo | Pronto |
| Fermentações alcoólica e malolática: início e fim, leituras, curvas e sugestão de fim | Pronto |
| Inventário da cantina: contagem com o livro na hora, medido e motivo, ajustes de uma vez numa operação, aviso acima do limite, permissão específica | Pronto |
| Painel da cantina: ocupação, lote, etapa, dias no recipiente, composição, fermentações, filtros e atalhos | Pronto |
| Higienização e manutenção como operação; recipiente que esvazia passa a "aguardando higienização" | Pronto |

## O que testar

Endereço: `https://app.vinicycle.com`.

### 1. Rascunho
1. **Operações › Desengace:** escolha a uva e o tanque e clique em **Salvar rascunho**. O volume do tanque e a uva a processar não mudam.
2. **Operações**, filtro **Rascunhos:** o rascunho aparece. Clique nele: o formulário volta como foi deixado.
3. Termine, veja a prévia e confirme. A operação ganha o código `OP-…` e some dos rascunhos.
4. Salve outro rascunho e use **Descartar rascunho**.

### 2. Estorno de operação
1. Faça um desengace num tanque e, depois, uma prensagem desse tanque.
2. Abra o desengace e clique em **Estornar**: o sistema pede antes o estorno da prensagem, com o link para ela.
3. Abra a prensagem, **Estornar**, com motivo. Confira:
   - a prévia mostra o volume de cada recipiente agora e depois do estorno;
   - a prensagem fica **Estornada**, com o link para o estorno e o motivo;
   - o estorno é uma operação própria (`OP-…`), com a mesma data de execução da prensagem;
   - o tanque volta ao volume estimado, e o lote da fração de prensa fica sem saldo;
   - no livro do recipiente, os lançamentos da prensagem aparecem marcados "estornada", e os do estorno os anulam;
   - a ficha do lote volta à composição e ao rendimento de antes, sem a genealogia da prensagem.
4. Agora estorne o desengace: o tanque fica vazio e a uva volta a **Uva a processar**.
5. Tente estornar de novo, ou estornar o próprio estorno: o sistema recusa.

### 3. Estorno do romaneio
1. Abra um romaneio confirmado cuja uva já foi processada e clique em **Estornar**: o sistema lista as operações a estornar antes.
2. Estornadas essas operações, estorne o romaneio, com motivo. Ele fica **Estornado** e sai da uva a processar.
3. Se o romaneio veio do XML da nota, importe o mesmo XML de novo: a nota está livre para o romaneio certo.

### 4. Trasfega
1. **Operações › Nova operação › Trasfega:** origem um tanque com vinho, destino um tanque vazio, litros que chegaram um pouco menos que o saldo, e marque **Esvaziar**. A prévia mostra a borra calculada; confirme. O tanque de origem fica vazio, e o destino fica com o mesmo lote e a mesma composição.
2. Um tanque enchendo duas barricas: uma origem, dois destinos. Depois, as duas barricas voltando para um tanque: duas origens com **Esvaziar**. Se os litros que saíram não fecharem com os que chegaram, o sistema avisa.
3. **Mistura:** trasfegue para um tanque que já tem outro lote do mesmo projeto. Escolha **Incorporar** ou **Lote novo**. Com variedades diferentes, o sistema sugere registrar como corte; marque **Registrar como corte** ou dê "ciente".
4. Estorne uma trasfega: o vinho e a borra voltam à origem.

### 5. Corte
1. **Nova operação › Corte:** duas origens de lotes diferentes (informe quanto saiu de cada uma, ou **Esvaziar**) e um tanque vazio como destino, em **Lote novo A**. Veja a prévia: a composição do lote novo e o que o rótulo pode declarar (varietal 75%, ou 85% na IP; safra 85%).
2. Confirme: a ficha da operação mostra **Corte** e a genealogia de cada lote de origem; a ficha do lote novo mostra de onde veio.
3. **Entre projetos:** se as origens são de projetos diferentes, a tela pede o **nome do projeto novo**. Depois de confirmar, o projeto novo aparece com o código na sequência, e o projeto de origem que ficou sem saldo aparece **Encerrado**, "incorporado ao projeto" novo.
4. Estorne o corte: os projetos de origem reabrem, e o projeto novo fica cancelado.
5. **Incorporar:** num destino que já tem lote, escolha **Incorporar ao lote**. O lote mantém o código e o projeto.

### 6. Atesto
1. **Nova operação › Atesto:** escolha a origem (um tanque do mesmo lote das barricas) e clique em **Todas do lote**: as barricas entram na lista. Informe os litros repostos em cada uma.
2. A prévia mostra cada barrica de volta ao volume cheio e a evaporação lançada (igual aos litros repostos). Corrija a evaporação de uma barrica, se for o caso; com evaporação zero numa barrica cheia, o sistema bloqueia pela capacidade.
3. Atesto com vinho de outro lote: a barrica mantém o lote dela (o vinho se incorpora).
4. **EnoTrace › Relatórios:** a evaporação de cada barrica no período, com o número de atestos e o percentual sobre a capacidade.

### 7. Estoque de insumos
1. **Configurações › Locais:** um local de estoque do EnoTrace (ex.: "Almoxarifado").
2. **Insumos e embalagens:** marque **Controla lote** e **Controla validade** num insumo (ex.: metabissulfito).
3. **EnoTrace › Estoque › Entrada:** local, número da nota, o insumo, a quantidade, o lote do fabricante e a validade. Uma segunda entrada com o mesmo lote soma no mesmo lote.
4. A lista mostra o saldo; lote com validade nos próximos 60 dias aparece **vencendo**. A ficha do item mostra o saldo por local e por lote e os movimentos.
5. **Ajuste ou descarte:** descarte 50 g com motivo; ajuste a diferença de uma contagem (negativa quando falta).
6. **Transferência** entre dois locais.
7. Faça um descarte maior que o saldo: o sistema aceita, avisa e mostra **Saldo negativo** na lista; a pendência some quando uma entrada cobre o saldo.
8. **Estornar** uma entrada errada: a entrada inteira é desfeita, com a data original.

### 8. Adição de insumo, SO₂, chaptalização e tratamentos
1. **Insumos e embalagens:** no metabissulfito, informe o **teor de SO₂** (cerca de 57%).
2. **Nova operação › Adição de insumo:** recipiente, metabissulfito, lote e dose (ex.: 10 g/hL). A prévia mostra o SO₂ adicionado no recipiente; confirme. O estoque baixa a quantidade calculada, e a ficha da operação mostra a conta.
3. Repita até passar de 300 mg/L: o sistema pede "ciente", com a fonte (IN Anvisa 211/2023). Escolha um lote vencido: outro aviso.
4. Trasfegue esse vinho para um tanque com outro vinho: o SO₂ do destino é a média pelos litros.
5. No desengace, na trasfega ou no atesto, lance um insumo no cartão **Insumos**; marque **Não estocado** para um insumo trazido pelo cliente (sem baixa).
6. **Estoque › item › Onde entrou** (em cada lote): os lotes de vinho que receberam aquele lote de insumo.
7. **Chaptalização:** num projeto com classe **Vinho fino** e cor **tinto**, lance açúcar em kg ou g/L. Acima de 1,5% vol estimado, o sistema avisa (Decreto 8.198/2014, mantido como referência). O recipiente fica **chaptalizado** na composição.
8. **Parâmetros técnicos › Tratamentos:** cadastre, na filtração, "Porosidade (µm)" como obrigatório. **Nova operação › Tratamento:** filtração, recipientes, a porosidade, uma perda e insumos.
9. Estorne uma adição: o insumo volta ao estoque e o SO₂ do recipiente volta ao anterior.

### 9. Fermentações
1. **EnoTrace › Fermentações › Iniciar fermentação:** recipiente com mosto, alcoólica.
2. **Leitura:** densidade e temperatura, algumas vezes ao longo dos dias (a hora da amostra pode ser no passado). Abra a fermentação: as curvas de densidade e de temperatura e a tabela das leituras.
3. Lance três leituras iguais abaixo de 0,995: aparece "Leituras estáveis: pode ter terminado". O critério fica em **Configurações › Parâmetros**.
4. **Encerrar:** a fermentação sai das em andamento. A malolática começa e termina à parte.
5. Estorne a operação de fim: a fermentação volta a estar em andamento.

### 10. Perda
1. **Nova operação › Perda:** um recipiente, um motivo (vazamento, amostra…) e os litros; ou **Esvaziar** para perder todo o saldo (descarte).
2. A prévia mostra a perda com o motivo; a composição do recipiente não muda.

### 11. Inventário da cantina
1. **EnoTrace › Inventário › Nova contagem:** data e hora da contagem e, se quiser, só um local. A lista traz cada recipiente com o lote e o volume do livro naquela hora.
2. Digite o **medido** de alguns recipientes (o que não foi contado fica vazio) e o motivo de cada diferença; **Motivo para as diferenças sem motivo › Aplicar** preenche de uma vez. **Salvar contagem** guarda para terminar depois, inclusive por outra pessoa.
3. **Prévia dos ajustes:** cada recipiente com diferença, antes e depois. Diferença acima de 2% do livro pede "ciente" (o percentual fica em **Configurações › Parâmetros**).
4. **Confirmar:** sai uma operação **Ajuste de inventário**, com os motivos, e a composição dos recipientes não muda. Sem nenhuma diferença, o inventário se confirma sem operação.
5. **Permissão:** com diferenças, só confirma quem tem **Ajuste de inventário** na grade (Configurações › Perfis e permissões). Nos perfis-modelo, enólogo e RT têm; o cantineiro conta e salva, mas não confirma. Os perfis já criados na sua empresa não ganham a permissão sozinhos: marque-a na grade de quem deve ter.
6. Recipiente vazio no livro com volume medido: o sistema pede para lançar antes a operação que pôs vinho nele.
7. Estorne o ajuste na ficha da operação: o livro volta ao que era.

### 12. Painel da cantina
1. **EnoTrace › Painel da cantina:** no alto, a ocupação total, os recipientes com vinho, os aguardando higienização e as fermentações em andamento.
2. Cada recipiente: a barra de ocupação, litros de quantos e a %, o lote e a etapa, há quantos dias o vinho está ali, o projeto e a composição. Fermentação em andamento aparece como **FA** ou **FML**, com link.
3. Filtre por local, tipo, situação e cheios ou vazios; busque por recipiente, lote ou projeto.
4. Os **⋯** de cada recipiente abrem a operação já com ele escolhido: trasfega, atesto (barricas), adição de insumo, tratamento, perda, higienização ou manutenção; e as fichas do recipiente e do lote.

### 13. Higienização e "aguardando higienização"
1. Esvazie um recipiente numa trasfega (ou numa perda com **Esvaziar**): a prévia avisa que ele passa a **aguardando higienização**, e é o que acontece ao confirmar.
2. Tente encher esse recipiente: o sistema pede "ciente".
3. **Nova operação › Higienização / manutenção** (ou pelo atalho do painel): higienização só com recipientes vazios; produto e dose são opcionais. Confirmada, o recipiente volta a **ativo**, e a ficha da operação mostra a situação de antes.
4. A manutenção pode ser em qualquer recipiente e também o devolve a ativo (inclusive o que estava **em manutenção**).
5. Estorne a higienização: o recipiente volta a aguardando higienização.
6. **Configurações › Parâmetros › Recipiente vazio fica aguardando higienização:** desligado, esvaziar não muda a situação.
7. **Parâmetros técnicos:** com a periodicidade de higienização do tipo, o recipiente vazio cuja última higienização passou do prazo aparece **Higienização vencida** no painel.
