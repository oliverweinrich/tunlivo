# Dependencies

Generated with `npm run dependencies`. This is an informational snapshot, not an update lockfile or a claim that every pin is the latest upstream release. Re-run after dependency changes and before release review. CI also generates an offline report artifact, so Dependabot PRs do not need to edit this snapshot to pass.

“Last pin change” is the UTC date of the Git commit last changing the cited declaration line, not the upstream publication date. Uncommitted files/lines and source archives without Git history are marked accordingly. Full digests/commit pins remain in the cited manifests. Transitive npm dates refer to their lockfile entry. Runtime package dates below refer to the published release as a whole.

## Images

| Dependency    | Configured version / pin             | Last pin change | Source                       | Dependabot / maintenance |
| ------------- | ------------------------------------ | --------------- | ---------------------------- | ------------------------ |
| golang        | 1.27.2-alpine (sha256:f92b6ef800e4…) | 2026-10-20      | `image/Dockerfile`           | Yes (docker; weekly)     |
| alpine        | 3.24 (sha256:294b683cb724…)          | 2026-10-21      | `image/Dockerfile`           | Yes (docker; weekly)     |
| aquasec/trivy | 0.76.0 (sha256:2416d1f74045…)        | 2026-10-21      | `.github/scanner/Dockerfile` | Yes (docker; weekly)     |

## Example images

| Dependency             | Configured version / pin             | Last pin change          | Source                                 | Dependabot / maintenance     |
| ---------------------- | ------------------------------------ | ------------------------ | -------------------------------------- | ---------------------------- |
| oliverweinrich/tunlivo | 1.0.3                                | Unknown (no Git history) | `examples/compose.manual-client.yaml`  | Excluded; release-managed    |
| nginx                  | stable-alpine (sha256:970364228b1e…) | Unknown (no Git history) | `examples/compose.manual-client.yaml`  | Yes (docker-compose; weekly) |
| oliverweinrich/tunlivo | 1.0.3                                | Unknown (no Git history) | `examples/compose.manual-server.yaml`  | Excluded; release-managed    |
| oliverweinrich/tunlivo | 1.0.3                                | Unknown (no Git history) | `examples/compose.pairing-client.yaml` | Excluded; release-managed    |
| nginx                  | stable-alpine (sha256:970364228b1e…) | Unknown (no Git history) | `examples/compose.pairing-client.yaml` | Yes (docker-compose; weekly) |
| oliverweinrich/tunlivo | 1.0.3                                | Unknown (no Git history) | `examples/compose.pairing-server.yaml` | Excluded; release-managed    |

## npm tooling

| Dependency               | Configured version / pin | Last pin change | Source              | Dependabot / maintenance                             |
| ------------------------ | ------------------------ | --------------- | ------------------- | ---------------------------------------------------- |
| husky (direct)           | 9.1.7                    | 2026-10-21      | `package.json`      | Yes (npm; weekly)                                    |
| lint-staged (direct)     | 17.6.0                   | 2026-10-21      | `package.json`      | Yes (npm; weekly)                                    |
| picomatch (transitive)   | 4.0.7                    | 2026-10-21      | `package-lock.json` | Yes (npm; weekly); lockfile/parent constraints apply |
| prettier (direct)        | 3.9.10                   | Uncommitted     | `package.json`      | Yes (npm; weekly)                                    |
| string-argv (transitive) | 0.3.2                    | 2026-10-21      | `package-lock.json` | Yes (npm; weekly); lockfile/parent constraints apply |
| tinyexec (transitive)    | 1.3.1                    | 2026-10-21      | `package-lock.json` | Yes (npm; weekly); lockfile/parent constraints apply |
| yaml (direct)            | 2.9.1                    | Uncommitted     | `package.json`      | Yes (npm; weekly)                                    |

## GitHub Actions

