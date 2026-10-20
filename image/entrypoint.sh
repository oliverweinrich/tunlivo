#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

config=/run/gateway/wg0.conf
nginx_pid=""
pairing_pid=""
cleanup() {
  rm -f /run/gateway/ready
  if [[ -n "$pairing_pid" ]]; then
    kill -TERM "$pairing_pid" 2>/dev/null || true
    wait "$pairing_pid" 2>/dev/null || true
  fi
  if [[ -n "$nginx_pid" ]]; then
    kill -TERM "$nginx_pid" 2>/dev/null || true
    wait "$nginx_pid" 2>/dev/null || true
  fi
  if wg show wg0 >/dev/null 2>&1; then wg-quick down "$config" || true; fi
}
trap cleanup EXIT
trap 'exit 0' TERM INT

case "${PAIR_MODE:-manual}" in
  manual) ;;
  server)
    gateway-pair serve &
    pairing_pid=$!
    while ! gateway-pair ready 2>/dev/null; do
      kill -0 "$pairing_pid" 2>/dev/null || { wait "$pairing_pid"; exit 1; }
      sleep 1 & wait $!
    done
    ;;
  client)
    gateway-pair join &
    pairing_pid=$!
    wait "$pairing_pid"
    pairing_pid=""
    ;;
  *) echo 'PAIR_MODE muss manual, server oder client sein.' >&2; exit 1 ;;
esac
if [[ "${PAIR_MODE:-manual}" != manual ]]; then
  gateway-pair config
  export WG_PRIVATE_KEY="$(cat /run/gateway/private.key)"
  export WG_PEERS="$(cat /run/gateway/peer)"
fi
configure.sh
wg-quick up "$config"
nginx -c /run/gateway/nginx.conf -g 'daemon off;' &
nginx_pid=$!
touch /run/gateway/ready
echo 'Gateway bereit: WireGuard und nginx. Handshake separat prüfen.'
if [[ -n "$pairing_pid" ]]; then
  wait -n "$nginx_pid" "$pairing_pid"
else
  wait "$nginx_pid"
fi
