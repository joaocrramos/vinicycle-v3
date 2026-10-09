# Módulo Administração (plataforma)

> **Situação:** rascunho em especificação.
> **Premissas de base:** P2 (cadastro padrão), P7 (limpeza), P8 (usuários e empresas), P12 (estabelecimentos),
> P14 (auditoria), P16 (regras versionadas), P25 (planos), P27 (perfis), P28 (personificação).

## Objetivo

Área usada pela **equipe da plataforma**, a equipe do ViniCycle (não os clientes), para:
- cadastrar e gerir clientes (empresas), seus estabelecimentos e o usuário Master de cada um;
- definir planos, preços, limites e adicionais, e controlar assinaturas, faturas e recebimentos;
- bloquear e desbloquear clientes;
- manter os catálogos globais (tabelas padrão) e as regras regulatórias versionadas;
- dar suporte: visão geral, auditoria, personificação, limpeza de dados.

## Quem usa

**Equipe da plataforma (P27):**
- **Administrador:** acesso a tudo.
- **Outros perfis:** criados conforme a necessidade, por exemplo Suporte e Financeiro da plataforma, cada um com a sua grade de permissões.

**Acesso:**
- A Administração é uma área separada do ambiente do cliente.
- O usuário da equipe da plataforma alterna entre "Administração" e as empresas às quais também estiver vinculado (P8).

## Mapa de telas

| Tela | Conteúdo |
|---|---|
| **Painel** | Clientes por situação, usuários ativos, assinaturas, faturas em aberto e vencidas, uso por módulo, alertas da plataforma |
| **Suporte** | Chamados de todos os clientes (ver "Suporte") |
| **Envios** | Fila de notificações por e-mail, WhatsApp e SMS: situação, tentativas, histórico e reenvio |
| **Modelos de mensagem** | Textos editáveis dos e-mails e mensagens (convite, passagem de bastão, cobrança, alertas), com variáveis e versões |
| **Clientes** | Lista de empresas → ficha do cliente (abas abaixo) |
| **Planos** | Planos, preços, módulos e limites |
| **Adicionais** | Itens vendidos à parte: usuário extra, estabelecimento extra, módulo avulso |
| **Faturas e recebimentos** | Faturas de todas as empresas, contas a receber, baixas |
| **Usuários** | Todos os usuários do sistema (identidade única por e-mail), com seus vínculos |
| **Equipe da plataforma** | Quem faz parte da equipe e com qual perfil de plataforma |
| **Perfis** | Perfis de plataforma e perfis-modelo de empresa, com a grade de permissões (telas × ações) |
| **Catálogos globais** | Tabelas padrão: variedades/cultivares, classificação oficial de produtos, unidades, insumos enológicos, aditivos e limites, tipos de recipiente, motivos de perda… |
| **Regras regulatórias** | Regras versionadas, com vigência, abrangência e fonte legal (P16) |
| **Termos e privacidade** | Versões dos termos de uso e da política de privacidade, e aceites (P21) |
| **Auditoria** | Consulta global de auditoria (P14) |
| **Manutenção** | Limpeza de dados (P7), exportação de dados de um cliente (P15) |
| **Configurações da plataforma** | Dados da empresa dona do ViniCycle, envio de e-mail, numeração de faturas, parâmetros gerais |

## Ficha do cliente (empresa)

| Aba | Conteúdo |
|---|---|
| **Dados** | Bloco padrão de cadastro (P2) da empresa. A plataforma preenche o mínimo; o cliente completa |
| **Estabelecimentos** | Consulta dos estabelecimentos **criados pelo cliente** (P12) |
| **Usuários** | Vínculos da empresa: usuário, perfil, estabelecimentos permitidos, situação. Indica quem é o Master e se há troca de Master pendente |
| **Assinatura** | Plano, adicionais, preços contratados, vigência, ciclo, período de teste, uso × limites |
| **Faturas** | Faturas da empresa e situação de pagamento |
| **Situação** | Teste / ativo / somente leitura / bloqueado / inativo, com histórico e motivos |
| **Auditoria** | Auditoria filtrada para a empresa, incluindo personificações |

O **perfil da vinícola** (regime tributário, origem da uva, produtos, IG…) é preenchido **pelo cliente**: parte na empresa, parte em cada estabelecimento.

## Fluxo: criar um novo cliente pela plataforma (Decidido)

A plataforma cria **só o cliente**. Dados regulatórios (MAPA, responsável técnico, estabelecimentos) são preenchidos **pelo próprio cliente**.

