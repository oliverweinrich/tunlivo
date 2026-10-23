# Agent guide for Tunlivo

This file preserves project context for future development sessions. Keep it current when architecture, tests or release behavior changes. Read the actual scripts and workflows before acting; versions, remote settings and release status can change.

## Start of a session

- Confirm that the working directory is the **Tunlivo repository**, not a neighboring monorepo. This project has its own Git history.
- Run `git rev-parse --show-toplevel`, `git status --short`, `git branch --show-current` and `cat VERSION`. Preserve existing user changes; do not assume they belong to the current task.
- Read `README.md` for setup, `examples/CONFIGURATION.md` for variables and `.github/README.md` for maintenance/release procedures. `FEATURES.md` is the public roadmap, not a list of implemented behavior; update its checkboxes when work is completed.
- Read `DEPENDENCIES.md` for update coverage; regenerate it with `npm run dependencies` after dependency changes. It is a snapshot, not a lockfile. `npm run dependencies:report` produces an offline CI report; `npm run test:tooling` tests all repository Node tools. Dockerfile and Compose updates use separate Dependabot ecosystems. Compose example names must match the updater discovery pattern (for example `compose.manual-client.yaml`, not `compose.manual.client.yaml`); the tooling tests enforce this. The own-image example references are release-managed; Node major upgrades remain manual. Dependabot excludes major `@types/node` updates so declarations continue to match Node 24; patch/minor updates within 24 remain automatic.
- Read `SECURITY.md` and `docs/VERSIONING.md` for support/compatibility decisions. Use `docs/RELEASE_CHECKLIST.md` for release verification and `docs/OPERATIONS.md` for backups, upgrades and recovery.
- Check remote Actions/release/tag state before giving publication or retry instructions. A local test or the existence of a Git tag does not prove successful publication.
- Make focused changes, run relevant checks and report what was actually verified. Do not commit, tag, push or publish merely to test tooling.

## Fresh-session prerequisites

Run commands below from the repository root. Development needs Node.js 24+ with npm and a running Docker daemon with Compose v2. The Docker daemon must support the containerd image store for multi-platform image load/save. No Go installation is required. Runtime and repository tools use native erasable TypeScript on Node.js; npm and the TypeScript compiler are development-only. The image installs Node.js from the pinned Alpine branch. Own runtime, release, test and CI orchestration are TypeScript. External WireGuard/Alpine tools still require Bash inside Linux containers.

```sh
git rev-parse --show-toplevel
git status --short
git branch --show-current
cat VERSION
node --version
npm --version
docker info --format '{{.OSType}}/{{.Architecture}}'
docker compose version
```

If Docker cannot connect on macOS, check that Docker Desktop is running and the selected Docker context is correct. Do not change production services or enable privileged containers to work around a local test setup problem. CI uses native `ubuntu-24.04` and `ubuntu-24.04-arm` runners. GitHub CLI authentication is needed for publication/preflight, not normal development checks.

Prefer this guide for durable project knowledge, the referenced docs for full procedures, and the actual code/workflows for current behavior. Keep transient logs and verification results out of instructions; record them in the task/PR summary. Recheck published versions and settings rather than turning an old snapshot into a permanent fact.

## Purpose and product boundaries

Tunlivo is Oliver Weinrich's independent, general-purpose TCP/UDP gateway using the original WireGuard tools and nginx. It is not an official WireGuard project.

```text
Incoming connection → Public gateway port → WireGuard tunnel → Client gateway → Service
```

The client initiates the tunnel, allowing services behind NAT without home-router port forwarding. This connects gateway containers; it is not automatically a full-tunnel VPN for either host.

- Keep runtime, documentation and examples independent of personal deployments, domains and applications such as Minecraft. Use the HTTP demo in `examples/` when an example service is needed.
- Configuration uses Docker Compose environment variables. `PROXY_ROUTES` maps TCP/UDP listeners to destinations; `WG_*` configures WireGuard.
- Manual mode accepts keys and peers. Automatic pairing uses a one-time invitation and persistent state under `/data`; each side needs its own volume. Automatic pairing currently supports one client per server.
- Health means local gateway readiness; it does not guarantee a recent peer handshake or a reachable application. Pairing is not healthy until initial pairing completes.
- Own runtime and repository tooling use TypeScript (`.mts`), checked with strict `tsc --noEmit`. Do not add Python or Go. Keep WireGuard and nginx as external native dependencies. The runtime has no npm dependencies; OpenSSL generates pairing certificates and flock protects cross-process state. Docker starts Node directly. The public `gateway-pair` executable is a symlink to the TypeScript CLI. Release, source-collection, scanning and test orchestration are also TypeScript. Only official Alpine APKBUILD expressions and third-party `wg-quick` use Bash; do not add own Shell/Python/Go programs.

