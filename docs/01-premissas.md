# Premissas do sistema

Regras transversais que valem para todos os módulos. Cada uma tem um status:

- **Aprovada**: definida pelo João Carlos. Só muda com nova decisão registrada aqui.
- **Proposta**: sugerida durante o planejamento e ainda não aprovada.

Ao implementar, cada premissa vira componente ou regra compartilhada. Nenhum módulo reimplementa o que está aqui.

---

## P1. A documentação basta para reconstruir o sistema (Aprovada)

**Regra:** com a pasta `docs/` deve ser possível reconstruir o sistema do zero, sem consultar o código.

**Detalhes:**
- Cada módulo tem uma especificação com:
  - objetivo;
  - entidades e campos (tipo, obrigatoriedade, validação);
  - regras de negócio;
  - telas e fluxos;
  - permissões;
  - relatórios;
  - critérios de aceite.
- Decisões de arquitetura ficam registradas (contexto, opções, decisão, consequências) em `docs/decisoes/`.
- Toda mudança de comportamento atualiza a documentação na mesma entrega do código. Documento desatualizado é tratado como defeito.
- As regras regulatórias citam a norma de origem (lei, decreto, IN, artigo). Ver [pesquisa/](pesquisa/).

**Aceite:** uma pessoa nova consegue entender e reproduzir qualquer regra lendo só `docs/`.

---

## P2. Cadastro padrão de pessoas e empresas (Aprovada)

**Regra:** toda entidade que representa pessoa ou empresa usa o mesmo bloco de cadastro, com os mesmos componentes de tela e as mesmas validações. Exemplos: cliente, fornecedor, funcionário, produtor de uva, transportador, laboratório, responsável técnico, a própria vinícola e o usuário.

**Campos do bloco padrão:**

| Campo | Regra |
|---|---|
| Tipo | Pessoa física ou jurídica (define máscara e campos) |
| Nome / Razão social | Obrigatório |
| Nome fantasia / Apelido | Opcional |
| Documento | CPF (`000.000.000-00`) ou CNPJ (`00.000.000/0000-00`), com máscara e **validação dos dígitos verificadores**. Único por empresa no sistema |
| Inscrição estadual / municipal | PJ; aceita "Isento" |
| E-mails | Vários, cada um com rótulo (principal, financeiro, técnico…). Um é o principal. Formato validado |
| Telefones | Vários, com rótulo e indicação de WhatsApp. Máscara `+55 (00) 00000-0000`, aceita fixo e celular |
| Redes sociais | Várias: tipo (Instagram, Facebook, LinkedIn, TikTok, YouTube, X, outra) e usuário ou URL |
| Endereço | CEP com **busca automática** que preenche logradouro, bairro, cidade, UF e código IBGE do município. O usuário completa número e complemento. Permite mais de um endereço (principal, cobrança, entrega, propriedade rural) |
| Site | URL validada |
| Avatar | Upload de imagem (recorte quadrado) ou escolha entre opções sugeridas (iniciais coloridas, ícones) |
| Observações | Texto livre |

**Detalhes:**
- Todo campo com formato mostra um exemplo no placeholder (`000.000.000-00`, `00000-000`, `nome@exemplo.com.br`).
- Campos inválidos são sinalizados ao sair do campo, com mensagem clara.
- **Busca de CNPJ (Decidido em 03/10/2026):** ao digitar um CNPJ válido, oferecer a busca dos dados públicos (razão social, endereço, situação cadastral) para pré-preencher.
- **Atenção:** a partir de julho de 2026, novos CNPJs podem ser **alfanuméricos** (IN RFB 2.229/2024). A validação e a máscara precisam aceitar letras nas 12 primeiras posições. *Confirmar a norma antes de implementar.*
- **Pessoa com papéis (Decidido em 03/10/2026):** usar uma única entidade "Pessoa" com **papéis**, em vez de tabelas separadas para cliente, fornecedor etc. Assim, quem é fornecedor e também cliente fica cadastrado uma vez só. Campos específicos de cada papel ficam em extensões. Exemplos: cadastro vitícola SIVIBE do produtor de uva, conselho e registro do responsável técnico, credenciamento MAPA do laboratório.

**Aceite:** os mesmos componentes de formulário servem para todos os cadastros de pessoa. Um CPF ou CNPJ inválido não é salvo.

---

## P3. Campos numéricos e de valor (Aprovada)

**Regra:** todo campo numérico é preenchido da direita para a esquerda, formatando enquanto se digita. Exemplo com 2 casas: digitar `123456` resulta em `1.234,56`.

