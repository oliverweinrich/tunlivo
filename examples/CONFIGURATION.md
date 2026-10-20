# Configuration reference

See the [README](../README.md) for setup instructions. Set these variables under
`environment` on the gateway service. Use YAML `|` for multiline values.

## General settings

| Variable         | Description                                    | Default  |
| ---------------- | ---------------------------------------------- | -------- |
| `PAIR_MODE`      | `manual`, `server` or `client`                 | `manual` |
| `WG_ADDRESS`     | This gateway's IPv4 tunnel address with prefix | Required |
| `WG_LISTEN_PORT` | WireGuard UDP port inside the container        | `51820`  |
| `WG_MTU`         | Tunnel interface MTU                           | `1420`   |
| `PROXY_ROUTES`   | One forwarding rule per line                   | Empty    |

For a custom tunnel network, update addresses and proxy destinations on both
sides. Avoid overlapping existing networks. Keep tunnel addresses unchanged
when reusing a saved pairing.

## Automatic pairing

| Variable            | Description                                                 | Default                                          |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `PAIR_PEER_ADDRESS` | Expected peer IPv4 tunnel address as `/32`                  | Server: `10.66.66.2/32`; client: `10.66.66.1/32` |
| `PAIR_SERVER`       | Registration service address as `HOST:PORT`; client only    | Required for initial pairing                     |
| `PAIR_CODE`         | Complete server invitation; client only                     | Required for initial pairing                     |
| `PAIR_PORT`         | Registration TCP listen port on the server                  | `51821`                                          |
| `WG_ENDPOINT`       | Public WireGuard server address as `HOST:PORT`; client only | Required initially, then saved                   |
| `PAIR_DATA_DIR`     | Directory for persistent keys and pairing state             | `/data`                                          |

Mount a persistent volume at `/data`. Each gateway needs its own volume.
In pairing mode, `WG_PRIVATE_KEY` and `WG_PEERS` are generated from saved state;
you do not need to set them. Automatic pairing supports one client per server.

On an unpaired server:

```sh
docker compose exec gateway gateway-pair invite  # Show the current valid invitation
docker compose exec gateway gateway-pair renew   # Create a new invitation; invalidate the old one
```

Invitations expire after ten minutes. After registration, other client identities
cannot redeem the code. The same client may retry within the validity period
to recover a lost response. Restarting with an existing volume does not generate
new keys or a new invitation. The registration service remains active on the
server, but its port can be blocked in the firewall after pairing succeeds.

## Manual configuration

| Variable         | Description                                 |
| ---------------- | ------------------------------------------- |
| `WG_PRIVATE_KEY` | This gateway's private WireGuard key        |
| `WG_PEERS`       | One peer per line; at least one is required |

Peer format:

```text
PUBLIC_KEY ALLOWED_IPS ENDPOINT_OR_DASH KEEPALIVE_SECONDS
```

Server example:

```yaml
WG_PEERS: |
  CLIENT_PUBLIC_KEY 10.66.66.2/32 - 0
```

Client example:

```yaml
WG_PEERS: |
  SERVER_PUBLIC_KEY 10.66.66.1/32 vpn-server.example.com:51820 25
```

`ALLOWED_IPS` defines destinations routed through this peer and source addresses
accepted from it. `/32` identifies exactly one IPv4 address. Separate multiple
networks with commas and no spaces. An endpoint of `-` lets the server learn
the client's address from incoming packets. Keepalive `25` maintains a NAT
mapping; `0` disables periodic keepalive packets.

For additional clients, use separate key pairs and unique tunnel addresses.
Add one peer line per client on the server and point proxy rules at the desired
client address. Do not assign overlapping peer networks.

## Forwarding rules

```yaml
PROXY_ROUTES: |
  tcp 8080 web:80
  udp 9000 receiver:9001
```

Format: `tcp|udp LISTEN_PORT TARGET_HOST:TARGET_PORT`. Targets may be DNS names
or IPv4 addresses. Put comments on their own lines starting with `#`.
For public server ports, configure Docker `ports` and the server firewall as
well. Remove unused mappings. Set `PROXY_ROUTES: ""` for a tunnel without a
proxy. Forwarding rules may also be configured in the opposite direction.

The original visitor IP is not preserved. Restarting a gateway interrupts
existing connections; application containers can keep running. Target DNS
names are resolved dynamically. TCP idle timeout: one hour; UDP idle timeout:
60 seconds; connection timeout: five seconds.

## Confidential settings

Keep private keys, completed Compose files, invitations and gateway volumes
confidential. Docker administrators can read container environment variables
and volumes. `docker inspect` and `docker compose config` without `--quiet`
may also display secrets. The server deliberately prints its invitation in
the log; the invitation becomes invalid after expiry or renewal.
