# Ciclo 1: Base

> Período previsto: 06/10 a 17/10/2026. Começou antes, em 03/10/2026.
> Escopo ([04-plano-de-entregas.md](../04-plano-de-entregas.md)):
> - banco no servidor e publicação automática;
> - login, empresa, estabelecimentos, locais, usuários, convites, perfis e grade, auditoria e anexos.

## O que foi entregue

| Item | Situação |
|---|---|
| Monorepositório, lint, formatação, testes (P24) | Pronto |
| Banco: esquema das seções 1 e 2 do modelo, RLS em todas as tabelas, livros só de inclusão, dados de referência | Pronto |
| Login, sessão, limite de tentativas, "esqueci a senha", troca de senha por código, sessões abertas (P10, P21) | Pronto |
| Segundo fator (aplicativo autenticador), obrigatório na Administração (P21) | Pronto |
| Administração: criar cliente, convite do Master, mudar situação do cliente | Pronto |
| Convite com dados pessoais, senha e aceite dos termos; quem já tem cadastro só confirma a senha (P8) | Pronto |
| Primeiro acesso: cadastro obrigatório do estabelecimento | Pronto |
| Empresa, estabelecimentos e locais, com histórico e anexos | Pronto |
| Usuários: convidar, reenviar, cancelar, mudar perfil e estabelecimentos, inativar | Pronto |
| Perfis: cópia dos modelos, perfis próprios, grade em matriz telas × ações (P27) | Pronto |
| Auditoria: consulta geral e aba Histórico em cada registro (P14) | Pronto |
| Componentes padrão: ficha (P2), números (P3), listagem (P4), anexos (P15), temas e paletas (P9) | Pronto |
| Verificação automática no GitHub | Pronta; roda a partir do primeiro envio |
| Servidor: banco, serviço e publicação | Publicado em 03/10/2026 ([operacao.md](../operacao.md#servidor)) |

## O que testar

Endereço: `http://localhost:3100` pelo túnel SSH ([operacao.md](../operacao.md#servidor)), até o `app.vinicycle.com` estar no ar.

### 1. Administração
1. Entre com o administrador e configure o aplicativo autenticador (Google Authenticator, Microsoft Authenticator…).
2. Crie a sua vinícola em **Clientes → Novo cliente**:
   - confira as máscaras de CNPJ, telefone e CEP e a mensagem de CNPJ inválido;
   - use o seu e-mail como Master.
3. Na ficha do cliente, confira o convite pendente.
   - Enquanto não houver o Resend, o link do convite está no registro do servidor; eu repasso.

### 2. Primeiro acesso do Master
1. Abra o convite, preencha os seus dados, a senha e aceite os termos (ainda em rascunho).
2. O sistema deve abrir direto o **cadastro do estabelecimento**. Confira:
   - a capacidade em litros, preenchida da direita para a esquerda;
   - a sugestão de fuso pela UF;
   - as atividades no MAPA.
3. Em **Início**, veja os primeiros passos.

### 3. Configurações
1. **Empresa:** complete os dados. Tente trocar o CNPJ (deve ficar bloqueado: só o suporte troca). Anexe um documento.
2. **Estabelecimentos:**
   - edite;
   - abra **Histórico** e veja o antes e depois de cada campo;
   - anexe o registro do MAPA.
3. **Locais:** crie "Adega", "Almoxarifado da cantina" (estoque do EnoTrace) e um local refrigerado. Teste nome repetido e inativar com motivo.
4. **Perfis:**
   - abra o Cantineiro e confira a grade;
   - crie um perfil copiando outro;
   - tente editar o Master (bloqueado).
5. **Usuários:**
   - convide alguém (pode ser outro e-mail seu) como Cantineiro;
   - reenvie e cancele um convite;
   - aceite outro;
   - mude o perfil;
   - restrinja a um estabelecimento;
   - inative.
6. **Auditoria:** filtre por ação e período e exporte em CSV.

### 4. Permissões na prática
1. Entre como o Cantineiro: as configurações não devem aparecer no menu.
2. Como Master, dê ao Cantineiro "Visualizar" em "Config.: locais". Sem sair, o Cantineiro já deve ver Locais.
3. Na Auditoria, procure "Acesso negado".

### 5. Segurança e preferências
1. Troque a senha pelo código no e-mail.
2. Abra outra sessão (outro navegador ou o celular) e encerre-a em **Segurança**.
3. Erre a senha 5 vezes: a conta fica bloqueada por 15 minutos.
4. Teste modo claro, escuro e as cinco paletas. Confira no celular.

## Fica para os próximos ciclos

| Item | Quando |
|---|---|
| Responsável técnico, IGs e produtos elaborados no estabelecimento; busca de CEP e CNPJ | Ciclo 2 (dependem de Pessoas e dos catálogos) |
| Passagem de bastão do Master, troca de e-mail do usuário | Ciclo 2 |
| Envio real de e-mails (Resend) | Quando a conta e o domínio estiverem prontos |
| Central de alertas (o sino) | Ciclo 6 |
| Personificação pelo suporte (P28) | 2027 (a auditoria já tem os campos) |
| Exportação em Excel e PDF (hoje: CSV, que abre no Excel) | Próximos ciclos |
