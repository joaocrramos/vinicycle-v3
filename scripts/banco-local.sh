#!/usr/bin/env bash
# Cria (ou recria) os bancos locais de desenvolvimento e de testes, com os mesmos papéis da
# produção (02-arquitetura.md, Princípio 1):
#   vinicycle_dono  dono do esquema; roda as migrações e os dados de referência;
#   vinicycle_app   usado pela API; sem privilégio de ignorar o RLS.
# Uso: scripts/banco-local.sh [--recriar]
# Requer um PostgreSQL local em que o usuário atual seja superusuário (padrão do Homebrew).
set -euo pipefail

RECRIAR=${1:-}
SENHA_DONO=${SENHA_DONO:-dono_local}
SENHA_APP=${SENHA_APP:-app_local}

psql -v ON_ERROR_STOP=1 -d postgres <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'vinicycle_dono') then
    create role vinicycle_dono login password '${SENHA_DONO}';
  end if;
  if not exists (select from pg_roles where rolname = 'vinicycle_app') then
    create role vinicycle_app login password '${SENHA_APP}' nobypassrls;
  end if;
end \$\$;
SQL

for BANCO in vinicycle vinicycle_teste; do
  if [[ "$RECRIAR" == "--recriar" ]]; then
    psql -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${BANCO} with (force)"
  fi
  if ! psql -d postgres -Atc "select 1 from pg_database where datname = '${BANCO}'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 -d postgres -c "create database ${BANCO} owner vinicycle_dono encoding 'UTF8' template template0"
  fi
  psql -v ON_ERROR_STOP=1 -d "${BANCO}" <<SQL
revoke all on database ${BANCO} from public;
grant connect on database ${BANCO} to vinicycle_app;
revoke create on schema public from public;
alter schema public owner to vinicycle_dono;
SQL
done
echo "Bancos prontos: vinicycle e vinicycle_teste."