**Detalhes:**
- **Casas decimais por grandeza.** Valem para qualquer número, moeda ou não. Exemplos:

  | Grandeza | Casas | Exemplo |
  |---|---|---|
  | Moeda | 2 | R$ 1.234,56 |
  | Litros | 2 | 1.234,56 L |
  | Quilos | 2 | 2.480,00 kg |
  | °Brix | 2 | 24,10 |
  | pH | 2 | 3,45 |
  | Densidade | 4 | 0,9950 |
  | SO₂ (mg/L) | 1 | 28,5 |

- **Moeda:** mostra o símbolo da moeda na exibição (R$; a moeda vem da empresa).
- **Unidade:** grandezas com unidade mostram a unidade ao lado do campo (L, kg, mg/L, °Brix).
- **Negativos:** só onde fizerem sentido, como em ajustes. O sinal é digitado com a tecla `-`.
- **Armazenamento:** valores nunca são gravados como ponto flutuante. Moeda em centavos inteiros; demais grandezas em decimal de precisão fixa.
- **Limites:** mínimo e máximo de cada campo vêm da especificação da entidade (pH entre 2 e 5, por exemplo).

**Aceite:** é impossível digitar um valor fora do formato. O valor exibido é exatamente o valor gravado.

---

## P4. Tabelas e listagens (Aprovada)

**Regra:** todas as listagens usam o mesmo componente de tabela.

**Detalhes:**
- **Ordenação:**
  - clicar no título de uma coluna ordena de forma ascendente; clicar de novo, descendente;
  - um indicador mostra a coluna e o sentido atuais.
- **Ordem padrão:** cada tabela declara seu campo principal e já abre ordenada por ele. Não é necessariamente a primeira coluna. Exemplos: recepções pela data mais recente; recipientes pelo código.
- **Filtros acima da tabela:**
  - busca por texto nos campos relevantes;
  - filtros dos campos importantes de cada tabela (status, período, tipo…).
- **Paginação:** 10 registros por padrão, com opções 10, 20, 50, 100 e Tudo. Mostra o total de registros encontrados.
- **Servidor:** ordenação, filtro e paginação são feitos no servidor, para funcionar com muitos registros.
- **Também (Decidido em 03/10/2026):**
  - lembrar, por usuário e por tabela, a última ordenação, os filtros e o tamanho de página;
  - exportar o resultado filtrado (CSV, Excel, PDF).

**Aceite:** nenhuma listagem foge desse padrão.

---

## P5. Nome do produto (Aprovada, sujeita a verificação)

Nome: **ViniCycle** (grafia oficial: V maiúsculo, "Vini" com um N, C maiúsculo). Domínios já registrados: `vinicycle.app` e `vinicycle.com`. A aplicação fica em `app.vinicycle.com`, e `vinicycle.app` redireciona para ela (decidido em 03/10/2026). Antes do lançamento, verificar a disponibilidade da marca no INPI (classes 9 e 42, software). Se houver impedimento, o nome volta à discussão.

---

## P6. Base de dados limpa e script único (Aprovada)

**Regra:** antes do lançamento ("go live"), a base de desenvolvimento é descartada. A estrutura definitiva é gerada por **um único script consolidado**, com rotinas de inicialização condensadas. Nada de remendos acumulados.

**Detalhes:**
- **Durante o desenvolvimento:** vale usar migrations à vontade. Na preparação do lançamento, elas são consolidadas num único script de criação ("baseline").
- **Dados de referência ≠ dados de demonstração:**
  - **referência** (oficial e necessária): classificação oficial de produtos, cultivares, unidades, aditivos e limites legais. É carregada pelo script de inicialização;
  - **demonstração/teste**: vive em script separado e nunca vai para produção.
- **Nenhuma senha, chave ou dado pessoal real** em scripts ou no repositório.
- **Atenção:** depois do lançamento, já haverá dados de clientes, e recriar do zero deixa de ser possível. Mudanças passam a exigir migrations. A disciplina proposta:
  - cada migration é revisada, pequena e reversível;
  - de tempos em tempos, as migrations antigas são consolidadas num novo baseline;
  - o script consolidado continua sendo capaz de criar uma base nova, idêntica à de produção.

**Aceite:** um comando cria a base completa do zero, idêntica à esperada, sem erros nem avisos.

---

## P7. Ação administrativa de limpeza da base (Aprovada)

**Regra:** a área administrativa tem uma ação para limpar dados.
- Por coleção/tabela.
- Por empresa (cliente).
- Ou tudo, recomeçando do zero.

