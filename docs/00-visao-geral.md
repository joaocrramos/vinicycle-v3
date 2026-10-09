# Visão geral

## Propósito

Sistema de gestão para vinícolas que acompanha o vinho **do campo à taça**. Cobre três frentes:

- **viticultura**, no campo;
- **enologia**, na produção (cantina);
- **enoturismo**, na recepção de visitantes.

Ao longo dessa cadeia, o sistema mantém a vinícola **regular perante as autoridades**: registros, declarações e documentos.

O produto é **comercial e multiempresa**: qualquer vinícola do Brasil pode contratá-lo. As regras que variam por estado ou tipo de produto vêm do cadastro da vinícola, não do código.

O primeiro cliente, e caso real de validação, é a vinícola do João Carlos, na **Bahia**.

## Objetivo de 2026

**Regularizar toda a parte documental da vinícola perante as autoridades até dezembro de 2026.**

**Marco revisto em 03/10/2026:** o sistema entra em **uso real em 01/01/2027**, com a vinícola registrando tudo nele desde o primeiro dia de 2027.
- **Carga inicial:** só o saldo de abertura em 31/12/2026. Os movimentos de 2026 não entram.
- **Declaração anual de janeiro de 2027** (ano de 2026, Portaria MAPA 615/2023): feita fora do sistema, como hoje.
- **Pelo sistema:** a declaração mensal a partir de janeiro de 2027 e a declaração anual de 2027, entregue de 1º a 10/01/2028.
- Plano em [04-plano-de-entregas.md](04-plano-de-entregas.md).

## Prioridades

| Ordem | Frente | Situação |
|---|---|---|
| 1 | **Cantina** (enologia, módulo EnoTrace) + **conformidade** | Foco de 2026 |
| 2 | **Viticultura** (módulo VitiTrack) | Depois. Em 2026, só o mínimo que a recepção da uva exige |
| 3 | **Enoturismo** (módulo EnoTur) | Depois |
| — | **Gastronomia** (módulo EnoMesa): restaurante e harmonização | Futuro |
| — | Concursos (inscrições, notas, medalhas) | Futuro |
| — | Integração com o PDV Legal (api.tabletcloud.com.br) | Futuro. Necessária para a rastreabilidade de vendas (recall) |
| — | Emissão de NF-e, IoT/sensores, IA, custo por lote | Futuro |

## Escopo proposto para 2026 (aguardando aprovação)

| Bloco | Conteúdo |
|---|---|
| **Base** | Empresas e estabelecimentos; usuários, perfis e grade de permissões; auditoria; personificação; planos e limites; perfil regulatório da vinícola (UF, registros MAPA, responsável técnico, uso de indicação geográfica); premissas transversais ([01-premissas.md](01-premissas.md)) |
| **Recepção da uva** | Variedade, data da colheita e kg são o núcleo. Somam-se os campos exigidos por norma: origem (vinhedo próprio ou fornecedor com cadastro vitícola), peso líquido na balança, °Brix e nota fiscal |
| **Cantina** | Recipientes numerados; lotes; livro de movimentos de volume (entrada, trasfega, corte, perda, ajuste, engarrafamento, estorno); adições de insumos com alerta de limites legais; análises e laudos por lote |
| **Estoque** | Insumos (com importação de NF-e), produto acabado (garrafas), embalagens |
| **Conformidade** | Documentos com vencimento e alertas; declaração anual; dados para o SIVIBE; fechamento mensal; relatório de rastreabilidade de lote |
| **Carga inicial** | Importação do estoque de abertura e dos movimentos de 2026 |

## Como o sistema se encaixa nas obrigações (resumo)

Detalhe e fontes em [pesquisa/](pesquisa/).

| Obrigação | Órgão / canal | O sistema… |
|---|---|---|
| Registros auditáveis de rastreabilidade, da recepção à expedição, guardados por 18 meses (Decreto 12.709/2025, arts. 119–123) | MAPA (fiscalização) | **É** esse registro: livro de movimentos imutável, com estorno |
| Recipientes numerados e identificados (Lei 7.678, art. 48) | MAPA | Cadastro de recipientes com código único |
| Declaração anual de produção e estoques, 1º–10/jan (Portaria 615/2023) | gov.br | Gera o relatório pronto para transcrever |
| Declaração de produção de uvas; compra só de fornecedor cadastrado e em dia (IN 59/2020; Decreto 12.709, art. 203) | SIVIBE | Valida o fornecedor na recepção; gera os dados da declaração |
| Declaração mensal de estoque, entradas e saídas (Lei 7.678, art. 31) | Portal do MAPA | Gera o fechamento mensal |
| Limites de aditivos (ex.: SO₂ total até 300 mg/L — IN Anvisa 211/2023) | MAPA/Anvisa | Calcula a dose acumulada e alerta |
| Laudo por lote antes da comercialização (Lei 7.678, art. 2º) | Laboratório credenciado | Guarda o laudo no lote; alerta no envase fora do padrão, com bloqueio opcional por empresa (P29) |
| Registro do estabelecimento e de produtos (10 anos), ART/AFT do RT, licença ambiental (INEMA), AVCB, alvarás, laudos de água | MAPA, conselhos, INEMA, bombeiros, município | Central de documentos com vencimento e alertas |
| Programa de autocontrole: fornecedores, água, pragas, higienização, treinamento, reclamações, recolhimento (Decreto 12.709, arts. 117–120) | MAPA | *2026: checklist com anexos. Módulo completo depois* |
| SISDEVIN (somente RS) | SEAPI-RS | Futuro, para clientes gaúchos (exportação no layout SDA1.4) |

