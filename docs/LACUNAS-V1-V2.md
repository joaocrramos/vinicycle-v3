# Lacunas da especificação nova em relação às versões antigas (v1 e v2)

> Gerado em 03/10/2026. Fontes:
> - código antigo: `joaocrramos/vinicycle-v1` (Supabase; 1.386 commits, último em 01/04/2026) e `joaocrramos/vinicycle-v2` (PocketBase; 928 commits, último em 28/04/2026), clonados só para leitura;
> - especificação nova: `docs/00-visao-geral.md`, `docs/01-premissas.md`, `docs/modulos/*.md` e `docs/ANALISE-VINICYCLE.md`. A pasta `docs/pesquisa/` foi usada só para conferir normas.
>
> **Critérios:**
> - entra só o que **falta** ou está **diferente** na especificação nova;
> - o que ela já cobre, mesmo com outro nome, ficou de fora;
> - falhas de segurança ficaram de fora, porque já estão na ANALISE.
>
> **Caminhos:** relativos à raiz de cada repositório, no formato `arquivo:linha`.
>
> **Histórico do git:** foi conferido. Os arquivos apagados (painel de aprovações, configurações gerais e de integrações na v1; modal de histórico na v2) não trazem nada de domínio além do que já está no código atual. Nenhuma das duas versões teve GLT, SISDEVIN, SIVIBE, romaneio, rótulo, chaptalização ou SO₂ em nenhum commit.

## Decisão (03/10/2026)

- **A1 a A6:** todos entram. As citações foram conferidas na fonte em 03/10/2026, com estes ajustes:
  - A1: a alínea "e" inclui "meio doce"; espumantes nos arts. 41, §1º, e 42, §1º, da IN 14/2018; as faixas em g/L estão sem norma vigente desde a revogação do Decreto 8.198/2014;
  - A4: rastreabilidade no art. 122, **§1º**; guarda de 18 meses no art. 123, **§1º**;
  - A3: acrescentar a Portaria MAPA 690/2022 (emissão da GLT);
  - B11: a IN 49/2011, art. 6º, exige só o acompanhamento do RT, não o registro nominal de quem executou.
- **B1 a B21:** todos entram já, em 2026.
- **B22:** não entra, porque nada ali é exigido. A aplicação usa só cookies necessários (P21).
- **C:** descartados.
- **Página pública do lote:** onde este relatório cita página pública de rastreio (C5, B9), vale a decisão posterior de cantina.md: o QR do rótulo leva à página comercial da vinícola, e o ViniCycle não tem página pública própria.
- Itens distribuídos em `cantina.md`, `ambiente-cliente.md`, `administracao.md` e nas premissas P20, P21 e P27.

## Resumo

| Grupo | Itens |
|---|---|
| **A.** Obrigatório por lei ou para a declaração ao MAPA | 6 |
| **B.** Útil para o negócio | 22 |
| **C.** Descartável | 15 |

---

## A. Obrigatório por lei ou para a declaração ao MAPA

### A1. Classificação quanto ao teor de açúcar (seco, meio seco, suave, nature, extra-brut, brut, demi-sec)

- **O que é:** o campo "Classificação (Açúcar)" do vinho, obrigatório no formulário da v1. Aparece também no cartão do vinho, no painel e na ficha técnica em PDF.
- **Onde:**
  - v1 `src/pages/wines/Wines.tsx:237-258`: select obrigatório com Seco, Meio Seco, Suave/Doce, Nature, Extra Brut, Brut e Demi-Sec;
  - v1 `supabase/migrations/20260321221500_core_tables.sql:58`: coluna `wines.sweetness`;
  - v1 `src/pages/wines/WineDashboard.tsx:73` e `src/lib/pdf-export.ts:165`: exibição e PDF.
  - Na v2 não existe.
- **Norma:**
  - Lei 7.678/1988, art. 8º, III (redação da Lei 10.970/2004): o vinho é classificado quanto ao teor de açúcar em nature, extra-brut, brut, seco/sec/dry, meio doce/meio seco/demi-sec, suave e doce;
  - IN MAPA 14/2018, art. 26, parágrafo único: a denominação do vinho é acrescida, nesta ordem, de **classe, cor e teor de açúcares totais**. Vale também para o vinho nobre (art. 34, §4º, II).
  - Os limites em g/L estavam no Decreto 8.198/2014, revogado. Hoje dependem de ato complementar (ver `pesquisa/2026-10-declaracoes-vinicolas.md`, seção 5).
- **Situação na especificação nova:**
  - o projeto de vinho tem "produto pretendido: classe oficial, cor e, se for espumante, o método" (`cantina.md`, "Dados do projeto"), **sem o teor de açúcar**;
  - o cadastro de Produtos (`ambiente-cliente.md`, "Cadastros") fala só em "classificação oficial".
