# Ambiente do cliente: navegação, bloco comum e configurações

> **Situação:** rascunho em especificação.
> **Premissas de base:** P2, P4, P9, P10, P12, P14, P20, P25, P27, P28.

## Módulos do produto

O ViniCycle tem **quatro módulos principais**, que só aparecem quando contratados (P25), e um **bloco comum**, presente em todos os planos.

| Módulo | Nome (Decidido) | Área | Situação |
|---|---|---|---|
| Campo | **VitiTrack** | Viticultura: vinhedos, talhões, manejo, maturação, colheita | Depois da Enologia |
| Enologia | **EnoTrace** | Cantina: projetos de vinho, recepção, lotes, recipientes, operações, laboratório, engarrafamento, declarações | **Primeiro módulo** |
| Enoturismo | **EnoTur** | Experiências, agenda, reservas, visitantes | Futuro |
| Gastronomia | **EnoMesa** | Restaurante e harmonização: cardápio, reservas de mesa, eventos | Futuro |
| Bloco comum | **Gestão** | "Admin" do cliente: início, pessoas, documentos, relatórios, configurações | Sempre presente, em todos os planos |

**Exibição no menu:** nome e função juntos, por exemplo "EnoTrace · Enologia". Antes do lançamento, verificar os nomes no INPI.

**Módulos não contratados (Decidido em 03/10/2026):** aparecem numa vitrine "Conheça e contrate" ou "Em breve", fora do menu de trabalho. O cliente pode registrar interesse, e o interesse chega à plataforma como oportunidade de venda.

## Estrutura da tela

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [logo] Empresa ▾ · Estabelecimento ▾      [ busca: lote, romaneio… ]  🔔  (avatar) │  ← barra superior
├───────────────┬──────────────────────────────────────────────────────────────┤
│ Menu lateral  │  Título da tela · trilha (ex.: EnoTrace › Lotes › 2026.01-042)     │
│ (por módulo,  │                                                              │
│  recolhível)  │  Conteúdo                                                    │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### Barra superior

**À esquerda:**
- Logo da empresa: a do cliente, se houver; senão, a do ViniCycle.
- **Seletor de empresa:** só aparece se o usuário tiver mais de uma (P8).
- **Seletor de estabelecimento** (P12):
  - mostra os estabelecimentos permitidos ao usuário;
  - opção "Todos" para as telas consolidadas, se o perfil permitir.

**Ao centro: busca global.** Digitar um código leva direto ao registro:
- lote (`2026.01-042`);
- lote comercial (`L26-0014`);
- romaneio, recipiente, operação.

**À direita:**
- 🔔 **Notificações** (central de alertas, P20):
  - contador de não lidas;
  - painel com a lista, cada item com link para o registro;
  - marcar como lida;
  - atalho para as preferências de notificação.
- **Avatar** (foto ou avatar sugerido, P2). Ao clicar:

  | Item do menu do avatar | Observação |
  |---|---|
  | Nome, e-mail e perfil na empresa atual | Cabeçalho do menu |
  | **Meu perfil** | Dados pessoais (bloco P2), avatar, troca de e-mail |
  | **Segurança** | Trocar senha (por token, P10), segundo fator, sessões abertas |
  | **Preferências** | Tema (claro/escuro/sistema), paleta, idioma, formato de data, notificações |
  | Trocar empresa | Se tiver mais de uma |
  | Administração da plataforma | Só para a equipe da plataforma |
  | Ajuda e suporte | Abrir chamado, **meus chamados**, documentação |
  | Termos e privacidade | Versões aceitas |
  | **Sair** | |

**Faixas fixas no topo** (quando aplicável):
- personificação (P28);
- período de teste (dias restantes);
- somente leitura ou bloqueio por inadimplência;
- passagem de bastão pendente.

### Menu lateral

- **Agrupamento:** por módulo, com o nome e o ícone do módulo como título do grupo.
- **Visibilidade:**
  - um módulo não contratado não aparece;
  - um item sem permissão de Visualizar (P27) também não aparece.
- **Formato:** o menu pode ser recolhido (só ícones) e lembra a escolha do usuário.
- **Ordem (Decidido em 05/10/2026):** do uso diário para o raro.
  1. **Topo, sem título:** Início e Aprovações (com o número de pedidos pendentes, só para quem aprova).
  2. **Módulos contratados**, começando pelo EnoTrace: o trabalho do dia fica solto, a um clique; o semanal e o mensal ficam em seções retráteis. Módulos novos (VitiTrack, EnoTur, EnoMesa) entram entre o EnoTrace e a Gestão.
  3. **Gestão:** Pessoas, Diário e a seção Documentos (Documentos e Autocontrole).
  4. **Configurações**, grupo próprio no fim: seção "Empresa e acesso" (Empresa, Estabelecimentos, Locais, Usuários, Perfis e permissões, Parâmetros, Auditoria) e seção "Conta e dados" (Assinatura, Exportar dados, Carga inicial).
  5. **Rodapé:** "Conheça e contrate" (vitrine, fora do trabalho do dia) e "Recolher menu".