## Repository map

| Path                                   | Responsibility                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `image/Dockerfile`                     | Pinned Alpine runtime with Node.js/WireGuard/nginx/OpenSSL/flock, labels, inventories and release-source export target. |
| `image/runtime/pair.mts`               | Pinned-TLS enrollment, legacy-compatible state, process locks and pairing CLI.                                          |
| `image/runtime/gateway.mts`            | Configuration validation, nginx/WireGuard subprocesses, readiness and signal cleanup.                                   |
| `tests/runtime/pair.test.mts`          | Security, concurrency, pinning, state and inventory tests run inside the runtime image.                                 |
| `image/runtime/inventory.mts`          | Installed Alpine package provenance inventory.                                                                          |
| `image/legal/`                         | Notices shipped in the image; Alpine notices and `release.json` are generated.                                          |
| `README.md`, `SECURITY.md`, `docs/`    | User setup, security reporting, compatibility, release checklist and operations/recovery.                               |
| `AGENTS.md`, `FEATURES.md`             | Agent entry point and public roadmap.                                                                                   |
| `examples/`                            | Consistently named manual/pairing server/client Compose examples and configuration reference.                           |
| `tests/integration/run.mts`            | Isolated manual/pairing, TCP/UDP, restart and persisted-state tests.                                                    |
| `release/`                             | Version changes, source/license collection, artifact checks and publication.                                            |
| `.github/workflows/`                   | Maintenance checks and gated release pipeline.                                                                          |
| `scripts/scan.mts`, `.github/scanner/` | Pinned Trivy scanner and image scan wrapper.                                                                            |
| `.github/maintenance-issue.mts`        | Maintenance issue reporting; tests are under `tests/tooling/github/`.                                                   |

Both Dockerfiles use the **repository root** build context. Root `.dockerignore` is an allowlist. Run `docker build -f image/Dockerfile .` for the runtime. All tests and test fixtures live under `tests/` (`runtime`, `tooling/github`, `tooling/release`, `integration`). Use exactly one root `package.json` and one lockfile; do not add package manifests for tests, release tools or runtime. Source archives also use an explicit allowlist in `release/package-project.mts`; add required new source/build files there when necessary.

`scripts/ci.mts` owns Actions orchestration and artifact transfer; `scripts/scan.mts` scans images. All actual test code and fixtures stay in `tests/`. `tests/tooling/release/run-permissions.mts` runs the Linux ownership regression.

## Branch, commit and pull request naming

Use English names and messages. Describe the concrete change; keep related work in one focused branch and avoid unrelated changes in a commit.

Branches follow `<type>/<short-kebab-case-description>` with lowercase words and hyphens. Release preparation uses `chore/release-X.Y.Z`. Use the next actual version, not a historical example.

| Type       | Purpose                                     | Branch example                   | Commit / PR title example                         |
| ---------- | ------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| `feat`     | New user-facing capability                  | `feat/connection-metrics`        | `feat(metrics): expose connection counters`       |
| `fix`      | Correct broken behavior                     | `fix/release-output-permissions` | `fix(release): restore source output ownership`   |
| `docs`     | Documentation only                          | `docs/agent-development-guide`   | `docs: document agent development conventions`    |
| `refactor` | Restructure without changing behavior       | `refactor/config-validation`     | `refactor(config): simplify route validation`     |
| `test`     | Add or improve tests                        | `test/pairing-reconnect`         | `test(pairing): cover reconnect with saved state` |
| `ci`       | GitHub Actions and automation               | `ci/native-release-tests`        | `ci(release): test images on native runners`      |
| `build`    | Image build, dependencies or tooling        | `build/update-alpine`            | `build(deps): update Alpine base image`           |
| `chore`    | General maintenance and release preparation | `chore/release-X.Y.Z`            | `chore(release): prepare version X.Y.Z`           |

