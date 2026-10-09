# Pontos de decisão pendentes

> Lista única do que espera resposta ou ação do João Carlos. Cada ponto novo entra aqui, com data e
> onde afeta; resolvido, sai da lista "Em aberto" e vai para "Resolvidos", com a resposta e onde ficou
> registrada. Atualizado em 04/10/2026 (ciclo 12 publicado).
>
> Perguntas para o RT e o MAPA ficam em [perguntas-externas.md](perguntas-externas.md); as fiscais, em
> [FISCAL.md](FISCAL.md).

## Em aberto

### Decisões de produto

| # | Desde | Ponto | Afeta | Proposta |
|---|---|---|---|---|
| 1 | 03/10/2026 | **Syrah fora da tabela do SISDEVIN.** A tabela de cultivares de 30/03/2023 (fonte oficial, conferida no PDF) não tem Syrah nem Shiraz, só a Petite Syrah, que é outra uva. Com que código a vinícola declara a Syrah hoje? | Recepção, composição, declarações | Cadastrar como variedade própria "sem código oficial" (regra já decidida: modelo, 1.11); as declarações mostram alerta. Se houver código, incluir no catálogo global |
| 17 | 03/10/2026 | **Revisar as decisões do roteiro do ciclo 5**, tomadas pelo Claude durante a noite com a sua autorização (conversões de unidade, granel, engarrafamento, saídas, o que ficou para 2027) | Ciclo 5 | Manter, salvo o que o João Carlos mudar ([04](04-plano-de-entregas.md#roteiro-do-ciclo-5)) |
| 18 | 04/10/2026 | **Revisar as decisões do roteiro do ciclo 6**, tomadas pelo Claude com a sua autorização (alertas só na tela e calculados na abertura da central, planilha em CSV, fechamento por estabelecimento, reabertura sem fluxo de aprovação, história do lote impressa pelo navegador) | Ciclo 6 | Manter, salvo o que o João Carlos mudar ([04](04-plano-de-entregas.md#roteiro-do-ciclo-6)) |
| 19 | 04/10/2026 | **Revisar as decisões do ciclo 7 (declarações)**, tomadas pelo Claude: produção do granel = vinho elaborado no ano (desengace e prensagem); granel agrupado pela classe e cor do projeto; meses não fechados pedem "ciente" para marcar a declaração; ano declarado travado como mês fechado; retificação reabre o ano. **Na primeira declaração (janeiro de 2028), conferir a ordem dos campos do formulário do gov.br** com o relatório | Ciclo 7 | Manter ([04](04-plano-de-entregas.md#roteiro-do-ciclo-7-declarações-2027-item-2-adiantado)) |
| 4 | 03/10/2026 | **Regras decididas como técnicas, que o João Carlos pode rever** (modelo, seção 6): pendência de estoque resolvida quando o saldo volta a zero ou mais; produto acabado e selo numerado bloqueiam saldo negativo | Ciclos 5 e 6 | Manter |

### Dados e documentos

| # | Desde | Ponto | Afeta |
|---|---|---|---|
| 14 | 03/10/2026 | **Data de publicação da IN Anvisa 211/2023 no DOU**, para a vigência da regra de SO₂ total (300 mg/L). Cadastrada com 01/03/2023, com nota pedindo conferência | Regra `so2_total_maximo` |
| 5 | 03/10/2026 | **Data de vigência da Nota Técnica DIPOV 005/2018** (transporte exigido no RS), para cadastrar a regra por UF. Até lá, o transporte é opcional em todos os estados | Recepção (regra por UF) |
| 6 | 03/10/2026 | **Termos de uso e política de privacidade:** dados da JCR Tecnologia e Engenharia (razão social, CNPJ, endereço), encarregado (Fabio Alves Santos, legal@vinicycle.com), foro (Salvador/BA) e limite de responsabilidade (valor pago nos últimos 6 meses) já nas minutas ([legal/](legal/)). Faltam: local do backup (depois da pendência 8) e região de envio do Resend. Depois, revisão por advogado e carga como nova versão, antes de 01/01/2027 | Lançamento |

### Infraestrutura (ação do João Carlos)

| # | Desde | Ponto |
|---|---|---|
| 26 | 04/10/2026 | **Conta no Asaas** para o ViniCycle (JCR Tecnologia): criar a conta de testes (sandbox) e a de produção, gerar as chaves de API e configurar a emissão de nota de serviço (inscrição municipal, código do serviço, alíquota). As chaves entram na Administração, cifradas; nunca no chat. Até lá, o adaptador é testado com respostas simuladas |
| 27 | 04/10/2026 | **WhatsApp Business na Meta:** conta Meta Business verificada, número de telefone dedicado, aplicativo com a API de WhatsApp e o token permanente; os modelos de mensagem (avisos de cobrança, alertas, convite) precisam ser aprovados pela Meta antes do uso. Até lá, o canal fica desligado |
| 8 | 03/10/2026 | **Backup** para o outro datacenter: destino e acesso. **Adiado** pelo João Carlos em 04/10/2026 ("não preocupa com backup agora"); volta antes da virada |

### Testes

| # | Desde | Ponto |
|---|---|---|
| 9 | 03/10/2026 | **Testar os ciclos publicados** pelas listas [ciclo-1](entregas/ciclo-1.md), [ciclo-2](entregas/ciclo-2.md), [ciclo-3](entregas/ciclo-3.md), [ciclo-4](entregas/ciclo-4.md), [ciclo-5](entregas/ciclo-5.md), [ciclo-6](entregas/ciclo-6.md) [ciclo-7](entregas/ciclo-7.md), [ciclo-8](entregas/ciclo-8.md) e [ciclo-9](entregas/ciclo-9.md), [ciclo-10](entregas/ciclo-10.md), [ciclo-11](entregas/ciclo-11.md) e [ciclo-12](entregas/ciclo-12.md) (acumulados a pedido do João Carlos em 04/10/2026). Os ajustes pedidos entram com prioridade |

## Resolvidos

| # | Data | Ponto | Resposta | Onde ficou |
|---|---|---|---|---|
| — | 05/10/2026 | Publicar o lote 1 de ajustes | Publicado pelo Claude (versão `20261005-092854-3e728da`), depois do backup `~/backups/antes-ajustes1-20261005-1226.sql.gz` | [ANDAMENTO.md](ANDAMENTO.md) |
| 28 | 05/10/2026 | Ajustes pedidos nos testes: dia do vencimento, tanque de PP, coluna Ações, selo que não aparecia | **O Master do cliente também muda o dia do vencimento** (vale a partir da próxima fatura), **no máximo uma vez a cada 90 dias**, e os dias oferecidos são **5, 10, 15, 20, 25 e 30**; **"Tanque de polipropileno (PP)" entra e a fibra continua**, e a lista fica **editável pela Administração** (Administração › Catálogos, **todos os catálogos, inclusive os oficiais**); coluna **Ações** com lápis (editar) e **ícone de bloquear** (inativar); o selo gravava mas a lista não o mostrava (corrigido) | [ANDAMENTO.md](ANDAMENTO.md), [administracao.md](modulos/administracao.md#catálogos-globais-e-itens-próprios-p8) |
| — | 04/10/2026 | Publicar o ciclo 12 (integrações e atendimento) | Publicado pelo Claude (versão `20261004-204032-46215c1`), depois do backup `~/backups/antes-ciclo12-20261004-2337.sql.gz`; pagamentos e WhatsApp ligam com as contas (pendências 26 e 27); testes acumulados | [ANDAMENTO.md](ANDAMENTO.md), [entregas/ciclo-12.md](entregas/ciclo-12.md) |
| 25 | 04/10/2026 | Perguntas do roteiro dos ciclos 11 e 12 (parte comercial) | **Asaas** como primeiro provedor; **nota de serviço pelo provedor**; WhatsApp pela **Meta**, SMS a definir; franquia mensal como **pacote adicional, um por canal**, e, acabada, os avisos **seguem só por e-mail**; **autocadastro depois**; a vinícola do João Carlos **paga**, com **desconto editável**; preço contratado zero sai pelo **reajuste na renovação** | [04](04-plano-de-entregas.md#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6) |
| — | 04/10/2026 | Roteiro dos ciclos 11 e 12 e publicação do ciclo 11 (assinatura e cobrança) | Roteiro **aprovado** pelo João Carlos; ciclo 11 publicado pelo Claude (versão `20261004-192614-43838fa`), depois do backup `~/backups/antes-ciclo11-20261004-2223.sql.gz`; testes acumulados | [04](04-plano-de-entregas.md#roteiro-dos-ciclos-11-e-12-parte-comercial-2027-item-6), [ANDAMENTO.md](ANDAMENTO.md) |
| — | 04/10/2026 | Publicar o ciclo 10 (vinificação para terceiros e "vinho cigano") | Publicado pelo Claude (versão `20261004-175104-05b3d3c`), depois do backup `~/backups/antes-ciclo10-20261004-2048.sql.gz`; testes acumulados | [ANDAMENTO.md](ANDAMENTO.md) |
| 24 | 04/10/2026 | Revisão das opções do roteiro do ciclo 10 (outra sessão) | **Incorporadas as 12 opções** ao roteiro: atividades contratadas, registro do produto, três formas de texto do rótulo (editável), alertas da IN 72/2018, prefixo do lote, granel recebido do cliente, devolução de insumos, entrega por ordem do titular, preço em itens, remessa de granel e de insumos, retornos parciais. Prazo de 180 dias do RICMS-BA fica para a fase fiscal | [04](04-plano-de-entregas.md#roteiro-do-ciclo-10-vinificação-para-terceiros-e-vinho-cigano-2027-item-5) |
| 23 | 04/10/2026 | Perguntas do roteiro do ciclo 10 (vinificação para terceiros e "vinho cigano") | Dossiê em PDF e CSV **e enviado por e-mail** pelo sistema (login do cliente fica para depois); pagamento em produto **sugerido pelo contrato e registrado pelo usuário**; insumos do cliente **nas duas formas** (descrição livre e estoque do cliente) | [04](04-plano-de-entregas.md#roteiro-do-ciclo-10-vinificação-para-terceiros-e-vinho-cigano-2027-item-5) |
| 7 | 04/10/2026 | Redirecionamento de `vinicycle.app` | Feito: o João Carlos rodou o `infra/servidor/redirecionar-app.sh`; `vinicycle.app` e `www.vinicycle.app` respondem 301 para `https://app.vinicycle.com` (conferido em 04/10/2026) | [operacao.md](operacao.md) |
| 22 | 04/10/2026 | Perguntas do roteiro do ciclo 9 | **O sistema é genérico e prevê tudo:** espumante tradicional e ancestral (além de Charmat e Asti); simulador em % e em litros; selos por faixa digitada; livro de álcool etílico completo. Não se pergunta mais "se a vinícola faz" | [04](04-plano-de-entregas.md#roteiro-do-ciclo-9-simulador-de-corte-espumante-na-garrafa-selos-de-ig-e-álcool-etílico-2027-item-4) |
| 21 | 04/10/2026 | Permissões novas do ciclo 8 (Programa de autocontrole; Aprovações: aprovar) | **Ficam vazias:** nenhum perfil as recebe, nem os perfis-modelo; o Master atribui a quem quiser | [04](04-plano-de-entregas.md#roteiro-do-ciclo-8-autocontrole-aprovações-diário-e-relatórios-agendados-2027-item-3) |
| 20 | 04/10/2026 | Perguntas do roteiro do ciclo 8 | Aprovação para as quatro ações propostas (desligadas por padrão); aprovar = marcar a pendência numa lista, que some da tela; todos os relatórios propostos são agendáveis; autocontrole totalmente configurável (o modelo é só o ponto de partida) | [04](04-plano-de-entregas.md#roteiro-do-ciclo-8-autocontrole-aprovações-diário-e-relatórios-agendados-2027-item-3) |
| 3 | 04/10/2026 | Recriar a base antes do uso real | **Sim, recriar.** Em dezembro, depois dos testes, o João Carlos roda `scripts/publicar.sh --recriar-base` (pede a frase de confirmação) e carrega só o saldo de abertura | [virada-2027.md](virada-2027.md), passo 1 |
| 15 | 04/10/2026 | Fator da chaptalização | A vinícola usa 17 g/L por 1% vol, com 2% vol como máximo da prática; **o sistema fica genérico**: fator e limite da prática viraram parâmetro da empresa (Configurações › Parâmetros › Chaptalização; padrão 17 g/L, sem limite da prática). O limite da prática pede "ciente", além do limite legal da regra versionada | [04](04-plano-de-entregas.md#roteiro-do-ciclo-7-declarações-2027-item-2-adiantado), ajustes de 04/10 |
| 16 | 04/10/2026 | Permissão "Ajuste de inventário" nos perfis já criados | Enólogo e Almoxarife (o Master tem sempre). Marcada pelo Claude no perfil Enólogo do servidor. O perfil Almoxarife ainda não existe na empresa; o perfil-modelo Enólogo já vem com a permissão | [ANDAMENTO.md](ANDAMENTO.md) |
| — | 04/10/2026 | Publicar o ciclo 9 (simulador, espumante na garrafa, selos, álcool) e o menu retrátil | Publicado pelo Claude (versão `20261004-104234-fa669db`), depois do backup `~/backups/antes-ciclo9-20261004-1340.sql.gz`; testes acumulados | [ANDAMENTO.md](ANDAMENTO.md) |
| — | 04/10/2026 | Publicar o ciclo 8 (autocontrole, aprovações, diário, relatórios por e-mail) e a chaptalização configurável | Publicado pelo Claude (versão `20261004-093029-b599432`), depois do backup `~/backups/antes-ciclo8-20261004-1228.sql.gz`; testes acumulados | [ANDAMENTO.md](ANDAMENTO.md) |
| — | 04/10/2026 | Publicar o ciclo 7 (declarações) | Publicado pelo Claude, como os anteriores (versão `20261004-075914-5ede6d3`), depois do backup `~/backups/antes-ciclo7-20261004-1057.sql.gz`; os testes ficam acumulados, a pedido do João Carlos | [ANDAMENTO.md](ANDAMENTO.md) |
| — | 04/10/2026 | Publicar os ciclos 5 e 6 | Publicados pelo Claude, como o ciclo 4, ao fim de cada ciclo (versões `20261004-005420-1fe961f` e `20261004-013552-45c956a`), depois dos backups `~/backups/antes-ciclo5-20261004-0352.sql.gz` e `~/backups/antes-ciclo6-20261004-0433.sql.gz` | [ANDAMENTO.md](ANDAMENTO.md) |
| — | 03/10/2026 | Publicar o ciclo 4 | Publicado pelo Claude com a autorização do João Carlos (versão `20261003-234927-695692a`), depois do backup `~/backups/antes-ciclo4-20261004-0221.sql.gz` | [ANDAMENTO.md](ANDAMENTO.md) |
| 2 | 03/10/2026 | Insumos no ciclo 4 sem o estoque do ciclo 5 | Livro de estoque de insumos no ciclo 4 (lotes, movimentos, entrada manual, ajuste); XML da NF-e no ciclo 5 | [04-plano-de-entregas.md](04-plano-de-entregas.md), roteiro do ciclo 4 |
| 10 | 03/10/2026 | Inventário com diferença acima do limite | Aviso com "ciente" e permissão de ajuste; aprovação em 2027 | 04-plano-de-entregas.md, roteiro do ciclo 4 |
| 11 | 03/10/2026 | Como somar o SO₂ adicionado | Teor de SO₂ no cadastro do insumo; acumulado por parte, viajando com os litros; alerta a 300 mg/L | 04-plano-de-entregas.md, roteiro do ciclo 4 |
| 12 | 03/10/2026 | Leituras da fermentação antes do laboratório | Densidade e temperatura já no ciclo 4, na tabela de análise | 04-plano-de-entregas.md, roteiro do ciclo 4 |
| 13 | 03/10/2026 | Itens especificados sem ciclo | Tratamentos, higienização e "aguardando higienização" automática no ciclo 4; granel no ciclo 5 | 04-plano-de-entregas.md, roteiro do ciclo 4 |
| — | 03/10/2026 | Lançamento retroativo que muda a composição de um recipiente com operação posterior | Bloquear e pedir o estorno das posteriores | [03-modelo-de-dados.md](03-modelo-de-dados.md), 4.3 e 5.5 |
| — | 03/10/2026 | Desengace com vários recipientes de destino | Repartição por item; sem ela, a mesma mistura | 03-modelo-de-dados.md, 5.2 |
| — | 03/10/2026 | XML da nota na recepção | Preenche, guarda a nota e memoriza a variedade | [04-plano-de-entregas.md](04-plano-de-entregas.md), roteiro do ciclo 3 |
| — | 03/10/2026 | Decisões do ciclo 2 (rendimento mais específico, ficha só com embalagens, avisos 60/30/7, ciclo 01, link do bastão como o do convite, recusa pelo link, confirmação do e-mail por clique, permissão de troca do Master) | Aceitas ao seguir para o ciclo 3 | 04-plano-de-entregas.md, roteiro do ciclo 2 |
| — | 03/10/2026 | Acesso pela internet, DNS de `vinicycle.com`, e-mail (Resend), arquivos | `app.vinicycle.com` no ar com HTTPS e Resend; anexos no disco da VM, atrás da interface compatível com S3 | [operacao.md](operacao.md) |