- **Sugestão:**
  - **Projeto de vinho:** acrescentar "classificação quanto ao açúcar (pretendida)";
  - **Produto comercial:** acrescentar a denominação completa (classe + cor + açúcar);
  - **Catálogo global** da classificação oficial (P16): incluir as faixas de açúcar por classe, versionadas e com a fonte legal;
  - **Laboratório:** incluir "açúcares totais (g/L)" entre os parâmetros, com alerta no engarrafamento se o laudo não bater com a classe declarada (P29).

### A2. Teor alcoólico declarado no rótulo (% vol a 20 °C)

- **O que é:** o campo `expected_abv` (teor alcoólico esperado) do vinho na v2.
- **Onde:**
  - v2 `pocketbase/migrations/0018_create_wines.js:30`: campo `wines.expected_abv`;
  - v2 `src/components/enotrace/WineDetailsForm.tsx:34`: o campo está no estado do formulário, mas sem campo visível na tela.
- **Norma:**
  - IN MAPA 14/2018, art. 11, §4º (incluído pela Portaria MAPA 723/2024): a graduação alcoólica vai no rótulo em % vol a 20 °C, com tolerância de ±0,5% vol, respeitando os limites da classe;
  - Lei 7.678/1988, art. 8º, §2º: expressão em % v/v a 20 °C.
- **Situação na especificação nova:**
  - `cantina.md`, "Análises", prevê alerta se o laudo estiver "fora da faixa de teor alcoólico do rótulo";
  - mas **nenhuma entidade tem esse campo**: nem Produto, nem versão de rótulo, nem projeto.
- **Sugestão:**
  - **Versão de rótulo do Produto:** campo "teor alcoólico declarado (% vol)";
  - **Projeto:** campo opcional "teor alcoólico pretendido";
  - **Ordem de engarrafamento:** comparar o declarado com o laudo do lote (tolerância de ±0,5, versionada pela P16).

### A3. Entrada e saída de vinho a granel (origem ou destino externo), com GLT

- **O que é:** a trasfega da v2 aceitava origem ou destino "Nenhum / Externo", ou seja, vinho entrando de fora ou saindo da vinícola a granel. Era rudimentar: sem documento nem GLT.
- **Onde:**
  - v2 `src/components/enotrace/WineRackingFormModal.tsx:142` e `:161`: opção "Nenhum / Externo" na origem e no destino;
  - v2 `pocketbase/migrations/0025_update_wine_history.js`: relações opcionais `source_vessel` e `destination_vessel`.
- **Norma:**
  - Lei 7.678/1988, art. 2º, §1º: o produto nacional circula acompanhado de guia de livre trânsito;
  - Decreto 12.709/2025, art. 235: GLT para vinho e derivados transportados a granel;
  - Decreto 12.709/2025, art. 203, IV: transportar ou comercializar a granel sem GLT é infração.
  - As entradas e saídas a granel também compõem o estoque da declaração anual (Portaria MAPA 615/2023, art. 4º).
- **Situação na especificação nova:**
  - o glossário (`00-visao-geral.md`) define GLT;
  - a tabela de operações (`cantina.md`, "Operações") **não tem** compra/recebimento nem venda/remessa de vinho a granel;
  - "Saídas de produto" trata só de produto acabado (garrafas);
  - a única saída a granel prevista é a devolução ao titular, na vinificação para terceiros.
- **Sugestão:** criar as operações "Entrada de granel" e "Saída de granel" no livro de movimentos, com:
  - nota fiscal;
  - **nº da GLT**;
  - remetente, destinatário e transportador;
  - tipo de embalagem (carro-tanque, tambor, barril);
  - confirmação de recebimento.
  - A GLT também deve entrar nos alertas (P20): saída a granel sem GLT informada gera alerta.

### A4. Lote do insumo usado em cada adição (rastreabilidade de insumos)

- **O que é:** na v1, a adição de insumo ao vinho exigia escolher o **lote do insumo** no estoque e mostrava o saldo e a validade do lote. O registro da adição guardava "Insumo (Lote: X)".
- **Onde:**
  - v1 `src/pages/wines/components/InputTab.tsx:94-127`: baixa do lote e movimento de saída;
  - v1 `src/pages/wines/components/InputTab.tsx:189-211`: seleção do lote;
  - v1 `supabase/migrations/20260322021000_create_missing_tables.sql:16`: tabela `supply_batches`, com número do lote, validade e quantidade;
  - v2 `pocketbase/migrations/0026_create_supplies.js`: campos `batch` e `supplier` do insumo.
- **Norma:**
  - Decreto 12.709/2025, art. 119, III: registros sistematizados e auditáveis "desde a obtenção e a recepção da matéria-prima, dos ingredientes e dos **insumos** até a expedição";
  - Decreto 12.709/2025, art. 122: a rastreabilidade detecta a origem.
  - Em um recolhimento (art. 119, VII), é preciso saber em quais lotes de vinho entrou um lote de insumo.
