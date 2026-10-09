# Ciclo 9: simulador de corte, espumante na garrafa, selos de IG e álcool etílico

> Item 4 da lista de 2027, adiantado em 04/10/2026, com as respostas do João Carlos (ponto 22: o sistema é genérico e prevê todas as opções). Os testes continuam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-9-simulador-de-corte-espumante-na-garrafa-selos-de-ig-e-álcool-etílico-2027-item-4)).
> **Publicado em 04/10/2026** (versão `20261004-104234-fa669db`), depois do backup `~/backups/antes-ciclo9-20261004-1340.sql.gz`. Migrações do ciclo: `0016_ciclo9` e `0017_seguranca_ciclo9`. Entra junto o menu lateral retrátil.

## O que foi entregue

| Item | Situação |
|---|---|
| Simulador de corte na ficha do projeto: em % sobre um volume ou em litros; composição, safras e rótulo; salvar, aprovar e fazer o corte já preenchido | Pronto |
| Livro de álcool etílico: entradas e usos, saldos, alerta "comunicar ao MAPA" e registro da comunicação | Pronto |
| Espumante na garrafa (tradicional e ancestral): tiragem, estágios configuráveis com perdas e insumos, finalização em lote comercial; espumante em elaboração na declaração anual | Pronto |
| Selos numerados: cadastro do selo, entrada por faixa, faixas usadas e perdidos em cada produção do engarrafamento, disponíveis | Pronto |

## O que testar

Endereço: `https://app.vinicycle.com`.

### 1. Simulador de corte (Projetos › um projeto › aba Simulações de corte)
1. Escolha "Em % sobre um volume", informe o volume (ex.: 1.000 L) e os recipientes com as % (ex.: 70 e 30). O sistema mostra os litros de cada um, a composição por variedade e safra e o que o rótulo pode declarar. Nada muda nos recipientes.
2. Troque para "Direto em litros" e digite os litros: as % aparecem. Pedir mais que o saldo gera aviso.
3. **Salvar a simulação** com um nome; **Aprovar**; **Fazer o corte** abre o corte já preenchido com as origens, os litros e o total no destino.
4. **Abrir no simulador** recarrega uma simulação salva para ajustar; **Descartar** tira da lista.

### 2. Livro de álcool etílico (EnoTrace › Conformidade › Livro de álcool)
1. Em Insumos, cadastre um insumo do tipo "Álcool etílico" e marque **É álcool etílico**.
2. Dê entrada no estoque: o sino mostra "Entrada de … de álcool etílico: comunicar ao MAPA".
3. No Livro de álcool, a entrada aparece com **Registrar comunicação**: informe a data e o protocolo, e o alerta some.
4. Os usos (adição em operação, descarte, estorno) aparecem em "Usos e outras saídas". Há CSV e impressão.

### 3. Espumante na garrafa (EnoTrace › Envase e estoque › Espumante na garrafa)
1. **Nova tiragem:** método (tradicional ou ancestral), recipiente e litros do vinho-base, garrafa (mL), número de garrafas e materiais (licor de tiragem, tampa-coroa). **Prévia** mostra tirados, nas garrafas e a perda; **Confirmar**.
2. O recipiente perde os litros (operação "Tiragem") e nasce o lote **TIR-AAAA-NNN** com as garrafas em processo.
3. **Registrar estágio:** repouso sobre borras, remuage, dégorgement, licor de expedição… com as garrafas perdidas e os insumos (ex.: licor de expedição). Os estágios são uma lista configurável em Cadastros › Catálogos.
4. **Anular** um estágio devolve as perdas e os insumos. Com estágio registrado, a tiragem não se estorna.
5. **Finalizar:** escolha o produto, o formato do mesmo volume e o local. As garrafas que sobraram entram como produto acabado num lote comercial, com a história do lote até as uvas.
6. Na declaração anual aparece o quadro "Espumante em elaboração".

### 4. Selos numerados (Cadastros › Insumos e embalagens › Selos; Envase e estoque › Selos numerados)
1. **Novo selo** (é sempre numerado) e, no produto, inclua o selo na ficha de embalagem.
2. **Receber uma faixa** (do nº X ao Y, série opcional): o estoque recebe a quantidade. Uma faixa que encosta em números já recebidos é recusada. A entrada comum de estoque não aceita selo numerado.
3. No engarrafamento, em cada produção, **Selos**: informe as faixas coladas e os números perdidos. Número não recebido ou já usado é recusado. Se o total diferir da baixa da produção, aparece um aviso.
4. Selos numerados mostra recebidos, usados, perdidos e as faixas disponíveis. Estornar a produção devolve os números; uma faixa sem número usado pode ser estornada.

### 5. Menu lateral
Gestão e EnoTrace se abrem e fecham pelo título; as seções (Documentos, Configurações, Produção, Envase e estoque, Conformidade, Cadastros) também. A seção da tela aberta vem aberta.

## O que ficou para depois

- Desfazer a finalização de um lote de tiragem: hoje, corrige-se pelo estoque do produto acabado.
- Leitura dos selos por código, um a um: a faixa digitada cobre o uso (ponto 22).
