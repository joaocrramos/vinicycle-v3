# Ciclo 3: Cantina 1

> Período previsto: 03/11 a 14/11/2026. Começou antes, em 03/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-3)): projeto e plano, recepção (romaneio, itens, pesagens, XML da nota), livro de volumes, desengace, prensagem, composição por recipiente.

## O que foi entregue

| Item | Situação |
|---|---|
| Motor das operações: confirmação numa transação só, trava por recipiente, linha do tempo, bloqueios físicos (volume negativo, capacidade, manutenção, um lote por vez, titulares diferentes, data passada que muda a composição) | Pronto |
| Composição por recipiente, calculada pelos litros (média ponderada), com a safra e o ciclo predominantes no código do lote | Pronto; conferida com os exemplos do modelo |
| Numeração na confirmação (P19): PRJ, ROM, OP e lote de produção, pelos formatos em Parâmetros | Pronto |
| Regras versionadas com fonte (P16) e "ciente" gravado (P29); Administração › Regras regulatórias | Pronto |
| Projetos de vinho: situações, variedades previstas, plano com insumos (previsto × executado), modelos de plano pelo dia 0, etapa de cada lote | Pronto |
| Vinhedos: propriedades e parcelas, próprias ou do produtor | Pronto |
| Recepção da uva: romaneio em rascunho, itens por variedade, várias pesagens, nota fiscal, transporte, alerta do SIVIBE, importação do XML da nota | Pronto |
| Desengace/esmagamento e prensagem (da massa ou direta), com prévia, frações, ajuste ao medido, rendimento real e alerta de 4/5 | Pronto |
| Consultas: conteúdo e livro do recipiente, ficha do lote, composição real do projeto e o que o rótulo pode declarar | Pronto |

## O que testar

Endereço: `https://app.vinicycle.com`. A ordem abaixo segue a vida da uva.

### 1. Preparação
1. **Parâmetros técnicos › Rendimento:** um rendimento geral (ex.: 0,70 L/kg) e, se quiser, um por variedade.
2. **Parâmetros técnicos › Ciclos da safra:** se a vinícola tem duas safras por ano, cadastre 01 e 02.
3. **Vinhedos:** a propriedade da vinícola com as parcelas.
4. **Pessoas:** um produtor de uva com o número do SIVIBE e a situação.
5. **Recipientes:** ao menos dois tanques.

### 2. Projeto de vinho (EnoTrace › Projetos de vinho)
1. Crie o projeto com classe, cor, açúcar, enólogo e variedades previstas. O código PRJ sai da safra.
2. Em **Plano**, aplique um modelo (crie em **Modelos de plano**: dia 0 desengace, dia 7 prensagem, dia 21 trasfega) e inclua um insumo com dose prevista.

### 3. Recepção (EnoTrace › Recepção da uva)
1. Nova recepção com uva comprada:
   - escolha o projeto (ou crie pelo "+");
   - inclua duas variedades, cada uma com duas pesagens (bruto e tara);
   - salve como rascunho.
2. Confirme sem o °Brix: o sistema bloqueia e diz o que falta.
3. Com fornecedor sem número no SIVIBE, a confirmação pede "Estou ciente" e cita o Decreto 12.709/2025, art. 203, V.
4. Teste **Importar XML da nota** com uma nota real de compra de uva:
   - o fornecedor é cadastrado se não existir;
   - os kg vêm da nota;
   - na nota seguinte do mesmo produtor, a variedade já vem escolhida.

### 4. Desengace (EnoTrace › Operações › Desengace)
1. Escolha a uva de um ou mais romaneios e um tanque, com lote novo. Clique em **Ver prévia**: o volume estimado e a composição aparecem antes de confirmar.
2. Teste dois tanques, repartindo a uva por item (ex.: 60% de uma variedade num tanque).
3. Tente pôr mais litros do que cabe no tanque: o sistema bloqueia.

### 5. Prensagem (EnoTrace › Operações › Prensagem)
1. Prense a massa de um tanque:
   - a flor fica no próprio tanque;
   - a 1ª prensa vai para outro tanque em lote novo.
2. Na ficha da operação, confira o ajuste de prensagem (medido − estimado) e o rendimento real.
3. Digite litros que deem mais de 0,8 L/kg: o sistema alerta pelo limite de 4/5 (Decreto 12.709/2025, art. 93) e pede "ciente".
4. Teste a prensagem direta da uva (cacho inteiro).

### 6. Consultas
1. **Recipientes:** a lista mostra volume e lote. Na ficha, a aba **Conteúdo** traz a composição e o livro de volumes com o saldo.
2. **Ficha do lote** (pelo link do lote):
   - composição de cada recipiente e a do lote;
   - genealogia (de onde veio, para onde foi);
   - o que o rótulo pode declarar (varietal ≥ 75%, safra ≥ 85%).
3. **Projeto:** composição real, Recepções e Operações.

## Pontos para decidir

Estão em [PENDENCIAS.md](../PENDENCIAS.md): Syrah fora da tabela do SISDEVIN (ponto 1), insumos e estoque no ciclo 4 (ponto 2), recriação da base antes do uso real (ponto 3) e vigência da regra do transporte no RS (ponto 5).

## Fica para os próximos ciclos

| Item | Quando |
|---|---|
| Rascunho e estorno de operações (até lá, operação confirmada não se desfaz) | Ciclo 4 |
| Adição de insumo, inclusive no desengace; chaptalização | Ciclo 4 |
| Trasfega, corte, atesto, perdas, inventário, fermentações e painel de recipientes | Ciclo 4 |
| Alerta de etapa do plano atrasada na central de alertas | Ciclo 6 |
| Importação de várias notas de uma vez (.zip) e busca na SEFAZ | Com o estoque (ciclo 5) |