**Confirmação reforçada de intenção:**
1. Prévia do que será apagado, com a contagem de registros por tabela, incluindo os dependentes.
2. Digitar uma frase de confirmação exata (por exemplo, o nome da empresa ou `APAGAR TUDO`).
3. Informar a senha de novo; **proposta:** também o segundo fator.
4. Backup ou exportação automática antes de executar, com link para download.
5. Registro na auditoria: quem, quando, o quê, contagens.

**Detalhes:**
- **Ordem de exclusão:** respeita as dependências, sem deixar registros órfãos.
- **"Zerar tudo" em produção:** **proposta:** só disponível se habilitado por uma configuração do servidor. Ninguém deve conseguir isso com um clique.
- **Retenção legal:** apagar dados regulatórios de uma empresa ativa pode violar a obrigação de guarda (rastreabilidade por 18 meses, Decreto 12.709, art. 123). A tela avisa e exige a exportação antes.

**Aceite:** é impossível executar a limpeza por engano, e toda limpeza fica auditada e é recuperável pelo backup.

---

## P8. Usuários, empresas e administração da plataforma (Aprovada)

**Regras:**
- **Identidade:** o usuário é **único no sistema, identificado pelo e-mail**.
- **Vínculos:** um usuário pode estar vinculado a **N empresas**, com um **perfil de permissões** em cada uma (P27), e escolhe em qual empresa está trabalhando.
- **Equipe da plataforma:** o mesmo usuário pode fazer parte da equipe da plataforma (administrador geral, suporte, financeiro da plataforma). Isso dá acesso à seção administrativa, conforme o perfil de plataforma dele (P27).

**Seção administrativa:**
- **Clientes (empresas):** cadastro, situação (teste, ativo, somente leitura, bloqueado, inativo) e bloqueio com motivo (ver administracao.md).
- **Planos:** preços, módulos e limites (P25).
- **Assinaturas, adicionais contratados, faturas e contas a receber.**
- **Visão geral:** usuários cadastrados, empresas, uso por módulo.
- **Tabelas padrão** (catálogos globais): insumos, variedades/cultivares, classificação de produtos, unidades, limites legais.

**Detalhes:**
- **Catálogos globais:** mantidos pela administração. Cada empresa usa os globais e pode acrescentar itens próprios, sem alterar os globais.
- **Personificação:** a equipe de suporte pode assumir a visão de um usuário cliente, sem conhecer a senha dele. Regras na P28.
- **Concessão de acesso à plataforma:** perfis de plataforma nunca são concedidos pela interface comum nem pelo próprio usuário. Só um administrador geral concede, e a concessão fica auditada.

**Aceite:** um usuário com vínculo em duas empresas nunca vê dados de uma enquanto trabalha na outra.

---

## P9. Temas e paletas (Aprovada)

**Regras:**
- **Modo de cor:** claro, escuro ou seguir o sistema.
- **Paletas:** há opções sugeridas de paleta, e cada usuário escolhe a sua. A escolha fica no perfil e vale em qualquer dispositivo.

**Detalhes:**
- **Tokens de design:** todas as cores vêm de tokens (fundo, superfície, texto, primária, sucesso, alerta, erro…). Nenhum componente usa cor fixa.
- **Contraste:** toda paleta é validada em modo claro e escuro, com contraste mínimo de leitura (WCAG AA).
- **Marca nos impressos (Decidido em 03/10/2026):** a empresa pode definir logo e cor de marca para relatórios e documentos impressos, independentemente da paleta escolhida por cada usuário na tela.

**Aceite:** trocar de paleta ou de modo muda a interface toda, sem nenhum elemento com cor errada.

---

## P10. Perfil do usuário (Aprovada)

**Regras:**
- **Edição:** o usuário edita o próprio perfil com o bloco padrão da P2, mais avatar e preferências (tema, paleta, idioma, formato de data).
- **Troca de senha:** por **token de verificação** enviado ao e-mail. O mesmo fluxo atende o "esqueci minha senha".

**Detalhes:**
- **Token:** uso único, com validade curta (proposta: 15 minutos para código e 1 hora para link).
- **Sessões:** trocar a senha encerra as outras sessões abertas.
- **Troca de e-mail:** exige confirmação no e-mail novo. Como o e-mail é a identidade (P8), não pode colidir com outro usuário.
- **Sessões (Decidido em 03/10/2026):** o usuário vê e encerra as próprias sessões (dispositivos conectados).

---

## P11. Importação de NF-e para estoque (Aprovada)

**Regras:**
- **Entrada:** as notas de compra entram no estoque de insumos enológicos, fertilizantes, defensivos, embalagens etc.
- **Dois caminhos:**
  1. **Importar o XML** da NF-e: um arquivo, vários ou um .zip.
  2. **Busca direta na SEFAZ** com o **certificado digital A1** da empresa, que baixa as notas emitidas contra o CNPJ.