- **Situação na especificação nova:**
  - o estoque tem lotes e validade (`ambiente-cliente.md`, "Estoque");
  - a adição de insumo (`cantina.md`, "Operações") só diz "baixa estoque", **sem exigir nem registrar o lote do insumo** e sem relatório reverso (insumo → vinhos).
- **Sugestão:** na operação "Adição de insumo" e nos tratamentos, registrar:
  - lote do insumo (obrigatório quando o item controla lote);
  - dose, volume tratado, data e hora;
  - operador.
  - No relatório de história, incluir também a consulta reversa: "em quais lotes de vinho entrou o lote X do insumo Y".

### A5. Higienização e manutenção de recipientes

- **O que é:** controle do estado de limpeza e manutenção de cada recipiente, com alerta por tipo de recipiente.
- **Onde:**
  - v1 `src/lib/data.ts:1`: estados do tanque Ocupado, Vazio, **Limpeza** e Manutenção;
  - v1 `supabase/migrations/20260323140000_setup_database_for_demo.sql:51`: status padrão "Para Limpeza";
  - v1 `src/lib/data.ts:131-132`: `lastMaintenanceDate` e `acquisitionDate` (nunca gravados no banco, ver ANALISE 2.4);
  - v1 `src/pages/dashboard/Index.tsx:151-175`: alertas para barrica com mais de 180 dias ("substituição ou revisão"), inox com mais de 360 dias ("limpeza profunda e passivação") e ovo com mais de 360 dias ("verificação de porosidade");
  - v1 `src/pages/recipients/components/TankPerformanceReport.tsx:65-88`: situação da manutenção (Ok, Alerta, Crítico);
  - v1 `src/pages/settings/components/DocumentRepository.tsx:451`: tipo de documento "Registro de Limpeza".
- **Norma:**
  - Decreto 12.709/2025, art. 120, IV: conformidade de equipamentos e utensílios com requisitos de **higiene, manutenção** e prevenção de contaminações;
  - Decreto 12.709/2025, art. 119, III: registros auditáveis do processo.
  - Proporcional ao risco (art. 120, parágrafo único).
- **Situação na especificação nova:**
  - os recipientes têm só as situações ativo, manutenção e inativo (`cantina.md`, "Recipientes");
  - não há registro de higienização (data, método, produto usado, responsável), nem situação "em higienização" ou "aguardando limpeza", nem periodicidade por tipo;
  - o autocontrole aparece só como "checklist com anexos" em 2026 (`00-visao-geral.md`).
- **Sugestão:**
  - nova operação de cantina **"Higienização / manutenção de recipiente"**, sem efeito no volume, com tipo, data, produto e dose, responsável e anexo;
  - situação "aguardando higienização", aplicada automaticamente quando o recipiente esvazia (configurável, P29);
  - periodicidade configurável por tipo de recipiente, com alerta na central (P20).

### A6. Registro de temperatura de recipientes e locais refrigerados, fora da fermentação

- **O que é:** histórico de temperatura por recipiente e por vinho, com faixa ideal e alerta.
- **Onde:**
  - v1 `supabase/migrations/20260322021000_create_missing_tables.sql:52`: tabela `temperature_logs` (recipiente, vinho, data e hora, temperatura);
  - v1 `src/pages/wines/components/MonitoringTab.tsx`: leituras, gráfico e alerta fora da faixa;
  - v1 `src/pages/wines/components/InputTab.tsx:242`: temperatura do mosto em cada adição;
  - v2 `pocketbase/hooks/on_sensor_update.js:14`: alerta com limites fixos de 10 °C e 30 °C.
- **Norma:** **verificar norma.**
  - Decreto 12.709/2025, art. 120, V: "procedimentos de controle de temperatura", "conforme aplicável" e proporcional ao risco;
  - a IN 5/2000 (BPF, item 3.2.8.4) pedia registro de temperatura em locais refrigerados.
  - Aplica-se à estabilização a frio e aos recipientes com frio. Confirmar com o RT o que a SFA-BA cobra.
- **Situação na especificação nova:**
  - só há a curva de fermentação, com densidade e temperatura (`cantina.md`, "Análises");
  - o recipiente tem "possui sistema de frio", mas nada registra a temperatura fora da fermentação.
- **Sugestão:**
  - permitir leituras de temperatura (manuais agora; por sensor quando o IoT entrar) em qualquer recipiente e em locais de estoque;
  - faixa configurável por recipiente ou etapa e alerta (P20).
  - Pode ser o mesmo registro da curva de fermentação, generalizado.

---

## B. Útil para o negócio

### B1. Módulo de suporte (chamados)
- **O que é:** chamados com:
  - protocolo, assunto, categoria, prioridade e descrição;
  - anexos e conversa (mensagens);
  - status configuráveis, com cor;
  - histórico de mudança de status;
  - SLA por cliente, com semáforo de tempo de espera;
  - aviso aos administradores e webhook na mudança de status;
  - página pública para quem não consegue entrar.
