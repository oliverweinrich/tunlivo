# Tunlivo

An independent TCP/UDP gateway by Oliver Weinrich, built with the original
[WireGuard tools](https://www.wireguard.com/) and nginx.

Expose services on another machine through a publicly reachable server. Run one
gateway on each side: connections to selected server ports travel through an
encrypted tunnel to your services.

```text
User → Public server port → Encrypted tunnel → Client gateway → Your service
```

The client initiates the connection. It needs neither a static public IP nor
router port forwarding. The tunnel connects the gateway containers; it does
not automatically route all traffic from either host.

**Image:** [`oliverweinrich/tunlivo:1.0.3`](https://hub.docker.com/r/oliverweinrich/tunlivo).

To build the image locally, run this from the repository root:

```sh
version="$(cat VERSION)"
docker build --build-arg VERSION="$version" -t "oliverweinrich/tunlivo:$version" -t "tunlivo:$version" image
```

## Requirements

- Docker with Docker Compose on both machines. On macOS or Windows, use Docker
  Desktop with Linux containers. The Linux host or Docker VM kernel must support
  WireGuard.
- A server that the client can reach. Allow UDP `51820` and the application ports
  you want to expose through its firewall. Automatic pairing also requires TCP
  `51821` during initial setup.
- The image available locally on both machines, or accessible through a registry.

## Examples

All examples and the full [configuration reference](examples/CONFIGURATION.md)
are in [`examples/`](examples/).

| Setup                 | Public server                                                       | Client                                                              |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| One-time-code pairing | [compose.pairing-server.yaml](examples/compose.pairing-server.yaml) | [compose.pairing-client.yaml](examples/compose.pairing-client.yaml) |
| Manual keys           | [compose.manual-server.yaml](examples/compose.manual-server.yaml)   | [compose.manual-client.yaml](examples/compose.manual-client.yaml)   |

The examples expose an HTTP demo service on server port `8080`. Replace it with
any TCP/UDP service after confirming the connection. Choose one setup method
per gateway.

### Option A: Pair using a one-time code

Recommended for one server-client pair. Each gateway generates its own keys.

1. Save the server pairing example as `compose.yaml` in a dedicated directory
   on the server, then start it:

   ```sh
   docker compose up -d
   docker compose logs gateway
   ```

   Copy the complete invitation starting with `wg1.` from the log. It expires
   ten minutes after creation. The server waits for pairing and is not marked
   healthy until pairing completes.

2. Save the client pairing example as `compose.yaml` in a dedicated directory
   on the client. Update these values under `environment`:

   ```yaml
   PAIR_SERVER: 'YOUR_SERVER:51821'
   WG_ENDPOINT: 'YOUR_SERVER:51820'
   PAIR_CODE: 'COMPLETE_INVITATION_FROM_SERVER'
   ```

   Replace `YOUR_SERVER` with the server's DNS name or public IPv4 address.
   Start the client with `docker compose up -d`.

3. Open `http://YOUR_SERVER:8080`. The nginx welcome page comes from the client
   demo service through the encrypted tunnel.

After successful pairing, remove `PAIR_CODE` from the client file and apply the
change with `docker compose up -d`. Subsequent starts use the saved association.
You can then close TCP `51821` in the server firewall; keep UDP `51820` open.

Treat the invitation as a secret. It authorizes one client and pins the server's
certificate fingerprint. Private keys remain on their respective machines.
Keys and pairing are stored in the gateway volumes. **Preserve these volumes;
do not use `docker compose down -v`.** Pairing a replacement client currently
requires fresh gateway volumes on both sides.

For an expired invitation, run this on the unpaired server:

```sh
docker compose exec gateway gateway-pair renew
```

This invalidates the previous invitation. An already paired server does not
accept another client. You can keep the example tunnel addresses if their
network does not overlap with an existing network in your setup.

### Option B: Configure keys manually

Use this for existing keys or multiple peers. Save the manual server and client
examples as `compose.yaml` in separate directories on their respective machines.

Generate a separate key pair on **each** machine:

```sh
umask 077
docker run --rm --network none --entrypoint wg oliverweinrich/tunlivo:1.0.3 genkey > private.key
docker run --rm -i --network none --entrypoint wg oliverweinrich/tunlivo:1.0.3 pubkey < private.key > public.key
```

| Placeholder          | Value                                  |
| -------------------- | -------------------------------------- |
| `SERVER_PRIVATE_KEY` | Contents of the server's `private.key` |
| `CLIENT_PRIVATE_KEY` | Contents of the client's `private.key` |
| `SERVER_PUBLIC_KEY`  | Contents of the server's `public.key`  |
| `CLIENT_PUBLIC_KEY`  | Contents of the client's `public.key`  |

Exchange only public keys. Replace `vpn-server.example.com` in the client file
with your server address. On both machines, run `chmod 600 compose.yaml` and
`docker compose up -d`. Test with `http://YOUR_SERVER:8080`.
Keep private keys and completed Compose files confidential. This setup does not
need TCP `51821`.

## Forward your own services

The examples forward server TCP `8080` to client gateway `10.66.66.2:8080`,
which forwards to `hello:80` on its Docker network.

Replace `hello` with your application. It must share a Docker network with the
client gateway; the simplest option is another service in the same Compose
file. The application needs neither WireGuard nor a published host port.

Each `PROXY_ROUTES` line follows this format:

```text
tcp|udp LISTEN_PORT TARGET_HOST:TARGET_PORT
```

For a service named `web` listening on port `80`:

| Location                       | Setting                    |
| ------------------------------ | -------------------------- |
| Server gateway: `PROXY_ROUTES` | `tcp 8080 10.66.66.2:8080` |
| Server gateway: `ports`        | `"8080:8080/tcp"`          |
| Client gateway: `PROXY_ROUTES` | `tcp 8080 web:80`          |

Add rules and server port mappings for more services. Use `udp` and `/udp` for
UDP, and update the server firewall accordingly. Each protocol/listen-port
combination must be unique. Reserve UDP `51820` for WireGuard and TCP `51821`
for pairing when enabled.

Forwarding supports IPv4, TCP and UDP. It does not preserve the original visitor
IP. HTTPS can pass through; certificates and TLS termination belong to the
destination service.

## Start, stop and inspect

Run these commands in the relevant Compose directory:

```sh
docker compose stop                      # Stop
docker compose up -d                     # Start or apply configuration changes
docker compose logs --tail=30 gateway    # Recent logs
docker compose exec gateway wg show     # Tunnel status
```

`wg show` should show a recent handshake and transferred data after connection.
A healthy container alone does not confirm that the destination service is
reachable. For troubleshooting, check the server address and firewall first,
then the invitation or keys, and finally the destination hostname and port.

See [configuration details](examples/CONFIGURATION.md) for all variables.
To run the isolated Docker integration tests after the local build above:

```sh
bash test-integration.sh
```

## Updates and releases

See the [dependency inventory](DEPENDENCIES.md) for versions and update coverage.
See the [maintenance workflow](.github/README.md) for dependency updates,
automated checks and publishing a new version.
For deployments, read [backup, upgrades and recovery](docs/OPERATIONS.md)
and the [versioning policy](docs/VERSIONING.md).
Report vulnerabilities using the [security policy](SECURITY.md).

## License and third-party software

Tunlivo's original code is licensed under [Apache-2.0](LICENSE).
Copyright 2026 Oliver Weinrich. Bundled components retain their own licenses;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [NOTICE](NOTICE).
License information is included in the image under `/usr/share/licenses/tunlivo/`.
Matching source archives, package inventories and checksums must accompany
published releases as described in the third-party notices.

Tunlivo is an independent project, not an official WireGuard product and not
endorsed by or affiliated with its developers. "WireGuard" and the "WireGuard"
logo are registered trademarks of Jason A. Donenfeld.
