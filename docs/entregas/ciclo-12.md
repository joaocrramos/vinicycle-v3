# Ciclo 12: integrações e atendimento

> Item 6 da lista de 2027 (parte comercial), segunda metade. Roteiro aprovado e respostas da pendência 25 dadas pelo João Carlos em 04/10/2026. Os testes continuam acumulados.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6)).
> Migrações do ciclo: `0023_ciclo12` e `0024_seguranca_ciclo12`, ensaiadas sobre uma base no estado publicado (ciclo 11 com os ajustes); esquema idêntico ao montado passo a passo.

## O que foi entregue

| Item | Situação |
|---|---|
| Camada de pagamentos com o adaptador do Asaas: cobrança de cada fatura (boleto, PIX, cartão ou escolha do cliente), aviso de pagamento conferido pelo token, baixa automática, estorno, cancelamento e nota de serviço pelo provedor | Pronto; testado com o Asaas simulado. Liga de verdade com a conta (pendência 26) |
| WhatsApp pela Meta (modelo aprovado), camada de SMS sem provedor, pacotes de mensagens por canal (franquia mensal), preferência de cada usuário, Envios e Modelos de mensagem editáveis | Pronto; testado com a Meta simulada. Liga de verdade com a conta (pendência 27) |
| Chamados: cliente, página pública, fila da equipe com prazo e semáforo, notas internas, resumo | Pronto |
| Personificação (P28) com faixa fixa, 60 minutos, bloqueios, auditoria com as duas identidades e aviso ao Master | Pronto |

## Antes de testar

- **Pagamentos e WhatsApp só funcionam de verdade depois das contas** no Asaas (pendência 26) e na Meta (pendência 27). Sem elas, dá para ver as telas, mas nada é cobrado nem enviado.
- **Asaas, em teste (sandbox):** em Administração › Integrações, **+ Pagamento**. Escolha o ambiente Teste e cole a chave do sandbox; marque as formas e, se quiser, a nota de serviço (código do serviço do município, alíquota do ISS). Depois:
  - use **Aviso (webhook)** para copiar o endereço e o token;
  - cadastre-os no painel do Asaas (Integrações › Webhooks), com os eventos de cobrança e de nota fiscal;
  - **Testar conexão** confere a chave.
- **WhatsApp:** em Administração › Integrações, **+ WhatsApp**: identificador do número, nome do modelo aprovado pela Meta (com uma variável no corpo), idioma (pt_BR) e o token. **Mensagem de teste** manda para um número.
- Para um cliente receber WhatsApp, cadastre em Administração › Adicionais um **pacote de mensagens de WhatsApp** (por exemplo, 100 mensagens por mês por unidade) e inclua-o na assinatura dele.

## O que testar

### 1. Pagamento pelo Asaas (com a conta de teste)
1. Gere uma fatura (avulsa, na ficha do cliente de teste). Em até 2 minutos, ela ganha a cobrança no Asaas: na fatura aparecem **Link de pagamento** e, quando a forma for PIX, o **PIX copia e cola**.
2. Pague no sandbox do Asaas (ele tem a opção de simular o pagamento). O aviso chega, a fatura vira **Paga** sozinha (recebimento "pelo provedor") e a empresa sai da restrição, se estava. Em Integrações, **Últimos avisos recebidos** mostra o evento.
3. Com a nota de serviço marcada, a nota é pedida ao Asaas depois do pagamento; o número e o PDF aparecem na fatura quando ele autoriza.
4. Cancele uma fatura com cobrança aberta: a cobrança some do Asaas. Dar baixa manual numa fatura com cobrança também cancela a cobrança lá.
5. Estorno no Asaas: o recebimento fica estornado e a fatura volta a ter saldo.

### 2. WhatsApp, pacotes e modelos
1. Em **Preferências**, o usuário marca **Avisos por WhatsApp**. O telefone dele em Meu perfil precisa estar marcado como WhatsApp.
2. Avisos de cobrança ao Master e relatórios agendados com canal WhatsApp saem por ele, dentro da franquia. Sem pacote, sem telefone ou sem a integração, saem por e-mail; no relatório agendado aparece o motivo.
3. Acabou a franquia do mês: o Master recebe um e-mail avisando, e os avisos seguem por e-mail até o mês seguinte. Na assinatura aparece "WhatsApp no mês: X de Y".
4. **Administração › Envios:** a fila de e-mail, WhatsApp e SMS, com tentativas e erros; **Reenviar** o que falhou.
5. **Administração › Modelos de mensagem:** edite o texto de um aviso (por exemplo, "Fatura a vencer"), com a prévia. A versão nova vale para os próximos envios; **Voltar ao padrão** desfaz. No WhatsApp sai o assunto com o link.

### 3. Chamados
1. Como cliente: menu do seu nome › **Ajuda e suporte** › **Novo chamado** (assunto, categoria, prioridade, descrição). Anexe uma tela. O Master vê os chamados de todos; os demais, só os seus.
2. Na tela de entrada, **Não consegue entrar? Fale com o suporte** abre a página pública (nome, e-mail, CNPJ, assunto, descrição); chega um e-mail com o número.
3. Como equipe: **Administração › Suporte** mostra a fila em aberto, ordenada pelo prazo da primeira resposta, com o semáforo (no prazo, perto, atrasado). Responda (vai por e-mail ao cliente), escreva uma **nota interna** (o cliente não vê), mude a situação, a prioridade e a categoria.
4. **Prazos de atendimento:** defina horas por prioridade para um plano ou um cliente. As categorias ficam em Administração › Configurações.

### 4. Personificação
1. Na ficha do cliente, ao lado de um usuário, **Personificar**: escolha o chamado (ou escreva o motivo) e comece. Você entra como esse usuário, com a faixa vermelha no topo.
2. Confira que senha, e-mail, segundo fator, preferências, perfis, integrações, exportação, passar o bastão e a Administração ficam bloqueados.
3. O Master recebe o e-mail de aviso. Em **Configurações › Auditoria** do cliente aparecem os **Acessos do suporte**, e as ações feitas na personificação ficam com o seu nome.
4. **Encerrar** volta à Administração; depois de 60 minutos, ela acaba sozinha.

## O que ficou para depois

- SMS: a camada está pronta; falta escolher o provedor.
- Cobrança recorrente no cartão (o cliente cadastra o cartão uma vez): por enquanto, cada fatura é paga na página do provedor.
- Autocadastro pelo site: depois (pendência 25).
- Alertas da central por WhatsApp e SMS para quem escolher (Configurações › Notificações): hoje saem por WhatsApp os avisos de cobrança e os relatórios agendados.
- Aviso de entrega e leitura do WhatsApp (o aviso da Meta): quando a conta estiver ativa.
