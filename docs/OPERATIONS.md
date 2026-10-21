# Operations, backup and recovery

Run Compose commands in the deployment directory, separately on the public server and client. Keep the same Compose project name and volume configuration when updating. Commands below assume the example service name `gateway` and pairing state at `/data`; adapt both if you customized them.

## What to preserve

Back up **both gateway volumes**, their Compose files and any `.env` or other secret configuration used by that deployment. `/data` contains the private keys, peer association and server pairing identity; copying only a public key is insufficient. In manual mode, preserve the private keys and completed configuration instead. Back up application data separately: gateway backups do not include the forwarded services.

Record the deployed image tag/digest on each side. Store backups outside Git and outside public release artifacts. Use restrictive permissions, encrypted storage and a separate secure copy. Never run two instances of the same restored gateway identity simultaneously.

## Back up pairing state

Stop the gateway to capture a consistent state. This interrupts forwarded connections. In each gateway deployment directory:

```sh
umask 077
backup_dir="$HOME/tunlivo-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker compose images gateway > "$backup_dir/images.txt"
container_id="$(docker compose ps -aq gateway)"
docker inspect --format '{{.Config.Image}} {{.Image}}' "$container_id" > "$backup_dir/image-identity.txt"
cp compose.yaml "$backup_dir/compose.yaml"
# Also copy .env and other referenced configuration, if used.
docker compose stop gateway
docker compose run --rm --no-deps -T --entrypoint tar gateway \
  -C /data -czf - . > "$backup_dir/gateway-state.tar.gz.tmp"
```

Only after the archive command succeeds:

```sh
mv "$backup_dir/gateway-state.tar.gz.tmp" "$backup_dir/gateway-state.tar.gz"
tar -tzf "$backup_dir/gateway-state.tar.gz" > /dev/null
docker compose up -d gateway
```

If backup creation fails, retain the original volume, investigate the error and restart the original gateway when appropriate. Do not treat a `.tmp` file as a completed backup. Keep identifiable server/client backups from the same association; avoid pairing/state changes while capturing the two sides. Adjust the configuration filename if you use `compose.yml`, override files or `-f` options. With a custom `PAIR_DATA_DIR`, archive that mounted directory instead.

## Upgrade

Read the release notes and [compatibility policy](VERSIONING.md). Take and verify backups on both sides before changing versions. Pin the intended published tag or digest in the Compose files, then on each side:

```sh
docker compose pull gateway
docker compose up -d gateway
docker compose ps
docker compose exec gateway wg show
```

Check the exposed service from a separate machine and verify traffic travels through the tunnel. Container health alone does not prove forwarding. Do not delete volumes during an upgrade; avoid `docker compose down -v`. Keeping a matching old image available can help recovery, but does not make incompatible state readable.

## Restore or roll back

1. Stop the affected gateways. Preserve their current state in a separate backup for diagnosis.
2. Recover the matching server/client Compose and secret configuration. Select the old known-good image version or digest recorded with those backups.
3. Restore into **new, empty volumes**, keeping the original volumes untouched. For the examples, change the top-level volume declaration on each side to a distinct unused name, such as:

   ```yaml
   volumes:
     gateway-state:
       name: tunlivo-restored-server-YYYYMMDD
   ```

   Use a different name for the client. Keep the gateway service mount `gateway-state:/data`. For bind mounts, use a new empty host directory instead. The backup and image must belong to the same gateway role and intended association.

4. From each corresponding deployment directory, set `backup_dir` to that side's backup, then restore with the selected recovery image:

   ```sh
   docker compose pull gateway
   docker compose run --rm --no-deps -T --entrypoint tar gateway \
     -C /data -xzf - < "$backup_dir/gateway-state.tar.gz"
   ```

5. Start both gateways with `docker compose up -d gateway`. Check health, `wg show` and an actual service connection through the public server. Do not start the old and restored copies together.

A successful archive listing is not a restore test. Periodically rehearse recovery with isolated volumes/networks and a demo service. Avoid binding production ports or contacting a production peer from the rehearsal. Retain the original volumes until recovery is confirmed.

If the original keys/state are lost, automatic pairing requires fresh gateway volumes and a new invitation on both sides. If a key was compromised, restoring that key from backup does not revoke it: replace the association and keys instead.
