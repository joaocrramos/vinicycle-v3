# Ciclo 5: Estoque e envase

> Período previsto: 01/12 a 12/12/2026. Começou antes, em 03/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-5)): laboratório básico, NF-e no estoque, granel, engarrafamento e lote comercial, saídas.
> **Publicado em 04/10/2026** (versão `20261004-005420-1fe961f`). Migrações do ciclo consolidadas em `0008_ciclo5` e `0009_seguranca_ciclo5`, ensaiadas sobre uma base no estado do ciclo 4 publicado.

## O que foi entregue

| Item | Situação |
|---|---|
| Análise interna e laudo externo de um lote (e recipiente), com os parâmetros que a empresa mede | Pronto |
| Valor digitado em outra unidade convertido para a padrão, com o original guardado (acidez total em mEq/L → g/L de ácido tartárico; acidez volátil → g/L de ácido acético; pressão em atm → bar) | Pronto |
| Fora da faixa ideal marcado, pela faixa mais específica (lote, projeto, empresa); valor fisicamente impossível bloqueado (P29) | Pronto |
| Pedido ao laboratório: amostra com código `AM-AAAA-NNNN`, coletada → enviada → laudo recebido, prazo pelo laboratório, laudo atrasado marcado, cancelamento com motivo | Pronto |
| Laboratório = pessoa com papel "laboratório"; sem credenciamento válido, aviso | Pronto |
| Laudo com número, anexos e correção; exclusão com motivo | Pronto |
| Aba **Análises** na ficha do lote, com a curva de cada parâmetro | Pronto |
| Entrada de granel (compra, retorno de terceiro, outra), com a composição informada ou "não informada", em lote novo ou incorporado | Pronto |
| Saída de granel (venda, remessa a terceiro, devolução ao titular, outra), com "esvaziar" | Pronto |
| Notas de entrada no estoque: importar o XML, conferir cada item (item do estoque, conversão, local, lote, validade) ou descartar; lançar; associação memorizada por fornecedor; estorno da nota inteira | Pronto |
| Engarrafamento: previsão de garrafas e materiais com o que falta; ordem (planejada, em execução, encerrada, cancelada); produção do dia com perda, materiais previsto × real e entrada do produto acabado; lote comercial `L26-0001` com a composição engarrafada; aviso do laudo fora do teor declarado | Pronto |
| Saídas: manual e pela nota de venda (NF-e ou NFC-e), baixa por lote pela estratégia, sem lote com aviso de recall, devolução ao lote de origem, estorno, relatório de recolhimento | Pronto |
| Nota, remetente ou destinatário, transportador, GLT e embalagem; saída sem GLT pede "ciente" (Decreto 12.709/2025, art. 203, IV); recebimento confirmado na ficha | Pronto |

## O que testar

Endereço: `https://app.vinicycle.com`.

### 1. Preparar
1. **EnoTrace › Parâmetros técnicos › Análises:** marque os parâmetros que a vinícola mede (pH, acidez total, SO₂ livre, graduação…) e dê a faixa ideal de alguns (ex.: pH de 3,2 a 3,7).
2. **Gestão › Pessoas:** cadastre o laboratório externo com o papel **Laboratório** e, se quiser, o documento de credenciamento.

### 2. Análise interna
1. **EnoTrace › Laboratório › Nova análise**, tipo **Análise interna**: escolha o lote (e o recipiente, se quiser), a data da coleta e os valores. **Registrar.**
2. Digite um pH fora da faixa: a análise é gravada e o valor aparece marcado **fora da faixa**.
3. Digite um valor impossível (pH 20, por exemplo): o sistema não aceita e diz o limite.
4. Digite a acidez total em **mEq/L**: o valor gravado aparece em g/L, e a ficha mostra **Como foi digitado**.
5. Abra a análise, **Corrigir** um valor e salve; depois **Excluir**, com motivo.

### 3. Pedido ao laboratório
1. **Pedido ao laboratório:** lote, laboratório, data da coleta e prazo do laudo. A amostra ganha o código `AM-2026-…` e fica **Coletada** na aba **Pedidos ao laboratório**.
2. **Enviada:** a situação muda.
3. **Laudo:** registre os resultados, o número do laudo e anexe o PDF. A amostra fica **Laudo recebido**, com o link **Ver laudo**.
4. Faça outro pedido com prazo já vencido: aparece **Laudo atrasado**.
5. Cancele um pedido, com motivo.
6. Use um laboratório sem credenciamento: o sistema avisa e pede "ciente".

### 4. Ficha do lote
1. **Lotes ›** um lote com várias análises **› Análises:** a lista de análises e a curva de cada parâmetro no tempo, com as leituras das fermentações.