Commit subjects and PR titles follow Conventional Commits style: `<type>(<optional-scope>): <short imperative description>`. Omit the parentheses when there is no useful scope. Common scopes are `pairing`, `config`, `proxy`, `release`, `deps` and `tooling`. Use a lowercase initial verb, omit the trailing period and aim for a subject of about 72 characters or fewer.

Mark an actual breaking change with `!`, for example `feat(config)!: require explicit peer addresses`, and explain the migration in a `BREAKING CHANGE:` body paragraph. Choose the release version based on compatibility impact; commit prefixes alone do not trigger publication or calculate versions.

Use the same style for PR titles so squash-merge subjects stay consistent. PR descriptions should explain the problem, resulting behavior and relevant validation. Branch names and commit types need not match exactly when the final scope changes; make the PR title describe the final result. Keep Dependabot's generated branch names and titles unless there is a specific reason to edit them.

These are documented conventions, not enforced by commit-message hooks. Existing hooks enforce formatting only. Do not rewrite published history merely to rename older commits.

## Development and checks

Documentation is in English. Use strict native erasable TypeScript for all own code, including automation and tests. Keep npm development dependencies pinned to exact versions with the lockfile committed.

```sh
# Local setup (installs pinned tools and activates hooks)
npm ci
npm run typecheck
npm run format:check
npm audit --audit-level=high
npm run test:tooling
git diff --check
```

`npm ci` activates Husky locally. Pre-commit uses lint-staged to format staged supported files while preserving partial staging. Pre-push checks formatting. Use `npm run format` to fix formatting and review the diff. CI installs with `npm ci --ignore-scripts`. Prettier excludes legal texts and generated/private files; it does not format Dockerfiles or external Bash recipes. Native Node type stripping does not type-check: `npm run typecheck` must pass independently. Avoid transform-only TS features such as enums/decorators/parameter properties. Imports use explicit `.mts` extensions.

For runtime changes, run unit tests inside the image (they need Linux `wg`, `flock` and OpenSSL, but no external network):

```sh
version="$(cat VERSION)"
docker build --build-arg VERSION="$version" -t "tunlivo:$version" -f image/Dockerfile .
docker run --rm --network none --read-only --tmpfs /tmp --entrypoint node \
  "tunlivo:$version" --test /opt/tunlivo/tests/runtime/pair.test.mts
```

If `actionlint` is installed, run it from the root for workflow changes. It is a separate tool, not an npm dependency; do not assume a previous session's temporary installation exists.

For runtime changes, build and run the integration tests:

```sh
version="$(cat VERSION)"
docker build --build-arg VERSION="$version" -t "tunlivo:$version" -f image/Dockerfile .
npm run test:integration
npm run test:compatibility
node tests/tooling/release/run-permissions.mts "tunlivo:$version"
TUNLIVO_SCAN_REPORT="$PWD/reports/local-review.json" \
  node scripts/scan.mts "tunlivo:$version"
```

A Linux kernel with WireGuard support and Docker network capabilities is required. Docker Desktop provides a Linux VM on macOS. Prefer native architecture integration tests. Override the test image with `TUNLIVO_TEST_IMAGE` when testing a separately named image.

The immutable Go migration baseline is `tests/integration/compatibility-baseline.json`; never auto-update it with normal releases. `npm run test:compatibility` (in `tests/integration/compatibility.mts`) tests old server/new client, new server/old client and upgrading both old volumes to the new image while retaining byte-identical state, plus rolling new state back to the Go baseline. These fixture images are test inputs, not runtime dependencies.

Integration probes use phase-specific 90-second wall-clock deadlines and wait for local gateway readiness before testing tunnel connectivity. Failure diagnostics expose only container status, public peer/endpoint information and routes, never gateway logs or state/invitations. A timeout is not proof of a protocol failure; inspect the failed phase. The original native ARM64 failure did not retain enough diagnostics to establish its cause. The old test sent only one UDP datagram before receiver readiness was guaranteed; retry probes now resend within the deadline. Do not return to a one-shot datagram followed by log-only waiting.

The integration test covers manual peers, TCP/UDP forwarding, a missing/restarted destination, automatic pairing and recreation with retained state but no invitation code. Its image defaults to `tunlivo:$(cat VERSION)`; setting `DOCKER_DEFAULT_PLATFORM` selects a variant but does not make an emulated test native. The permissions test covers non-root host access after both source-collection success and failure.