1. **Clientes → Novo.** O administrador preenche os dados cadastrais da empresa e da assinatura. Todos os campos seguem as máscaras, validações e formatação automática das premissas P2 e P3.

   | Campo | Regra |
   |---|---|
   | Tipo | Pessoa jurídica ou física |
   | Razão social (PJ) / Nome (PF) | Obrigatório |
   | Nome fantasia | PJ |
   | Documento | CNPJ ou CPF, com máscara e dígitos verificadores. Obrigatório. Busca dos dados públicos pelo CNPJ |
   | Endereço | CEP com busca automática (P2) |
   | Inscrição estadual | Número ou "Isento" |
   | Inscrição municipal | Número ou "Isento" |
   | Logotipo | Upload, ou avatar sugerido |
   | Telefones | Vários, com rótulo e indicação de WhatsApp |
   | Redes sociais | Várias |
   | E-mail de contato da empresa | Formato validado |
   | Contato financeiro | Nome, e-mail e telefone |
   | **E-mail do Master** | Obrigatório. Recebe o convite |
   | Plano, adicionais, ciclo de cobrança, data de início | Obrigatórios |
   | Começa em teste? | Sim/não (7 dias) |

2. **Ao confirmar, o sistema:**
   - cria a empresa, a assinatura e a cópia dos **perfis-modelo** (P27);
   - aplica as configurações padrão (códigos P19, estratégias de baixa…);
   - registra tudo na auditoria;
   - envia o **convite** ao Master.
3. **Convite (Decidido).** O link é de uso único e tem validade (*proposta:* 7 dias, reenviável pela plataforma). No convite, o usuário:
   - preenche **os próprios dados** pelo bloco padrão (P2): nome, documento, telefones, endereço, avatar…;
   - define a senha;
   - aceita os termos de uso e a política de privacidade (P21).

   Se o e-mail **já tem cadastro** no ViniCycle (P8), não é preciso preencher dados nem senha: o usuário só aceita o vínculo à nova empresa.
4. **Primeiro acesso (Decidido).** Enquanto a empresa **não tiver nenhum estabelecimento**, todo login cai **obrigatoriamente** na tela de criação de estabelecimento. O cliente informa ali:
   - bloco padrão (P2);
   - IE;
   - registro MAPA e validade;
   - responsável técnico;
   - capacidade;
   - perfil do estabelecimento: origem da uva, IG, atividades, produtos.

   Só depois disso o sistema é liberado.
5. **Implantação.** O Master completa o perfil da empresa, cria os demais usuários e, se precisar, outros estabelecimentos (dentro do limite do plano).
   - Uma lista de **"primeiros passos"** guia essa implantação (Decidido em 03/10/2026).

## Master e passagem de bastão (Decidido)

**Regra:** toda empresa tem **sempre exatamente um Master** (P27).

**Troca pelo próprio Master:**
1. O Master abre a lista de usuários da empresa, escolhe o futuro Master e aciona **"Passar o bastão"**.
2. O escolhido recebe um **e-mail para aceitar**. Enquanto não aceitar, nada muda e o Master atual continua Master.
3. **Prazo:** o aceite precisa ser feito em **48 horas**. Depois disso o pedido perde a validade e é preciso uma nova tentativa.
4. **Ao aceitar:**
   - o escolhido vira Master;
   - o antigo Master passa ao **perfil escolhido pelo próprio Master** no momento de passar o bastão.
5. Tudo fica registrado na auditoria. Os dois recebem a confirmação por e-mail.

**Troca pelo suporte** (Master desaparecido, falecimento, desligamento):
1. O cliente entra em contato com o suporte.
2. Pelo painel administrativo, o suporte **designa o novo Master** (um usuário da empresa ou um e-mail novo, que recebe convite). Informa o motivo e anexa a comprovação (P15).
3. O designado recebe o e-mail de aceite (48 horas), e o fluxo segue igual ao da troca pelo Master. O suporte escolhe o perfil que o Master anterior recebe, ou o inativa.
4. A ação exige permissão específica de plataforma (P27) e é auditada. O Master anterior, se tiver e-mail ativo, é **avisado** (Decidido em 03/10/2026). Como em qualquer troca, o novo Master só assume depois de **aceitar** o papel.

**Outras regras:**
- **Cancelamento:** o Master pode cancelar a passagem antes do aceite.
- **Recusa:** o escolhido pode recusar, e o Master é avisado.
- **Um pedido por vez:** há no máximo um pedido de troca pendente por empresa.

