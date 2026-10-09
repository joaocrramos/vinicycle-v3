# Ciclo 11: assinatura e cobrança

> Item 6 da lista de 2027 (parte comercial), primeira metade. Roteiro aprovado pelo João Carlos em 04/10/2026. Os testes continuam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6)). O ciclo 12 (meios de pagamento, WhatsApp e SMS, chamados, personificação) depende das respostas da pendência 25.
> Migrações do ciclo: `0020_ciclo11` e `0021_seguranca_ciclo11`, ensaiadas sobre uma base no estado do ciclo 10 (esquema idêntico ao montado passo a passo; assinaturas antigas com o ciclo atual preenchido).

## O que foi entregue

| Item | Situação |
|---|---|
| Planos com preço por ciclo (mensal, trimestral, semestral, anual) e vigência, formas de pagamento aceitas, módulos e limites; adicionais (usuário, estabelecimento, armazenamento, módulo avulso) | Pronto |
| Assinatura com preço congelado, ciclo atual, vencimento e forma; limite efetivo = plano + adicionais; upgrade na hora com proporcional; downgrade, troca de ciclo e retirada agendados para a renovação, sem reembolso; descontos com motivo e validade | Pronto |
| Faturas de cada ciclo, emitidas sozinhas 10 dias antes do vencimento; fatura avulsa; baixa manual com comprovante; estorno; cancelamento | Pronto |
| Régua: avisos do fim do teste e bloqueio sem contratação; avisos de vencimento; tolerância de 5 dias, somente leitura e bloqueio; liberação na hora do pagamento | Pronto |
| Exportação completa dos dados (ZIP com planilhas e anexos), só o Master, também com a empresa bloqueada | Pronto |
| Vitrine "Conheça e contrate"; painel da Administração; prazos da régua configuráveis | Pronto |

## Antes de testar

**O plano Completo ainda não tem preço**, e a assinatura da sua vinícola entrou com preço contratado zero (as assinaturas que já existiam foram preenchidas assim). Por isso:

1. Em **Administração › Planos**, edite o plano Completo: marque as formas de pagamento aceitas e informe o preço de cada ciclo que quiser vender. Sem preço no ciclo, não se cria cliente nesse ciclo.
2. Em **Administração › Adicionais**, cadastre ao menos um "Usuário extra" (tipo usuário) e um "Armazenamento" (tipo armazenamento, por exemplo 10 GB por unidade), com preço mensal.
3. Para a sua vinícola (ela paga, como os demais clientes): na ficha do cliente, **Reajustar preço** (preço de tabela ou valor digitado, com motivo) vale na próxima renovação. Se quiser, **Novo desconto**, que agora também se **edita** (as faturas já emitidas não mudam).
4. Para testar a cobrança sem mexer na sua vinícola, crie um **cliente de teste** (Administração › Clientes › Novo cliente) com um e-mail seu, e use-o nos testes abaixo.

## O que testar

Endereço: `https://app.vinicycle.com`. Na Administração, o menu tem itens novos: **Painel**, Planos, Adicionais, **Faturas** e **Configurações**. No ambiente do cliente: **Configurações › Assinatura**, **Configurações › Exportar dados** e **Conheça e contrate** (Gestão).

### 1. Planos e adicionais (Administração)
1. **Novo plano:** módulos (a Gestão vem sempre), limites (vazio = sem limite), formas de pagamento, preço por ciclo (vazio = não vendido nesse ciclo) e a data a partir da qual os preços valem.
2. Edite um preço com data futura: o cartão mostra o preço de hoje e "A partir de" com o novo. Quem já assina continua com o preço contratado.
3. **Inativar** (pede motivo): o plano sai da lista de venda; as assinaturas dele continuam. Reativar.
4. **Adicionais:** "Módulo avulso" exige o módulo; o tipo não muda depois de criado.

