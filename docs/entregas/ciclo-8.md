# Ciclo 8: autocontrole, aprovações, diário e relatórios agendados

> Item 3 da lista de 2027, adiantado em 04/10/2026, com as respostas do João Carlos (ponto 20). Os testes continuam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-8-autocontrole-aprovações-diário-e-relatórios-agendados-2027-item-3)).
> **Publicado em 04/10/2026** (versão `20261004-093029-b599432`), depois do backup `~/backups/antes-ciclo8-20261004-1228.sql.gz`. Migrações do ciclo: `0014_ciclo8` e `0015_seguranca_ciclo8`. Entra junto o parâmetro da chaptalização (fator e limite da prática), resposta à pendência 15.

## O que foi entregue

| Item | Situação |
|---|---|
| Autocontrole: programa pelo modelo da norma, totalmente configurável; evidências com anexos; evidência automática (higienização, temperatura); prazo e alerta de atraso | Pronto |
| Aprovações: parâmetro com as quatro ações; pedido pendente; lista com caixa de marcar (marcou, aprovou e fez); recusa com motivo; "aprovado, não feito" quando algo mudou | Pronto |
| Diário: notas datadas com vínculo a projeto, recipiente ou parcela; anexos; aba Diário nas fichas do projeto e do recipiente | Pronto |
| Relatórios por e-mail: quatro relatórios, quatro frequências, às 7h; enviar agora; permissões do momento do envio | Pronto |
| Chaptalização: fator (g/L por 1% vol) e limite da prática em Configurações › Parâmetros | Pronto |

## O que testar

> **Permissões novas:** **Programa de autocontrole** e **Aprovações: aprovar** não vêm marcadas em nenhum perfil (decisão de 04/10/2026, ponto 21). O Master tem tudo e atribui a quem quiser, em Configurações › Perfis.

Endereço: `https://app.vinicycle.com`.

### 1. Autocontrole (Gestão › Autocontrole)
1. **Criar o programa pelo modelo:** entram os dez controles da norma, com as periodicidades sugeridas:
   - mensal: pragas, higienização e temperatura;
   - semestral: água;
   - anual: fornecedores, manutenção, produtos químicos, treinamento e recolhimento;
   - sob demanda: reclamações.
2. Abra um controle e **Alterar**: mude o nome, a periodicidade (por exemplo, a cada 15 dias, ou sob demanda), o responsável e a evidência automática. **Novo controle** inclui um controle próprio. **Inativar** tira o controle da conta.
3. **Registrar evidência:** data e o que foi feito; depois, **Anexos** para o certificado ou o laudo. A próxima data anda.
4. Registre uma evidência antiga num controle de periodicidade curta: ele aparece **Atrasado** e o sino mostra o alerta.
5. **Anular** uma evidência lançada por engano: ela fica riscada, com o motivo, e deixa de contar.
6. A higienização e a temperatura contam sozinhas: lance uma higienização na cantina e veja a data no controle de higienização. Se estornar a operação, a evidência some.
7. O cantineiro registra evidências, mas não muda o programa (permissão "Programa de autocontrole", que o Master atribui).

### 2. Aprovações (Configurações › Parâmetros e Gestão › Aprovações)
1. Em **Ações que exigem aprovação**, ligue as que quiser:
   - ajuste de inventário acima do limite;
   - estorno de operação;
   - reabertura de mês;
   - retificação de declaração.
2. Peça uma dessas ações, por exemplo um estorno. Aparece o aviso "Pedido enviado para aprovação", e a operação continua confirmada.
3. Com outro usuário que tenha a permissão de aprovar (atribuída pelo Master), abra **Aprovações**: o pedido está na lista. **Marque a caixa**: a ação é feita na hora e o pedido sai da tela.
4. **Recusar** pede o motivo. Quem pediu vê a recusa no sino e em **Meus pedidos**; **Ok, visto** apaga o alerta.
5. Se algo mudou depois do pedido, a aprovação não faz a ação e o pedido fica **Aprovado, não feito**, com o motivo. Exemplos: outra operação no recipiente, o inventário alterado.
6. Quem pediu não aprova o próprio pedido (a caixa fica desligada). O Master pode aprovar o próprio.

### 3. Diário (Gestão › Diário)
1. Escreva notas com data, ligadas ou não a um projeto, a um recipiente ou a uma parcela. Os anexos ficam no clipe.
2. Use os filtros: texto, período e "Parcelas de [propriedade]", base da declaração de uvas no SIVIBE.
3. Na ficha do projeto e do recipiente, a aba **Diário** mostra as notas deles e já cria a nota ligada.
4. O autor altera e remove as próprias notas.

### 4. Relatórios por e-mail (menu do usuário › Preferências)
1. Escolha o relatório:
   - resumo dos alertas;
   - relatório do mês (o anterior);
   - painel da cantina;
   - estoque abaixo do mínimo e lotes vencendo.
2. Escolha a frequência e **Agendar**:
   - todo dia;
   - toda segunda;
   - a cada duas segundas;
   - todo dia 1º.
3. **Enviar agora** manda na hora para o seu e-mail, para conferir. O envio agendado sai às 7h.
4. Desmarque **Ativo** para pausar o envio; **Excluir** apaga o agendamento.

### 5. Chaptalização (Configurações › Parâmetros)
1. O padrão é 17 g/L por 1% vol, e você pode mudar. O ganho estimado na operação usa esse valor.
2. Para usar o limite da prática (no caso de vocês, 2% vol), preencha o campo. A chaptalização acima dele pede "Estou ciente", além do limite legal da classe.

## O que ficou para depois

- Diário sem internet: com o uso sem internet (2027, item 7).
- Envio por WhatsApp e SMS: item 6 da lista de 2027.
- Configuração de destinatários e antecedências por tipo de alerta: junto com os canais externos.
