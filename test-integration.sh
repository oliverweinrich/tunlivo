#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")" && pwd)"
image="${TUNLIVO_TEST_IMAGE:-tunlivo:1.0.0}"

# Jeder Testlauf besitzt eigene Container, ein Netzwerk und temporäre Dateien.
# Keine Containerlogs ausgeben: Sie können gültige Einladungen enthalten.
cleanup() {
  docker rm -f "$prefix-udp" "$prefix-app" "$client" "$server" >/dev/null 2>&1 || true
  docker network rm "$prefix" >/dev/null 2>&1 || true
  docker volume rm "$server" "$client" >/dev/null 2>&1 || true
  rm -rf "$work"
}
setup() {
  stage="$1"
  prefix="gateway-$stage-check-$$-$RANDOM"
  server="$prefix-server"
  client="$prefix-client"
  work="$(mktemp -d "${TMPDIR:-/tmp}/gateway-check.XXXXXX")"
  trap 'result=$?; if (( result != 0 )); then echo "FEHLER: $stage-Test fehlgeschlagen; Testressourcen werden entfernt." >&2; fi; cleanup; exit "$result"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  docker network create "$prefix" >/dev/null
}
retry() {
  local attempt
  for attempt in $(seq 1 60); do
    if "$@" > "$work/last-output" 2>&1; then return 0; fi
    sleep 0.5
  done
  echo 'Zeitlimit beim Warten auf die Testverbindung erreicht.' >&2
  return 1
}
start_gateway() {
  local role="$1"
  shift
  docker run -d --name "$prefix-$role" --network "$prefix" \
    --cap-drop ALL --cap-add NET_ADMIN --cap-add NET_RAW --cap-add NET_BIND_SERVICE \
    --cap-add SETUID --cap-add SETGID --security-opt no-new-privileges:true \
    --read-only --tmpfs /run --tmpfs /tmp "$@" "$image" >/dev/null
}
start_http() {
  printf 'events {} http { server { listen 18080; return 200 "tunnel-ok"; } }\n' > "$work/app.conf"
  docker run -d --name "$prefix-app" --network "$prefix" \
    -v "$work/app.conf:/app.conf:ro" --entrypoint nginx "$image" -c /app.conf -g 'daemon off;' >/dev/null
}
fetch() {
  local result
  result="$(docker run --rm --network "$prefix" --entrypoint wget "$image" -qO- -T 2 "http://$server:8080")"
  [[ "$result" == tunnel-ok ]]
}
check_gateways() {
  retry docker exec "$client" /usr/local/bin/healthcheck.sh
  retry docker exec "$server" /usr/local/bin/healthcheck.sh
}

test_manual() (
  setup manual
  local role address peer peer_role endpoint keepalive
  for role in server client; do
    docker run --rm --network none --entrypoint wg "$image" genkey > "$work/$role.key"
    docker run --rm -i --network none --entrypoint wg "$image" pubkey < "$work/$role.key" > "$work/$role.pub"
  done
  for role in server client; do
    if [[ "$role" == server ]]; then
      address=10.203.77.1/24; peer=10.203.77.2/32; peer_role=client; endpoint=-; keepalive=0
    else
      address=10.203.77.2/32; peer=10.203.77.1/32; peer_role=server; endpoint="$server:51820"; keepalive=25
    fi
    {
      printf 'PAIR_MODE=manual\nWG_ADDRESS=%s\nWG_PRIVATE_KEY=%s\n' "$address" "$(cat "$work/$role.key")"
      printf 'WG_PEERS=%s %s %s %s\n' "$(cat "$work/$peer_role.pub")" "$peer" "$endpoint" "$keepalive"
    } > "$work/$role.env"
  done
  start_gateway server --env-file "$work/server.env" \
    --env $'PROXY_ROUTES=tcp 8080 10.203.77.2:8080\nudp 8081 10.203.77.2:8081'
  start_gateway client --env-file "$work/client.env" \
    --env "PROXY_ROUTES=$(printf 'tcp 8080 %s-app:18080\nudp 8081 %s-udp:18081' "$prefix" "$prefix")"
  retry docker exec "$client" ping -c 1 -W 1 10.203.77.1
  check_gateways
  start_http
  docker run -d --name "$prefix-udp" --network "$prefix" --entrypoint nc "$image" -u -l 18081 >/dev/null
  retry fetch
  docker run --rm --network "$prefix" --entrypoint sh "$image" \
    -c "printf 'udp-ok\n' | nc -u -w 1 '$server' 8081"
  retry bash -c 'docker logs "$1" 2>&1 | grep -q udp-ok' _ "$prefix-udp"
  echo 'OK: Manuelle Schlüssel, WireGuard, nginx, TCP/UDP und getrennte Dienstcontainer.'

  docker stop -t 5 "$prefix-app" >/dev/null
  docker restart "$server" >/dev/null
  retry docker exec "$server" /usr/local/bin/healthcheck.sh
  docker start "$prefix-app" >/dev/null
  docker restart "$client" >/dev/null
  retry fetch
  echo 'OK: Gateway startet bei fehlendem Ziel; Weiterleitung funktioniert nach Wiederanlauf.'
)

