#!/usr/bin/env bash
# Redireciona vinicycle.app e www.vinicycle.app para https://app.vinicycle.com (roda UMA vez, com
# sudo, pelo João Carlos, depois que o DNS dos dois aponta para o servidor):
#   scp infra/servidor/redirecionar-app.sh vm-joao:/tmp/redirecionar-vinicycle.sh
#   ssh -t vm-joao 'sudo bash /tmp/redirecionar-vinicycle.sh; rm -f /tmp/redirecionar-vinicycle.sh'
#
# Acrescenta o bloco ao Caddyfile (com cópia do anterior), valida, recarrega e confere.
set -euo pipefail

CADDY=/etc/caddy/Caddyfile

if grep -q '^vinicycle\.app' "$CADDY"; then
  echo "Caddy: o redirecionamento de vinicycle.app já existe."
else
  cp "$CADDY" "$CADDY.antes-vinicycle-app-$(date +%Y%m%d%H%M%S)"
  cat >> "$CADDY" <<'BLOCO'

# ViniCycle: o domínio .app leva à aplicação.
vinicycle.app, www.vinicycle.app {
	redir https://app.vinicycle.com{uri} permanent
}
BLOCO
  if ! caddy validate --config "$CADDY" --adapter caddyfile; then
    echo "Caddyfile inválido: nada foi recarregado. Restaure a cópia $CADDY.antes-vinicycle-app-* se quiser." >&2
    exit 1
  fi
  systemctl reload caddy
  echo "Caddy: redirecionamento incluído e recarregado."
fi

for i in $(seq 1 30); do
  destino=$(curl -sS -o /dev/null -w '%{redirect_url}' https://vinicycle.app/ 2>/dev/null || true)
  if [[ "$destino" == https://app.vinicycle.com/* ]]; then
    echo "Pronto: https://vinicycle.app leva a $destino"
    exit 0
  fi
  sleep 2
done
echo "O Caddy recarregou, mas https://vinicycle.app ainda não redireciona (o certificado pode levar alguns segundos)." >&2
echo "Veja: journalctl -u caddy -n 30" >&2
exit 1