- A seção da tela aberta abre sozinha; cada item tem um ícone próprio, sem repetição.

## Gestão (bloco comum)

Presente em todos os planos. Especificação detalhada em [gestao.md](gestao.md).

| Item | Conteúdo | Quem acessa por padrão |
|---|---|---|
| **Início** | Painel geral do estabelecimento: alertas, vencimentos próximos, pendências, atalhos dos módulos contratados | Todos |
| **Pessoas** | Cadastro único com papéis (P2): clientes, fornecedores, produtores de uva, funcionários, transportadores, laboratórios, responsáveis técnicos | Conforme perfil |
| **Documentos** | Central de documentos com vencimento: registros MAPA, ART/AFT, licenças, AVCB, alvarás, laudos de água, certificados, **contratos** (ex.: vinificação para terceiros) e **certificados de origem**; com alertas (P20). Organização por **pastas ou etiquetas**, vínculo opcional a um módulo e registro de **quem assinou e quando** (a assinatura digital fica para depois) | Responsável Técnico, Master |
| **Relatórios** | Relatórios gerais e exportações (P4, P23). Qualquer relatório pode ser **agendado por e-mail** (semanal, quinzenal ou mensal), por usuário, com o filtro salvo | Conforme perfil |
| **Diário** | Notas datadas por estabelecimento, com autor, anexos e vínculo opcional a projeto, recipiente ou parcela. No campo, ajuda a etapa 2 da declaração de uvas do SIVIBE ("condições que afetaram a produtividade") | Todos |
| **Aprovações** | Solicitações pendentes de aprovação (P27): solicitante, tipo, registro, aprovar ou recusar | Quem tiver a ação "aprovar" |
| **Suporte** | Meus chamados: abrir, acompanhar e conversar com o suporte da plataforma | Todos |
| **Configurações** | Ver abaixo | Master e quem tiver permissão |

### Estoque: um por módulo (Decidido)

Cada módulo tem o **seu estoque**, porque os itens são diferentes e fisicamente ficam em lugares diferentes:

| Módulo | Itens típicos |
|---|---|
| VitiTrack | Fertilizantes, defensivos, materiais de campo |
| EnoTrace | Insumos enológicos, embalagens (garrafas, rolhas, rótulos), produto acabado |
| EnoTur | Itens de loja e de experiências |
| EnoMesa | Insumos de cozinha e bar, bebidas |

**O que é comum** a todos os estoques:
- **Estrutura única:** as mesmas tabelas, telas e regras (itens, lotes, validade, movimentos em livro somente-inclusão P13, inventário, importação de NF-e P11). Cada item e cada movimento **identifica o módulo** a que pertence.
- **Menu:** cada estoque aparece dentro do menu do seu módulo.

**Por estabelecimento e por local (Decidido):**
- cada estoque é por estabelecimento (P12);
- dentro do módulo, o cliente pode ter mais de um **local de estoque** (ex.: "Almoxarifado da cantina" e "Depósito de embalagens").

**Entrada por NF-e (Decidido):**
- ao importar uma nota (P11), o destino de cada item só pode ser o estoque de um **módulo contratado** pela empresa;
- o usuário escolhe o módulo e o local de cada item, e a escolha é memorizada para as próximas notas do mesmo fornecedor e item;
- **Descarte na importação (Decidido):** itens da nota que não têm onde entrar podem ser **descartados da importação**.
  - **Exemplo:** uma nota traz fertilizante e levedura, mas o cliente só contratou o EnoTrace. A levedura entra no estoque do EnoTrace; o fertilizante é descartado, porque não há estoque do VitiTrack.
  - O mesmo vale para frete, serviços e materiais de uso imediato.
  - O descarte fica registrado na importação (quem, quando, quais itens) e é memorizado: na próxima nota, o mesmo item já vem sugerido como descartado.

**Descarte de estoque:** saída de itens vencidos, avariados ou inutilizados, com motivo obrigatório e baixa do lote correspondente.

**Validade (Decidido em 03/10/2026):** cada lote de item mostra a situação válido, vencendo (antecedência configurável, padrão de 30 dias) ou vencido, com alerta na central (P20).

**Produção não é transferência.** Garrafa vazia, rolha e rótulo são itens de embalagem. O vinho engarrafado é **outro produto**. A passagem de um para o outro é uma **ordem de produção (engarrafamento)**:
- consome do estoque a garrafa, a rolha, o rótulo etc.;
- consome os litros do vinho;
- insere o produto acabado.

