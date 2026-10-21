# Maintenance and release workflow

## What happens automatically

| Trigger                                                                | Result                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every Monday                                                           | Dependabot checks pinned Docker images (including the Trivy scanner), GitHub Actions and Go dependencies and opens update pull requests, including major upgrades.                                                                                                                                              |
| Pull request or push to `main`                                         | Native AMD64 and ARM64 builds, Go tests and static checks, forwarding/pairing/restart tests, package comparison and vulnerability scans.                                                                                                                                                                        |
| Monday at 05:17 UTC, or a manual check run on `main`                   | Fresh Alpine packages are built and compared with `oliverweinrich/tunlivo:latest`. A single **Dependency maintenance** issue is created or updated for package changes, failed checks or known high/critical vulnerabilities. It closes when both architecture reports are clean and match the published image. |
| Push a new `vX.Y.Z` tag, or manually run **Publish release** on `main` | Prepare matching source/license archives, build and test both architectures, scan the actual images, publish GitHub assets, then Docker source/runtime images.                                                                                                                                                  |

Updates are not merged automatically. A merged dependency update does not publish an image.
The Go module currently uses only the standard library; Go toolchain updates come through the pinned builder image.
Alpine packages installed by `apk add` need the scheduled fresh build because Dependabot cannot update those unpinned package versions.
Fresh builds run `apk upgrade` before installing the application packages, so updates to existing base packages such as BusyBox and musl are included as well.
The HTTP demo images in `examples/` are examples, not bundled runtime dependencies.

The scanner image is pinned in `.github/scanner/Dockerfile` and updated by Dependabot; its vulnerability database is refreshed on each scan.
The scan fails for known **HIGH** and **CRITICAL** findings, including findings without a fix. Lower-severity findings do not block a release. A successful scan is not a guarantee that no vulnerabilities exist.
If a major Alpine or Go update breaks source collection or compatibility, the checks must be fixed before releasing.

## Formatting and Git hooks

For development, install Node.js 24 or newer, then run this once after cloning:

```sh
npm ci
```

This installs the pinned development tools and activates the Husky Git hooks:

- **Before committing:** lint-staged formats staged Markdown, JSON, YAML, JavaScript and other supported Prettier files and stages the formatting changes. Partially staged changes are preserved.
- **Before pushing:** Prettier checks the repository. If formatting is missing, run `npm run format`, review and commit the changes, then push again.
- **In CI and before publishing:** the same formatting check and an npm audit run automatically.

Manual commands:

```sh
npm run format
npm run format:check
```

`.prettierrc.json` contains the shared formatting rules. VS Code settings enable format-on-save for supported languages with the recommended Prettier extension. Go continues to use `gofmt` in CI; Bash, Dockerfiles and AWK are not formatted by this Prettier configuration.
License/notice files, private configuration and generated artifacts are excluded. The formatter tools and `node_modules` are not included in the runtime image. Dependabot also monitors the pinned npm tooling dependencies.

## One-time GitHub setup

1. Push these files on a branch and open a pull request targeting `main`. Enable GitHub Actions and Issues for the repository. Review and merge after both checks pass.
2. Under **Settings → Environments**, create an environment named **dockerhub**.
3. In that environment, add these variables:
   - `DOCKERHUB_USERNAME`: your Docker Hub login, for example `oliverweinrich`.
   - `DOCKERHUB_REPOSITORY`: `oliverweinrich/tunlivo` (optional; this is the default).
4. Create a Docker Hub personal access token with **Read & Write** access. Store it in the environment as the secret **DOCKERHUB_TOKEN**. Do not put it in a committed file.
5. Under **Settings → Code security**, enable Dependabot alerts/security updates where available. Version updates are configured by `.github/dependabot.yml`.
6. Run **Actions → Checks and dependency monitoring → Run workflow** on `main` once to verify runner support and view the initial reports.
7. After the first successful run, require **Check (amd64)** and **Check (arm64)** in your `main` branch ruleset before merging pull requests. Enable GitHub notifications for failed workflow runs and maintenance issues.

The release workflow uses GitHub's built-in `GITHUB_TOKEN` to create releases and upload files; a separate GitHub personal access token is not needed.
Checks and Dependabot pull requests do not receive Docker Hub credentials. Only the release job has write permissions and uses the `dockerhub` environment.

## Updating the project

