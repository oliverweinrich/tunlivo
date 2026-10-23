# TypeScript runtime migration

The gateway runtime, package inventory and repository Node tools now use native erasable TypeScript with strict static checking. WireGuard (host kernel and CLI) and nginx remain the existing networking components. No custom VPN protocol or proxy was introduced.

This migration is prepared for **1.0.4**. It is a compatible runtime refactor, not a new VPN protocol or configuration format.

## Runtime and tooling

The image installs Node.js, OpenSSL and flock from the pinned Alpine branch. OpenSSL replaces Go's certificate generation; flock retains the existing OS-level cross-process lock. No npm packages are installed in the runtime. The compiler, Node types, YAML parser and formatting tools are development dependencies.

`image/runtime/pair.mts` replaces Go enrollment; `gateway.mts` replaces the shell application lifecycle/configuration/health logic; `inventory.mts` replaces AWK package parsing. Docker starts the TypeScript runtime and health command directly. The public `gateway-pair` CLI is a symlink to the executable TypeScript enrollment module; own Shell launchers have been removed. Repository tools and tests use `.mts` rather than CommonJS `.cjs`.

Release/source collection, scanning and Docker integration tests also use TypeScript. Official Alpine APKBUILD recipes and `wg-quick` remain upstream Bash programs. The collector invokes only the official recipe expressions through Bash; own orchestration does not embed Shell programs. Husky's two one-line npm launchers and Docker/Actions command integration are tool interfaces.

All tests and fixtures live in `tests/runtime/`, `tests/tooling/` and `tests/integration/`. A single root `package.json`, lockfile and strict TypeScript configuration cover the project. Both Dockerfiles use the repository root as their build context; use `docker build -f image/Dockerfile .`.

## Existing deployments

Environment variables, published ports, manual peers and the `gateway-pair` CLI remain compatible. Existing JSON keeps Go's PascalCase fields and base64 PEM encoding. Startup does not rotate keys, rewrite state, expire an existing association or require a new invitation. The same flock lock file protects CLI and server changes. New state/certificates use the same interoperable protocol and can be read by the old implementation.

Compatibility checks use an immutable published Go baseline and cover mixed peer implementations and recreating both gateway containers with unchanged old state volumes, plus rolling back newly created state to the Go baseline. Never use production volumes in tests. See `npm run test:compatibility` and `tests/integration/compatibility-baseline.json`.

## Image and source archive size

Node.js and its native dependencies increase the runtime footprint. Complete matching sources and copyright/license bundles also grow substantially: migration review produced roughly 1 GB of compressed sources and 280 MB of compressed licenses. These are approximate review measurements, not fixed release sizes; package updates and architecture inventories can change them. Allow adequate disk space and artifact-transfer time. Do not remove required notices to reduce size.

## Upgrade and rollback

Back up both Compose configurations and both `/data` volumes before upgrading. Update both image references to `oliverweinrich/tunlivo:1.0.4`, then recreate each gateway with `docker compose up -d`. Keep the existing volumes; no new pairing code is required. Confirm an actual forwarded request, not only container health.

The automated baseline checks cover 1.0.3 peers, retained 1.0.3 state and returning newly created 1.0.4 state to 1.0.3. This does not establish compatibility with every older release. If rollback is needed, stop the gateways, select the previous image on both sides and preserve or restore the matching pre-upgrade volumes as described in [operations](OPERATIONS.md). Never run both implementations against one volume simultaneously.

## Validation and publication

Run `npm run typecheck`, `npm run test:tooling`, runtime security tests inside the new image, ordinary integration tests and legacy compatibility tests. Both native architectures must pass hosted checks. Source preparation collects Node.js through the installed Alpine package provenance, and both platform images must match the resulting package inventories, runtime hashes and license files.

This changes the runtime image and requires a new unused release version before public distribution. Development review images are not replacements for already published versioned tags. Read the normal backup/upgrade and release guides; retain pre-upgrade backups even when compatibility tests pass. No image is published by the migration itself.