Tests create disposable containers, networks, volumes and temporary files, then clean them up. Never use real deployment volumes. Do not dump container logs indiscriminately: they can contain valid pairing invitations. Formatting/documentation-only changes normally need formatting/diff checks rather than a full source collection and image rebuild.

## Validation scope and handoff

- Documentation/configuration-only work: formatting, `git diff --check`, local Markdown links and matching behavior in scripts. Verify documented operational commands with disposable fixtures when changing them.
- Pairing/runtime work: strict typecheck and runtime unit tests, image build, complete integration suite and scan. Changes to the pairing protocol/state also need compatibility fixtures described in `docs/VERSIONING.md`.
- Release/build/workflow work: strict TypeScript checks, release-tool tests, workflow lint and the permissions regression. If source collection or source packaging changes, prepare into a new isolated output directory and check the final multi-platform image against it; never overwrite published output as a test.
- Before handing off: review `git diff` and untracked files, preserve user edits, list checks actually run and their limits. A local ARM64 run does not establish native AMD64 behavior; use the hosted matrix for the other architecture. Do not report tests of an old image as verification of new code.
- This repository is maintained solo for now. Do not add a contributor process or require a second reviewer without a request. Read-only reviews and reversible local fixes can proceed within the requested task; external actions require the user's applicable authorization.

## Automation and release invariants

- `check.yml` runs on PRs, pushes to `main`, manual dispatch and **weekly** on Monday at 05:17 UTC. It tests natively on AMD64 and ARM64, compares installed packages and scans images. Scheduled/manual monitoring updates a maintenance issue.
- Dependabot checks Docker, GitHub Actions and npm weekly. npm audit also runs in CI. Known high/critical findings block checks; a clean scan is not a guarantee of no vulnerabilities.
- Alpine packages installed/upgraded by `apk` require fresh builds to detect changes; Dependabot's Docker tag updates alone do not cover them.
- Updates are reviewed and merged through PRs. Merging does not publish an image. Check current branch rules; the expected required checks are `Check (amd64)` and `Check (arm64)`.
- `VERSION` is the version source of truth. Run `node release/set-version.mts X.Y.Z` to update it and documentation/examples. Use a new increasing version; historical examples in maintenance docs are not the next release number.
- After merging, a matching `vX.Y.Z` tag on the merged `main` commit triggers release. Manual dispatch on `main` is also supported. Existing versioned images/releases are not overwritten.
- `release.yml` first prepares sources, builds and scans the multi-platform candidate. It exports that exact image as a checksummed artifact. Separate native AMD64/ARM64 jobs load and test it. Only after both succeed does the publication job request the `dockerhub` environment approval and load the same candidate and matching release state.
- Do not rebuild the runtime image after testing. Do not weaken or skip a platform test to make a release pass. QEMU remains useful for cross-platform builds/file checks, not as a substitute for native WireGuard integration tests.
- Only image publication has `contents: write`. Docker Hub credentials are limited to the protected image publication and overview-sync jobs (the latter needs only contents read). The source helper is also rebuilt/scanned and its package inventory uploaded by native checks. The separate maintenance notification job has `issues: write` to manage its own issue. The `dockerhub` environment supplies `DOCKERHUB_USERNAME`, optional `DOCKERHUB_REPOSITORY` (default `oliverweinrich/tunlivo`) and push secret `DOCKERHUB_TOKEN` (Read/Write). Metadata steps separately use `DOCKERHUB_OVERVIEW_TOKEN` (Read/Write/Delete required by the Overview API); never pass it to image login/push steps. Never commit or print credentials.
- Docker Hub Overview text comes from `docs/DOCKERHUB.template.md`; `.github/dockerhub.mts` renders `VERSION`, actual pairing examples and commit-pinned source links. `npm run dockerhub:preview` writes a safe local preview. Release sync runs after verified image publication; the separate manual `dockerhub-overview.yml` retries metadata only on `main`, gated by the `dockerhub` environment and requiring `VERSION` to match published `latest`. Do not rebuild or republish an immutable image merely because metadata sync failed. The sync preserves short description/category and verifies saved `full_description`. Tests must mock API writes.
- `release/publish.mts` publishes publicly. `--check` is a read-only availability preflight requiring GitHub CLI authentication. Publication creates matching public source/license assets before pushing runtime images.

## Source and license obligations