- **Onde:**
  - v1 `supabase/migrations/20260321220500_initial_schema.sql:55` (tabela `tickets`), `src/pages/support/SupportDashboard.tsx:97-103` (SLA), `src/pages/super-admin/SuperAdminSupport.tsx:233` e `:308` (categorias e status), `pocketbase/hooks/status_update.js` (log, aviso e webhook), `src/pages/public/PublicSupport.tsx`;
  - v2 `pocketbase/migrations/0032_create_support_collections.js` (`support_tickets` com prioridade Baixa/Média/Alta e `ticket_messages`), `src/pages/support/SupportPage.tsx`, `pocketbase/hooks/on_ticket_create.js` e `on_ticket_update.js`.
- **Na especificação nova:**
  - o menu do avatar tem "Ajuda e suporte: abrir chamado" (`ambiente-cliente.md`);
  - a P28 cita "número do chamado";
  - mas **não há especificação do módulo**, nem tela de chamados na Administração (`administracao.md`, "Mapa de telas").
- **Sugestão:**
  - Administração: tela "Suporte", com categorias, status e SLA por plano ou cliente;
  - Gestão: "Meus chamados";
  - ligar o chamado ao motivo da personificação (P28).

### B2. Canais de notificação WhatsApp e SMS, com fila e reenvio
- **O que é:**
  - envio de alertas e cobranças por WhatsApp (Meta Cloud API) e SMS (Twilio), além do e-mail;
  - fila com tentativas, histórico de envios e botão de reenvio na Administração;
  - preferências do cliente por canal e por gatilho de cobrança (5 dias antes, no vencimento, 3 dias depois).
- **Onde:**
  - v2 `pocketbase/migrations/0034_create_notification_logs.js` (tipos email, whatsapp e sms; status; tentativas), `pocketbase/hooks/cron_process_notifications.js`, `api_send_whatsapp.js`, `api_send_sms.js`, `src/pages/admin/NotificationsPage.tsx:61` (reenvio);
  - v1 `src/pages/settings/components/FinancialAlertsSettings.tsx` e `NotificationCenter.tsx`, `src/lib/data.ts:447-456`.
- **Na especificação nova:** a P20 prevê só tela e e-mail. A Administração cita "fila de tarefas" em "Saúde", sem tela de histórico nem reenvio.
- **Sugestão:**
  - camada de canais plugável, como a de pagamentos;
  - WhatsApp como canal opcional por usuário;
  - tela "Envios" na Administração, com status, tentativas e reenvio.

### B3. Prazo de validade dos insumos: alerta de vencido e vencendo
- **O que é:** situação por validade (Válido, Próximo ao vencimento em 30 dias, Vencido) e destaque do lote vencido.
- **Onde:** v2 `src/pages/enotrace/InventoryPage.tsx:149-155`; v1 `src/pages/inventory/Estoque.tsx:441-476`.
- **Na especificação nova:**
  - o estoque guarda a validade e prevê o descarte de vencidos;
  - a central de alertas (P20) cobre documentos, declarações, limites legais e estoque mínimo, **não a validade de insumos**.
- **Sugestão:** incluir "validade de lote de estoque" na P20, com antecedência configurável, e alerta ao escolher lote vencido numa adição (P29). *Pode ser exigível pelo art. 120, III do Decreto 12.709 (controle de produtos químicos e condições de uso): verificar norma.*

### B4. Cadastro de insumo mais rico: fabricante, marca, apresentação e unidades permitidas
- **O que é:**
  - **insumo:** nome comercial, marca, fabricante, formato físico (pó, pastilha, líquido), tipo, unidade base e estoque mínimo;
  - **tipo de insumo:** limita as unidades e os formatos permitidos;
  - **fabricante:** cadastro com as categorias que fornece.
- **Onde:**
  - v1 `supabase/migrations/20260322014000_full_system_migration.sql:29` (`manufacturers`) e `:67` (`supply_masters`);
  - v1 `src/pages/registration/components/SupplyMasterModule.tsx:140-249`, `SupplyTypesModule.tsx:80-129`, `SupplyFormatsModule.tsx`, `ManufacturersModule.tsx:40`;
  - v1 `supabase/migrations/20260322021826_seed_default_catalogs.sql:15-36`: carga padrão de tipos e formatos.
- **Na especificação nova:** "Insumos: itens do cliente, cada um de um tipo, com unidade e, quando houver, limite legal" (`ambiente-cliente.md`). Não traz fabricante, marca nem apresentação.
- **Sugestão:** acrescentar fabricante (pessoa P2 com papel "fabricante"), marca, apresentação e unidades permitidas por tipo. Ajuda no recolhimento de insumo e na associação de itens da NF-e (P11).

### B5. Cor da uva no cadastro de variedades (tinta, branca, rosada)
- **Onde:**
  - v1 `supabase/migrations/20260325000000_add_grape_type_and_tank_sensor.sql:1`;
  - v1 `src/pages/registration/components/GrapeVarietiesModule.tsx:86-95`.
