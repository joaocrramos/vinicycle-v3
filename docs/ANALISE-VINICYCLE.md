# Análise dos projetos Vinicycle (v1 e v2) e proposta de reconstrução em PostgreSQL

> Gerado em 2026-10-02. Fontes analisadas: repositórios `joaocrramos/vinicycle-v1` (v1; chamava-se `vinicycle` até 2026-10-03) e
> `joaocrramos/vinicycle-v2` (v2), ambos gerados pela ferramenta low-code Skip, e o Bacco ERP
> como referência de produto (via busca na web — os sites estavam bloqueados no ambiente de nuvem).

---

## 1. Resumo executivo

- Os dois projetos têm boas ideias de produto, mas **a base não deve ser aproveitada**: não há
  isolamento real entre vinícolas, qualquer usuário consegue se promover a administrador, a lógica
  de negócio roda no navegador sem transações e há muitas telas com dados simulados.
- O que vale reaproveitar: **desenho das telas (React + shadcn + Tailwind), lista de cadastros,
  fluxos pensados e vocabulário do domínio.**
- Recomendação: recomeçar com **PostgreSQL + API própria (Node/TypeScript)**, modelo de dados
  centrado em **lote e livro de movimentos de volume** (como o Bacco ERP), regras no servidor.

| | **vinicycle (v1)** | **vinicycle-v2** |
|---|---|---|
| Backend usado de fato | Supabase (PocketBase presente mas morto) | PocketBase (83 migrations, 25 hooks) |
| Ponto forte | Domínio de cantina mais rico | Parte SaaS mais rica (convites, notificações, auditoria) |
| Commits | ~50 automáticos (Skip) | ~50 automáticos (Skip) |

---

## 2. Vinicycle v1 (Supabase)

### 2.1 Arquitetura
- Só Supabase. `src/lib/supabase/client.ts` usado por AppContext, use-auth, páginas de auth,
  MyProfile, TankPublicView, RecipientsModule, WineryProfile, SuperAdmin*.
- Edge functions: `invite-user`, `update-user`. RPC: `switch_user_tenant`.
- `pocketbase/` e `src/lib/pocketbase/` são código morto (cópia legada de suporte/IoT).
  Regra útil lá: mudança de status de ticket grava `status_log`, notifica admins e chama webhook.
- `AppContext.tsx` com **2712 linhas** carrega tabelas inteiras (`select('*')`, sem filtro de tenant)
  e faz `addEntity/updateEntity/deleteEntity` direto do navegador.

### 2.2 Rotas
**Públicas:** `/login` (+ landing comercial), `/select-context` (escolha de vinícola),
`/forgot-password`, `/reset-password`, `/force-password-change`, `/tanque/:id` (página pública do
tanque via QR: tanque, vinícola, vinho, safra, trasfegas, insumos), `/feedback` (falso, não salva),
`/suporte-publico` (ticket anônimo), `/not-authorized`.

**App da vinícola:** `/` dashboard (KPIs, ocupação de tanques, alertas de pH/temperatura,
manutenção por tipo de recipiente, documentos vencendo em 30 dias, análises atrasadas >15 dias),
`/vinhos` (abas Geral/safra, Insumos, Trasfegas, Laboratório), `/sensores` (mock),
`/estoque` (itens, lotes com validade e estoque mínimo, movimentos), `/recipientes` (mapa de tanques,
relatório de desempenho), `/trasfegas`, `/relatorios` (CSV/PDF), `/cadastro` (insumos, tanques,
sensores, unidades, formatos, tipos de insumo, fabricantes, tipos de tanque, status, motivos de saída,
variedades de uva, controle de acesso), `/documentos`, `/configuracoes` (perfil da vinícola, usuários,
alertas, QR codes, backup), `/faturas` (mock), `/suporte` (tickets, chat, SLA), `/perfil`, `/notificacoes`.

**Super admin `/admin`:** vinícolas (CRUD, personificação), planos, usuários, inteligência (mock),
estatísticas, relatórios por categoria, integrações (só memória), templates de e-mail (localStorage),
logs, auditoria, backups, BI financeiro (vazio), suporte.