**Exemplo de particularidades regionais (primeiro cliente, Bahia).** O produto é nacional; regras de cada UF e região entram como parâmetros (P16), conforme surgirem:
- **SISDEVIN:** não se aplica.
- **Safra:** é o ano civil (Portaria MAPA 824/2025). As duas colheitas anuais do Vale do São Francisco entram na mesma safra, mas o sistema registra também o **ciclo** de cada colheita.
- **IP Vale do São Francisco:** Casa Nova e Curaçá ficam na área da Indicação de Procedência, que tem controles próprios (produtividade por ciclo, varietal ≥ 85%, selos numerados).

## Glossário

| Termo | Significado |
|---|---|
| **Empresa** | Cliente do sistema (a vinícola como organização) |
| **Estabelecimento** | Unidade com CNPJ, inscrição estadual e registro no MAPA. Uma empresa pode ter vários |
| **Recipiente** | Tanque, barrica, tonel, ovo ou ânfora, com código único e capacidade |
| **Lote** | Porção identificada de mosto, vinho ou derivado: a unidade de rastreabilidade na cantina |
| **Romaneio** | Registro de uma recepção de uva (carga pesada e analisada) |
| **Livro de movimentos** | Lançamentos de litros que entram e saem de recipientes. O volume de um recipiente é a soma deles, nunca um número digitado |
| **Trasfega** | Passagem de vinho de um recipiente para outro, do mesmo lote |
| **Corte (blend)** | Mistura de lotes diferentes, formando um novo lote |
| **Atesto** | Completar o nível de um recipiente (barricas) para evitar oxidação |
| **Estorno** | Lançamento que anula outro, com motivo. Registros confirmados nunca são editados |
| **Safra** | Ano civil das uvas colhidas (1º/jan a 31/dez) |
| **Ciclo** | Cada colheita dentro de uma safra (viticultura tropical: até duas por ano). Tem número (`01`, `02`) e nome configurável (ex.: Verão, Inverno) |
| **RT** | Responsável técnico do estabelecimento perante o MAPA |
| **SIPEAGRO** | Sistema do MAPA de registro de estabelecimentos e produtos |
| **SIVIBE** | Sistema federal do cadastro vitícola e das declarações de uva |
| **SISDEVIN** | Sistema de declarações vinícolas do RS (não se aplica a outros estados) |
| **GLT** | Guia de Livre Trânsito, obrigatória para transportar vinho a granel |
| **PIQ** | Padrões de identidade e qualidade dos produtos |
| **IP / IG** | Indicação de Procedência / Indicação Geográfica |
| **Autocontrole** | Programa obrigatório de controles e registros do processo produtivo (Decreto 12.709) |

## Perfil da vinícola (preenchido na implantação)

O sistema é genérico, então as respostas de negócio de cada cliente não são decisões de projeto: são **campos do perfil da empresa e dos estabelecimentos**, preenchidos na implantação. Esses campos ligam ou desligam regras e telas.

| Item do perfil | Onde fica | O que muda no sistema |
|---|---|---|
| Origem da uva: própria, comprada ou ambas | Estabelecimento | Exige o cadastro de vinhedos próprios (SIVIBE) e/ou de fornecedores com cadastro vitícola. A origem é registrada também em cada recepção |
| UF e município | Estabelecimento (endereço, P2) | Regras por UF (SISDEVIN só no RS, benefícios de ICMS) e área de indicação geográfica |
| Indicações geográficas usadas (ex.: IP Vale do São Francisco) | Estabelecimento | Liga os controles da IG: produtividade por ciclo, varietal ≥ 85%, selos, idade máxima, declarações ao Conselho |
| Atividades registradas no MAPA (produtor, engarrafador, padronizador…) | Estabelecimento | Define quais declarações se aplicam (ex.: mensal para engarrafador) |
| Regime tributário (Simples Nacional, Lucro Presumido, Real) | Empresa | Necessidade do Bloco K e das bases fiscais (fase fiscal, ver [FISCAL.md](FISCAL.md)) |
| Produtos elaborados (vinho fino, de mesa, espumante, suco, colonial…) | Estabelecimento | Habilita a classificação oficial correspondente |
| Situação do autocontrole (tem Manual de BPF? data da última revisão) | Estabelecimento | Habilita o checklist de autocontrole e os alertas de revisão |
| Forma atual de registro (planilha, papel, outro sistema) | Implantação | Define o roteiro da carga inicial (P23) |

## Pendências do planejamento

Nenhuma. Perguntas para o RT e o MAPA em [perguntas-externas.md](perguntas-externas.md); questões fiscais em [FISCAL.md](FISCAL.md).