### 2. Novo cliente e assinatura (ficha do cliente)
1. **Novo cliente:** escolha o plano e o ciclo (aparece o preço), o dia de vencimento (vazio = o dia do início) e a forma de pagamento (só as do plano). Fora do teste, a primeira fatura sai na hora.
2. Na ficha, a seção **Assinatura** mostra o plano, o ciclo atual, o total por ciclo, a próxima renovação, o uso e os limites, os adicionais, os descontos e as mudanças.
3. **Mudar de plano** para um mais caro: vale na hora; o aviso mostra o proporcional, que entra na próxima fatura. Para um mais barato: fica **agendado** para a renovação (aparece em Mudanças, com "Cancelar"); se o uso passar dos limites do plano menor, vem o aviso.
4. **Incluir** um adicional (ex.: 2 usuários): o limite de usuários sobe na hora; o proporcional vai para a próxima fatura. **Retirar**: agendado para a renovação.
5. **Mudar o ciclo** (ex.: para anual): agendado para a renovação; recusado se o plano ou um adicional não tiver preço nesse ciclo.
6. **Vencimento e forma** e **Novo desconto** (percentual ou valor por fatura, com validade; **Editar** muda as próximas faturas). O cliente vê o desconto, mas não o motivo.
7. **Reajustar preço** (só a Administração): agenda o novo preço do plano para a renovação; o cliente vê o reajuste em Mudanças, mas não o cancela. Uma troca de plano cancela o reajuste pendente.
8. Cliente **em teste**: as mudanças valem na hora e sem cobrança. **Contratar agora** abre o primeiro ciclo hoje, emite a primeira fatura e tira do teste.

### 3. Faturas e recebimentos
1. **Administração › Faturas:** todas as faturas, com busca pelo cliente ou número e filtro por situação. Clique numa fatura.
2. **Registrar recebimento:** data, valor (vem o saldo), forma, referência e comprovante (opcional). Parcial deixa "Parcial"; o total deixa "Paga". Valor acima do saldo é recusado.
3. **Estornar** um recebimento (pede motivo): ele fica riscado e a fatura volta a ter saldo.
4. **Cancelar fatura** (só sem recebimento, pede motivo).
5. Na ficha do cliente, **Fatura avulsa** (implantação, treinamento…), com itens e vencimento.
6. Como o cliente: **Configurações › Assinatura** mostra as faturas; na fatura, o **Comprovante** baixa o arquivo.
7. A tarefa de cobrança roda de hora em hora: renova o ciclo vencido (aplicando o que estava agendado) e emite a fatura do próximo ciclo 10 dias antes do vencimento.

### 4. Régua e bloqueio
Os prazos ficam em **Administração › Configurações**. Para ver a régua sem esperar dias, use o cliente de teste e uma **fatura avulsa com vencimento no passado**; a régua roda de hora em hora:
1. Vencida há até 5 dias: tudo funciona; o Master vê a faixa amarela com a data da somente leitura; e-mail de fatura vencida ao Master e ao contato financeiro.
2. Do 6º ao 20º dia: **somente leitura** (faixa com a data do bloqueio; consultar e exportar funciona, lançar não).
3. A partir do 21º: **bloqueio**. Só o Master entra, e só na Assinatura e em Exportar dados; os demais veem o aviso.
4. **Registre o pagamento:** a empresa volta a ativa na hora (e-mail de liberação).
5. Bloqueio manual (Mudar situação na ficha) não é desfeito pela régua.
6. Cliente em teste: avisos 3 e 1 dia antes do fim; no dia seguinte ao fim, bloqueio. **Contratar agora** libera.

### 5. Exportar dados, vitrine e painel
1. **Configurações › Exportar dados** (só o Master): baixa um ZIP com o LEIA-ME, uma planilha CSV por tabela (abre no Excel) e os anexos. Sem senhas nem certificados.
2. **Conheça e contrate:** os módulos que a empresa não tem. "Tenho interesse" registra uma vez; o Master contrata o módulo avulso na hora (quando houver adicional com preço).
3. **Administração › Painel:** receita recorrente mensal, clientes, usuários, faturas vencidas, previsão de 6 meses, maiores clientes, quem está perto dos limites, clientes em teste e as **oportunidades** da vitrine ("Atendido" tira da lista).

## O que ficou para depois (ciclo 12)

- Meios de pagamento integrados pelo Asaas (boleto, PIX e cartão, baixa automática e nota de serviço), WhatsApp pela Meta (SMS quando houver provedor), chamados e personificação: ciclo 12. As contas no Asaas e na Meta são as pendências 26 e 27.
- Modelos de mensagem editáveis e a tela de Envios: ciclo 12.
- Encerramento da assinatura (cliente que sai): por enquanto, Mudar situação para Inativo na ficha.