- **Na especificação nova:** a variedade tem "código oficial e tipo (vinífera ou americana/híbrida)" (`cantina.md`, "Recepção da uva"), sem a cor.
- **Sugestão:** acrescentar a cor ao catálogo global de cultivares. A tabela oficial de cultivares do SISDEVIN traz código, cor e tipo. A cor também ajuda a sugerir a cor do produto e a validar cortes.

### B6. Faixa ideal de pH e temperatura por vinho/lote, com alerta
- **O que é:** mínimo e máximo de pH e de temperatura configurados para cada vinho, com alerta na ficha e no painel quando a última leitura sai da faixa.
- **Onde:**
  - v1 `src/pages/wines/components/GeneralTab.tsx:17-33` e `:132-200`;
  - v1 `src/pages/wines/WineDashboard.tsx:32-117`;
  - v1 `src/pages/dashboard/Index.tsx:123-148`.
- **Na especificação nova:** "Parâmetros de análise: com unidade e faixa de referência" por cliente (`ambiente-cliente.md`). Não há faixa **por lote ou projeto**, nem alerta de qualidade fora do PIQ.
- **Sugestão:** faixa por parâmetro no nível do cliente, sobreponível no projeto, no lote ou no modelo de plano. Leitura fora da faixa gera alerta na P20.

### B7. Alerta de análise pendente (lote sem análise há X dias)
- **Onde:** v1 `src/pages/dashboard/Index.tsx:189-192`, que alertava vinho sem análise há mais de 15 dias.
- **Na especificação nova:** o alerta de "etapa atrasada" cobre só o plano. Não há periodicidade mínima de análise.
- **Sugestão:** periodicidade configurável por etapa (ex.: densidade diária na fermentação, SO₂ livre mensal na maturação), com alerta na P20.

### B8. Dados de vida útil dos recipientes e relatório de desempenho
- **O que é:**
  - dimensões (comprimento, largura e altura);
  - fabricante do recipiente;
  - data de aquisição;
  - relatório de uso por recipiente: trasfegas, tempo de uso e idade, com exportação em PDF e envio agendado.
- **Onde:**
  - v1 `supabase/migrations/20260401155659_add_manufacturer_refrigerated_to_tanks.sql:1-3`;
  - v1 `src/lib/data.ts:132-135`;
  - v1 `src/pages/recipients/components/TankPerformanceReport.tsx`;
  - v1 `src/lib/pdf-export.ts:635`.
- **Na especificação nova:** o recipiente tem código, tipo, material, capacidade, frio, localização e situação. A barrica tem tanoaria, origem da madeira, tosta e ano do 1º uso. Faltam dimensões, fabricante do tanque e data de aquisição para os demais tipos, e o relatório de uso.
- **Sugestão:** acrescentar esses campos opcionais e o relatório "Uso de recipientes" em Relatórios.

### B9. Etiqueta com QR code para identificar o recipiente
- **O que é:** gerar e imprimir o QR de cada recipiente. Ao ler, abre a ficha do tanque (conteúdo, vinho, safra, trasfegas, insumos).
- **Onde:**
  - v1 `src/pages/qrcodes/QRGenerator.tsx:31`;
  - v1 `src/pages/settings/components/QRCodesSettings.tsx`.
- **Na especificação nova:** só há QR público no contrarrótulo (proposta). Nada para uso interno na cantina.
- **Sugestão:** etiqueta interna do recipiente com código e QR, que exige login e abre a ficha e o atalho para registrar a operação. Reforça a identificação dos recipientes (Lei 7.678, art. 48).

### B10. Uso sem internet (modo offline) na cantina
- **O que é:** adições, análises e notas registradas sem conexão ficavam numa fila e eram enviadas depois, com contador de pendentes.
- **Onde:**
  - v1 `src/contexts/AppContext.tsx:976`;
  - v1 `src/pages/wines/components/InputTab.tsx:63-65` e `:269-275`;
  - v1 `src/pages/wines/components/LabTab.tsx:58-60`.
- **Na especificação nova:** não tratado.
- **Sugestão:** decidir se vale para leituras e análises (rascunho local, confirmado no servidor). Lançamentos de volume devem continuar só online, por causa dos bloqueios e da atomicidade.

### B11. Operador que executou a operação e cadastro de cargos
- **O que é:**
  - "operadores" (pessoas da cantina, mesmo sem login), com foto, cargo e situação;
  - cargos com descrição;
  - campo "enólogo/operador" na trasfega e "operador" nos movimentos de estoque.
- **Onde:**
  - v1 `src/pages/settings/components/access/OperatorList.tsx:102-162`;
  - v1 `src/pages/settings/components/access/JobRoleList.tsx:72-85`;
  - v1 `supabase/migrations/20260321221500_core_tables.sql:109` (`transfers.enologist`);
  - v1 `src/pages/transfers/Transfers.tsx:129`.