## Período de teste (Decidido: 7 dias)

- O cliente pode começar em teste de **7 dias**, com os módulos e limites do plano escolhido.
- **Avisos:** o Master é avisado antes do fim (*proposta:* D-3 e D-1).
- **Fim do teste sem contratação (Decidido): bloqueio direto**, sem período de somente leitura.
  - Como em qualquer bloqueio, só o Master entra.
  - Ele vê a opção de contratar e o botão de exportação dos dados.

## Planos, adicionais e assinaturas (P25)

**Plano:**
- **Dados:** nome, descrição, situação (ativo/inativo; um plano inativo não é vendido, mas as assinaturas existentes seguem).
- **Preço por periodicidade (Decidido):** mensal, trimestral, semestral e anual.
- **Módulos incluídos.**
- **Limites:** estabelecimentos, usuários, armazenamento de anexos (GB).

**Adicional:** nome, tipo (usuário, estabelecimento, armazenamento, módulo), preço por unidade e periodicidade.

**Assinatura da empresa:**
- **Contratação:** plano + adicionais (com quantidade), com o **preço contratado congelado** (P25).
- **Vigência e cobrança:** vigência, ciclo de cobrança, dia de vencimento, forma de pagamento. O dia do vencimento e a forma mudam pela Administração (ficha do cliente) ou pelo **Master do cliente** (Configurações › Assinatura); valem para as faturas emitidas daqui em diante, e a já emitida mantém o vencimento. Dias oferecidos: **5, 10, 15, 20, 25 e 30** (o 30 vence no último dia de fevereiro); no cliente novo sem dia escolhido, o primeiro da lista a partir do dia do início (depois do 30, o 5). Assinatura com dia de antes da lista continua com ele até trocar. O **Master muda o dia no máximo uma vez a cada 90 dias**, contados da última mudança do dia (por ele ou pela Administração); a Administração muda quando precisar, e a forma de pagamento muda a qualquer momento (Decidido em 05/10/2026).
- **Upgrade e inclusão de adicionais (Decidido):**
  - valem na hora;
  - o proporcional dos dias restantes do ciclo é cobrado na próxima fatura.
- **Downgrade e retirada de adicionais (Decidido):**
  - só valem **na renovação**;
  - o pedido pode ser registrado a qualquer momento e fica **agendado**: a empresa continua no plano atual até o fim do ciclo contratado, e a renovação já sai no plano menor;
  - **não há abatimento nem reembolso**;
  - se o uso estiver acima dos limites do plano menor, o Master é avisado antes da renovação para ajustar (P25).
- **Descontos (Decidido em 03/10/2026):** descontos e condições especiais por cliente, com motivo e validade.

## Faturas e contas a receber

**Fatura:**
- **Dados:** número sequencial da plataforma, empresa, competência, itens (plano, adicionais, proporcionais), descontos, total, vencimento, situação.
- **Situações:**

  | Situação | Significado |
  |---|---|
  | Aberta | Emitida, aguardando pagamento |
  | Paga | Recebida integralmente |
  | Parcial | Recebida em parte |
  | Vencida | Passou do vencimento sem pagamento |
  | Cancelada | Anulada |

