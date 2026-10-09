# Arquitetura

> Situação: stack, servidor e endereços aprovados.
> Decisão registrada em [decisoes/0001-stack.md](decisoes/0001-stack.md).

## Visão geral

```
Navegador (React)  ──HTTPS──>  API (Node.js/Fastify)  ──>  PostgreSQL
                                      │   └── fila de tarefas (no próprio PostgreSQL)
                                      ├──>  Armazenamento de arquivos (compatível com S3)
                                      ├──>  E-mail (envio transacional)
                                      └──>  Serviços externos: busca de CEP/CNPJ, SEFAZ (NF-e), PDV Legal (futuro)
```

- **O navegador nunca acessa o banco.** Toda leitura e escrita passa pela API, que:
  - autentica;
  - verifica as permissões (P27) e o plano (P25);
  - aplica as regras de negócio dentro de transações;
  - grava a auditoria (P14).
- **Monorepositório** em TypeScript com três partes:
  - `api`;
  - `web`;
  - `shared`: validações, enums e tipos comuns aos dois lados.

## Componentes

| Camada | Tecnologia | Papel |
|---|---|---|
| Banco | PostgreSQL (versão estável atual) | Dados, isolamento por empresa (RLS), livros somente-inclusão, fila de tarefas |
| Acesso a dados | Drizzle ORM | Esquema descrito em código; gera as migrations e o script único de criação (P6) |
| API | Node.js LTS + TypeScript + Fastify | Regras de negócio, autenticação, permissões, auditoria |
| Validação | zod | Mesmas regras no formulário e na API |
| Tarefas | pg-boss (fila sobre PostgreSQL) | Alertas e e-mails, busca de NF-e na SEFAZ, geração de relatórios e exportações |
| Interface | React + Vite + Tailwind CSS + shadcn/ui | Telas e componentes padrão (P2, P3, P4, P9) |
| Tabelas e dados | TanStack Table + TanStack Query | Listagens com ordenação, filtro e paginação no servidor (P4) |
| Arquivos | Armazenamento compatível com S3 (MinIO na infraestrutura própria) | Anexos (P15) |
| Testes | Vitest, com banco real de teste | Regras de volume, estoque, limites e permissões (P24) |

## Princípios

1. **Isolamento entre empresas em duas camadas.**
   - **Na aplicação:** toda consulta filtra pela empresa e pelo estabelecimento ativos.
   - **No banco:** políticas de segurança por linha (RLS). A API conecta com um usuário sem privilégio de ignorá-las, então mesmo uma consulta mal escrita não vê dados de outra empresa.
2. **Livros somente-inclusão.**
   - Movimentos de volume, de estoque e a auditoria só aceitam inclusão.
   - O usuário do banco usado pela API nem tem permissão de alterar ou apagar essas tabelas (P13, P14).
3. **Regras no servidor, em transação.**
   - Operações da cantina bloqueiam os recipientes envolvidos, validam volume e capacidade e gravam tudo de uma vez, ou nada.
4. **Regras legais como dados.**
   - Limites, classificações e prazos ficam em tabelas versionadas com vigência e fonte (P16).
5. **Sem segredos no código.**
   - Senhas, chaves e certificados ficam em variáveis de ambiente ou num cofre.
   - O certificado A1 dos clientes fica cifrado no banco (P11, P21).
6. **Script único de criação** (P6).
   - Durante o desenvolvimento, usam-se migrations.
   - Antes do lançamento, elas são consolidadas num baseline.
   - Dados de referência e dados de demonstração ficam em scripts separados.

## Ambientes (P22)

| Ambiente | Uso |
|---|---|
| Desenvolvimento | Máquina do desenvolvedor e/ou servidor de desenvolvimento. Dados fictícios |
| Produção | Clientes reais |
| Ensaio (temporário) | Criado a partir do backup de produção antes de mudanças de risco; descartado depois |

## Infraestrutura

**Hospedagem:** datacenter na **Cirion, em Cotia/SP**, o que dá dados no Brasil (LGPD) e baixa latência.