### 2.3 Modelo de dados (estado final)
- **Identidade/tenancy:** `tenants` (razão social, nome fantasia, CNPJ, inscrição estadual/MAPA,
  endereço, responsável técnico, registro profissional, redes sociais, logo, plano, gamificação);
  `wineries` (**duplica** tenants, mesmo id; trigger semeia unidades/formatos/tipos/status);
  `profiles` (tenant ativo, role); `user_tenants` (N:N usuário–vinícola–papel);
  `switch_user_tenant()` copia tenant/papel para `profiles`.
- **Cadastros (com `winery_id` e `sort_order`):** units, supply_types (unidades/formatos permitidos),
  supply_formats, manufacturers, tank_types (Inox/Barrica/Ovo/Barril Inox), statuses (por entidade),
  exit_justifications, grape_varieties, supply_masters (marca, fabricante, formato, tipo, unidade, mínimo).
- **Operação:** `tanks` (capacidade, volume atual, status, tipo, conteúdo, sensores, refrigerado,
  dimensões); `wines` (tipo, doçura, safra, status, uvas, tanque atual, dados de colheita: data, peso,
  acidez, °Brix, pH); `transfers` (origem, destino, vinho, volume, enólogo em texto, data);
  `lab_measurements` (pH, Baumé/Brix, acidez); `input_logs` (insumo aplicado, quantidade, temperatura;
  sem FK para o item); `temperature_logs`; `field_notes`; `inventory_items`; `supply_batches`
  (lote, validade, quantidade); `inventory_movements` (IN/OUT, operador em texto).
- **Plataforma:** commercial_plans (módulos em jsonb), audit_logs (sem tenant), backup_logs,
  notifications, iot_sensors (nunca lido), ticket_categories, ticket_statuses, tickets
  (protocolo, mensagens em jsonb, sem tenant), status_logs.
- **Valores:** status do vinho Registrado → Fermentando → Maturando → Engarrafado → Finalizado;
  status de tanque conflitantes entre código (Vazio/Ocupado/Limpeza/Manutenção) e seed
  (Vazio/Fermentando/Maturando/Cheio/Para Limpeza); tickets Aberto/Em Análise/Aguardando Cliente/
  Resolvido/Fechado; papéis operator/admin/Admin/Master/SuperAdmin/Financeiro/Suporte Técnico.
- **Migrations caóticas:** tabelas criadas duas vezes, timestamps duplicados, quatro migrations de
  "reset/limpeza", usuários semeados e removidos, migrations só com `NOTIFY pgrst`.

### 2.4 Regras de negócio encontradas
- **Colheita:** vinho criado como Registrado com peso, °Brix, pH, acidez e data.
- **Trasfega:** grava transfer e ajusta tanques no navegador (origem − volume, destino + volume).
  Sem validar capacidade/volume disponível, sem transação, não atualiza o tanque atual do vinho.
- **Insumos:** escolhe lote; quantidade ≤ saldo do lote; baixa lote, baixa item (pelo **nome**),
  grava movimento OUT e o input_log. Modo offline enfileira em localStorage (sem baixar estoque).
- **Entrada de estoque:** cria lote, soma no item (pelo nome), movimento IN. Estoque baixo = qtd ≤ mínimo.
- **Laboratório:** alertas de pH fora da faixa ideal (colunas `ideal_*` não existem no banco).
- **IoT:** definições de sensor só em localStorage; dashboard fixo.
- **Manutenção:** Barrica > 180 dias, Inox/Ovo > 360 dias (data nunca persistida).
- **QR público:** `/tanque/{id}`; SELECT anônimo liberado em tabelas inteiras.
- **Suporte:** protocolo `TCK-<aleatório 0–9999>` (colisões), anexos `blob:` perdidos ao recarregar.
- **Cobrança:** planos "Plano Vinha" e "Plano Colheita" com módulos, mas nada é bloqueado por plano.
- **Permissões:** DASHBOARD_VIEW, PRODUCTION_VIEW/EDIT, INVENTORY_VIEW/EDIT, SETTINGS_VIEW,
  BILLING_VIEW, SUPPORT_VIEW…; papéis e operadores em localStorage; `hasPermission` libera quando
  não encontra o papel.
