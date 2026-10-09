# Operação: desenvolvimento, testes e publicação

Como rodar o ViniCycle no Mac, testar e publicar no servidor. As decisões por trás estão em [decisoes/0002-implementacao-da-base.md](decisoes/0002-implementacao-da-base.md).

## Desenvolvimento no Mac

**Requisitos:**
- Node 24 ou superior;
- pnpm 12;
- PostgreSQL local, com o usuário do Mac como superusuário (padrão do Homebrew).

**Primeira vez:**

```bash
pnpm install
scripts/banco-local.sh                      # bancos vinicycle e vinicycle_teste, papéis dono e app
cp apps/api/.env.example apps/api/.env      # e gere a CHAVE_CIFRA: openssl rand -base64 32
pnpm --filter @vinicycle/api db:migrar
pnpm --filter @vinicycle/api db:referencia
```

Nos catálogos que a Administração edita (Administração › Catálogos), a carga dos dados de referência só inclui o item que falta: renomear um item global no código não chega às bases existentes; renomeie pela tela.

Os dados de referência criam o administrador inicial da plataforma, **admin@vinicycle.com**, sem senha. Para definir a senha, use "Esqueci minha senha" na tela de entrada; no desenvolvimento, o link aparece no terminal da API.

**Rodar:**
- `pnpm dev` sobe a API (porta 3000) e a interface (porta 5173);
- abra `http://localhost:5173`;
- no desenvolvimento, os e-mails (convites, senhas) aparecem no terminal da API.

**Administração local:** `pnpm --filter @vinicycle/api demo` cria também `equipe@vinicycle.local` (senha de `DEMO_SENHA`), Administrador da plataforma com segredo fixo de segundo fator; o código do momento sai em `pnpm --filter @vinicycle/api demo codigo`. Só desenvolvimento: o script recusa a produção.

**Recomeçar a base local do zero:** `scripts/banco-local.sh --recriar`, depois migrar e carregar a referência.

## Verificação

`pnpm verificar` roda formatação, lint, tipos e testes. A mesma verificação roda no GitHub a cada envio ([.github/workflows/verificar.yml](../.github/workflows/verificar.yml)).

**O que os testes cobrem:**
- **Testes da API:**
  - recriam o banco `vinicycle_teste` do zero a cada execução;
  - cobrem o isolamento entre empresas no banco (RLS), as permissões, a autenticação e os fluxos completos.
- Com `LOG_TESTE=1`, os erros internos da API aparecem na saída.

**Migrações:**
- Mudou o esquema em `apps/api/src/db/schema/`? Rode `pnpm --filter @vinicycle/api db:gerar`.
- **Política de RLS:** toda tabela nova precisa de uma, numa migração própria (`drizzle-kit generate --custom`). O teste "nenhuma tabela sem RLS" falha se faltar.

## Servidor

**Preparação única (João Carlos, com `sudo`):** no Terminal do Mac, porque o `sudo` precisa de um terminal para pedir a senha.

```bash
scp /Users/joao.carlos/Projetos/ViniCycle/infra/servidor/preparar.sh vm-joao:/tmp/preparar-vinicycle.sh
```

```bash
ssh -t vm-joao 'sudo bash /tmp/preparar-vinicycle.sh; rm -f /tmp/preparar-vinicycle.sh'
```

O script cria:
- as pastas em `/srv/vinicycle`;
- o banco e os papéis;
- o arquivo `/srv/vinicycle/config/api.env`, com senhas e chave geradas no próprio servidor;
- o "linger" do usuário `vinicycle`.

Pode rodar de novo sem estragar nada.

**Publicar (do Mac, com a VPN):**

```bash
scripts/publicar.sh
```

O script, na ordem:
1. verifica e empacota;
2. envia a versão para `/srv/vinicycle/releases/<versão>`;
3. aplica as migrações e os dados de referência;
4. troca o atalho `atual` e reinicia o serviço;
5. confere se a API respondeu.

**Administrador inicial:**
- A criação da base (dados de referência) cria **admin@vinicycle.com**, sem senha, quando não há nenhum membro da equipe da plataforma (decidido em 03/10/2026).
- A senha é definida por "Esqueci minha senha" em `https://app.vinicycle.com`; o link chega pelo Resend.
- Outros membros da equipe, até existir a tela "Equipe da plataforma":

```bash
ssh vinicycle 'cd /srv/vinicycle/atual/api && set -a && . /srv/vinicycle/config/api.env && set +a && node dist/cli.js criar-admin voce@exemplo.com "Seu Nome"'
```

**Recriar a base do servidor** (só enquanto ela for de desenvolvimento, até 01/01/2027; P6):
- `scripts/publicar.sh --recriar-base` apaga todos os dados e anexos do servidor e recria a base pelo script único de criação;
- pede para digitar `RECRIAR A BASE`;
- antes do início do uso real, essa opção sai do script.

**Acesso enquanto o `app.vinicycle.com` não está no ar:** túnel SSH pela VPN.

```bash
ssh -N -L 3100:127.0.0.1:3100 vinicycle
```

Com o túnel aberto, use `http://localhost:3100` no navegador.

**Registros e serviço:**
- `ssh vinicycle 'journalctl --user -u vinicycle-api -n 100'`
- `ssh vinicycle 'systemctl --user status vinicycle-api'`

Enquanto o e-mail estiver no modo `console`, os links de convite aparecem nesse registro.

**Voltar para a versão anterior:**
- aponte `/srv/vinicycle/atual` para a pasta anterior em `releases/` e reinicie (`systemctl --user restart vinicycle-api`);
- migrações já aplicadas não são desfeitas: para isso, restaure o backup (P22).

**Endereço definitivo e e-mail (João Carlos, com `sudo`, uma vez):**

```bash
scp /Users/joao.carlos/Projetos/ViniCycle/infra/servidor/ativar-endereco.sh vm-joao:/tmp/ativar-vinicycle.sh
```

```bash
ssh -t vm-joao 'sudo bash /tmp/ativar-vinicycle.sh; rm -f /tmp/ativar-vinicycle.sh'
```

O script:
- inclui `app.vinicycle.com` no Caddy;
- pede a chave do Resend, sem mostrá-la, e a grava só no `api.env` do servidor;
- troca o endereço da aplicação para `https://app.vinicycle.com`;
- reinicia o serviço.

O remetente é `nao-responda@vinicycle.com`; o domínio precisa estar verificado no Resend. O redirecionamento de `vinicycle.app` (e `www`) para a aplicação está ativo desde 04/10/2026, pelo [infra/servidor/redirecionar-app.sh](../infra/servidor/redirecionar-app.sh). Blocos do Caddy: [infra/servidor/Caddyfile-vinicycle](../infra/servidor/Caddyfile-vinicycle).