**Como é a infraestrutura:**
- **Equipamentos:** há rack com servidores próprios e também máquinas virtuais em hosts da Cirion, usadas por alguns clientes. A virtualização padrão é **VMware**.
- **Operação:** a equipe do João Carlos opera toda a parte lógica dos servidores próprios. Nas VMs em ambiente da Cirion, atua apenas via chamado.
- **Onde o ViniCycle roda:** numa VM própria, com operação direta sem depender de chamado. Decidido: a VM `vm-joao` (Cirion, Cotia/SP), descrita abaixo.
- **Backup:** a cópia vai para **outro datacenter da empresa**.
- **E-mail transacional:** **Resend**, que a equipe já conhece. O domínio de envio precisa de SPF, DKIM e DMARC configurados, e o envio passa por uma camada da API que permite trocar de provedor sem mexer no resto do sistema.

**Componentes previstos (VMs VMware no rack próprio):**
- servidor de aplicação rodando a API e a interface como **serviços systemd** próprios (ver "Separação entre os dois sistemas"); contêineres ficam como opção futura;
- PostgreSQL com backup automático e cópia fora do servidor principal;
- MinIO para os arquivos, com o mesmo regime de backup;
- proxy reverso com HTTPS (certificados automáticos) para `app.vinicycle.com`;
- monitoramento: disponibilidade, erros, espaço em disco e alertas de backup.

**Servidor escolhido (Decidido):** a VM `vm-joao` (rede privada, acessível só pela VPN), a mesma que já roda o ObraGrid. O ObraGrid ainda não é comercial, e o ViniCycle começa com um único usuário (o João Carlos).

| Item | Situação em 02/10/2026 |
|---|---|
| Sistema | Ubuntu 26.04 |
| Recursos | 8 CPUs, 7,2 GB de memória (6,4 GB disponíveis), 29 GB de disco (19 GB livres). Podem ser aumentados quando necessário |
| PostgreSQL | 18.6, só em 127.0.0.1 |
| Proxy HTTPS | Caddy (já em uso pelo ObraGrid) |

**Separação entre os dois sistemas no mesmo servidor:**
- **Usuário de sistema:** `vinicycle`, separado do `obragrid`.
- **Chave SSH:** própria, `~/.ssh/id_ed25519_vinicycle` no Mac (comentário `vinicycle-mac`), para distinguir nos registros quem acessou.
- **Banco e papéis:** banco `vinicycle` com papéis próprios (dono do esquema e aplicação), sem acesso ao banco do ObraGrid.
- **Arquivos e serviços:**
  - diretórios próprios em `/srv/vinicycle`;
  - serviços systemd próprios;
  - um bloco próprio no Caddyfile.
- **Backup:** próprio, incluído na sincronização para o outro datacenter.

**Acesso (feito em 02/10/2026):**
- Usuário `vinicycle` criado no servidor, sem senha (entra só com chave) e sem `sudo`.
- Atalhos no `~/.ssh/config` do Mac:

  | Atalho | Usuário | Chave | Uso |
  |---|---|---|---|
  | `ssh vinicycle` | `vinicycle` | `id_ed25519_vinicycle` | Acesso do ViniCycle (Claude) |
  | `ssh vm-joao` | `joao.carlos` | `id_ed25519_joao`, com frase-senha no Chaveiro | Acesso pessoal do João Carlos, com `sudo` |

- Ações que exigem `sudo` (instalar serviços, criar o banco, alterar o Caddy) são preparadas em comandos e executadas pelo João Carlos.

**Endereços (Decidido em 03/10/2026):**
- **site comercial:** `vinicycle.com`;
- **aplicação:** `app.vinicycle.com`. Uma marca só para lembrar, e os e-mails do sistema saem de `@vinicycle.com` com links para o mesmo domínio, o que passa mais confiança ao usuário e aos filtros de spam;
- **`vinicycle.app`:** fica registrado e redireciona para `app.vinicycle.com`;
- **isolamento entre site e aplicação:** os cookies de sessão valem só para `app.vinicycle.com` (sem atributo `Domain`, prefixo `__Host-`).

**Pendências de infraestrutura:** nenhuma no momento.