**Recebimentos:**
- **Baixa manual (Decidido por enquanto).** O usuário informa data, valor, forma (PIX, boleto, cartão de crédito, cartão de débito, transferência, dinheiro), **referência** (ex.: ID da transação) e anexa o comprovante (P15).
- **Formas aceitas por plano (Decidido em 03/10/2026):** cada plano define as formas de pagamento aceitas (cartão, PIX, boleto).
- **Quitação:** a fatura fica paga quando a soma dos recebimentos atinge o total.
- **Integração futura:** por uma camada de integração de pagamentos (ver [Integração de pagamentos](#integração-de-pagamentos-decidido-camada-própria)).

**Geração:** automática a cada ciclo, a partir da assinatura: a fatura sai 10 dias antes do vencimento (prazo em Configurações da plataforma) e vence no primeiro dia de vencimento a partir do início do ciclo. Fatura avulsa para cobranças fora do ciclo (Decidido no ciclo 11, 04/10/2026).

## Inadimplência e bloqueio (Decidido)

| Etapa | O que acontece |
|---|---|
| Antes do vencimento | Avisos ao Master e ao contato financeiro (*proposta:* D-3 e no dia) |
| Vencida — **tolerância de 5 dias** | Tudo funciona normalmente; avisos ao Master e ao contato financeiro |
| **Somente leitura (15 dias)**, a partir do 6º dia após o vencimento | Todos os usuários entram, consultam e exportam, mas **não lançam nada**. Uma faixa avisa a situação e o prazo para o bloqueio |
| **Bloqueio**, a partir do 21º dia após o vencimento | **Só o Master consegue entrar.** Ele vê a situação, o que está em aberto e um **botão de exportação dos dados** (P15). Nada mais é acessível |
| Pagamento registrado | Desbloqueio imediato, ao dar baixa na fatura |

**Bloqueios manuais:**
- A plataforma pode bloquear ou passar a somente leitura manualmente, com motivo (pedido do cliente, uso indevido, outro), auditado.

**Prazos** (tolerância, somente leitura, avisos) em Configurações da plataforma. A régua só muda a situação que ela mesma pôs: bloqueio manual não é desfeito pelo pagamento (Decidido no ciclo 11, 04/10/2026).

**Inativação** (cliente que saiu):
- dados preservados pela guarda legal;
- exportação disponível;
- limpeza só pela Manutenção (P7).

## Catálogos globais e itens próprios (P8)

**Catálogos globais** (mantidos pela plataforma):
- variedades/cultivares, com o código oficial;
- classificação oficial de produtos;
- unidades (P17);
- insumos enológicos comuns;
- aditivos e coadjuvantes com limites (P16);
- tipos de recipiente;
- motivos de perda;
- tipos de documento regulatório (registro MAPA, ART, licença ambiental, AVCB…).

**Itens próprios:** a empresa usa os itens globais e pode criar os seus, que só ela vê.

**Atualização:** alterar um item global vale para todos. Um item global em uso não é apagado: é inativado (P26).

**Administração › Catálogos** (Decidido em 05/10/2026): a equipe da plataforma (permissão "Catálogos globais") inclui, edita, inativa e reativa os itens globais de todos os catálogos simples, **inclusive as listas oficiais**: variedades (com o código oficial do SISDEVIN), tipos de recipiente, tipos de insumo, tipos de documento e as listas de opções (materiais, motivos de perda, cores do vinho, açúcar, conselhos…). Os itens próprios das empresas não aparecem ali. Unidades, classes de produto, IGs, parâmetros de análise e regras regulatórias seguem pela carga dos dados de referência (as regras têm tela própria).

**Carga dos dados de referência:** nesses catálogos, a carga só inclui o item que falta (pelo código); não desfaz o que a Administração alterou. Opção nova numa lista existente entra logo depois da anterior da carga.

## Visão geral (Painel)

- **Clientes:** por situação, novos no mês, cancelados.
- **Usuários:** total, ativos nos últimos 30 dias, por empresa.
- **Financeiro:** receita recorrente mensal, faturas abertas e vencidas, inadimplência.
- **Uso:** módulos mais usados, **taxa de adoção** por módulo, **sessões** por dia, armazenamento por cliente, clientes perto dos limites do plano.
- **Previsão:** receita recorrente projetada para os próximos 6 meses, considerando cancelamentos e mudanças de plano; maiores clientes por receita.
- **Saúde:** últimos backups, erros recentes, fila de tarefas (alertas, e-mails, NF-e).

## Suporte (Decidido em 03/10/2026)

**Chamado:**
- protocolo, cliente, solicitante, assunto, categoria, prioridade e descrição;
- anexos (P15) e conversa entre o cliente e o suporte;
- situação, com histórico de mudanças.

**Configuração da plataforma:** categorias, situações (com cor) e **prazo de atendimento** (SLA) por plano ou por cliente, com semáforo do tempo de espera.

**Avisos:** a equipe é avisada de chamados novos; o cliente, de respostas e mudanças de situação (P20).

**Quem não consegue entrar** no sistema abre o chamado por uma página pública, informando e-mail e CNPJ.

**Feito no ciclo 12 (04/10/2026):** situações fixas (aberto, em atendimento, aguardando o cliente, resolvido, fechado); categorias configuráveis; prazo da primeira resposta por prioridade (padrão urgente 4 h, alta 8 h, normal 24 h, baixa 72 h, ajustável por plano ou por cliente); notas internas; cada usuário vê os seus chamados, o Master os da empresa.

**Ligações:** a personificação (P28) cita o número do chamado. Relatório de chamados por categoria e por prazo.

## Integração de pagamentos (Decidido: camada própria)

**Princípio:** o ViniCycle não depende de um único meio de pagamento. A cobrança passa por uma **camada de integração** (um "middleware" interno). O sistema conversa sempre com a mesma interface, e cada provedor é um **adaptador** plugável. Quanto mais integrações, melhor.

**Interface única** (o que o sistema pede, seja qual for o provedor):
- cadastrar o cliente no provedor;
- criar a assinatura ou a cobrança recorrente;
- criar uma cobrança avulsa (boleto, PIX ou cartão);
- cancelar ou alterar uma cobrança;
- consultar a situação.

**Eventos do provedor:**
- cada provedor avisa o ViniCycle por um **endereço de retorno** (webhook): pago, vencido, estornado, cartão recusado…;
- o adaptador traduz o aviso para um **evento padrão** do ViniCycle;
- a régua de inadimplência e a baixa de faturas usam só eventos padrão, nunca o formato do provedor.

**Segurança e confiabilidade:**
- todo aviso recebido é verificado (assinatura do provedor) e registrado;
- o processamento é **idempotente**: um aviso repetido não baixa a fatura duas vezes.
- **Cartão de crédito:** os dados do cartão **nunca passam nem ficam** no ViniCycle. São capturados pela página ou componente do provedor (tokenização), o que dispensa a certificação PCI.

**Configuração:**
- os provedores e as chaves de acesso são configurados na Administração, com segredos cifrados (P21);
- *proposta:* é possível usar mais de um provedor ao mesmo tempo, por forma de pagamento. Exemplo: cartão recorrente pelo Pagar.me e boleto/PIX pelo Asaas ou Cora.

**Baixa manual continua sempre disponível**, para pagamentos fora dos provedores.

**Provedores candidatos** (todos com API):

| Provedor | Pontos fortes | Observações |
|---|---|---|
| **Asaas** | Assinaturas, boleto, PIX, cartão recorrente, régua de cobrança, **emissão automática de NFS-e** | Resolve cobrança e nota numa integração só |
| **Pagar.me** | Cartão de crédito recorrente (assinaturas), PIX, boleto | Forte em cartão; do grupo Stone |
| **Cora** | Banco digital para empresas, com API de boleto e PIX | Tarifas baixas; recorrência e cartão mais limitados (*confirmar recursos atuais*) |
| Iugu | Assinaturas, boleto, PIX, cartão, NFS-e | Semelhante ao Asaas |
| Vindi | Especialista em cobrança recorrente | Integra vários adquirentes |
| Stripe | API de assinaturas muito madura; PIX e boleto no Brasil | Sem NFS-e |
| Mercado Pago, Efí | PIX, boleto, cartão | Assinaturas mais simples |

*Tarifas e recursos mudam; comparar no momento de ativar cada adaptador.* **Decidido em 04/10/2026 (pendência 25): primeiro adaptador Asaas, com a nota de serviço emitida por ele; feito no ciclo 12** (uma cobrança por fatura, paga na página do provedor).

## Autocadastro pelo site (futuro próximo — mapeamento)

Fluxo previsto para `vinicycle.com`, a ser implementado depois. Reaproveita os mesmos passos da criação pela plataforma.

1. **Escolher o plano** na página de preços → "Começar teste grátis de 7 dias".
2. **Cadastro inicial:**
   - os **mesmos dados da criação pela plataforma** (passo 1 do fluxo acima): dados da empresa, endereço, IE/IM, logotipo, contatos, redes sociais, contato financeiro;
   - mais o e-mail, o nome e a senha de quem está se cadastrando, que vira o Master.
3. **Confirmação do e-mail** por link ou código. Sem confirmação, a conta não é criada.
4. **Aceite** dos termos de uso e da política de privacidade (P21).
5. **Criação automática** da empresa em período de teste, com a pessoa como **Master**: perfis-modelo e configurações padrão aplicados.
6. **Primeiro acesso** → criação obrigatória do estabelecimento (mesmo fluxo da seção anterior).
7. **Durante o teste:** lista de primeiros passos, avisos D-3 e D-1.
8. **Contratação:** o Master escolhe a periodicidade e paga. Com meio de pagamento integrado, a liberação é automática.
9. **Sem contratação:** régua de somente leitura e depois bloqueio.

**Proteções:**
- um teste por CNPJ/CPF e por e-mail;
- limite de cadastros por IP;
- verificação anti-robô no formulário;
- a plataforma é avisada de cada novo cadastro e pode revisar.

## Pendências deste módulo

*Nenhuma pendência de decisão no momento.*