**Detalhes:**
- **Duplicidade:** a chave de acesso (44 dígitos) impede importar a mesma nota duas vezes.
- **Fornecedor:**
  - o emitente vira um fornecedor (P2);
  - se ainda não existir, é cadastrado a partir dos dados da nota.
- **Itens:**
  - cada item é associado a um item de estoque da empresa;
  - o sistema **memoriza a associação** (código do produto no fornecedor → item de estoque) para as próximas notas;
  - **conversão de unidade:** por exemplo, caixa com 12 → unidade, ou saco de 25 kg → kg;
  - lote e validade vêm do grupo de rastreabilidade da nota, quando existir; senão, são informados na conferência.
- **Conferência:** a importação passa por uma tela de conferência antes de lançar no estoque. Só então os movimentos são gerados.
- **Busca direta:**
  - usa o serviço nacional de distribuição de documentos fiscais;
  - para obter o XML completo, normalmente exige a manifestação do destinatário (ciência da operação);
  - *detalhar na especificação do módulo.*
- **Certificado A1:**
  - guardado cifrado, com a senha também cifrada;
  - nunca é exibido nem exportado;
  - o vencimento (geralmente anual) entra nos alertas de vencimento.
- **Nota da uva (Decidido em 03/10/2026):** o mesmo importador lê as notas de entrada de uva (nota do produtor) e pré-preenche a recepção. A digitação manual continua disponível.

---

## Premissas complementares

Surgidas no planejamento para evitar remendos no futuro. O status de cada uma está no título.

### P12. Empresa e estabelecimento (Aprovada)

**Hierarquia:**
- A **empresa** é o cliente do sistema (quem assina o plano).
- Ela tem um ou mais **estabelecimentos** (matriz, filiais).
- Cada estabelecimento tem:
  - bloco de cadastro padrão (P2);
  - CNPJ e inscrição estadual próprios;
  - número de registro no MAPA, com validade;
  - responsável técnico;
  - capacidade de armazenamento.

**O que é de cada nível:**

| Nível | Exemplos |
|---|---|
| Estabelecimento | Recipientes, estoques, movimentos, declarações, licenças e documentos regulatórios |
| Empresa | Cadastros compartilhados (pessoas, itens de estoque, perfis de permissão) e assinatura |

**Acesso:**
- O usuário trabalha numa empresa e escolhe o estabelecimento ativo. Pode também ver dados consolidados, se tiver permissão.
- **Restrição por estabelecimento:** o vínculo do usuário pode ser restrito a alguns estabelecimentos da empresa. Sem restrição, ele acessa todos.

**Motivo:** uma vinícola com matriz e filial, ou com cantina e loja, não cabe num modelo "uma empresa = um CNPJ".

### P13. Registros regulatórios são imutáveis (Aprovada)

- **Imutabilidade:** depois de confirmados, não são editados nem apagados:
  - movimentos de volume e de estoque;
  - recepções;
  - engarrafamentos.
- **Correção:**
  - é feita por **estorno**, com motivo obrigatório, e fica visível no histórico;
  - um estorno também é imutável.
- **Rascunho:** antes de confirmar, um registro pode ficar em rascunho, editável e sem efeito no estoque.
- **Fechamento de período:**
  - o **fechamento mensal** (manual, com conferência) trava o mês do estabelecimento; a declaração anual entregue trava o ano (ver cantina.md, "Declarações e fechamento");
  - alterações posteriores exigem **reabertura** auditada, com a permissão "reabrir período" (P27); a empresa pode exigir também aprovação.
- **Motivo:** é o que torna os registros "sistematizados e auditáveis" (Decreto 12.709, art. 119).

### P14. Auditoria e rastreio completos desde o início (Aprovada)

**Regra:** tudo o que acontece no sistema deixa rastro de quem fez, o quê, quando e de onde. A auditoria entra **desde a primeira versão**, como parte do núcleo, não como módulo posterior.

**O que é registrado:**
- **Alterações de dados:**
  - inclusões, alterações, inativações, exclusões e estornos;
  - para cada uma: valor **antes e depois** de cada campo alterado.
- **Acesso:**
  - login, logout, falhas de login;
  - troca de senha;
  - troca de empresa ou estabelecimento ativo.
- **Acessos negados por falta de permissão.** Útil para o diagnóstico do suporte (P28).
- **Ações sensíveis:**
  - exportações;
  - limpezas (P7);
  - reabertura de período;
  - alteração de perfis e permissões;
  - personificações.