### 5. Granel
1. **Operações › Nova operação › Entrada de granel**, tipo **Compra**: escolha o projeto, o remetente, a GLT e a embalagem; na **Composição**, uma ou mais variedades com safra e percentual (somando 100%); destino um tanque vazio em **Lote novo A**, com os litros. A prévia mostra a composição; confirme. O lote nasce com a safra da composição.
2. Na ficha da operação, cartão **Entrada de granel**: dê a data e **Confirmar recebimento**; depois, **Desmarcar**.
3. Outra entrada sem composição, incorporada a esse lote noutro recipiente: o vinho entra como "Não informada".
4. Entrada do tipo **Retorno de terceiro**: o lote novo fica com a origem "retorno de terceiro".
5. **Saída de granel**, tipo **Venda**, sem GLT: a prévia avisa e pede "Estou ciente". Com **Esvaziar**, o recipiente fica vazio e passa a aguardar higienização.
6. Saída do tipo **Devolução ao titular** de vinho próprio: aviso.
7. Estorne a saída: o vinho volta ao recipiente.

### 6. Notas de entrada no estoque
1. **Estoque › Notas de entrada › Importar XML da nota:** escolha o XML de uma nota de compra de insumos. A nota abre em conferência; o fornecedor é cadastrado se ainda não existir. Lote, fabricação e validade vêm da nota quando ela traz o grupo de rastreabilidade.
2. Em cada item, escolha o **Item do estoque**: a conversão aparece sozinha quando as unidades combinam (KG → g = 1000), e a linha mostra quanto entra. Escolha o **Local**. Itens que não entram (frete, serviço) se marcam em **Descartar da importação**, com motivo.
3. **Ver prévia:** item sem associação impede lançar; lote vencido pede "Estou ciente". **Lançar no estoque:** a nota fica **Lançada** e os lançamentos aparecem na ficha da nota e na ficha do item.
4. Importe outra nota do mesmo fornecedor com os mesmos produtos: os itens já vêm associados (e o frete, descartado).
5. Importe a mesma nota de novo: abre a nota existente.
6. **Estornar** a nota, com motivo: o saldo volta e a nota volta à conferência. **Descartar a nota** (ex.: nota de serviço) e **Reabrir**.

### 7. Engarrafamento
1. **Preparar:** em **Produtos**, um produto com versão de rótulo (teor alcoólico declarado), formato (ex.: 750 mL) e ficha de embalagem (garrafa, rolha, cápsula, rótulo, caixa com 6 = 0,1667). Os materiais são itens de **Insumos e embalagens** com saldo no estoque.
2. No projeto com vinho, **Pronto para envase** e depois **Planejar envase** (ou **Engarrafamento › Nova ordem**). Escolha o produto, os locais e o formato: com as garrafas em branco, o sistema sugere pelos litros e pela perda média (Configurações › Parâmetros › Envase). A tabela mostra os materiais necessários, o que há no estoque e o que falta. **Criar ordem:** o projeto passa a "Envase planejado".
3. Na ordem, **Produção do dia:** litros que saíram de cada recipiente e garrafas. **Ver prévia:** saem X L, engarrafados Y L, perda de vinho; materiais previsto pela ficha (pode corrigir o real, ex.: rótulos perdidos). Se um material ficar negativo, o sistema avisa e pede "ciente". **Confirmar:** nasce o lote comercial `L26-…`; o recipiente perde os litros; os materiais saem do estoque; o produto acabado entra com o lote comercial.
4. Faça um laudo (Laboratório) do lote com a graduação alcoólica 1% acima do rótulo e registre outra produção: o sistema avisa (tolerância de 0,5% vol). Ligue o bloqueio em Parâmetros › Envase e veja que a produção não passa.
5. Segundo dia de envase: mesmo lote comercial. A ficha mostra a composição do que foi engarrafado e os lotes de produção de origem.
6. Estorne uma produção pela operação (link na lista de produções): os litros voltam ao recipiente, os materiais voltam ao estoque e o lote comercial é refeito.
7. **Encerrar** a ordem. **Cancelar ordem** só sem produção. **Engarrafamento › Lotes comerciais** lista os lotes com a composição.

### 8. Saídas
1. **Configurações › Parâmetros › De qual lote sai cada garrafa:** deixe "Usar o lote da nota" ligado e "Mais antigo primeiro".
2. **Saídas › Nova saída**, tipo **Venda**: escolha o local, o produto e a quantidade, sem lote. **Ver prévia:** sai do lote mais antigo (e de mais de um, se precisar). **Lançar saída.**
3. Outra saída escolhendo o lote; outra maior que o saldo: o sistema não deixa (produto acabado não fica negativo).
4. Mude a estratégia para **Sem lote** e faça uma saída: o sistema avisa do recall e pede "Estou ciente". Volte para "Mais antigo primeiro".
5. Na ficha de uma saída, **Devolução:** devolva parte para um local de avariadas. As garrafas voltam ao mesmo lote; o estoque mostra o saldo por local.
6. **Estornar** uma saída sem devolução: as garrafas voltam.
7. **Saídas › Notas de venda › Importar XML da nota:** o XML de uma venda (NF-e ou NFC-e). Associe cada item ao produto (a caixa com 6 com conversão 6), o local e o lote; descarte o que não é vinho (sacola, frete). **Ver prévia** e **Lançar a saída.** Importe outra nota com os mesmos produtos: já vem associada.
8. **Engarrafamento › Lotes comerciais › quem recebeu:** as saídas do lote, com destinatário, quantidade e o que voltou.
