# Gestão (bloco comum)

> **Situação:** especificado em 03/10/2026. Presente em todos os planos. Visão geral das telas em
> [ambiente-cliente.md](ambiente-cliente.md#gestão-bloco-comum). Vale a premissa **P29**: o cliente decide, o sistema informa.

## Pessoas (Decidido em 03/10/2026)

**Base:** cadastro padrão da P2, com uma única entidade "Pessoa" e **papéis**. Quem é fornecedor e cliente é cadastrado uma vez só.

**Documento (CPF ou CNPJ):**
- **obrigatório**, validado e único por empresa;
- **exceções:**
  - estrangeiro: passaporte ou documento do país, com o país;
  - pessoa de contato de uma empresa (abaixo);
- o consumidor não identificado de uma venda **não** vira cadastro.

**Papéis e campos próprios:**

| Papel | Campos próprios |
|---|---|
| Cliente | Condições comerciais |
| Fornecedor | Categorias que fornece |
| Fabricante | Marcas (para os insumos) |
| Produtor de uva | Número do SIVIBE, situação do cadastro, declaração do ano anterior, propriedades |
| Funcionário | Cargo, situação, foto |
| Transportador | Placas |
| Laboratório | Credenciamento MAPA com validade, prazo médio de laudo |
| Responsável técnico | Conselho, número de registro, ART/AFT com validade |
| Cantina prestadora / cliente de vinificação | Contratos de terceirização |
| Engarrafadora | Contratos, se houver |

- A lista de papéis pode crescer. A plataforma cria papéis novos; o cliente não.
- Validades (credenciamento, ART, situação do SIVIBE) geram alertas (P20).

**Contatos de uma pessoa jurídica:** nome, cargo, e-mails e telefones, sem documento obrigatório.

**Funcionário e usuário:**
- a pessoa existe **uma vez só**;
- pode ter **login** ou não. O cantineiro sem login aparece em "executado por" nas operações;
- ao convidar um funcionário como usuário, o convite parte do cadastro dele (P8).

## Documentos (Decidido em 03/10/2026)

**Conteúdo:** registros MAPA, ART/AFT, licenças, AVCB, alvarás, laudos de água, certificados, certificados de origem e contratos (ex.: vinificação para terceiros).

**Cada documento tem:**
- tipo (catálogo global mais tipos próprios, P8), número, órgão emissor, emissão e vencimento;
- estabelecimento (ou a empresa toda) e vínculo opcional a um módulo;
- **responsável pela renovação**;
- pastas ou etiquetas;
- registro de **quem assinou e quando** (a assinatura digital fica para depois);
- anexos (P15).

**Renovação:**
- o documento renovado é uma **nova versão** ligada à anterior. O histórico fica guardado, e a versão antiga passa a "substituída";
- **avisos escalonados** antes do vencimento (padrão: 60, 30 e 7 dias), configuráveis por tipo, para o responsável e para quem estiver nas notificações (P20);
- documento vencido aparece em destaque no Início.

**Autocontrole** (aba em Documentos; Decreto 12.709/2025, arts. 117 a 120):
- lista de **controles**, cada um com periodicidade, responsável e evidências anexadas;
- **modelo inicial** com os controles da norma: fornecedores, água, pragas, higienização, manutenção, temperatura, produtos químicos, treinamento, reclamações e recolhimento. O cliente inclui, altera ou inativa controles (P29);
- controle atrasado gera alerta (P20);
- a higienização de recipientes e as leituras de temperatura da cantina servem de evidência automática dos controles correspondentes.

## Configurações

As seções estão em [ambiente-cliente.md](ambiente-cliente.md#configurações). Abaixo, os **parâmetros** decididos até 03/10/2026, num só lugar:

| Parâmetro | Onde se usa |
|---|---|
| Formatos de código (romaneio, projeto, lote, operação, lote comercial) | P19, cantina |
| Nomes dos ciclos da safra (ex.: 01 Verão, 02 Inverno) | Cantina |
| Etapas de produção | Cantina |
| Rendimento padrão (kg → litros), por estabelecimento, variedade e estilo | Cantina |
| Frações de prensa | Cantina |
| Métodos de trasfega | Cantina |
| Motivos de perda | Cantina |
| Tipos de saída | Cantina |
| Estratégia de baixa de lote nas saídas | Cantina |
| Parâmetros de análise, unidades preferidas e faixas ideais | Laboratório |
| Periodicidade mínima de análises por etapa | Laboratório |
| Critério de fim de fermentação provável | Cantina |
| Prazo de laudo por laboratório | Laboratório |
| Parâmetros técnicos por tipo de tratamento | Cantina |
| Periodicidade de higienização por tipo de recipiente | Cantina, autocontrole |
| "Aguardando higienização" ao esvaziar (liga/desliga) | Cantina |
| Antecedência dos avisos de validade e de vencimento de documentos | P20 |
| Limite de ajuste de inventário que exige aprovação | P27 |
| Ações que exigem aprovação | P27 |
| Alertas legais transformados em bloqueio | P29 |
| Locais (localização dos recipientes e do estoque) | Cantina, estoque |