- **Onboarding:** criar vinícola → tenants + wineries + `invite-user` cria Master com troca de senha obrigatória.
- **i18n:** pt/en/es existe, mas só a sidebar usa.

### 2.5 Problemas de segurança/qualidade
- RLS `USING (true)` em todas as tabelas de negócio; anônimos leem tanques, vinhos, trasfegas, insumos.
- Usuário pode alterar o próprio `role` (vira Master). `handle_new_user` confia em metadados do cliente.
- `update-user` redefine a senha de **qualquer** usuário só com o e-mail; `invite-user` cria usuário
  com qualquer papel em qualquer vinícola; nenhuma checa quem chama; CORS `*`.
- Login de super admin é flag em localStorage.
- Senhas em texto puro em várias migrations (inclusive da conta do João Carlos) e senha padrão fixa
  no `invite-user`. **Trocar essas senhas se forem usadas em outros lugares.**
- Bugs: `minLevel` em camelCase quebra update; papel errado em novos super admins; "última" análise
  é a mais antiga; `daysInTank` sempre 0; estoque ligado por nome.

---

## 3. Vinicycle v2 (PocketBase)

### 3.1 Rotas
**Auth:** `/login` (+ checkbox LGPD), `/forgot-password`, `/invitation/confirm/:token` e
`/accept-invite` (**quebrados**: chamam endpoints inexistentes), `/selecionar-cliente`, `/perfil`.

**Admin (super admin):** dashboard (quase todo mock), usuários (matriz de permissões inconsistente),
clientes/tenants (CRUD, bloqueio, personificação), planos, financeiro (faturas e KPIs), recebimentos
(Recebido/Parcial/Pendente), relatórios financeiros (CSV; fallback mock), auditoria, manutenção
(reset do banco, backup JSON), consentimento LGPD (morto), fila de notificações com reenvio.
`SystemSettings.tsx` não está roteado.

**EnoTrace:** dashboard (contadores reais, gráficos fixos), vinhos (com aba Trasfegas), recipientes,
sensores (teste falso), estoque (validade e registro de uso), documentos (download/compartilhar falsos),
faturas, usuários e convites, configurações (branding da vinícola, só Master).

**GrapeTrack / EnoTur:** placeholders com lista de espera. **Suporte:** tickets da vinícola.

### 3.2 Modelo de dados
- `users` (nome, avatar, idioma, formato de data, tema, status, lgpd_accepted, telefones, CPF, nascimento).
- `tenants` (razão social, CNPJ, IE/IM com isenção, e-mails master/financeiro/técnico, telefones,
  redes, logo, 4 cores, status active/inactive/blocked, plano).
- Legado ainda em uso: `clients`, `user_client_access`, `user_roles`, `client_plans`.
- `user_tenant_roles` (papel Master/Enólogo/Operacional/Financeiro/Admin/Outro, permissions json, status).
- `super_admin_permissions` (módulo × total/visualizar/criar/editar/apagar).
- `plans` (preço mensal, limite de usuários, storage, módulos Admin/EnoTrace/GrapeTrack/EnoTur,
  recorrência Mensal/Trimestral/Semestral/Anual, modules_config, forma de pagamento Cartão/PIX/Boleto).
- `wines` (tipo Tinto/Branco/Rosé, status Em Produção/Maturação/Finalizado, uva principal, teor
  esperado, volume, recipiente atual em **texto**, próxima trasfega).
- `wine_history` (ação "Trasfega", origem, destino, Agendada/Concluída), `vessels` (barril/tanque/
  garrafa, madeira/aço/vidro, capacidade, local, disponível/ocupado/manutenção, vinho atual),
  `sensors` (temperatura/umidade/pH, última leitura em texto), `supplies` (levedura/sulfito/enzima/
  tanino, quantidade, unidade, validade, fornecedor, lote), `documents`, `invoices`, `invoice_items`,
  `receipts` (Dinheiro/Cartão/Transferência/PIX), `support_tickets`, `ticket_messages`,
  `audit_logs`, `notification_logs`, `notifications`, `user_invitations`, `waiting_list`, `system_settings`.
