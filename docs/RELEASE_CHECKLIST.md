# Release checklist

Use this for each release; record the actual version, commit, workflow URL and verification results in the release PR or notes. The commands below inspect published artifacts, but do not publish anything.

## Before tagging

- [ ] Choose a new version using [the compatibility policy](VERSIONING.md). Review configuration, persisted-state and protocol changes, including rollback limits.
- [ ] Refresh `DEPENDENCIES.md` with `npm run dependencies` and review its coverage boundaries. The installed-package snapshot refers to the latest already-published release; regenerate again after publication if desired.
- [ ] Review dependency/security changes. Confirm both required PR checks, `Check (amd64)` and `Check (arm64)`, pass. Do not waive a platform failure to publish.
- [ ] Run `bash release/set-version.sh X.Y.Z`, review the changed references and merge the release PR into `main`.
- [ ] Prepare release notes with upgrade/migration steps, security fixes and known limitations.
- [ ] Confirm the version/tag is unused and tag the intended merged commit. Never run `release/publish.sh` as a dry run; its `--check` mode is the availability preflight.

## Workflow gates

- [ ] Source preparation, license checks and image scans pass. HIGH/CRITICAL findings block publication.
- [ ] Native AMD64 and ARM64 release tests pass using the exported candidate image; the runtime is not rebuilt after testing.
- [ ] Review and approve the `dockerhub` environment deployment, if approval is configured.
- [ ] Confirm **Publish tested release** succeeds. A Git tag or partial GitHub release alone is not proof of completion.

## After publication

Set the released version explicitly, for example `version=X.Y.Z`, replacing the placeholder first.

- [ ] Confirm GitHub release `vX.Y.Z` points to the intended commit and contains the source archive, license archive, `packages.tsv` and `SHA256SUMS`. Download all four into a new directory and run `shasum -a 256 -c SHA256SUMS` there.
- [ ] Inspect `oliverweinrich/tunlivo:X.Y.Z`, `:latest` and `:X.Y.Z-sources` with `docker buildx imagetools inspect`. All must contain `linux/amd64` and `linux/arm64`; ignore extra attestation entries when checking platforms.
- [ ] Compare the top-level runtime digest for `X.Y.Z` and `latest`: they must match immediately after this release. The source-only image has its own digest.
- [ ] Explicitly pull the published version on native AMD64 and ARM64 hosts and check its version label. Do not use QEMU forwarding tests as a substitute for a native platform test.

  ```sh
  docker pull "oliverweinrich/tunlivo:$version"
  docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' \
    "oliverweinrich/tunlivo:$version"
  ```

- [ ] In disposable environments, start a fresh server/client pair from the published image with new volumes and the demo service. Confirm pairing, a service request through the public endpoint, a handshake and traffic counters. Recreate both gateways retaining those test volumes and confirm the association still works without `PAIR_CODE`.
- [ ] For changes affecting UDP/manual peers, repeat those published-image paths as well. Preserve evidence of which architectures and paths were tested.
- [ ] Review release notes and Docker Hub Overview for correct versions, migration instructions and source links. Confirm the automatic Overview sync/readback succeeds. For metadata-only corrections, use the separate **Update Docker Hub overview** workflow without rebuilding or republishing images.

If any published verification fails, document the affected version and impact. Stop promoting it, inspect which assets are already public, and prepare a corrected new release. Do not silently replace versioned images, tags or source/license archives. Restore `latest` only as an explicit, reviewed recovery action pointing to a verified release.

## Repository settings review

Periodically confirm on GitHub:

- [ ] The active ruleset targets `main`, requires PRs and both platform checks, and blocks force pushes/deletion. Zero required reviewer approvals is appropriate while working alone; keep the checks mandatory.
- [ ] **Settings → Security → Advanced Security → Private vulnerability reporting** is enabled (GitHub may also surface this under the repository Security tab).
- [ ] Dependabot alerts/security updates, Actions failure notifications and maintenance issue notifications are enabled as intended.
- [ ] Only the protected image publication and overview-sync jobs receive Docker Hub credentials and the `dockerhub` environment retains the intended approval rules.

Remote settings are not established by committed workflow files. Check their current values rather than relying on a historical successful run.
