# ViniCycle

Sistema de gestão para vinícolas: campo, cantina, enoturismo e gastronomia, com conformidade regulatória (MAPA).

- Documentação (fonte da verdade): [docs/](docs/README.md)
- Onde paramos: [docs/ANDAMENTO.md](docs/ANDAMENTO.md)
- Como rodar, testar e publicar: [docs/operacao.md](docs/operacao.md)

```
apps/api         API (Node, Fastify, Drizzle, PostgreSQL com RLS)
apps/web         Interface (React, Vite, Tailwind)
packages/shared  Validações, permissões e listas comuns aos dois lados
infra/servidor   Preparação do servidor, serviço e Caddy
scripts/         Banco local e publicação
```
