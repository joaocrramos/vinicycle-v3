# 0001. Stack tecnológica

- **Data:** 02/10/2026
- **Situação:** Aprovada

## Contexto

- **O que o sistema precisa:**
  - ser multiempresa, com isolamento forte entre clientes;
  - manter livros contábeis de volume e estoque, com precisão decimal e transações;
  - ter auditoria imutável, permissões granulares e personificação;
  - incluir relatórios regulatórios.
- **O que deu errado antes:**
  - **v1 (Supabase):** gravava direto do navegador, sem transação e com RLS permissivo.
  - **v2 (PocketBase):** isolamento frágil e regras espalhadas.
- **Restrição de infraestrutura:** a infraestrutura é própria, num datacenter na Cirion em Cotia/SP.

## Opções consideradas

| Opção | A favor | Contra |
|---|---|---|
| **PostgreSQL + API própria (Node/TypeScript)** | Transações e decimais exatos; RLS no banco; sem dependência de fornecedor; roda no datacenter próprio | Mais código de infraestrutura (autenticação, fila) |
| Supabase | PostgreSQL com autenticação pronta | Induz gravação direta do navegador; personificação e login próprio são difíceis; dependência do fornecedor |
| PocketBase | Simples de subir | SQLite: fraco para muitas empresas, concorrência e relatórios; problemas vistos no v2 |

## Decisão

| Camada | Escolha |
|---|---|
| Banco | PostgreSQL |
| API | Node.js + TypeScript + Fastify |
| Acesso a dados | Drizzle ORM |
| Validação | zod, compartilhado entre API e interface |
| Interface | React + Vite + Tailwind + shadcn/ui + TanStack Table/Query |
| Fila de tarefas | pg-boss |
| Arquivos | Armazenamento compatível com S3 (MinIO) |
| Testes | Vitest |
| Hospedagem | Datacenter próprio (Cirion, Cotia/SP) |

## Consequências

- Autenticação, sessões, segundo fator e personificação são implementados na própria API. O controle é total, mas precisam de testes cuidadosos.
- Operação do banco (backup, atualização, monitoramento) fica sob nossa responsabilidade, no datacenter próprio.
- Uma única linguagem (TypeScript) em todo o sistema; as validações valem igualmente na tela e no servidor.