Ver [cantina.md](cantina.md#engarrafamento-decidido-na-própria-vinícola-como-ordem-de-produção).

**Transferência entre locais:** move itens entre locais do mesmo módulo e estabelecimento. **Entre estabelecimentos da empresa:** prevista para produto acabado, como tipo de saída (ver cantina.md, "Saídas"), com entrada correspondente no estabelecimento de destino (Decidido em 03/10/2026). *A transferência entre módulos fica para definir quando EnoTur e EnoMesa forem especificados.*

**Visão consolidada (Decidido):** um relatório na Gestão soma todos os estoques, só para consulta.

### Configurações

| Seção | Conteúdo |
|---|---|
| **Empresa** | Dados do cliente (bloco P2: razão social, nome fantasia, endereço, IE/IM, logotipo, telefones, redes, contatos, contato financeiro) e perfil da vinícola. **O Master pode atualizar** (Decidido) |
| **Estabelecimentos** | Criar, editar e inativar estabelecimentos, dentro do limite do plano. Dados regulatórios: registro MAPA com validade, RT, capacidade, fuso, perfil do estabelecimento |
| **Usuários** | Lista de usuários; convidar (P8, convite com preenchimento dos dados); perfil e estabelecimentos permitidos de cada um; inativar; **Passar o bastão** (só o Master) |
| **Perfis e permissões** | Perfis da empresa e a **grade** em matriz telas × ações (P27). O perfil Master aparece bloqueado |
| **Parâmetros** | Formatos de código (P19), estratégias de baixa de saídas, rendimento padrão, parâmetros de análise usados, motivos de perda, conversão de alertas legais em bloqueio (P29) |
| **Notificações** | Quais alertas a empresa gera, para quem e por qual canal: tela, e-mail, WhatsApp ou SMS (P20) |
| **Integrações** | Certificado A1 (P11), importação de XML de vendas, PDVs (futuro) |
| **Assinatura** | Plano, adicionais, uso × limites, faturas, pedido de upgrade/downgrade (só o Master) |
| **Auditoria** | Consulta da auditoria da empresa, incluindo personificações (P14, P28) |
| **Exportar dados** | Pacote completo (P15), só o Master |

**Documento do cliente (Decidido):** o CNPJ/CPF identifica o contrato.
- O Master **não** altera o documento.
- A troca do documento é feita pelo suporte, porque equivale a mudar de cliente.

## Menu do EnoTrace (Enologia, primeiro módulo) — em refinamento

**Ponto de partida (Decidido): o projeto de vinho.**
- O fluxo da cantina começa pela **criação de um projeto de vinho**, e tudo gira em torno dele, inclusive o recebimento de uvas.
- O projeto contém **lotes de produção** (rastreio interno). Na finalização, gera o **lote comercial** do contrarrótulo.
- Um corte entre projetos gera um **novo projeto**.
- Detalhes em [cantina.md](cantina.md#projeto-de-vinho-decidido).

**Menu em uso (Decidido em 05/10/2026):**
- **Soltos, do dia a dia:** Painel da cantina, Projetos de vinho, Recepção da uva, Operações, Fermentações, Laboratório.
- **Envase e expedição ▸** Engarrafamento, Espumante na garrafa, Lotes comerciais, Saídas.
- **Estoque ▸** Estoque, Notas de entrada, Selos numerados.
- **Conformidade ▸** Inventário da cantina, Fechamento do mês, Declarações, Livro de álcool, Relatórios.
- **Terceiros ▸** Contratos, Conta do cliente, Dossiês, Produção em terceiro.
- **Cadastros ▸** Recipientes, Produtos, Marcas, Insumos e embalagens, Vinhedos (vai para o VitiTrack quando ele existir), Catálogos, Parâmetros técnicos.

**Rascunho inicial do menu** (03/10/2026, mantido como registro):

| Item | Conteúdo |
|---|---|
| **Painel da cantina** | Projetos em andamento, mapa dos recipientes, fermentações, alertas |
| **Projetos de vinho** | Criar e acompanhar projetos. Ficha do projeto: dados, uvas recebidas, recipientes atuais, operações, análises, insumos, envases, **história completa** e genealogia |
| **Recepção de uva** | Romaneios, sempre vinculados a um projeto |
| **Operações** | Registrar operações e consultar o **livro da cantina** |
| **Laboratório** | Análises, laudos, curvas de fermentação |
| **Engarrafamento** | Ordens de engarrafamento (consomem vinho e embalagens, geram produto acabado e o lote comercial), garrafas em processo de espumante |
| **Estoque** | Insumos enológicos, embalagens, produto acabado (mecanismo comum, estoque próprio do EnoTrace, por local) |
| **Saídas** | Importação de XML de vendas, transferências, baixa por lote |
| **Declarações** | Declaração anual ao MAPA, fechamento mensal, dados para o SIVIBE |
| **Relatórios** | História do projeto/lote, livro de movimentos, estoques, rendimentos |
| **Cadastros ▸** | Submenu, abaixo |

**Cadastros ▸** (submenu):

| Cadastro | Conteúdo |
|---|---|
| Tipos de recipiente | Catálogo global (tanque inox, barrica, autoclave, ovo de concreto, ânfora…) + tipos próprios do cliente |
| Recipientes | Tanques, barricas, autoclaves… (um a um, com tipo, capacidade e frio) |
| Variedades de uva | O **catálogo global** de variedades (com código oficial, tipo e cor: tinta, branca ou rosada) fica com a plataforma. O cliente **associa as variedades com que trabalha**, e só elas aparecem nas telas dele. Se usar uma variedade fora do catálogo (clone local, nome regional), **cria a sua**, marcada "sem código oficial"; a plataforma é avisada para avaliar a inclusão no catálogo global, e as declarações mostram alerta (Decidido em 03/10/2026) |
| Tipos de insumo | Leveduras, acidificantes, clarificantes, enzimas, nutrientes, taninos, conservantes… (catálogo global + próprios). Cada tipo define as **unidades e apresentações permitidas** |
| Insumos | Itens de insumo do cliente (Decidido em 03/10/2026: cadastro completo): tipo, nome comercial, **marca**, **fabricante** (pessoa com papel fabricante, P2), **apresentação** (pó, pastilha, líquido…), unidade base, estoque mínimo, controle de lote e validade e, quando houver, limite legal (P16). Ajuda no recolhimento e na associação de itens da NF-e (P11) |
| Marcas | Nome e **dono**: a própria empresa ou o cliente de vinificação para terceiros (Decidido em 03/10/2026) |
| Produtos | Vinhos comerciais: **marca**, **denominação completa** (classe, cor e classificação quanto ao açúcar), registro MAPA, versões de rótulo com o **teor alcoólico declarado** (% vol), formatos e **ficha de embalagem** (materiais por unidade) |
| Motivos de perda | Catálogo global + próprios |
| Parâmetros de análise | Quais parâmetros o cliente mede, com unidade e faixa de referência |

*Há mais cadastros a definir na especificação detalhada.*

## Primeiro acesso do Master

1. **Convite:** o Master preenche os dados pessoais, define a senha e aceita os termos.
2. **Estabelecimento:** sem estabelecimento cadastrado, a tela obrigatória de **criação de estabelecimento** abre antes de qualquer outra.
3. **Primeiros passos:** a tela **Início** mostra a lista abaixo, que some quando concluída:
   - completar os dados da empresa;
   - convidar usuários;
   - revisar os perfis;
   - cadastrar recipientes;
   - importar o estoque inicial (P23);
   - cadastrar documentos com vencimento.

## Nomes dos módulos (Decidido)

Os nomes atuais misturam idiomas e lógicas: *Grape* é inglês, enquanto *Eno* é a raiz latina de vinho. A proposta segue uma só lógica, a do termo técnico **vitivinicultura**:
- **Viti-** para a videira;
- **Eno-** para o vinho e o que vem dele.

| Módulo | Atual | Proposta | Por quê |
|---|---|---|---|
| Campo | GrapeTrack | **VitiTrack** | Par direto com EnoTrace: *viti* (videira) + *track* (acompanhar) |
| Enologia | EnoTrace | **EnoTrace** (manter) | Já comunica rastreabilidade, o coração do produto |
| Enoturismo | EnoTur | **EnoTur** (manter) | Curto e claro em pt e es |
| Gastronomia | EnoGastro | **EnoMesa** | "Mesa" evoca restaurante e harmonização, e é igual em pt e es |

**Alternativa só em português:** ViniCycle Campo, Cantina, Turismo e Mesa.

**Recomendação para a interface:** o menu mostra o nome do módulo e, em texto menor, a função. Exemplo: "EnoTrace · Enologia". O cliente novo entende na hora, e a marca se fixa.

**Nome do bloco comum:**
- **Gestão** (recomendado);
- "Central";
- "Minha Vinícola".

*Verificar disponibilidade dos nomes no INPI antes de fixar.*

## Pendências desta especificação

1. Refinar o menu do EnoTrace (rascunho acima) junto com a especificação das telas.
2. Transferência de itens entre módulos e entre estabelecimentos: definir quando EnoTur e EnoMesa forem especificados.
