# Questões fiscais (fase futura)

> Criado em 03/10/2026, a pedido do João Carlos. A parte fiscal no Brasil é de extrema complexidade e **não entra
> agora**: cobrir tudo atrasaria o sistema em anos. Este documento guarda o que já se sabe e o que falta responder,
> para quando a fase fiscal começar.
> Pesquisa de origem: [pesquisa/2026-10-elaboracao-por-terceiros.md](pesquisa/2026-10-elaboracao-por-terceiros.md) (seções 4 a 6).

## Princípio (Decidido em 03/10/2026)

**Por enquanto, o ViniCycle não trata de fiscal.** Ele só:
- guarda **referências** de documentos fiscais: número, série, chave e o XML anexado;
- **lê o XML** para preencher cadastros e lançamentos: entrada de estoque (P11), recepção de uva e saídas de venda.

Não calcula imposto, não escolhe CFOP, não emite nota e não gera escrituração.

## Adiado para a fase fiscal

| Tema | O que se sabe | Onde surgiu |
|---|---|---|
| **Emissão de NF-e** | Já estava como futuro na visão geral | [00-visao-geral.md](00-visao-geral.md) |
| **Prazo da suspensão do ICMS** na industrialização por encomenda | Cada UF define prazo e prorrogações (resposta à pergunta 10). Exemplo: Bahia, 180 dias, prorrogáveis duas vezes (RICMS-BA, art. 280). Ideia aprovada em 03/10/2026: tabela por UF e aviso 30 dias antes de cada vencimento. **Adiada** com a parte fiscal | [modulos/cantina.md](modulos/cantina.md) |
| **CFOPs da industrialização por encomenda** | Remessa 5.901/1.901, retorno 5.902/1.902, cobrança 5.124/1.124; entrega direta por conta do cliente 5.122, 5.924, 5.925 e 5.125 (tabela CFOP oficial) | Pesquisa, seção 4 |
| **Nota de retorno** | Dois grupos de itens: retorno pelo valor da remessa e cobrança do serviço com os materiais | Pesquisa, seção 4 |
| **IPI no vinho elaborado por terceiro** | Sem suspensão no retorno; devido na saída da cantina e na do cliente, que se credita (RIPI, Decreto 7.212/2010, art. 43, §5º); quem encomenda é equiparado a industrial (art. 9º, V) | Pesquisa, seção 4 |
| **Bloco K e EFD-ICMS/IPI** | Vinho do cliente aparece como estoque de terceiro na escrita da cantina e como estoque próprio em poder de terceiro na do cliente | Pesquisa, seção 4 |
| **Regime tributário** no perfil da empresa | Define a necessidade do Bloco K e das bases fiscais | [00-visao-geral.md](00-visao-geral.md) |
| **Pagamento em produto** | Sem regra específica encontrada; dois modelos de nota propostos por analogia | Pesquisa, seção 6 |

## Perguntas para o contador

As respostas do João Carlos de 03/10/2026 estão marcadas.

1. **Prazo da suspensão do ICMS:** regra nacional ou de cada estado? **Resposta: cada estado.**
2. **Remessa entre estados** de uva, mosto ou vinho para industrialização tem suspensão do ICMS? Há acordos entre estados? **Resposta: sim.** *Falta saber quais acordos e em quais estados.*
3. **Vinho que passa do prazo de retorno** (ex.: tintos de guarda): retorno simbólico ou recolhimento do imposto? **A verificar.**
4. **IPI no retorno do vinho:** base de cálculo, convivência com a suspensão do granel (RIPI, art. 44), equiparação de quem encomenda a industrial (art. 9º, V), efeito no Simples Nacional. **A verificar.**
5. **Pagamento em vinho:** qual nota, como valorar a parte que fica com a cantina, quais impostos incidem.
6. **Produtor rural pessoa física:** NF-e ou nota avulsa (varia por UF)? Qual CFOP na venda de uva entregue direto à cantina de terceiro (5.101, ou 5.122 com 5.924)?
7. **ISS** sobre o serviço de vinificação para terceiros: vale o Tema 816 do STF?
8. **Reforma tributária:** industrialização por encomenda na CBS e no IBS (LC 214/2025) e Imposto Seletivo sobre o vinho elaborado por terceiro.
9. **Benefícios fiscais estaduais para vinho:** valem para quem só manda elaborar ou só para quem fabrica?