**Campos de cada registro de auditoria:**
- data e hora;
- usuário real e, em personificação, também o usuário personificado;
- empresa e estabelecimento;
- ação, entidade e identificador;
- diferença antes/depois;
- IP, navegador e identificador da requisição (para correlacionar com logs técnicos).

**Garantias:**
- A auditoria é **somente inclusão**: nem administradores alteram ou apagam registros de auditoria pela aplicação.
- **Guarda:** os registros de auditoria são mantidos por **5 anos**, acima da retenção legal mínima (18 meses após a expedição, Decreto 12.709, art. 123).

**Consultas:**
- aba **Histórico** em cada registro;
- consulta geral por usuário, entidade, ação e período, com exportação (P4).

### P15. Anexos padrão (Aprovada)

- **Anexos:** qualquer registro aceita arquivos (laudos, notas, fotos, certificados, rótulos), com o mesmo componente.
- **Armazenamento:** fora do banco, com limite de tamanho e tipos permitidos (P25 pode limitar o espaço por plano).
- **Metadados no banco:** nome original, tipo, tamanho, hash (detecta duplicidade e corrupção), quem enviou, quando, a que registro pertence e uma categoria (laudo, nota fiscal, certificado, foto, rótulo, outro).
- **Organização física:** os arquivos ficam numa estrutura de pastas previsível, com identificadores internos, e não pelo nome enviado pelo usuário:
  `empresa/estabelecimento/entidade/registro/arquivo`.
- **Exportação (LGPD e saída do cliente):**
  - gera um pacote `.zip` com os dados em formatos abertos (CSV/JSON) e os anexos;
  - os anexos ficam organizados em pastas legíveis, por exemplo `Lotes/L-2026-0042 - Merlot/Laudos/2026-09-12 laudo.pdf`;
  - um índice relaciona cada arquivo ao registro de origem;
  - o pacote também é usado no backup obrigatório antes de uma limpeza (P7).

### P16. Regras regulatórias versionadas (Aprovada)

- **Premissa de base:** as normas **sempre vão mudar**. Nenhuma regra legal fica fixa no código.
- **O que é versionado:** limites legais, classificações oficiais de produtos, cultivares oficiais, regras de indicação geográfica, prazos de declaração e dizeres de rótulo.
- **Estrutura:** essas regras ficam em tabelas com:
  - vigência (início e fim);
  - abrangência (nacional, UF, indicação geográfica);
  - **fonte legal** (norma, artigo, link).
- **Aplicação no tempo:** cada registro é avaliado pela regra vigente na data dele. Um laudo de 2025 segue a regra de 2025.
- **Manutenção:**
  - a equipe da plataforma mantém as regras globais na seção administrativa;
  - uma norma nova vira uma nova versão, sem apagar a anterior.

### P17. Unidades e precisão (Aprovada)

- **Catálogo único de unidades:** kg, L, hL, g, mg/L, g/hL, °Brix, % vol, mEq/L, atm…, com conversões.
- **Precisão:** cada grandeza tem precisão fixa (P3).
- **Doses:** calculadas a partir do volume tratado.

### P18. Datas, fuso horário e idiomas (Aprovada)

- **Datas e horas:**
  - gravadas em UTC;
  - exibidas no fuso do estabelecimento (Bahia: UTC−3, sem horário de verão);
  - datas sem hora são gravadas como data pura.
- **Idiomas:** textos da interface em arquivos de tradução desde o início; começa em pt-BR.

### P19. Numeração e códigos (Aprovada)

- **Sequências:** sequenciais por estabelecimento, por tipo e por ano, sem buracos nem repetição, com formato configurável.
- **Exemplos:** `ROM-2026-0001`, `L-2026-0042`.

### P20. Central de alertas (Aprovada)

- **Uma central única para:**
  - vencimentos de documentos;
  - prazos de declaração;
  - limites legais ultrapassados;
  - estoque mínimo;
  - validade de lotes de estoque (vencendo e vencidos);
  - etapas do plano atrasadas e análises pendentes;
  - leituras fora da faixa ideal;
  - higienização de recipientes vencida;
  - saída a granel sem GLT;
  - fim de fermentação provável (leituras estáveis);
  - entrada de álcool etílico a comunicar ao MAPA.
- **Canais:** na tela, por e-mail, por WhatsApp e por SMS, com preferência por usuário. Os canais externos passam por uma camada plugável, como a de pagamentos, para trocar de provedor sem mexer no resto (Decidido em 03/10/2026).

### P21. Segurança e LGPD (Aprovada)

