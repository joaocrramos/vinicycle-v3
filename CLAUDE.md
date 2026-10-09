# ViniCycle

Sistema comercial e multiempresa de gestão para vinícolas: campo, cantina, enoturismo e gastronomia, com conformidade regulatória (MAPA). Primeiro cliente: a vinícola do João Carlos, na Bahia.

## Ao começar uma sessão

1. Leia [docs/ANDAMENTO.md](docs/ANDAMENTO.md), seção "Ponto de retomada": onde paramos e o próximo passo.
2. Veja [docs/PENDENCIAS.md](docs/PENDENCIAS.md): os pontos de decisão que esperam o João Carlos.
3. A pasta `docs/` é a fonte da verdade (premissa P1). Premissas em [docs/01-premissas.md](docs/01-premissas.md).
4. Como rodar, testar e publicar: [docs/operacao.md](docs/operacao.md). Antes de cada commit: `pnpm verificar`.

## Como trabalhar neste projeto

- **Fase atual: os seis ciclos do plano e os ciclos 7 a 12 (itens 2 a 6 da lista de 2027, com a parte comercial completa) estão publicados (04/10/2026); os testes do João Carlos estão acumulados; pagamentos e WhatsApp esperam as contas no Asaas e na Meta (pendências 26 e 27); a seguir, ajustes e o item 7 da lista de 2027.** Virada para o uso real em 01/01/2027: [docs/virada-2027.md](docs/virada-2027.md). Modelo de dados e plano de entregas aprovados em 03/10/2026.
  - Siga o roteiro do ciclo em [docs/04-plano-de-entregas.md](docs/04-plano-de-entregas.md) e registre o progresso em `docs/ANDAMENTO.md`.
  - Funcionalidade nova ou mudança de regra fora do que está especificado: discutir antes de codar.
  - Apresente síntese e perguntas, e registre as decisões em `docs/`.
  - **Todo ponto de decisão pendente vai para [docs/PENDENCIAS.md](docs/PENDENCIAS.md)** (com data e onde afeta); resolvido, passa para "Resolvidos" com a resposta e onde ficou registrado.
  - Ao fim de cada sessão, deixe o "Ponto de retomada" do ANDAMENTO exato: último commit, o que está publicado, o que espera o João Carlos e o próximo passo.
- **O cliente decide, o sistema informa** (P29):
  - práticas de vinificação são opções configuráveis;
  - limites legais geram alerta;
  - só se bloqueia o que é impossível fisicamente ou quebra a integridade dos dados;
  - nada fica amarrado a um fornecedor específico.
- **Mostre o conteúdo na conversa.** Ao atualizar documentos, resuma no chat o que mudou e o que precisa de resposta; o João Carlos nem sempre consegue abrir arquivos.
- **Idioma:** documentação e interface em pt-BR. Toda regra regulatória cita a norma (lei, decreto, IN, artigo).
- **Base limpa** (P6): sem remendos; antes do lançamento, um script único cria a base.
- **Servidor:** `ssh vinicycle` (exige VPN). Tudo que precisar de `sudo` é preparado em comandos para o João Carlos executar.
