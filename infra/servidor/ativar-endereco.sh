#!/usr/bin/env bash
# Põe o ViniCycle no endereço definitivo (roda UMA vez, com sudo, pelo João Carlos):
#   scp infra/servidor/ativar-endereco.sh vm-joao:/tmp/ativar-vinicycle.sh
#   ssh -t vm-joao 'sudo bash /tmp/ativar-vinicycle.sh; rm -f /tmp/ativar-vinicycle.sh'
#
# 1. Acrescenta o bloco app.vinicycle.com ao Caddyfile (com cópia do anterior), valida e recarrega.
# 2. Pede a chave do Resend sem mostrá-la e grava em /srv/vinicycle/config/api.env.
# 3. Troca URL_APLICACAO para https://app.vinicycle.com e o e-mail para o Resend.
# 4. Reinicia o serviço do ViniCycle e confere a resposta pelo endereço público.
set -euo pipefail

CADDY=/etc/caddy/Caddyfile
ENV=/srv/vinicycle/config/api.env
USUARIO=vinicycle

if grep -q '^app\.vinicycle\.com' "$CADDY"; then
  echo "Caddy: bloco do ViniCycle já existe."
else
  cp "$CADDY" "$CADDY.antes-vinicycle-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDY" <<'BLOCO'

# ViniCycle. Como no ObraGrid, a API entrega a interface e a própria API; o Caddy só termina o TLS.
app.vinicycle.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3100
}
BLOCO
  caddy validate --config "$CADDY" --adapter caddyfile
  systemctl reload caddy
  echo "Caddy: bloco do ViniCycle incluído e recarregado."
fi

read -rsp "Cole a chave da API do Resend (não aparece na tela) e tecle Enter: " CHAVE
echo
if [[ ! "$CHAVE" =~ ^re_[A-Za-z0-9_]+$ ]]; then
  echo "A chave do Resend começa com re_. Nada foi alterado na configuração." >&2
  exit 1
fi

definir() {
  local nome=$1 valor=$2
  if grep -q "^${nome}=" "$ENV"; then
    # O valor vai por variável de ambiente para não aparecer na lista de processos.
    NOME="$nome" VALOR="$valor" perl -i -pe 's/^\Q$ENV{NOME}\E=.*/$ENV{NOME}=$ENV{VALOR}/' "$ENV"
  else
    printf '%s=%s\n' "$nome" "$valor" >> "$ENV"
  fi
}
definir URL_APLICACAO https://app.vinicycle.com
definir EMAIL_PROVEDOR resend
definir RESEND_API_KEY "$CHAVE"
chown "$USUARIO:$USUARIO" "$ENV"
chmod 600 "$ENV"
unset CHAVE

UID_APP=$(id -u "$USUARIO")
sudo -u "$USUARIO" XDG_RUNTIME_DIR="/run/user/$UID_APP" systemctl --user restart vinicycle-api
for i in $(seq 1 30); do
  if curl -fsS https://app.vinicycle.com/api/saude >/dev/null 2>&1; then
    echo "Pronto: https://app.vinicycle.com no ar, com e-mail pelo Resend."
    exit 0
  fi
  sleep 2
done
echo "O serviço reiniciou, mas https://app.vinicycle.com ainda não respondeu (o certificado pode levar alguns segundos)." >&2
echo "Veja: journalctl -u caddy -n 30   e   sudo -u $USUARIO XDG_RUNTIME_DIR=/run/user/$UID_APP journalctl --user -u vinicycle-api -n 30" >&2
exit 1