1. Review the Dependabot pull request and its changelog. Merge after both architecture checks pass.
2. Review the maintenance issue for Alpine package changes and security findings. Package changes may require a new image release even if no Dockerfile version changed.
3. Make and test any project changes on a branch, then merge into `main`.
4. Choose a new, increasing stable version. Use a patch for compatible fixes/package refreshes, a minor for compatible new features, and a major for breaking changes.

`VERSION` is the release version source of truth. This command updates it and the image references in the README and examples:

```sh
bash release/set-version.sh 1.0.1
git diff
```

For 1.0.1, commit the version changes on a branch and open a pull request:

```sh
git switch -c chore/release-1.0.1
git add VERSION README.md examples/
git commit -m "chore: prepare release 1.0.1"
git push -u origin chore/release-1.0.1
```

Review the pull request, wait for **Check (amd64)** and **Check (arm64)**, then merge into `main`.
For the first automation setup, include the new workflow and release-script files in the commit as well.
After merging, update local `main` and tag the merged commit:

```sh
git switch main
git pull --ff-only origin main
git tag -a v1.0.1 -m "Tunlivo 1.0.1"
git push origin v1.0.1
```

If the `dockerhub` environment requires your approval, open the **Publish release** run and choose **Review deployments → Approve and deploy**.
In the current workflow this approval gates the whole release job, including the builds and tests.

Use the next unused version, not 1.0.1 repeatedly. The tag must exactly match `VERSION` and its commit must be part of `main`.
Alternatively, after committing a new version to `main`, run **Publish release** manually on `main`; the workflow creates the tag through the GitHub release.
For the first automated release, finish configuring and testing the workflows before pushing a release tag.

## Release outputs

For version `X.Y.Z`, the workflow publishes:

- GitHub release `vX.Y.Z` with `tunlivo-X.Y.Z-sources.tar.gz`, `tunlivo-X.Y.Z-licenses.tar.gz`, `packages.tsv` and `SHA256SUMS`.
- `oliverweinrich/tunlivo:X.Y.Z-sources`: source-only image, extracted using `docker create` and `docker cp`.
- `oliverweinrich/tunlivo:X.Y.Z`: tested AMD64/ARM64 runtime image.
- `oliverweinrich/tunlivo:latest`: the same runtime image.

Source collection uses the actual installed package inventory, exact Alpine build commits, verified upstream archives, and the pinned Go builder sources. The collector uses the same Alpine base as the runtime. Public source downloads and licenses in both runtime architectures are checked before pushing runtime tags.
The tested runtime image is tagged and pushed directly; it is not rebuilt after testing. Versioned tags/releases are not overwritten. `latest` moves only during an explicit release.

If publishing fails partway through, inspect the GitHub release, Actions logs and existing Docker tags before retrying. The preflight deliberately refuses an existing release or versioned image. Some assets may already be public; do not replace them with archives from a different build. Recover using the matching build, or prepare a new version.
The Docker Hub Overview is not edited by the workflow; update its example tags and source links after a release if needed.

## Local validation and release preparation

```sh
version="$(cat VERSION)"
docker build --build-arg VERSION="$version" -t "tunlivo:$version" image
bash test-integration.sh
```

Preparing release archives requires a multi-platform Docker builder, AMD64/ARM64 emulation if needed, `curl`, and `shasum`:

```sh
bash release/prepare.sh
docker buildx build --platform linux/amd64,linux/arm64 --load \
  --build-arg VERSION="$(cat VERSION)" -t "tunlivo:$(cat VERSION)" image
bash release/check.sh --local
```

`prepare.sh` deliberately refreshes the runtime package layer. The final build must reuse that builder/cache; do not add `--no-cache` between source collection and the final build. The release check rejects mismatched package inventories, runtime files, versions or license files.
It refuses to overwrite an already completed output directory. For isolated testing, set `TUNLIVO_RELEASE_DIR` to a new absolute path for both prepare/check commands. The existing public 1.0.0 artifacts must remain unchanged.
`TUNLIVO_CACHE_DIR` can select a download-cache directory. `TUNLIVO_REFRESH=0` reuses the Docker build cache for debugging; release workflows use the fresh default.

Do not run `release/publish.sh` as a test: it publishes publicly. `--check` performs only preflight checks and requires an authenticated GitHub CLI.
The hosted GitHub Actions run and secret configuration must be verified after pushing; local tests cannot validate GitHub environment settings or Docker Hub token permissions.