- **Segurança:**
  - isolamento entre empresas garantido também no banco;
  - segundo fator obrigatório para a equipe da plataforma e opcional para os demais;
  - limite de tentativas de login;
  - segredos (certificado A1, chaves) cifrados.
- **LGPD:**
  - termos e política de privacidade versionados, com aceite datado;
  - exportação dos dados do titular;
  - eliminação respeitando as guardas legais;
  - **cookies (Decidido em 03/10/2026):** a aplicação usa só cookies estritamente necessários, como o de sessão. Para eles não cabe pedir consentimento, então **não há aviso nem banner** de cookies. A política de privacidade traz uma **seção de cookies**, porque informar continua obrigatório (LGPD, arts. 6º, 9º e 10; Guia orientativo de cookies da ANPD, 2022). Se algum dia a aplicação usar cookie não essencial (ex.: análise de acesso), o consentimento passa a ser exigido.

### P22. Ambientes, backup e restauração (Aprovada)

- **Ambientes permanentes:** dois, **desenvolvimento** e **produção**, com bancos, arquivos e segredos separados. Dados reais de produção nunca são copiados para desenvolvimento sem anonimização.
- **Ensaio antes de mudanças de risco:** não há homologação permanente. Antes de aplicar em produção uma mudança de estrutura do banco, cria-se um **ambiente temporário de ensaio** restaurando o último backup de produção.
  - A mudança é aplicada e conferida no ensaio; depois o ambiente é descartado.
  - Isso valida a mudança com dados reais e, de quebra, **testa a restauração do backup**.
- **Backup:**
  - automático e diário do banco e dos arquivos;
  - cópia fora do servidor principal;
  - retenção mínima de 30 dias;
  - teste de restauração ao menos mensal, e sempre que houver ensaio.

### P23. Importação e exportação padrão (Aprovada)

- **Exportação:** toda listagem exporta para CSV, Excel e PDF (P4).
- **Importação por planilha** para cargas iniciais e em massa:
  - modelo de planilha para download, por tipo de cadastro ou movimento;
  - validação linha a linha, com relatório de erros, antes de gravar qualquer coisa;
  - a importação é tudo ou nada: ou entra a planilha inteira, ou nada;
  - cada importação fica registrada (arquivo, quem, quando, quantos registros) e pode ser estornada se ainda não houver movimentos dependentes.
- **Uso imediato em 2026:** estoque de abertura (31/12/2025) e movimentos do ano anteriores ao início do uso, para a declaração de janeiro de 2027.

### P24. Testes automatizados das regras (Aprovada)

- **Testes automáticos** para as regras de volume, estoque, limites legais e permissões.
- **Gate:** nenhuma entrega passa sem eles.

### P25. Planos, módulos e limites (Aprovada)

Cada **plano** define:
- **preço** e periodicidade (mensal, anual…);
- **módulos incluídos** (Cantina, Estoque, Conformidade, Viticultura, Enoturismo…);
- **limites:**
  - número de **estabelecimentos**;
  - número de **usuários**;
  - armazenamento de anexos (decidido em administracao.md, com adicional próprio).

**Adicionais:**
- Além do plano, a empresa pode contratar **adicionais com preço próprio**:
  - usuário adicional;
  - estabelecimento adicional;
  - módulo avulso.
- O limite efetivo é o do plano mais os adicionais.

**Regras:**
- **Liberação de módulos:**
  - o sistema libera ou bloqueia telas e ações conforme os módulos contratados, desde a primeira versão;
  - no servidor, não só escondendo menus.
- **Limites:** ao atingir um limite, o sistema impede o cadastro excedente e explica como contratar um adicional. Nada é apagado.
- **Preço histórico:**
  - mudar o preço de um plano não altera assinaturas em vigor sem decisão explícita;
  - a assinatura guarda o preço contratado.
