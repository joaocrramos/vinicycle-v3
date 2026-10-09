# Ciclo 6: Conformidade e virada

> Período previsto: 15/12 a 30/12/2026. Começou antes, em 04/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-6)): central de alertas, carga do saldo de abertura, fechamento mensal, história do lote, ensaio geral.
> **Publicado em 04/10/2026** (versão `20261004-013552-45c956a`). Migrações do ciclo consolidadas em `0010_ciclo6` e `0011_seguranca_ciclo6`. Roteiro da virada: [virada-2027.md](../virada-2027.md).

## O que foi entregue

| Item | Situação |
|---|---|
| Central de alertas: sino com contador e painel, tela Alertas, alertas que se resolvem sozinhos, leitura por usuário | Pronto |
| GLT informada depois, na ficha da saída de granel | Pronto |
| Carga do saldo de abertura por planilha CSV: granel, garrafas, insumos e embalagens; conferência linha a linha; estorno | Pronto |
| Fechamento mensal: conferência, relatório do mês (granel e produto acabado), trava dos lançamentos no mês fechado, reabertura com motivo | Pronto |
| História do lote: do lote comercial, do lote de produção ou do projeto às uvas de origem, com operações, insumos, análises, cortes, envases e saídas; impressão | Pronto |
| Início: alertas abertos, atalhos da cantina pela permissão, passos da implantação marcados pelo que já existe | Pronto |
| Ensaio geral automatizado e roteiro de virada para 01/01/2027 | Pronto |

## O que testar

Endereço: `https://app.vinicycle.com`.

### 1. Central de alertas
1. Provoque algumas causas: um documento vencido (Gestão › Documentos), um insumo com estoque mínimo acima do saldo, um lote de insumo com validade nos próximos dias, uma saída de granel sem GLT.
2. O **sino** na barra superior mostra quantos alertas não foram lidos (vermelho quando há críticos). Clique: o painel lista os alertas, cada um leva ao registro.
3. **Ver todos os alertas:** a tela Alertas, com filtro por tipo e a lista dos resolvidos. **Atualizar agora** refaz a varredura na hora.
4. Resolva uma causa (informe a GLT na ficha da saída de granel; dê entrada no insumo) e atualize: o alerta passa para os resolvidos.
5. Um usuário cujo perfil não vê o Estoque não recebe os alertas do estoque.

### 2. Carga inicial
1. **EnoTrace › Carga inicial:** escolha o tipo, **Baixar o modelo** e preencha no Excel (salve como CSV).
2. **Conferir a planilha:** os erros aparecem por linha (recipiente que não existe, variedade desconhecida, percentuais que não somam 100%…) e nada é gravado.
3. Corrigida, **Aplicar a carga:** o granel aparece nos recipientes (com a composição informada), as garrafas no estoque com o lote comercial, os insumos com lote e validade.
4. **Estornar** uma carga: o saldo sai. Se já houver movimento depois, o sistema pede para estornar antes.

### 3. Fechamento do mês
1. **EnoTrace › Fechamento do mês:** escolha um mês que já terminou. A **Conferência** mostra o que ficou pendente, com link para cada coisa.
2. Deixe um insumo com saldo negativo no mês (ajuste de inventário negativo): **Fechar o mês** não passa. Dê entrada no insumo com data do mês: passa.
3. Com rascunhos ou notas em conferência no mês, o fechamento pede "Estou ciente" de cada item.
4. Confira o **Relatório do mês**: o granel (estoque inicial, entradas, saídas, movimentos internos, ajustes e final, com a soma por tipo de lançamento) e o produto acabado por produto e formato. **Imprimir** gera a versão para salvar em PDF.
5. **Fechar o mês.** Tente lançar algo com data nele (uma entrada no estoque, uma perda, o estorno de uma operação do mês): o sistema não deixa.
6. **Reabrir o mês** (perfil com a permissão Reabrir período), com motivo: volta a aceitar lançamentos.

### 4. História do lote
1. **Engarrafamento › Lotes comerciais › história** (ou o botão **História do lote** na ficha de um lote, ou o link **história do projeto** no cabeçalho do projeto).
2. Confira as seções: lotes de produção (incluindo os de origem de um corte), uvas de origem com produtor e parcela, operações com os recipientes, insumos com o lote do fabricante, análises e laudos, cortes, envases com a composição e as saídas com quem recebeu.
3. **Imprimir:** sai só o relatório, sem o menu, em cores claras; salve em PDF pelo diálogo de impressão.

### 5. Início e virada
1. **Início:** os alertas abertos (os críticos primeiro), os atalhos da cantina que o seu perfil pode usar e os passos da implantação, marcados conforme já existe cada coisa (locais, recipientes, insumos, produtos, carga inicial, usuários).
2. Leia o [roteiro de virada](../virada-2027.md) e diga o que mudaria.
