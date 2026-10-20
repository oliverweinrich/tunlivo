#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
umask 077
directory=/run/gateway
mkdir -p "$directory"

: "${WG_ADDRESS:?WG_ADDRESS fehlt}"
: "${WG_PRIVATE_KEY:?WG_PRIVATE_KEY fehlt}"
: "${WG_PEERS:?WG_PEERS fehlt}"
listen="${WG_LISTEN_PORT:-51820}"
mtu="${WG_MTU:-1420}"
valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 > 0 && 10#$1 <= 65535 ))
}
[[ "$WG_ADDRESS" =~ ^[0-9.]+/[0-9]{1,2}$ ]] || { echo 'Ungültige WG_ADDRESS' >&2; exit 1; }
[[ "$WG_PRIVATE_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Ungültiger privater Schlüssel' >&2; exit 1; }
printf '%s\n' "$WG_PRIVATE_KEY" | wg pubkey >/dev/null
valid_port "$listen" || { echo 'Ungültiger WG_LISTEN_PORT' >&2; exit 1; }
[[ "$mtu" =~ ^[0-9]{3,4}$ ]] && (( 10#$mtu >= 576 && 10#$mtu <= 9000 )) || exit 1
{
  printf '[Interface]\nAddress = %s\nPrivateKey = %s\nListenPort = %s\nMTU = %s\n' "$WG_ADDRESS" "$WG_PRIVATE_KEY" "$listen" "$mtu"
  while read -r public allowed endpoint keepalive extra; do
    [[ -z "$public" || "$public" == \#* ]] && continue
    [[ "$public" =~ ^[A-Za-z0-9+/]{43}=$ && "$allowed" =~ ^[0-9./,]+$ && -z "${extra:-}" ]] || { echo 'Ungültige WG_PEERS-Zeile' >&2; exit 1; }
    [[ "$keepalive" =~ ^[0-9]{1,5}$ ]] && (( 10#$keepalive <= 65535 )) || exit 1
    printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = %s\nPersistentKeepalive = %s\n' "$public" "$allowed" "$keepalive"
    if [[ "$endpoint" != - ]]; then
      [[ "$endpoint" =~ ^[A-Za-z0-9_.-]+:[0-9]+$ ]] && valid_port "${endpoint##*:}" || exit 1
      printf 'Endpoint = %s\n' "$endpoint"
    fi
  done <<< "$WG_PEERS"
} > "$directory/wg0.conf"

cat > "$directory/nginx.conf" <<'NGINX'
load_module /usr/lib/nginx/modules/ngx_stream_module.so;
user nginx;
worker_processes 1;
pid /run/gateway/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
stream {
    resolver 127.0.0.11 ipv6=off valid=5s;
    resolver_timeout 3s;
    include /run/gateway/proxies.conf;
}
NGINX

: > "$directory/proxies.conf"
number=0
while read -r protocol port target extra; do
  [[ -z "$protocol" || "$protocol" == \#* ]] && continue
  [[ "$protocol" == tcp || "$protocol" == udp ]] && valid_port "${port:-}" &&
    [[ "$target" =~ ^[A-Za-z0-9_.-]+:[0-9]+$ && -z "${extra:-}" ]] && valid_port "${target##*:}" || {
      echo 'Ungültige PROXY_ROUTES-Zeile: erwartet tcp/udp PORT HOST:PORT' >&2; exit 1;
    }
  number=$((number + 1))
  udp=""
  timeout=1h
  if [[ "$protocol" == udp ]]; then udp=" udp"; timeout=60s; fi
  cat >> "$directory/proxies.conf" <<NGINX
upstream route_$number { zone route_$number 64k; server $target resolve; }
server {
    listen $port$udp;
    proxy_connect_timeout 5s;
    proxy_timeout $timeout;
    proxy_pass route_$number;
}
NGINX
done <<< "${PROXY_ROUTES:-}"
nginx -t -c "$directory/nginx.conf"