- **clients × tenants:** a migration 0054 copiou `clients` para `tenants` com o mesmo id. As tabelas
  de domínio ainda apontam para `clients`, então tenants criados depois não conseguem ter vinhos,
  recipientes etc. Super admin é modelado de 3 jeitos diferentes.
- `schema.json` está desatualizado em relação às migrations 0086–0089; numeração com lacunas e 0087 duplicada.

### 3.3 Lógica no servidor (hooks)
- **Convites:** endpoint valida Master/Admin e gera token, mas o frontend não usa; aceite cria
  `user_tenant_roles`; limpeza de convites >30 dias chamável por qualquer usuário.
- **Notificações:** fila em `notification_logs` + cron a cada minuto (50 por vez, 3 tentativas)
  enviando por **Resend** (e-mail), **Meta WhatsApp Cloud API** e **Twilio** (SMS). Eventos: usuário
  criado, fatura criada/atrasada, sensor fora da faixa, ticket criado/fechado, trasfega agendada/concluída.
  Vários destinos fixos no código.
- **Auditoria:** create/update/delete com old/new data, tenant e header de personificação; login.
- **Segregação:** middleware extrai `client='…'` do filtro por regex — sem filtro, nada é checado.
- **Sensores:** temperatura >30 ou <10 → WhatsApp; pH <3,0 ou >4,0 → SMS (limites fixos).
- **reset_database:** apaga 25 coleções (inclusive usuários) e ressemeia admin com senha fixa.

### 3.4 Regras no frontend
- Trasfega troca recipiente atual e status dos recipientes; **sem validação de volume/capacidade**.
- Insumos: status por validade (Vencido / Próximo ao vencimento em 30 dias / Válido); uso baixa
  quantidade, sem histórico e sem vínculo com o vinho.
- Faturas: número `FAT-` + 6 dígitos aleatórios no navegador; total = Σ qtd × preço − desconto;
  pagamento marca Paga quando Σ recebimentos ≥ total.
- Planos: limites de usuários/storage e módulos não são aplicados.
- Permissões por papel só no ProtectedRoute/sidebar (Enólogo sem recipientes/faturas/documentos,
  Operacional sem vinhos/estoque/faturas/documentos, Financeiro só faturas/documentos/suporte/dashboard,
  configurações só Master).
- LGPD: só um booleano, sem versão nem data.

### 3.5 Problemas de segurança/qualidade
- Quase todas as coleções: qualquer logado lista/cria/edita/apaga. Qualquer um pode se dar Master em
  qualquer tenant, ou Admin no tenant SISTEMA, ou criar permissão de super admin e chamar o reset.
- `user_invitations.updateRule = ""` → anônimos alteram convites.
- Usuários veem e-mail, CPF e telefone de todos. Realtime `subscribe('*')` vaza outros tenants.
- Páginas de Recipientes e Sensores passam parâmetros na ordem errada e perdem o filtro de tenant.
- Filtros montados por interpolação de texto (injeção). Tokens com `Math.random`.
- Senhas em texto puro em várias migrations e no hook de reset. Credenciais Twilio na URL.

---

## 4. Referência: Bacco ERP (objetivo de produto)