- **Na especificação nova:** a auditoria registra **quem digitou**, não quem executou. A P2 prevê "funcionário" como papel de pessoa, mas as operações não têm o campo.
- **Sugestão:** campo "executado por" (pessoa com papel funcionário) e "RT/enólogo responsável" em cada operação. *A IN 49/2011 pede práticas enológicas com acompanhamento do RT: verificar se exige registro nominal.*

### B12. Detalhes da adição de insumo: hora, temperatura do mosto e insumo fora do estoque
- **Onde:** v1 `src/pages/wines/components/InputTab.tsx:49-57` (data, hora, temperatura, observações) e `:209` ("Entrada Manual (Fora do Estoque)").
- **Na especificação nova:** a adição baixa sempre do estoque. Não prevê insumo de terceiro, por exemplo o trazido pelo cliente na vinificação para terceiros.
- **Sugestão:**
  - permitir adição com insumo "não estocado" (descrição livre, sem baixa), sinalizada no relatório;
  - registrar a temperatura no momento da adição (opcional).

### B13. Ficha técnica do vinho em PDF
- **O que é:** documento com dados gerais, colheita, adições, análises e trasfegas do vinho.
- **Onde:**
  - v1 `src/lib/pdf-export.ts:100-230`;
  - v1 `src/pages/wines/WineDashboard.tsx:25-30`.
- **Na especificação nova:** há o "relatório de história" para fiscalização e recall, mas não uma ficha técnica comercial (para distribuidores, concursos e loja).
- **Sugestão:** relatório "Ficha técnica" do produto ou lote comercial: composição, teor alcoólico, açúcar, acidez, pH, notas de elaboração. Escolher os campos a exibir.

### B14. Relatórios agendados por e-mail
- **O que é:**
  - envio automático de relatórios (estoque global, movimentações, trasfegas, análises, desempenho de recipientes);
  - frequência semanal, quinzenal ou mensal;
  - destinatário e ativação por agendamento.
- **Onde:**
  - v1 `src/pages/reports/ReportsDashboard.tsx:89-102`, `:291-344` e `:694-726`;
  - v1 `src/pages/recipients/components/TankPerformanceReport.tsx:340-351`.
- **Na especificação nova:** a P23 exporta sob demanda. Não há agendamento.
- **Sugestão:** agendamento de qualquer relatório (pg-boss já previsto na arquitetura), por usuário, com o filtro salvo.

### B15. Diário da cantina e do campo (notas livres)
- **O que é:** notas datadas no painel ("observações do vinhedo, condições climáticas ou tarefas diárias"), também offline.
- **Onde:**
  - v1 `supabase/migrations/20260322021000_create_missing_tables.sql:73` (`field_notes`);
  - v1 `src/pages/dashboard/Index.tsx:233` e `:530-554`.
- **Na especificação nova:** não há.
- **Sugestão:** diário por estabelecimento, com data, autor, anexos e vínculo opcional a projeto, recipiente ou parcela. No VitiTrack, ajuda na etapa 2 da declaração de uvas do SIVIBE ("condições que afetaram a produtividade").

### B16. Fluxo de aprovação de solicitações
- **O que é:** painel de solicitações pendentes (solicitante, tipo/entidade, situação, aprovar ou recusar).
- **Onde:**
  - v1 `src/contexts/AppContext.tsx:1559-1561` e `:1698`;
  - v1, arquivo apagado no commit `e2ebe28`: `src/pages/settings/components/ApprovalRequestsPanel.tsx`.
- **Na especificação nova:** a P27 lista "aprovar" como ação especial, mas não define nenhum fluxo de aprovação.
- **Sugestão:** definir onde há aprovação, por exemplo:
  - ajuste de inventário acima de X litros;
  - estorno;
  - reabertura de período.
  - Tela "Aprovações pendentes" na Gestão.

### B17. Central de documentos: pastas, assinatura, contratos e vínculo a módulo
- **O que é:**
  - **v1:** pastas criáveis e renomeáveis; situação de assinatura (Pendente/Assinado, com quem e quando); tipos Alvará/Licença, Análise Laboratorial, **Certificado de Origem**, **Contrato**, Documentos Jurídicos, Laudo Técnico, **Registro de Limpeza** e Outros; filtros por tipo e assinatura;
  - **v2:** documento ligado a um módulo.
- **Onde:**
  - v1 `src/lib/data.ts:405-417`;
  - v1 `src/pages/settings/components/DocumentRepository.tsx:66-150` e `:445-452`;
  - v2 `pocketbase/migrations/0028_create_documents_collection.js:17-20`.
- **Na especificação nova:** a central de documentos trata vencimento e alerta. Não traz pastas, contratos nem assinatura.
- **Sugestão:**
  - incluir contratos (ex.: vinificação para terceiros) e certificados entre os tipos de documento;
  - registrar quem assinou e quando (assinatura digital real fica para depois);
  - organizar por pastas ou etiquetas.

