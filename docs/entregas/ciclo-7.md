# Ciclo 7: Declarações

> Item 2 da lista de 2027, adiantado em 04/10/2026, enquanto os testes dos ciclos 4 a 6 ficam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-7-declarações-2027-item-2-adiantado)): números da declaração anual ao MAPA, entrega com protocolo e ano travado, retificação, apoio ao SIVIBE.
> **Publicado em 04/10/2026** (versão `20261004-075914-5ede6d3`), depois do backup `~/backups/antes-ciclo7-20261004-1057.sql.gz`. Migrações do ciclo: `0012_ciclo7` e `0013_seguranca_ciclo7`. Decisões para revisar: [PENDENCIAS.md](../PENDENCIAS.md), ponto 19.

## O que foi entregue

| Item | Situação |
|---|---|
| Declaração anual (Portaria MAPA 615/2023): estoque em 31/12 do ano anterior, produção do ano e estoque em 31/12, a granel e engarrafado, com o vinho de terceiros separado | Pronto |
| Avisos antes da entrega: meses não fechados, projeto sem classe, produto sem registro no MAPA, variedade sem código oficial | Pronto |
| Entrega registrada com o protocolo (números guardados) e recibo em anexo; ano declarado travado | Pronto |
| Retificação: abrir com motivo (destrava o ano), concluir com o novo protocolo | Pronto |
| Apoio ao SIVIBE: uva própria por parcela e cultivar, uva comprada por fornecedor, uva de terceiros | Pronto |
| Planilha CSV de cada tabela e impressão | Pronto |
| Alerta do prazo da declaração por estabelecimento, resolvido quando a entrega é registrada; alerta de retificação aberta | Pronto |
| Relatório do mês (fechamento): a prensagem da uva conta como entrada, e o estorno conta no tipo da operação que desfaz | Ajuste |

## O que testar

Endereço: `https://app.vinicycle.com`. Menu **EnoTrace › Declarações**. A declaração anual só se marca como entregue depois que o ano termina; para testar a entrega agora, use um ano passado em que haja lançamentos (por exemplo, uma carga inicial com data de 2025).

### 1. Números da declaração anual
1. Escolha o ano. A aba **Declaração anual (MAPA)** mostra:
   - um quadro por titular ("Vinificação própria" e um por cliente de vinificação para terceiro), com estoque em 31/12 do ano anterior, produção e estoque em 31/12, a granel e engarrafado;
   - **A granel (litros):** por classe e cor do projeto. Produção = vinho elaborado no ano (desengace e prensagem). Outras entradas = granel comprado, retorno, carga inicial. Engarrafado = o que saiu para as garrafas;
   - **Engarrafado:** por marca, produto e formato, em garrafas e litros, com o registro no MAPA.
2. Confira uma conta: estoque anterior + produção + outras entradas + engarrafado + saídas + perdas, ajustes e internos = estoque em 31/12 (as saídas aparecem com sinal negativo).
3. Estorne um desengace: a produção diminui, sem aparecer em "ajustes".
4. Os **avisos** (meses não fechados, projeto sem classe, produto sem registro, variedade sem código oficial) aparecem no alto; cada um tem "Estou ciente".
5. **CSV** em cada tabela abre no Excel com vírgula decimal. **Imprimir** gera a versão para salvar em PDF.

### 2. Entrega e ano travado
1. Num ano que já terminou, marque os "Estou ciente", informe o **protocolo** e clique em **Marcar como entregue**.
2. A declaração mostra "Entregue", o protocolo e quem registrou; os números passam a ser os guardados na entrega. Anexe o **recibo** do gov.br.
3. Tente lançar algo com data naquele ano (uma operação, uma entrada de estoque, o estorno de uma carga): o sistema recusa, dizendo que o ano já foi declarado.

### 3. Retificação
1. **Abrir retificação** (pede a permissão "Reabrir período" e o motivo): o ano fica destravado e o sino mostra o alerta da retificação aberta.
2. Faça a correção e, depois de retificar no gov.br, **Concluir a retificação** com o novo protocolo: o ano volta a travar e a lista mostra o protocolo anterior e o novo.

### 4. Apoio ao SIVIBE
1. Aba **Uvas (SIVIBE)**: a uva colhida no ano, em três tabelas: **própria** (por propriedade, parcela e cultivar, com o número no SIVIBE e a área), **comprada** (por fornecedor, com CPF/CNPJ, número no SIVIBE, situação do cadastro, declaração do ano anterior e notas) e **de terceiros** (por dono da uva).
2. Uva recebida sem parcela e fornecedor sem número no SIVIBE geram aviso.
3. O registro da entrega no SIVIBE (protocolo) é opcional e não trava nada.

### 5. Alerta do prazo
De 15/12 a 10/01, cada estabelecimento sem a declaração anual registrada tem o alerta do prazo (crítico a partir de 05/01). Registrada a entrega, o alerta some.

## O que ficou para depois

- **Uva enviada para processamento por terceiros** ("vinho cigano", entrega simples): entra com a vinificação para terceiros completa (2027, item 5).
- **Ordem exata dos campos do formulário do gov.br:** conferir na primeira declaração pelo sistema (janeiro de 2028, ponto 19).
