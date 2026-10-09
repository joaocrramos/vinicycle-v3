# Roteiro de virada: início do uso real em 01/01/2027

> Montado pelo Claude em 04/10/2026 (ciclo 6, bloco 5); atualizado no mesmo dia com a parte comercial (ciclos 11 e 12). A vinícola começa com o **saldo de abertura** de 31/12/2026; os movimentos de 2026 não entram (decidido em 03/10/2026, cantina.md, Carga inicial). A declaração anual de 2026 (prazo de 1º a 10/01/2027, Portaria MAPA 615/2023) é feita com os registros de hoje, fora do sistema.

## 1. Antes da virada (dezembro de 2026)

| # | Passo | Quem | Onde |
|---|---|---|---|
| 1 | Recriar a base (decidido em 04/10/2026: sim), depois dos testes, para começar sem os dados de teste | João Carlos | `scripts/publicar.sh --recriar-base` (pede a frase de confirmação) |
| 2 | Backup automático diário e cópia fora do servidor (P22; pendência 8) | João Carlos e Claude | Servidor |
| 3 | Termos de uso e política de privacidade com os dados reais e revisão do advogado (pendência 6) | João Carlos | `docs/legal/` |
| 4a | **Parte comercial** (a base recriada volta sem eles): preço do plano em cada ciclo, formas de pagamento e adicionais; integrações do Asaas e do WhatsApp com as chaves de produção e o novo token do aviso cadastrado no Asaas (pendências 26 e 27); prazos da régua e categorias dos chamados; modelos de mensagem editados, se houver | Plataforma | Administração › Planos, Adicionais, Integrações, Configurações, Modelos de mensagem |
| 4 | Criar a empresa e o Master (convite), completar os dados da empresa e do estabelecimento (CNPJ, endereço, registro no MAPA, fuso). A assinatura da vinícola do João Carlos já nasce com o preço contratado (ela paga, decidido em 04/10/2026); desconto, se houver, pela ficha do cliente | Plataforma e Master | Administração; Configurações |
| 5 | Locais: adega, almoxarifado, expedição, avariadas | Master | Configurações › Locais |
| 6 | Parâmetros: formatos de código, alertas de validade, estratégia de baixa das saídas, envase, inventário, higienização | Master e RT | Configurações › Parâmetros |
| 7 | Cadastros da cantina: recipientes, variedades em uso, insumos e embalagens (com estoque mínimo), produtos (rótulo, formatos e ficha de embalagem), marcas, parâmetros técnicos de análise e faixas | Enólogo | EnoTrace › Cadastros |
| 8 | Pessoas: fornecedores, produtores de uva (SIVIBE), laboratórios (credenciamento), transportadores, engarrafadora | Master | Gestão › Pessoas |
| 9 | Documentos com vencimento (registro no MAPA, licenças, certificados) | Master | Gestão › Documentos |
| 10 | Perfis e grade de permissões (RT, enólogo, cantineiro, financeiro); convites aos usuários | Master | Configurações › Perfis; Usuários |
| 11 | Projetos de 2026 que ainda têm vinho (um por vinho), se quiser os nomes certos; a carga cria os que faltarem | Enólogo | EnoTrace › Projetos |

## 2. Na virada (31/12/2026 e 01/01/2027)

| # | Passo | Onde |
|---|---|---|
| 1 | Medir o vinho de cada recipiente em 31/12 e montar a planilha de **granel** (recipiente, projeto, lote, litros e composição por variedade e safra) | EnoTrace › Carga inicial (modelo) |
| 2 | Contar as **garrafas** por produto, formato e lote comercial, e os **insumos e embalagens** por local e lote | Idem |
| 3 | Conferir cada planilha (os erros aparecem por linha) e aplicar, com a **data do saldo 31/12/2026, 23:59** | Idem |
| 4 | Conferir o resultado: Painel da cantina (volumes), Estoque (saldos e lotes), Lotes comerciais | EnoTrace |
| 5 | Se algo saiu errado: estornar a carga, corrigir a planilha e aplicar de novo | Carga inicial › Estornar |

## 3. Primeiro mês de uso (janeiro de 2027)

- Lançar no dia a dia: recepção, operações, análises, notas de compra (XML), envases, saídas (XML da nota de venda ou digitação).
- Acompanhar a **central de alertas** (sino) e o **Início**.
- No começo de fevereiro: **fechar janeiro** (EnoTrace › Fechamento do mês). O relatório do mês é a base da declaração mensal (Lei 7.678/1988, art. 31).
- Anotar o que estranhar: os ajustes entram com prioridade (04, 2027, item 1).
- A **declaração anual de 2027** (de 1º a 10/01/2028) sai de EnoTrace › Declarações, já pronta (ciclo 7); a de 2026 é feita fora do sistema.

## 4. O que ainda não está no sistema em 01/01/2027

Os itens 2 a 6 da lista de 2027 foram adiantados e já estão no sistema (declarações, autocontrole e aprovações, simulador de corte, espumante na garrafa, selos, álcool etílico, vinificação para terceiros e a parte comercial). Faltam, pela ordem de [04-plano-de-entregas.md](04-plano-de-entregas.md#2027-em-ordem-de-prioridade-proposta):
- item 7: uso sem internet, etiquetas com QR dos recipientes, ficha técnica em PDF;
- item 8: fase fiscal ([FISCAL.md](FISCAL.md)) e os próximos módulos (VitiTrack, EnoTur, EnoMesa);
- da parte comercial: autocadastro pelo site, cobrança recorrente no cartão, alertas da central por WhatsApp e SMS e o provedor de SMS.
