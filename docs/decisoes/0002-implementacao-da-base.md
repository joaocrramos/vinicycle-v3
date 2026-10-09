# 0002. Implementação da base (ciclo 1)

- **Data:** 03/10/2026
- **Situação:** Aprovada. Os três pontos que dependiam do João Carlos (níveis da grade, cadastros da cantina, validade da sessão) foram confirmados por ele em 03/10/2026.

## Contexto

O ciclo 1 transformou as premissas e o [modelo de dados](../03-modelo-de-dados.md) em código. Várias escolhas técnicas não estavam nos documentos. Elas ficam registradas aqui para que `docs/` continue bastando para reconstruir o sistema (P1).

## Decisões

### Repositório e ferramentas

| Tema | Decisão |
|---|---|
| Organização | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`. O `shared` é usado como código-fonte (sem etapa de compilação) |
| Versões | Node 24 LTS (a mesma do servidor), TypeScript 6.0, Fastify 5, Drizzle 0.45, React 19, Vite 8, Tailwind 4, Vitest 5. TypeScript 7 e Drizzle 1.0 ficam para quando o restante do ecossistema os suportar |
| Banco local | PostgreSQL 16 no Mac; a verificação no GitHub roda com PostgreSQL 18, a versão do servidor. Nada usa recurso exclusivo do 17 ou do 18 |
| Identificadores | UUID v7, gerado na aplicação (ordenado no tempo, melhor para os índices). O banco tem `gen_random_uuid()` de reserva |
| Empacotamento da API | Um arquivo por ponto de entrada (esbuild). Só o argon2, que é binário, é instalado no servidor, na versão exata |

### Isolamento no banco (RLS)

- **Papéis:**
  - `vinicycle_dono`: dono do esquema; roda as migrações;
  - `vinicycle_app`: usado pela API. Não é dono das tabelas e não tem `BYPASSRLS`.
- **Contexto de cada transação:** gravado com `set_config(..., true)`, que vale só para a transação:
  - `app.usuario_id`;
  - `app.empresa_id`;
  - `app.plataforma`: ligado só depois de a API conferir o perfil de plataforma (proposta da seção 1.2 do modelo);
  - `app.autenticacao`: só nos fluxos de entrada (login, senha, convite). Libera as tabelas do usuário (identidade, sessão, token), nunca as da empresa;
  - `app.sistema`: tarefas de fundo, como a fila de e-mails.
- **Políticas:** em todas as tabelas, inclusive catálogos. Um teste automático falha se alguma tabela ficar sem RLS.
- **Convite:** o link prova o acesso à empresa que convidou. Uma função `SECURITY DEFINER` devolve só a empresa do convite; o resto é lido com o RLS normal.
- **Chaves estrangeiras compostas** (`id`, `empresa_id`) entre tabelas da empresa, como pede a seção 1.2. Um local nunca aponta para o estabelecimento de outra empresa, nem com o RLS aberto.
- **Livros somente-inclusão:**
  - o papel da API não tem `UPDATE`/`DELETE` em `auditoria`, `empresa_situacao`, `termo_aceite` e `envio_tentativa`;
  - os livros da cantina entram com a mesma regra nos ciclos 3 e 4.

### Acesso e sessão

| Tema | Decisão |
|---|---|
| Sessão | Token aleatório no cookie (o banco guarda só o hash). Cookie `__Host-vinicycle_sessao` em HTTPS (`HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`); `vinicycle_sessao` no desenvolvimento local |
| Validade | Encerra após **7 dias sem uso** e, em qualquer caso, **30 dias** depois da entrada (Decidido em 03/10/2026) |
| CSRF | Além do `SameSite`, toda alteração exige o cabeçalho `x-vinicycle: 1`, e a origem, quando informada, precisa ser a da aplicação |
| Senha | Argon2id. Mínimo de 10 caracteres, máximo de 128, sem regras de composição; não pode conter o e-mail |
| Tentativas | 5 erros seguidos bloqueiam a conta por 15 minutos (P21). Limite por IP nas rotas de entrada: 20 por minuto |
| Tokens | Link de redefinição de senha: 1 hora. Código de troca de senha com sessão aberta: 6 dígitos, 15 minutos, 5 tentativas (P10) |
| Segundo fator | TOTP (aplicativo autenticador; RFC 6238). Obrigatório para entrar na Administração; vale 12 horas por sessão. Segredo cifrado com AES-256-GCM (`CHAVE_CIFRA`). Para usuários de empresa, fica opcional e configurável em Segurança; a exigência no login deles entra depois |
| Estabelecimento ativo | Guardado na sessão. Se for inativado ou sair do vínculo, vira "Todos" na próxima ação |
| Primeiro acesso | Ao entrar, abre a última empresa usada (ou a única) e o último estabelecimento usado (ou o primeiro permitido) |

### Permissões (P27)

- A grade inicial dos perfis-modelo é gerada a partir da tabela da P27 ([permissoes.ts](../../packages/shared/src/permissoes.ts)). Cada área da tabela foi detalhada em telas (funcionalidades).
- **Leitura dos níveis (Decidido em 03/10/2026):**

  | Nível | Ações |
  |---|---|
  | V | Visualizar |
  | E | Visualizar, criar, editar, inativar, **confirmar**, importar e exportar. "Lançar" grava no livro: a P27 diz que o cantineiro "lança operações, mas não estorna" |
  | ★ | Tudo de E, mais estornar, aprovar e reabrir período |

  **Confirmar ≠ aprovar.** Confirmar grava o rascunho de vez no livro (P13): o registro ganha número e passa a ser corrigido só por estorno. Aprovar é a decisão de outra pessoa sobre uma ação que a empresa escolheu submeter ao fluxo de aprovação (P27).

- **Exportar** só vale para quem tem pelo menos E em "Relatórios e exportação". Na grade inicial, isso deixa o cantineiro sem exportação.
- **Cadastros da cantina** (recipientes, variedades, insumos, produtos…) não estavam na tabela da P27. A grade inicial ficou assim (Decidido em 03/10/2026):

  | RT | Enólogo | Cantineiro | Agrônomo | Financeiro |
  |---|---|---|---|---|
  | V | E | V | V | V |

- **Exclusivas do Master,** fora da grade de qualquer outro perfil: usuários, perfis e permissões, e a exportação completa dos dados. As demais configurações (empresa, estabelecimentos, locais, parâmetros, notificações, integrações, auditoria) podem ser concedidas na grade.
- **Situação da empresa:**
  - "somente leitura" bloqueia toda ação que não seja visualizar ou exportar;
  - "bloqueado" deixa só o Master entrar;
  - "inativo" não deixa ninguém entrar.

### E-mail, arquivos e auditoria

- **Fila de e-mails:**
  - tabela `envio`, gravada na mesma transação do negócio. Se a transação falha, o e-mail não sai;
  - uma tarefa no próprio processo envia, com novas tentativas em 1, 2, 4, 8 e 16 minutos.
  - O pg-boss (02-arquitetura.md) entra quando houver tarefas agendadas (alertas, ciclo 6); a fila de e-mails é uma tabela do modelo e continua igual.
- **Provedor de e-mail:** `console` (grava no registro do servidor) até a conta do Resend existir; o adaptador do Resend já está pronto.
- **Textos dos e-mails:** ficam no código até existir a tela "Modelos de mensagem" da Administração.
- **Anexos:**
  - em disco, em `ARMAZENAMENTO_DIR`, com o caminho da P15;
  - a interface de gravação é a de um armazenamento de objetos, como o S3, para trocar pelo MinIO sem mudar quem usa;
  - limite de 25 MB por arquivo; tipos aceitos em [dominios.ts](../../packages/shared/src/dominios.ts).
- **Auditoria:**
  - tabela única, ainda não particionada. O particionamento por mês (proposta da seção 1.5) fica para antes do baseline do lançamento, se o volume pedir;
  - membros da equipe aparecem para a empresa como "Suporte ViniCycle".
- **Exportação de listagens (P4):** CSV (abre direto no Excel), montado na tela; cada exportação fica na auditoria. Excel nativo e PDF ficam para depois.

### Interface

- **Paletas (P9):** cinco (vinho, oliva, terra, azul, grafite), em modo claro, escuro ou seguindo o sistema. Todas as cores vêm de tokens.
- **Componentes:** botão, campos, cartões, diálogo, menu e abas no estilo shadcn/ui, sobre Radix. Os seletores são nativos, o que funciona melhor no celular.
- **Traduções (P18):** textos dos componentes comuns em `apps/web/src/i18n/pt-BR.json`. **Pendente:** levar para o arquivo também os textos das telas.

### Publicação

- **Execução:** a API serve também a interface compilada, num só processo, na porta 3100 (a 3000 é do ObraGrid). Ela roda como serviço do usuário `vinicycle` (`systemctl --user`), sem `sudo` para reiniciar.
- **Versões guardadas:** cada publicação fica em `/srv/vinicycle/releases/<versão>`, com o atalho `atual` apontando para a vigente; ficam as cinco últimas.
- **Passos da publicação:** aplicar as migrações, carregar os dados de referência e reiniciar.
- **Administrador inicial:** os dados de referência criam admin@vinicycle.com, sem senha, quando a base não tem nenhum membro da equipe. A senha é definida por "Esqueci minha senha". Assim, a base nasce completa pelo script único (P6), sem passo manual (decidido em 03/10/2026).
- **Recriar a base:** até o uso real, a base do servidor é de desenvolvimento e pode ser recriada do zero (`scripts/publicar.sh --recriar-base`). Em 01/01/2027 essa opção sai do script.
- **Segredos:** gerados no próprio servidor, em `/srv/vinicycle/config/api.env`. Nunca passam pelo repositório nem pelo chat.

## Consequências

- O isolamento não depende só do código da API: o teste de RLS roda a cada verificação.
- Novas tabelas precisam de política de RLS na mesma migração. O teste "nenhuma tabela sem RLS" falha se esquecerem.
- A publicação depende da VPN e do SSH a partir do Mac. A verificação no GitHub não publica, porque a VM não é acessível de fora.