start_pairing_peer() {
  local role="$1" address peer routes
  # Nichtleeres Array für die unter macOS mitgelieferte Bash 3.2.
  local -a options=(--env "PAIR_MODE=$1")
  if [[ "$role" == server ]]; then
    address=10.204.77.1/24; peer=10.204.77.2/32
    routes="tcp 8080 10.204.77.2:8080"
  else
    address=10.204.77.2/32; peer=10.204.77.1/32
    routes="tcp 8080 $prefix-app:18080"
    options+=(--env "PAIR_SERVER=$server:51821" --env "WG_ENDPOINT=$server:51820")
    if [[ "${2:-}" == first ]]; then options+=(--env-file "$work/invitation.env"); fi
  fi
  start_gateway "$role" -v "$prefix-$role:/data" \
    --env "WG_ADDRESS=$address" --env "PAIR_PEER_ADDRESS=$peer" \
    --env "PROXY_ROUTES=$routes" "${options[@]}"
}
test_pairing() (
  setup pairing
  local role
  for role in server client; do docker volume create "$prefix-$role" >/dev/null; done
  start_pairing_peer server
  retry docker exec "$server" gateway-pair invite
  docker exec "$server" gateway-pair renew > "$work/code"
  printf 'PAIR_CODE=%s\n' "$(cat "$work/code")" > "$work/invitation.env"
  start_pairing_peer client first
  check_gateways
  retry docker exec "$client" ping -c 1 -W 1 10.204.77.1
  start_http
  retry fetch
  if docker exec "$server" gateway-pair renew >/dev/null 2>&1; then
    echo 'Bereits gekoppelte Server dürfen keine neue Einladung erzeugen.' >&2
    exit 1
  fi
  for role in server client; do docker exec "$prefix-$role" sha256sum /data/state.json > "$work/$role.hash"; done
  # Nur die Volumes behalten; PAIR_CODE beim Neuerstellen nicht mehr übergeben.
  docker rm -f "$client" "$server" >/dev/null
  start_pairing_peer server
  start_pairing_peer client
  check_gateways
  retry fetch
  for role in server client; do
    docker exec "$prefix-$role" sha256sum /data/state.json > "$work/$role.after"
    cmp "$work/$role.hash" "$work/$role.after"
  done
  echo 'OK: Einmalcode, HTTP durch WireGuard und Neuerstellung ohne Code mit unveränderten Schlüsseln.'
)

docker image inspect "$image" >/dev/null
for compose_file in "$root"/examples/compose.*.yaml; do
  docker compose -f "$compose_file" config --quiet
done
test_manual
test_pairing
echo 'OK: Alle Integrationstests erfolgreich.'
