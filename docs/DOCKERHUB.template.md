# Tunlivo

Expose TCP and UDP services on another machine through an encrypted tunnel.
Tunlivo combines the original [WireGuard tools](https://www.wireguard.com/) with nginx stream forwarding in one gateway container.

```text
Internet → Public server → Encrypted tunnel → Client gateway → Your service
```

The client initiates the tunnel, so it needs no static public IP or router port forwarding.
Configure forwarding rules with Docker Compose environment variables. Use one-time-code pairing for a server/client pair, or manual keys for multiple peers.

## Images

- `{{REPOSITORY}}:{{VERSION}}` — versioned runtime image
- `oliverweinrich/tunlivo:latest` — latest runtime release
- `{{REPOSITORY}}:{{VERSION}}-sources` — matching source archives, licenses, package inventory and checksums; extraction only

Runtime platforms: **linux/amd64** and **linux/arm64**.

## Requirements

Use Docker Compose and a Linux host or Docker Desktop Linux VM with WireGuard kernel support.
Allow UDP `51820`, TCP `51821` for initial pairing, and the application ports on the public server.

## Example: public server

Save this as `compose.yaml` on your public server:

{{SERVER_COMPOSE}}

Start it and copy the complete invitation beginning with `wg1.`:

```sh
docker compose up -d
docker compose logs gateway
```

## Example: client

Save this as `compose.yaml` on the machine hosting your services.
Replace `vpn-server.example.com` and `COMPLETE_INVITATION_FROM_SERVER` before starting:

{{CLIENT_COMPOSE}}

```sh
docker compose up -d
```

Open `http://YOUR_SERVER:8080`: the nginx welcome page is served from the client through the tunnel.
Replace the `hello` service and `PROXY_ROUTES` destinations with your own TCP/UDP services.
Each route has the format `tcp|udp LISTEN_PORT TARGET_HOST:TARGET_PORT`.

Invitations expire after ten minutes. After pairing, remove `PAIR_CODE`, apply with `docker compose up -d`, and close public TCP `51821` if desired.
Keep both gateway volumes: they store the keys and association. Do not use `docker compose down -v` unless you intend to reset pairing.

## Operation

```sh
docker compose stop
docker compose up -d
docker compose logs --tail=30 gateway
docker compose exec gateway wg show
```

Forwarding supports IPv4, TCP and UDP. Original visitor IPs are not preserved.
The health check confirms local gateway operation; it does not prove that a remote service is reachable.

## Matching sources and licenses

The complete release source and license archives are publicly available in **this repository** under `{{REPOSITORY}}:{{VERSION}}-sources`.
This is a source-only image with no executable application. Extract it without starting it:

```sh
mkdir -p tunlivo-sources
docker create --name tunlivo-source-copy {{REPOSITORY}}:{{VERSION}}-sources
docker cp tunlivo-source-copy:/sources/. ./tunlivo-sources/
docker rm tunlivo-source-copy
```

The directory contains `tunlivo-{{VERSION}}-sources.tar.gz`, `tunlivo-{{VERSION}}-licenses.tar.gz`, `packages.tsv` and `SHA256SUMS`.
Runtime notices are also included at `/usr/share/licenses/tunlivo/`.

Tunlivo's original code is licensed under **Apache-2.0**. Copyright 2026 Oliver Weinrich.
Bundled components retain their own licenses.

Tunlivo is an independent project, not an official WireGuard product and not endorsed by or affiliated with its developers.
"WireGuard" and the "WireGuard" logo are registered trademarks of Jason A. Donenfeld.

[Source code]({{PROJECT_URL}}) · [Configuration reference]({{SOURCE_URL}}/examples/CONFIGURATION.md) · [Manual-key examples]({{SOURCE_URL}}/examples/) · [Third-party notices]({{SOURCE_URL}}/THIRD_PARTY_NOTICES.md)