| Dependency                 | Configured version / pin | Last pin change | Source                          | Dependabot / maintenance     |
| -------------------------- | ------------------------ | --------------- | ------------------------------- | ---------------------------- |
| actions/checkout           | v7.0.1 (3d3c42e5aac5…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| actions/setup-node         | v7.1.0 (949feb2413d6…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| docker/setup-buildx-action | v4.4.1 (f87e5991a6d7…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| actions/upload-artifact    | v7.0.2 (cf430e030ddb…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| actions/download-artifact  | v8.0.2 (9000827ccba6…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| actions/github-script      | v9.0.0 (3a2844b7e9c4…)   | 2026-10-21      | `.github/workflows/check.yml`   | Yes (github-actions; weekly) |
| docker/setup-docker-action | v5.5.0 (2bf61fb9464c…)   | 2026-10-21      | `.github/workflows/release.yml` | Yes (github-actions; weekly) |
| docker/setup-qemu-action   | v4.4.0 (990126619549…)   | 2026-10-21      | `.github/workflows/release.yml` | Yes (github-actions; weekly) |

## Toolchains and modules

| Dependency            | Configured version / pin | Last pin change | Source                 | Dependabot / maintenance                                                          |
| --------------------- | ------------------------ | --------------- | ---------------------- | --------------------------------------------------------------------------------- |
| Go language directive | 1.27.0                   | 2026-10-20      | `image/pairing/go.mod` | Manual alignment with the Docker Go toolchain; gomod monitors module dependencies |
| Node.js major         | 24                       | 2026-10-21      | `.node-version`        | Manual major upgrades; setup-node resolves patches within this major              |

## Runtime OS packages

Dependabot does not update individual `apk` packages. Scheduled native CI builds run `apk upgrade`/`apk add`, compare installed packages with the published image and run vulnerability scans. A maintainer still reviews, merges and releases updates. The Go standard library is provided by the pinned Go builder; there are currently no external Go modules.

Published-image snapshot: [v1.0.3](https://github.com/oliverweinrich/tunlivo/releases/download/v1.0.3/packages.tsv), published 2026-10-21. These are the installed package versions in that release, including transitive/base packages; a fresh local build can differ. All rows have **no direct Dependabot coverage** and share that release publication date. The TSV retains per-architecture versions, licenses, origin commits and package provenance.

| Package                  | Installed version |
| ------------------------ | ----------------- |
| alpine-baselayout        | 3.7.2-r1          |
| alpine-baselayout-data   | 3.7.2-r1          |
| alpine-keys              | 2.6-r0            |
| alpine-release           | 3.24.2-r0         |
| apk-tools                | 3.0.8-r0          |
| bash                     | 5.3.9-r1          |
| busybox                  | 1.37.0-r31        |
| busybox-binsh            | 1.37.0-r31        |
| ca-certificates-bundle   | 20261020-r0       |
| iproute2                 | 7.0.0-r0          |
| iproute2-minimal         | 7.0.0-r0          |
| iproute2-ss              | 7.0.0-r0          |
| iproute2-tc              | 7.0.0-r0          |
| libapk                   | 3.0.8-r0          |
| libbsd                   | 0.12.2-r0         |
| libcap2                  | 2.78-r0           |
| libcrypto3               | 3.5.9-r0          |
| libelf                   | 0.195-r0          |
| libmd                    | 1.2.0-r0          |
| libmnl                   | 1.0.5-r2          |
| libncursesw              | 6.6_p20260516-r0  |
| libssl3                  | 3.5.9-r0          |
| libxtables               | 1.8.13-r0         |
| musl                     | 1.2.6-r2          |
| musl-utils               | 1.2.6-r2          |
| ncurses-terminfo-base    | 6.6_p20260516-r0  |
| netcat-openbsd           | 1.234.1-r0        |
| nginx                    | 1.30.4-r1         |
| nginx-mod-stream         | 1.30.4-r1         |
| openresolv               | 3.17.4-r0         |
| pcre2                    | 10.49-r0          |
| readline                 | 8.3.3-r1          |
| scanelf                  | 1.3.9-r1          |
| ssl_client               | 1.37.0-r31        |
| wireguard-tools          | 1.0.20260223-r0   |
| wireguard-tools-wg       | 1.0.20260223-r0   |
| wireguard-tools-wg-quick | 1.0.20260223-r0   |
| zlib                     | 1.3.2-r1          |
| zstd-libs                | 1.5.7-r2          |

## Source helper OS packages

Local/CI helper inventory observed 2026-10-21, from `reports/source-helper-packages.tsv`. This is a build snapshot, not part of the published runtime inventory and not a per-package update date. All packages below are maintained through fresh Alpine helper builds and scans, **not direct Dependabot PRs**. Download the native maintenance report artifacts for the other architecture.

| Package                | Installed version |
| ---------------------- | ----------------- |
| abuild                 | 3.17.0-r0         |
| abuild-sudo            | 3.17.0-r0         |
| acl-libs               | 2.3.2-r1          |
| alpine-baselayout      | 3.7.2-r1          |
| alpine-baselayout-data | 3.7.2-r1          |
| alpine-keys            | 2.6-r0            |
| alpine-release         | 3.24.2-r0         |
| apk-tools              | 3.0.8-r0          |
| bash                   | 5.3.9-r1          |
| brotli-libs            | 1.2.0-r1          |
| busybox                | 1.37.0-r31        |
| busybox-binsh          | 1.37.0-r31        |
| c-ares                 | 1.34.8-r0         |
| ca-certificates-bundle | 20260909-r0       |
| curl                   | 8.22.0-r0         |
| fakeroot               | 1.37.2-r0         |
| grep                   | 3.12-r0           |
| libapk                 | 3.0.8-r0          |
| libcap-getcap          | 2.78-r0           |
| libcap2                | 2.78-r0           |
| libcrypto3             | 3.5.9-r0          |
| libcurl                | 8.22.0-r0         |
| libgcc                 | 15.2.0-r5         |
| libidn2                | 2.3.8-r0          |
| libncursesw            | 6.6_p20260516-r0  |
| libpsl                 | 0.21.5-r3         |
| libssl3                | 3.5.9-r0          |
| libstdc++              | 15.2.0-r5         |
| libunistring           | 1.4.2-r0          |
| lzip                   | 1.26-r0           |
| musl                   | 1.2.6-r2          |
| musl-utils             | 1.2.6-r2          |
| ncurses-terminfo-base  | 6.6_p20260516-r0  |
| nghttp2-libs           | 1.70.0-r0         |
| openssl                | 3.5.9-r0          |
| patch                  | 2.8-r0            |
| pcre2                  | 10.49-r0          |
| pkgconf                | 2.5.1-r0          |
| readline               | 8.3.3-r1          |
| scanelf                | 1.3.9-r1          |
| ssl_client             | 1.37.0-r31        |
| tar                    | 1.35-r5           |
| xz                     | 5.8.4-r0          |
| xz-libs                | 5.8.4-r0          |
| zlib                   | 1.3.2-r0          |
| zstd                   | 1.5.7-r2          |
| zstd-libs              | 1.5.7-r2          |

## Coverage boundaries

- The source helper inherits `ALPINE_IMAGE` from the pinned runtime base; it has no separate image pin for Dependabot to update. Its `bash abuild curl grep tar xz zstd` packages (and their dependencies) resolve when that helper is built, not from the runtime TSV. CI rebuilds and scans this helper; its exact inventory is a separate report artifact.
- `oliverweinrich/tunlivo` in the examples is this project's output, explicitly excluded from Dependabot. `release/set-version.sh` owns those references.
- `.node-version` and the Node engine requirement need manual major-version review. GitHub-hosted runner OS, Docker/Compose and QEMU installed by setup actions follow their providers/action inputs; host OS/kernel/Docker maintenance remains the operator's responsibility.
- Dependabot tracks future external modules in `image/pairing/go.mod`. Review the Go language directive alongside Docker toolchain updates; do not assume it is independently upgraded. npm security updates/alerts additionally require GitHub repository settings to be enabled; lockfile updates must respect parent constraints.
- Trivy's vulnerability database refreshes during scans. The scanner image pin is maintained by Dependabot; software inside third-party images/actions is maintained indirectly through those upstream releases, not as separate Tunlivo manifests.
- Optional local tools such as `actionlint`, Git and the VS Code Prettier extension are not repository-pinned dependencies and require local maintenance.

The machine-readable sources of truth are manifests/lockfiles and each release's package inventory. For a standardized full image SBOM (SPDX/CycloneDX), use an image-aware SBOM tool against an immutable image digest; this Markdown file and `packages.tsv` are not substitutes for a complete SBOM.

References: [Dependabot ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories), [maintenance workflow](.github/README.md).