Informações obtidas por busca (sites https://www.bacco-erp.com/pt-BR e
https://www.baccosistemas.com.br/cantina/ não puderam ser lidos diretamente — **reler no ambiente local**):

- ERP brasileiro exclusivo para vinícolas: vinho, espumante e suco; 6 idiomas (pt, en, es, it, fr, de).
- **Viticultura (Bacco-Campo):** plantio, manejo, colheita, análises do vinhedo; rastreabilidade por
  talhão, variedade e terroir.
- **Enologia:** fluxos de vinificação (desengace, prensagem, fermentação, trasfega), tanques e barricas,
  lotes de fermentação com rastreabilidade da entrada da uva ao produto final, análises de laboratório
  com histórico e relatórios.
- **Estoque/insumos enológicos:** movimentações, rotulagem, etiquetas com QR code.
- **Conformidade:** cita SIVIBE/ENVIN; no Brasil, declarações obrigatórias no SISDEVIN/MAPA
  (Lei 7.678/1988, Decreto 8.198/2014).
- **Enoturismo + PDV (Bacco-Comanda):** agendamentos, degustações, visitas, experiências, reservas.
- **IoT (Bacco-iOT):** Bacco Meteo (estação no vinhedo), Bacco Ferm (fermentação), BaccoDens
  (densidade e temperatura), Bacco-Cloud, API pública, alertas automáticos.
- IA integrada.

**Diferença central:** o Bacco é construído em torno do **lote e do volume rastreável** — toda operação
(recepção de uva, trasfega, corte, adição, engarrafamento) é um lançamento que movimenta litros entre
recipientes; daí vêm a rastreabilidade e as declarações oficiais. O Vinicycle atual trata o vinho
como um cadastro.

---

## 5. Proposta: novo Vinicycle em PostgreSQL

### 5.1 Arquitetura recomendada
- **Monorepo TypeScript:** frontend React + Vite + shadcn/Tailwind (reaproveita o visual);
  **API própria em Node** (Fastify ou NestJS) com **Drizzle ORM**; **PostgreSQL**.
- `tenant_id` em todas as tabelas + **RLS como defesa em profundidade**; autorização no servidor.
- Regras de negócio no servidor, **em transações** (nunca gravar do navegador direto no banco).
- Migrations versionadas e limpas; seeds só para desenvolvimento; **nenhuma senha no código**.
- Testes automatizados nas regras de volume e estoque.

### 5.2 Modelo de dados (núcleo)
- **Plataforma:** `tenants`, `users`, `memberships` (usuário × vinícola × papel), `roles`,
  `permissions`, papéis de plataforma separados dos papéis da vinícola, `audit_log`,
  `plans`, `subscriptions`, `invitations`, `notifications`.
- **Cadastros:** variedades, fornecedores/produtores de uva, talhões, tipos de recipiente, unidades,
  insumos, motivos de saída/perda.
- **Cantina:**
  - `vessels` (tanques/barricas, capacidade);
  - `wine_lots` (lote, safra, tipo, composição varietal);
  - `grape_receptions` (romaneio: peso, °Brix, pH, talhão, produtor);
  - `cellar_operations` + `volume_movements` (livro de movimentos em litros: trasfega, corte/blend,
    perda, engarrafamento são lançamentos; **volume do tanque é calculado**, nunca editado);
  - `lab_analyses`;
  - `additions` (insumo aplicado em lote → baixa estoque).
- **Estoque:** `stock_items`, `stock_batches`, `stock_movements` (FKs, entrada/saída).
- **Rastreabilidade:** genealogia de qualquer lote/garrafa; QR público expõe só o que for marcado como público.
- **IoT:** `sensors`, `sensor_readings` (série temporal), regras de alerta configuráveis por tenant.

### 5.3 Fases
1. **Fundação:** autenticação, vinícolas, permissões, auditoria, layout.
2. **Cantina:** cadastros, recipientes, recepção de uva, lotes, trasfega/corte com validação de volume,
   análises, insumos.
3. **Estoque, engarrafamento, rastreabilidade e QR público.**
4. **Relatórios e declarações SISDEVIN.**
5. **IoT** (leituras com histórico e alertas configuráveis).
6. **SaaS:** planos, faturamento, liberação de módulos por plano.
7. **Expansões:** GrapeTrack (vinhedo), EnoTur (enoturismo), PDV.

### 5.4 Decisões pendentes
1. ~~Onde fica o projeto novo?~~ **Decidido em 2026-10-03:** repositório novo e privado `joaocrramos/vinicycle`; a v1 foi renomeada para `vinicycle-v1`.
2. Backend: API Node + Postgres (recomendado) ou Supabase? Onde hospedar o banco?
3. Começar pelas fases 1 e 2?
