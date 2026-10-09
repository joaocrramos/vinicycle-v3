# Ciclo 10: vinificação para terceiros e "vinho cigano"

> Item 5 da lista de 2027, decidido pelo João Carlos em 04/10/2026 (ponto 23) e completado com a revisão das opções (ponto 24). Os testes continuam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-10-vinificação-para-terceiros-e-vinho-cigano-2027-item-5)).
> Migrações do ciclo: `0018_ciclo10` e `0019_seguranca_ciclo10`, ensaiadas sobre uma base no estado do ciclo 9 (esquema idêntico ao montado passo a passo).

## O que foi entregue

| Item | Situação |
|---|---|
| Contrato de terceirização nos dois sentidos: atividades, registro do produto, itens de preço, perda tolerada, pagamento em produto, prefixo do lote, três formas do texto do rótulo (editável), SIPEAGRO; pendências da IN 72 e alertas | Pronto |
| Transferência de titularidade a granel (total no recipiente ou parcial para outro) e no estoque (o lote passa a outro titular com o mesmo código) | Pronto |
| Granel recebido do cliente; saída com o dono do produto; devolução ao titular e entrega por ordem do titular; insumos do cliente (entrada, uso, devolução da sobra); prefixo do contrato no lote comercial; conta do cliente com a perda tolerada | Pronto |
| Dossiê do lote para o cliente: PDF pela impressão, CSV e envio por e-mail, com o registro de cada envio | Pronto |
| Produção em terceiro: remessa de uva, granel e insumos; retornos parciais com perdas informadas; SIVIBE "uva enviada"; retornos de terceiro na declaração | Pronto |

## Antes de testar

- Em **Gestão › Pessoas**, cadastre um **cliente de vinificação** (para testar a cantina que presta o serviço) e uma **cantina prestadora de serviço** (para testar o vinho cigano). Cada uma com CNPJ, endereço e e-mail.
- Em **Configurações › Locais**, cadastre um local de estoque **externo** com o nome da cantina contratada (é onde ficam os insumos remetidos a ela).

## O que testar

Endereço: `https://app.vinicycle.com`. O menu do EnoTrace tem a seção nova **Terceiros**: Contratos, Conta do cliente, Dossiês e Produção em terceiro.

### 1. Contrato de terceirização (Terceiros › Contratos)
1. **Novo contrato**, "Prestamos o serviço": escolha o cliente; marque as atividades (elaboração, padronização, envase, guarda); diga quem tem o registro do produto; marque as marcas do cliente (só aparecem as dele, em Cadastros › Marcas com ele como dono); itens de preço (ex.: elaboração R$ 4,50 por litro; armazenagem por mês); perda tolerada (ex.: 2%); pagamento em produto (ex.: 10%); prefixo do lote (ex.: VC).
2. Na ficha, o **texto do rótulo** aparece montado. Troque a forma para "Produzido e envasilhado sob responsabilidade de": o texto passa a ter o nome e o endereço da unidade central. Escreva um texto próprio em "Texto do rótulo (editado)": ele prevalece.
3. Os avisos da IN MAPA 72/2018 aparecem na ficha e no sino: anexe a via do contrato (categoria "Contrato") e, se o registro do produto for do cliente, a cópia do certificado (categoria "Certificado"); os avisos somem.
4. Contrato "Contratamos" com a cantina e o registro do produto com a empresa: pede a comunicação no SIPEAGRO. Informe data e protocolo; depois mude as atividades e salve: aparece "comunique de novo".
5. Validade do registro da contraparte vencida e fim da vigência em menos de 60 dias geram alerta. Inativar o contrato (encerrado) tira os alertas dele.
6. Na **Recepção da uva**, ao escolher o dono da uva, o contrato vigente vem escolhido. Sem contrato, a confirmação pede "ciente". O mesmo na entrada de granel com titular.
7. Na ficha do produto do cliente aparece o texto do rótulo e de quem é o registro.