### B18. Perfil-modelo "Financeiro" no cliente
- **Onde:**
  - v2 `pocketbase/migrations/0052_create_user_tenant_roles.js:30-33` (Master, Enólogo, Operacional, **Financeiro**, Admin, Outro);
  - v2 `src/components/ProtectedRoute.tsx:235`: o Financeiro vê só faturas, documentos, suporte e painel;
  - v1 `src/pages/settings/components/access/AuditDashboard.tsx:122`.
- **Na especificação nova:** os perfis-modelo são Master, RT, Enólogo, Cantineiro e Agrônomo (P27). Nenhum para quem cuida de faturas, assinatura e NF-e.
- **Sugestão:** perfil-modelo "Financeiro / Administrativo" (assinatura, faturas, importação de NF-e, estoque em consulta).

### B19. Modelos de e-mail editáveis na Administração
- **Onde:**
  - v1 `src/pages/super-admin/SuperAdminEmailTemplates.tsx`;
  - v1 `src/pages/super-admin/SuperAdminIntegrations.tsx:219-227` (modelos de lembrete por e-mail e WhatsApp).
- **Na especificação nova:** "Configurações da plataforma: envio de e-mail". Os modelos não são citados.
- **Sugestão:** tela de modelos (convite, passagem de bastão, cobrança, alertas), com variáveis e versão em pt-BR.

### B20. Detalhes de cobrança: formas aceitas por plano e recebimento
- **O que é:**
  - formas de pagamento aceitas por plano (Cartão, PIX, Boleto);
  - formas de recebimento Dinheiro, Cartão débito e Cartão crédito;
  - número de referência do recebimento;
  - relatório "Top 10 clientes por receita".
- **Onde:**
  - v2 `pocketbase/migrations/0073_add_payment_methods_to_plans.js:7-9`;
  - v2 `src/pages/admin/components/ReceiptModal.tsx:260-277`;
  - v2 `src/pages/admin/FinancialReportsPage.tsx:315-325`.
- **Na especificação nova:** a baixa manual tem PIX, boleto, cartão e transferência, sem referência. O plano não restringe a forma de pagamento.
- **Sugestão:** acrescentar referência (ID da transação), "dinheiro" e "cartão débito" na baixa, e formas aceitas por plano.

### B21. Lista de espera dos módulos futuros
- **O que é:** página do módulo ainda não lançado com cadastro de e-mail para aviso.
- **Onde:**
  - v2 `pocketbase/migrations/0035_create_waiting_list.js` (coleção `waiting_list`);
  - v2 `src/pages/grapetrack/Placeholder.tsx:33` e `:91`;
  - v2 `src/pages/enotur/Placeholder.tsx:106`.
- **Na especificação nova:** um módulo não contratado não aparece no menu. Não há vitrine.
- **Sugestão:** opcional. Mostrar os módulos não contratados como "conheça e contrate" ou "em breve", com interesse registrado (útil para vendas).

### B22. LGPD e conveniências de interface: aviso de cookies, tour guiado e exportação em outro idioma
- **O que é:**
  - **aviso de cookies**, com política de cookies;
  - **tour guiado** da interface;
  - **exportação de relatórios** com cabeçalhos em pt, en ou es.
- **Onde:**
  - v1 `src/components/shared/CookieBanner.tsx:4-47` e `src/pages/auth/components/CookiePolicyDialog.tsx`;
  - v1 `src/contexts/TourContext.tsx:19-41` e `src/App.tsx:450`;
  - v1 `src/components/shared/LanguageExportDialog.tsx:36`.
- **Na especificação nova:**
  - a P21 prevê termos e política de privacidade versionados, sem política de cookies;
  - os "primeiros passos" não são um tour;
  - a P18 começa só em pt-BR.
- **Sugestão:**
  - incluir a política de cookies nos documentos versionados da P21, com aviso se houver cookie não essencial (LGPD, Lei 13.709/2018: *verificar se só cookies de sessão dispensam o aviso*);
  - tour e exportação em outro idioma são opcionais.

---

## C. Descartável

