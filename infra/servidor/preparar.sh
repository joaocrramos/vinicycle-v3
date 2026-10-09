#!/usr/bin/env bash
# Preparação do servidor para o ViniCycle (roda UMA vez, com sudo, pelo João Carlos).
#
#   scp infra/servidor/preparar.sh vm-joao:/tmp/preparar-vinicycle.sh
#   ssh -t vm-joao 'sudo bash /tmp/preparar-vinicycle.sh; rm -f /tmp/preparar-vinicycle.sh'
#
# (O sudo precisa de terminal para pedir a senha; por isso o -t e a cópia antes.)
#
# O que faz (02-arquitetura.md, "Separação entre os dois sistemas"):
#   1. pastas em /srv/vinicycle, do usuário vinicycle;
#   2. banco "vinicycle" com os papéis vinicycle_dono (migrações) e vinicycle_app (API, sem
#      privilégio de ignorar o RLS), sem acesso ao banco do ObraGrid;
#   3. arquivo de configuração com senhas e chave geradas aqui mesmo: os segredos nunca saem
#      do servidor nem passam pelo repositório (P6, P21);
#   4. "linger" do usuário vinicycle, para o serviço continuar rodando sem sessão aberta e ser
#      reiniciado nas publicações sem sudo.
# Pode rodar de novo sem estragar nada: o que já existe é mantido.
set -euo pipefail

USUARIO=vinicycle
BASE=/srv/vinicycle

install -d -o "$USUARIO" -g "$USUARIO" -m 750 "$BASE" "$BASE/releases" "$BASE/armazenamento" "$BASE/config"

if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname = 'vinicycle_dono'" | grep -q 1; then
  echo "Papéis do banco já existem; banco e configuração mantidos."
else
  SENHA_DONO=$(openssl rand -hex 24)
  SENHA_APP=$(openssl rand -hex 24)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
create role vinicycle_dono login password '${SENHA_DONO}';
create role vinicycle_app login password '${SENHA_APP}' nobypassrls;
create database vinicycle owner vinicycle_dono encoding 'UTF8' template template0;
SQL
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d vinicycle <<SQL
revoke all on database vinicycle from public;
grant connect on database vinicycle to vinicycle_app;
revoke create on schema public from public;
alter schema public owner to vinicycle_dono;
SQL
  umask 077
  cat > "$BASE/config/api.env" <<ENV
NODE_ENV=production
PORTA=3100
HOST=127.0.0.1
# Enquanto o app.vinicycle.com não estiver no ar, o acesso é por túnel SSH (ver docs/operacao.md).
URL_APLICACAO=http://localhost:3100
DATABASE_URL=postgres://vinicycle_app:${SENHA_APP}@127.0.0.1:5432/vinicycle
DATABASE_URL_DONO=postgres://vinicycle_dono:${SENHA_DONO}@127.0.0.1:5432/vinicycle
CHAVE_CIFRA=$(openssl rand -base64 32)
ARMAZENAMENTO_DIR=${BASE}/armazenamento
WEB_DIR=${BASE}/atual/web
PASTA_MIGRACOES=${BASE}/atual/api/drizzle
EMAIL_PROVEDOR=console
EMAIL_REMETENTE="ViniCycle <nao-responda@vinicycle.com>"
ENV
  chown "$USUARIO:$USUARIO" "$BASE/config/api.env"
  chmod 600 "$BASE/config/api.env"
  echo "Banco, papéis e $BASE/config/api.env criados."
fi

loginctl enable-linger "$USUARIO"
echo "Pronto. A publicação agora roda do Mac, sem sudo: scripts/publicar.sh"