Own code uses Apache-2.0 with attribution to Oliver Weinrich. Third-party components retain their own licenses. Keep `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.md` byte-identical to their corresponding copies in `image/legal/`. Do not bulk-format these files or claim legal certainty from technical checks.

A release must retain matching sources, Alpine recipes/patches, verified upstream archives (including Node.js and its bundled dependencies), notices, package inventory and checksums for the actual image. `prepare.mts` derives the source helper's Alpine base from the pinned runtime base. `check.mts` verifies both architectures against those materials, including runtime hashes and shipped notices.

A normal development build can contain generated license metadata from an earlier preparation; its version label alone does not make it a distributable release. Always run preparation and `release/check.mts` for a release candidate.

Preparation refreshes runtime packages by default. Reuse the builder/cache for the final image; adding a fresh rebuild between collection and final verification can change the installed packages. Retained `VERIFIED` markers never bypass upstream checksum checks: retries verify disposable copies with `abuild`, because that tool deletes corrupt inputs. Damaged retained sources or a mismatched recipe version block collection without silently refetching them. `tests/tooling/release/cache-probe.mts` exercises this offline in the source helper.

`COMPLETE` marks a prepared release and prevents accidental overwrites. Use separate absolute `TUNLIVO_RELEASE_DIR` and `TUNLIVO_CACHE_DIR` paths for isolated work; `TUNLIVO_REFRESH=0` is for debugging, not the normal release path.

Never overwrite already published archives. Before retrying a failed publication, inspect GitHub releases, registry tags and Actions artifacts for partial publication. Re-running an old workflow run executes its old revision, not a later fix. If a tagged failed release needs code changes, prefer a new version/tag pointing to the corrected merged commit.

## TypeScript migration compatibility invariants

- Preserve the PascalCase JSON state fields and base64-encoded PEM strings from Go `encoding/json`. Never rewrite a valid existing state on startup, including its exact keys/certificate/token/expiry.
- `state.lock` is the same OS flock file/inode used by Go. Secret request values go through stdin to lock workers, not argv. Do not replace the lock with a process-local mutex while CLI commands exist.
- Invitations remain `wg1.<sha256-of-certificate-DER>.<token>`; retain TLS 1.3 minimum, constant-time token checks, body/header/time limits and single-peer/idempotent retry policy.
- Validate the pinned certificate **before** sending the HTTP bearer token. Node's `rejectUnauthorized: false` alone is not pinning; the client explicitly establishes/verifies TLS first, then sends HTTP on that socket.
- Node `spawnSync` pipes are sockets; nginx cannot open `/dev/stderr` against those sockets. Run `nginx -t` with inherited stderr and keep gateway process logs free of private keys/state.
- Follow `docs/TYPESCRIPT_MIGRATION.md` for the external Bash boundary and release/rollback implications.

## Lessons from release failures

1. **Linux bind-mount ownership:** the root source-helper container created root-owned `/output/licenses`, causing host-side copying of Go notices to fail. `prepare.mts` now passes the host UID/GID; `collect-sources.mts` restores ownership of output/cache in `finally`, including failure paths. Preserve numeric validation and failure exit status. `tests/tooling/release/run-permissions.mts IMAGE` verifies success/failure behavior using Linux container storage and a non-root writer; macOS bind mounts can hide the issue.
2. **Emulated ARM64 integration timeout:** AMD64 passed while the ARM64 run on the AMD64 release runner timed out. The exact emulation failure was not established from the available log. Release tests now use matching native runners and transfer the unchanged candidate between jobs. Do not regress to testing both architectures through QEMU in one runner.
3. **Docker Desktop file copying:** a native Node copy between separate `/output` and `/cache` bind mounts produced an empty cache file during source collection. `scripts/lib.mts` uses explicit chunked reads/writes through `copyTree` instead of kernel-assisted file cloning. Preserve that path for source/cache and legal staging. The collector preserves the original failure when ownership restoration also fails.
4. **Immutable release identity:** version, Git tag/commit, sources, licenses and published image must agree. A failed run does not justify moving an existing tag silently or replacing public artifacts with another build.

## Private and generated material

Keep `.env`, private keys, pairing codes/state, deployment data, `release-cache/`, `release-output/`, `reports/`, `node_modules/` and generated `.husky/_/` out of Git and runtime build contexts. `FEATURES.md` is public documentation and participates in formatting and source packaging. Do not mix personal deployment configuration or unrelated workspace content into public documentation or source archives.