| # | O que é | Onde | Por que descartar |
|---|---|---|---|
| C1 | Sensores IoT: cadastro de sensor (tipo, marca, faixa, unidade, intervalo), vínculo ao tanque, leituras de temperatura, umidade, CO₂ e bateria, mapa de sensores, alertas por WhatsApp/SMS com limites fixos | v1 `src/pages/iot/IoTDashboard.tsx`, `src/pages/registration/components/IoTSensorsModule.tsx`, `supabase/migrations/20260326183500_update_tanks_sensors.sql`; v2 `pocketbase/migrations/0023_create_sensors_collection.js`, `src/pages/enotrace/SensorsPage.tsx`, `pocketbase/hooks/on_sensor_update.js` | A especificação **adiou de propósito**: "IoT/sensores: Futuro" (`00-visao-geral.md`, Prioridades). Os dados eram simulados. O registro manual de temperatura que importa já está em A6 |
| C2 | Painéis com dados simulados: inteligência, BI financeiro e projeção de MRR, estatísticas de acesso, relatórios por categoria, gráficos fixos do painel da v2 | v1 `src/pages/super-admin/SuperAdminIntelligence.tsx`, `SuperAdminFinancialBI.tsx`, `SuperAdminAnalytics.tsx`, `SuperAdminCategoryReports.tsx`; v2 `src/pages/admin/Dashboard.tsx`, `src/pages/enotrace/Dashboard.tsx` | Dados falsos. O painel real da Administração já está especificado (`administracao.md`, "Visão geral") |
| C3 | Gamificação e ranking de engajamento entre vinícolas | v1 `profiles.wants_to_participate_in_game`, `tenants.gamification_active`, `src/lib/pdf-export.ts:818` | Sem valor regulatório nem operacional e não pedido pelo cliente |
| C4 | Personalização visual completa da vinícola: cores primária, secundária, de fundo e de texto, favicon e ícones por módulo | v1 `src/pages/settings/components/BrandingPanel.tsx`, `src/lib/data.ts:304-316`; v2 `tenants.primary_color…background_color`, `src/pages/enotrace/TenantSettings.tsx`, `src/pages/admin/SystemSettings.tsx` | A P9 decidiu: paleta escolhida por usuário e, como proposta, só logo e cor de marca nos impressos |
| C5 | Página pública do tanque via QR, sem login | v1 `src/pages/public/TankPublicView.tsx`, rota `/tanque/:id` | Expõe dados internos. A especificação prevê página pública só para o **lote comercial**, com dados marcados como públicos. O QR interno está em B9 |
| C6 | Página de avaliação do consumidor | v1 `src/pages/public/Feedback.tsx` | Era falsa (não gravava). Reclamações entram no autocontrole (`00-visao-geral.md`) |
| C7 | Página comercial dentro da tela de login | v1 `src/pages/auth/components/CommercialLanding.tsx`; v2 `src/components/auth/AuthBrandingPanel.tsx` | O site comercial fica separado em `vinicycle.com` (P5, `02-arquitetura.md`) |
| C8 | Login separado de super admin e papéis de plataforma misturados aos da vinícola | v1 `src/pages/super-admin/SuperAdminLogin.tsx`, rota `/admin/login`; v2 `super_admin_permissions`, papel "Admin" no tenant SISTEMA | A P8 e a P27 decidiram identidade única por e-mail, com perfis de plataforma separados |
| C9 | Troca obrigatória de senha no primeiro acesso, com senha temporária | v1 `src/pages/auth/ForcePasswordChange.tsx`, `supabase/functions/invite-user` | A especificação usa convite com link de uso único em que o próprio usuário define a senha (`administracao.md`) |
| C10 | Status livres configuráveis por entidade (Recipientes, Trasfegas, Geral) e reordenação manual de cadastros | v1 `src/pages/registration/components/StatusesModule.tsx:38`, `AppContext.tsx` (`reorderItem`), colunas `sort_order` | A especificação fixou situações com significado (P13) e etapas configuráveis. A ordenação segue a P4 |
| C11 | Recipiente do tipo "garrafa" e material "vidro" | v2 `pocketbase/migrations/0021_create_vessels.js:14-25` | Garrafa é produto acabado ou garrafa em processo, não recipiente (`cantina.md`, "Espumantes" e "Engarrafamento") |
| C12 | "Integração MAPA" de fachada (`mapa_status = 'Pending Setup'`) | v2 `src/pages/admin/SystemSettings.tsx:41-63` e `:236-248` | Não há API pública do MAPA. A especificação decidiu gerar os relatórios prontos para transcrição (`00-visao-geral.md`) |
| C13 | Importação de backup JSON pelo cliente | v1 `src/pages/settings/components/SystemBackup.tsx`, `src/lib/data.ts:419-424` | A restauração é da plataforma (P22). A carga do cliente é por planilha validada (P23) e a exportação é pela P15 |
| C14 | Dados de perfil sem uso: nome de aparição, data de nascimento, região e SLA soltos no cadastro do cliente | v2 `users.display_name`, `users.birth_date`; v1 `src/lib/data.ts:394-395` | O bloco padrão (P2) basta. O SLA entra no módulo de suporte (B1) |
| C15 | Tabelas e coleções duplicadas ou legadas: `wineries` × `tenants`, `clients` × `tenants`, `client_plans`, `user_roles`, PocketBase morto na v1 | v1 `supabase/migrations/20260322030000_winery_seeds_trigger.sql`; v2 `pocketbase/migrations/0054_migrate_data_to_tenants.js` | Ruído técnico. A especificação parte de base limpa (P6) |