- **Rebaixamento:** só vale na renovação, sem abatimento nem reembolso. Se o uso estiver acima do novo limite, o Master precisa ajustar antes da renovação (inativar usuários, por exemplo). Detalhes em [modulos/administracao.md](modulos/administracao.md#planos-adicionais-e-assinaturas-p25).

### P26. Inativar em vez de apagar (Aprovada)

- **Cadastros referenciados** são inativados, não apagados.
- **Exclusão física:** só para registros sem vínculo ou pela limpeza administrativa (P7).

### P27. Perfis e grade de permissões (Aprovada)

**Regra:**
- O acesso é controlado por **perfis**.
- Cada perfil tem uma **grade de permissões**: para cada tela ou funcionalidade do sistema, as ações permitidas.

**Ações da grade:**

| Ação | Significado |
|---|---|
| Visualizar | Ver a tela e os registros |
| Criar | Incluir registros |
| Editar | Alterar registros |
| Inativar/Apagar | Inativar, ou apagar quando permitido (P26) |

**Ações especiais**, só onde existirem:
- confirmar ou estornar lançamentos (P13);
- exportar;
- importar planilha;
- reabrir período;
- aprovar.

**Fluxo de aprovação (Decidido em 03/10/2026):** a empresa escolhe quais ações exigem aprovação antes de valer. Exemplos: ajuste de inventário acima de X litros, estorno, reabertura de período. A solicitação fica pendente na tela "Aprovações" da Gestão até alguém com a ação "aprovar" aprovar ou recusar, com motivo. Tudo fica na auditoria (P14).

**Perfis de empresa:**
- **Modelos:** a plataforma fornece perfis-modelo. Cada empresa recebe uma cópia ao ser criada. A lista é mutável: a plataforma pode criar novos modelos, e cada empresa pode criar perfis próprios. Modelos iniciais:

  | Perfil | Acesso inicial |
  |---|---|
  | **Master** | Tudo, no âmbito da empresa. Ver regras abaixo |
  | **Responsável Técnico** | Inicialmente só a documentação e a conformidade |
  | **Enólogo** | Cantina, análises, estoque de insumos |
  | **Cantineiro** | Operações de cantina e estoque, sem estornos nem reabertura de período |
  | **Agrônomo** | Viticultura e recepção da uva, quando os módulos existirem |
  | **Financeiro / Administrativo** | Assinatura, faturas, importação de NF-e e estoque em consulta (Decidido em 03/10/2026) |

- **Grade inicial dos perfis-modelo (Decidido em 03/10/2026).** Cada empresa recebe esta grade e pode ajustá-la. Legenda: **—** sem acesso; **V** ver; **E** ver e lançar; **★** lançar e também confirmar, estornar ou aprovar.

  | Área | RT | Enólogo | Cantineiro | Agrônomo | Financeiro |
  |---|---|---|---|---|---|
  | Projetos e plano | V | ★ | V | V | — |
  | Recepção de uva | V | E | E | E | V |
  | Operações da cantina | V | ★ | E | — | — |
  | Laboratório | V | E | E | V | — |
  | Engarrafamento | V | ★ | E | — | V |
  | Estoque | V | E | E | — | E |
  | Saídas | V | V | — | — | E |
  | Fechamento e declarações | ★ | V | — | — | V |
  | Reabrir período | ★ | — | — | — | — |
  | Pessoas | V | E | V | E | E |
  | Documentos e autocontrole | ★ | V | E | — | V |
  | Relatórios e exportação | E | E | V | V | E |
  | Configurações e usuários | — | — | — | — | — |
  | Faturas da assinatura | — | — | — | — | V |

  - O **Master** tem tudo; só ele mexe em configurações, usuários, perfis e assinatura.
  - O **cantineiro** lança operações mas não estorna. Em Documentos, lança só evidências do autocontrole.
  - O **RT** fecha o mês, cuida das declarações e, com o Master, é quem reabre período.
  - A grade por tela e ação (P27) detalha estas áreas no modelo de dados.
- **Master:**
  - existe **exatamente um** por empresa: o usuário principal do cliente;
  - tem todas as permissões no âmbito da empresa; a grade dele não é editável, nem por ele mesmo;
  - cria usuários, define perfis e permissões, gerencia a empresa;
  - para trocar o Master, é preciso **passar o bastão**: o Master escolhe outro usuário, que precisa aceitar por e-mail. Em caso de ausência do Master, o suporte designa o novo Master pelo painel administrativo. Fluxo completo em [modulos/administracao.md](modulos/administracao.md#master-e-passagem-de-bastão-decidido).
- **Personalização:** a empresa pode criar perfis próprios e ajustar a grade dos seus perfis, sem afetar os modelos nem outras empresas.
- **Vínculo:** o usuário tem um perfil por empresa (opcionalmente restrito a alguns estabelecimentos, P12).

**Perfis de plataforma:**
- A equipe da plataforma tem perfis e grade próprios, separados dos perfis de empresa.
  - **Administrador (geral do sistema):** acesso a tudo.
  - Outros perfis de plataforma (suporte, financeiro da plataforma) são criados conforme a necessidade.
- A grade cobre a seção administrativa: clientes, planos, faturas, catálogos globais, auditoria, limpeza, personificação.

**Regras gerais:**
- **Negado por padrão:** sem permissão explícita, a ação é negada.
- **Verificação no servidor:**
  - a permissão é verificada no servidor em toda requisição;
  - a interface só esconde o que o usuário não pode usar, para conforto, e não é a barreira.
- **Plano e grade se combinam:** uma permissão só vale se o módulo estiver contratado (P25).
- **Proteção contra perda de acesso:**
  - um usuário não altera o próprio perfil;
  - toda empresa tem sempre um Master ativo; ele só deixa de ser Master passando o bastão.
- **Auditoria:** toda alteração de perfil ou de grade fica auditada (P14).
- **Diagnóstico:** um acesso negado mostra a mensagem "sem permissão para *ação* em *tela*", fica registrado (P14) e ajuda o diagnóstico (P28).

**Aceite:**
- a grade é editável numa tela, em formato de matriz (telas × ações);
- uma mudança na grade vale na próxima ação do usuário, sem novo login.

### P28. Personificação (Aprovada)

**Regra:** um membro da equipe da plataforma com permissão de personificar (suporte, administrador geral) pode **assumir a visão de um usuário cliente**:
- vê e age exatamente com as permissões, a empresa e o estabelecimento daquele usuário;
- **sem conhecer nem alterar a senha dele.**

**Uso típico:** diagnosticar falta de permissão, dado que "sumiu" ou erro que só acontece para aquele usuário.

**Regras de uso:**
- **Início:**
  - o suporte escolhe empresa e usuário;
  - informa um **motivo** obrigatório (por exemplo, o número do chamado).
- **Durante a personificação:**
  - uma faixa fixa e bem visível mostra "Você está personificando *Fulano* (*Empresa*)" e um botão para encerrar;
  - a sessão tem duração máxima (proposta: 60 minutos) e encerra sozinha.
- **Ações bloqueadas:**
  - trocar senha, e-mail ou segundo fator do usuário;
  - ver ou exportar o certificado A1 e outros segredos;
  - executar limpezas (P7);
  - personificar outra pessoa a partir da personificação;
  - alterar perfis e permissões.
- **Auditoria:**
  - toda ação feita durante a personificação é registrada com **as duas identidades**, a real e a personificada (P14);
  - início, fim e motivo também ficam registrados.
- **Transparência para o cliente:**
  - a empresa vê, na própria auditoria, quando e por quem foi personificada;
  - **aviso:** os administradores (perfil Master) da empresa recebem um aviso por e-mail no início de cada personificação, com o nome de quem personificou e o motivo. Não há aprovação prévia.
- **Restrição:** usuários de empresa nunca personificam; o recurso é exclusivo da equipe da plataforma.

**Aceite:** o suporte reproduz exatamente o que o cliente vê, e o registro de auditoria nunca confunde o que o cliente fez com o que o suporte fez.

### P29. O cliente decide; o sistema informa (Aprovada)

**Regra:** o ViniCycle é um sistema comercial para muitas vinícolas. Ele **não julga boas práticas** nem impõe uma forma de trabalhar. Onde houver mais de uma prática válida, o sistema suporta todas, e a escolha é do cliente:
- na **configuração** da empresa ou do estabelecimento (padrão);
- ou no **momento da operação**, pela decisão do enólogo.

**Três níveis de regra:**

| Nível | Exemplos | Comportamento |
|---|---|---|
| **Impossibilidade física e integridade dos dados** | Volume negativo, volume acima da capacidade, editar registro confirmado (P13) | **Bloqueia**. Exceção (Decidido em 03/10/2026): **estoque de insumos e embalagens** pode ficar negativo, porque a nota costuma chegar depois do uso. O sistema alerta e cria uma pendência que precisa ser resolvida antes do fechamento do mês. O volume de vinho nunca fica negativo |
| **Limite legal ou regulatório** | Fornecedor sem cadastro no SIVIBE, SO₂ acima do limite, rendimento acima de 4/5 | **Alerta.** O usuário confirma ciente, e a confirmação fica na auditoria (P14). **A empresa pode transformar um alerta específico em bloqueio (Decidido em 03/10/2026).** Mesmo bloqueado, o **Master pode desbloquear** um caso, com motivo obrigatório e registro na auditoria (P14) |
| **Prática de vinificação** | Juntar o vinho de prensa, atestar com outro lote, método do espumante, rendimento estimado | **Livre.** O sistema registra a escolha e suas consequências (por exemplo, a composição do lote), sem opinar |

**Sem amarra a fornecedor:**
- Integrações com terceiros (PDV Legal, por exemplo) são opcionais.
- Toda funcionalidade tem uma entrada genérica:
  - qualquer XML de NF-e ou NFC-e;
  - planilha (P23);
  - digitação manual.
