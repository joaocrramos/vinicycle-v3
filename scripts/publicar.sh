#!/usr/bin/env bash
# Publica a versão atual no servidor (04-plano-de-entregas.md, ciclo 1). Roda no Mac, com a VPN.
#   scripts/publicar.sh                 verifica (lint, tipos, testes), empacota e publica
#   scripts/publicar.sh --sem-verificar empacota e publica
#   scripts/publicar.sh --recriar-base  apaga a base do servidor e a recria pelo script único de
#                                       criação (migrações e dados de referência), com os anexos.
#                                       Só enquanto a base for de desenvolvimento (P6): sai deste
#                                       script antes do início do uso real, em 01/01/2027.
# Requer a preparação única do servidor (infra/servidor/preparar.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

VERIFICAR=sim
RECRIAR=nao
for opcao in "$@"; do
  case "$opcao" in
    --sem-verificar) VERIFICAR=nao ;;
    --recriar-base) RECRIAR=sim ;;
    *) echo "Opção desconhecida: $opcao" >&2; exit 1 ;;
  esac
done
if [[ "$RECRIAR" == sim ]]; then
  echo "Isto APAGA todos os dados e anexos do ViniCycle no servidor e recria a base do zero."
  read -rp 'Para confirmar, digite RECRIAR A BASE: ' FRASE < /dev/tty
  [[ "$FRASE" == "RECRIAR A BASE" ]] || { echo "Cancelado." >&2; exit 1; }
fi

[[ "$VERIFICAR" == nao ]] || pnpm verificar
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Há alterações sem commit. Faça o commit antes de publicar." >&2
  exit 1
fi
pnpm build

VERSAO="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
ARGON2=$(node -p "require('./apps/api/node_modules/@node-rs/argon2/package.json').version")
PACOTE=$(mktemp -d)
trap 'rm -rf "$PACOTE"' EXIT
mkdir -p "$PACOTE/api" "$PACOTE/web"
cp -R apps/api/dist apps/api/drizzle "$PACOTE/api/"
cp -R apps/web/dist/. "$PACOTE/web/"
cp infra/servidor/vinicycle-api.service "$PACOTE/"
cat > "$PACOTE/api/package.json" <<JSON
{ "name": "vinicycle-api", "private": true, "type": "module", "dependencies": { "@node-rs/argon2": "$ARGON2" } }
JSON
echo "$VERSAO" > "$PACOTE/VERSAO"

echo "Enviando ${VERSAO}…"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$PACOTE" . | ssh vinicycle "mkdir -p /srv/vinicycle/releases/$VERSAO && tar xzf - -C /srv/vinicycle/releases/$VERSAO"

ssh vinicycle bash -s -- "$VERSAO" "$RECRIAR" <<'REMOTO'
set -euo pipefail
VERSAO=$1
RECRIAR=$2
DIR=/srv/vinicycle/releases/$VERSAO
cd "$DIR/api"
npm install --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error
set -a; . /srv/vinicycle/config/api.env; set +a
if [[ "$RECRIAR" == sim ]]; then
  systemctl --user stop vinicycle-api.service 2>/dev/null || true
  psql "$DATABASE_URL_DONO" -v ON_ERROR_STOP=1 -q -c 'drop schema if exists drizzle cascade' \
    -c 'drop schema public cascade' -c 'create schema public' -c 'revoke create on schema public from public'
  find "$ARMAZENAMENTO_DIR" -mindepth 1 -delete
  echo "Base e anexos apagados; recriando pelo script único."
fi
export PASTA_MIGRACOES="$DIR/api/drizzle"
node dist/migrar.js
node dist/referencia.js
ln -sfn "$DIR" /srv/vinicycle/atual
mkdir -p ~/.config/systemd/user
cp "$DIR/vinicycle-api.service" ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable vinicycle-api.service >/dev/null 2>&1
systemctl --user restart vinicycle-api.service
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3100/api/saude >/dev/null 2>&1; then
    echo "No ar: $VERSAO"
    # Guarda as cinco últimas versões, para voltar atrás se preciso.
    ls -1dt /srv/vinicycle/releases/* | tail -n +6 | xargs -r rm -rf
    exit 0
  fi
  sleep 1
done
echo "A API não respondeu. Veja: journalctl --user -u vinicycle-api -n 50" >&2
exit 1
REMOTO
