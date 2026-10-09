# Ciclo 2: Gestão e cadastros

> Período previsto: 20/10 a 31/10/2026. Começou antes, em 03/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md#roteiro-do-ciclo-2)):
> - pessoas e papéis, busca de CEP e CNPJ, documentos com vencimento;
> - cadastros da cantina e parâmetros;
> - pendências do ciclo 1: passagem de bastão e troca de e-mail.

## O que foi entregue

| Item | Situação |
|---|---|
| Catálogos globais: papéis, tipos de documento, tipos de recipiente, unidades, classes de produto, cultivares do SISDEVIN (30/03/2023), tipos de insumo, parâmetros de análise, listas | Pronto |
| Catálogos editáveis pela empresa: itens próprios ao lado dos globais (P29) | Pronto |
| Pessoas: cadastro único com papéis e extensões, contatos da pessoa jurídica | Pronto |
| Busca de CEP (ViaCEP → BrasilAPI → OpenCEP) e de CNPJ (BrasilAPI → CNPJ.ws), só para pré-preencher | Pronto |
| Estabelecimento com responsável técnico, IGs e produtos elaborados | Pronto |
| Documentos: tipos, versões, vencimento (em dia, vencendo, vencido), responsável, etiquetas, anexos; resumo no Início | Pronto |
| Cadastros da cantina: recipientes (com barricas e situação), insumos e embalagens, marcas, produtos (rótulos, formatos, ficha de embalagem) | Pronto |
| Parâmetros técnicos: análises e faixas, rendimento, ciclos da safra, higienização | Pronto |
| Parâmetros da Gestão: formatos de código (P19), baixa de lote nas saídas, recipiente vazio, avisos de validade | Pronto |
| Passagem de bastão do Master, inclusive pelo suporte, com comprovante | Pronto |
| Troca de e-mail do usuário, confirmada no endereço novo (P10) | Pronto |
| Busca livre na Auditoria | Corrigida (a tela mostrava a busca, mas a API a ignorava) |

## O que testar

Endereço: `https://app.vinicycle.com`.

### 1. Pessoas (Gestão › Pessoas)
1. Cadastre um fornecedor de uva pessoa jurídica:
   - digite o CEP e veja o endereço preenchido;
   - clique em **Buscar dados públicos do CNPJ**. CNPJ baixado ou inapto aparece como alerta, não bloqueia;
   - inclua dois contatos (comercial e financeiro).
2. Cadastre um funcionário pessoa física com cargo e um responsável técnico com conselho e registro.
3. Dê dois papéis à mesma pessoa (ex.: cliente e fornecedor) e confira os filtros da lista.

### 2. Estabelecimento (Configurações › Estabelecimentos)
1. Escolha o responsável técnico cadastrado em Pessoas.
2. Marque a IG Vale do São Francisco e os produtos elaborados.

### 3. Documentos (Gestão › Documentos)
1. Cadastre o registro do estabelecimento no MAPA, com vencimento, responsável pela renovação e o PDF.
2. Crie um documento que vença em 20 dias: ele aparece como **vencendo**, e o Início mostra o aviso.
3. Renove o documento (nova versão) e veja o histórico de versões.
4. Crie etiquetas ("MAPA", "Ambiental") e filtre por elas.

### 4. Cadastros da cantina (EnoTrace)
1. **Catálogos:** marque as variedades com que a vinícola trabalha; crie uma variedade fora do catálogo e veja o aviso de "sem código oficial".
2. **Recipientes:** cadastre um tanque de inox e uma barrica (aparecem os campos de tanoaria, madeira, tosta e primeiro uso). Mude a situação para "em manutenção", com motivo.
3. **Insumos e embalagens:** um insumo (o tipo filtra as unidades) e uma garrafa.
4. **Marcas e produtos:**
   - crie uma marca e um produto. A denominação se monta pela classe, cor e açúcar;
   - inclua um rótulo com o teor alcoólico;
   - inclua o formato 750 mL e, na ficha de embalagem, a garrafa (1 por garrafa);
   - em Insumos e embalagens › Produto acabado, o formato aparece como item de estoque.
5. **Parâmetros técnicos:** marque as análises usadas e as faixas; crie uma regra de rendimento; cadastre os ciclos da safra (01 e 02); defina a higienização da barrica.

### 5. Parâmetros (Configurações › Parâmetros)
1. Mude o formato do romaneio e veja o exemplo. Tente um formato sem o ano: o sistema não aceita.
2. Escolha "Sem lote" na baixa das saídas e leia o aviso sobre recolhimento.

### 6. Passagem de bastão e troca de e-mail
1. **Passagem de bastão:** convide uma segunda conta sua.
   - Em Usuários, abra essa pessoa e clique em **Passar o bastão**. Escolha o seu perfil depois da troca.
   - Confira o aviso de pedido pendente. Cancele e faça de novo.
   - Aceite pelo e-mail com a outra conta. Ela vira Master, e você passa ao perfil escolhido.
   - Para voltar, peça à outra conta que lhe passe o bastão.
2. **Troca pelo suporte:**
   - na Administração, abra o cliente e use **Designar novo Master**, com motivo e um PDF;
   - o Master atual recebe o aviso.
3. **Troca de e-mail:**
   - em Meu perfil › E-mail › Trocar, informe o endereço novo e a senha;
   - confirme pelo link;
   - entre com o e-mail novo. O antigo recebe o aviso.

## Fica para os próximos ciclos

| Item | Quando |
|---|---|
| Avisos de vencimento por e-mail e no sino; alertas de validade e de higienização | Ciclo 6 (central de alertas) |
| Propriedades e parcelas do produtor de uva | Ciclo 3, com a recepção |
| Parâmetros do laboratório, aprovações e alertas que viram bloqueio | Com o ciclo que os usa |
| Autocontrole, diário e etiqueta com QR dos recipientes | 2027 |
| Edição dos textos dos e-mails pela Administração | Depois (hoje ficam no código) |