### 2. Transferência de titularidade
1. **Operações › Nova operação › Transferência de titularidade:** escolha o recipiente com vinho do cliente, o novo titular (a própria empresa) e o motivo "Pagamento do serviço em produto", com o contrato.
2. Parte para outro recipiente: escolha o destino (vazio ou com vinho do novo titular), desmarque "Todo o saldo" e digite os litros. Parte no mesmo recipiente é recusada (deixaria dois donos juntos).
3. Todo o saldo no próprio recipiente: deixe o destino em "O próprio recipiente".
4. A ficha da operação mostra de quem para quem, o motivo e o contrato; a genealogia liga os lotes. O contrato soma "já transferido". Estornar desfaz.
5. **Estoque › Titularidade:** garrafas (ou outro item com lote) que passam a outro titular. O lote mantém o código; a ficha do item mostra "de [cliente]" no lote.

### 3. Vinho do cliente: entrada, saída, insumos e conta (Terceiros › Conta do cliente)
1. **Entrada de granel** do tipo "Recebido do cliente para elaboração ou envase": exige o titular.
2. Engarrafe o vinho do cliente: o lote comercial sai com o prefixo do contrato (ex.: VC-L26-0001) e as garrafas ficam com o cliente.
3. **Saídas › Nova saída:** com "Dono do produto" vazio (a própria empresa), a venda não pega as garrafas do cliente. Escolha o cliente e o tipo **Devolução ao titular** (entregue a outra pessoa, pede "ciente") ou **Entrega por ordem do titular** (ao comprador dele, sem aviso).
4. **Estoque › Entrada** com "Dono" = o cliente: a levedura dele entra com lote, fora do estoque próprio (a lista mostra "de clientes"). Usar essa levedura no vinho de outro titular pede "ciente". A sobra volta ao cliente por uma saída "Devolução ao titular".
5. **Conta do cliente:** por safra, uva, mosto, granel recebido, rendimento, perdas (com o %), engarrafado, devolvido, transferido e em elaboração; garrafas; transferências; insumos; o que falta devolver. Perda acima da tolerada no contrato aparece em destaque e no sino.

### 4. Dossiê (Terceiros › Dossiês)
1. **Novo dossiê:** escolha o cliente e um lote de produção ou um lote comercial dele.
2. Confira as seções: identificação (cliente, cantina, contrato, texto do rótulo), lotes e rendimento, recepção com a nota de remessa, granel, operações, análises, insumos (com quem forneceu), recipientes, genealogia, envase, devoluções e transferências.
3. **Imprimir** (salvar em PDF), **CSV** e **Enviar por e-mail** (vem com o e-mail do cliente): o e-mail leva o dossiê no corpo, e o envio fica registrado na ficha.

### 5. Produção em terceiro, o vinho cigano (Terceiros › Produção em terceiro)
1. Para mandar vinho a granel, registre antes em Operações a **Saída de granel** do tipo "Remessa a terceiro", com a GLT.
2. **Nova remessa:** projeto, cantina, contrato, nota de remessa e itens: uva (do vinhedo próprio, de um romaneio já recebido, que sai do saldo dele, ou de um fornecedor que entregou direto na cantina), granel (a saída do passo 1) e insumos ou embalagens (do almoxarifado para o local externo da cantina).
3. **Retorno:** a granel (recipiente, litros, lote; a composição vem sugerida pela uva remetida), engarrafado (produto, garrafas e o lote informado pela cantina) e insumos consumidos pela cantina; perdas informadas e GLT. Pode haver vários retornos para a mesma remessa. Nos anexos do retorno vai o dossiê da cantina.
4. A ficha mostra o enviado, o que voltou, as perdas, o rendimento e as garrafas ainda em poder da cantina. **Marcar como concluída** quando a cantina devolveu tudo.
5. **Conformidade › Declarações:** no SIVIBE, o quadro novo "Uva enviada para processamento por terceiros"; na declaração anual, a linha "Retorno de terceiro" (já incluído nas entradas).

## O que ficou para depois

- Acesso do cliente com login para ver o lote dele (ponto 23): depende do compartilhamento entre empresas.
- Cobrança do serviço e contas a receber: com a parte comercial e a fiscal.
- O prazo de 180 dias da industrialização por encomenda (RICMS-BA, art. 280): fase fiscal.
- Como a declaração do contratante trata o retorno de terceiro: pergunta ao RT (perguntas-externas.md, ponto 2); até lá, entra como entrada, com a linha informativa.
