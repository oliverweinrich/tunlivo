#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
export COPYFILE_DISABLE=1
root="$(cd "$(dirname "$0")/.." && pwd)"
source "$root/release/common.sh"
if [[ -f "$output/COMPLETE" ]]; then
  echo "Release already prepared at $output. Use a new VERSION or a separate TUNLIVO_RELEASE_DIR." >&2
  exit 1
fi
mkdir -p "$output" "$cache"
cmp "$root/LICENSE" "$root/image/legal/APACHE-2.0.txt"
cmp "$root/NOTICE" "$root/image/legal/NOTICE"
cmp "$root/THIRD_PARTY_NOTICES.md" "$root/image/legal/THIRD_PARTY_NOTICES.md"
# An unfinished/failed attempt must never leave a valid release marker behind.
rm -f "$output/COMPLETE"
build_options=(--build-arg "VERSION=$version")
case "${TUNLIVO_REFRESH:-1}" in
  1) build_options+=(--pull --no-cache-filter runtime) ;;
  0) ;;
  *) echo 'TUNLIVO_REFRESH must be 0 or 1.' >&2; exit 1 ;;
esac
docker buildx build "${build_options[@]}" --platform linux/amd64,linux/arm64 --target release-sources \
  --output "type=local,dest=$output/seed" "$root/image"
{
  head -n 1 "$output/seed/linux_amd64/packages.tsv"
  tail -n +2 "$output/seed/linux_amd64/packages.tsv"
  tail -n +2 "$output/seed/linux_arm64/packages.tsv"
} > "$output/packages.tsv"
alpine_image="$(awk '$1=="FROM" && $3=="AS" && $4=="runtime" {print $2}' "$root/image/Dockerfile")"
[[ "$alpine_image" =~ ^alpine:[0-9]+\.[0-9]+([.][0-9]+)?@sha256:[0-9a-f]{64}$ ]] || {
  echo 'Cannot determine pinned Alpine runtime base.' >&2; exit 1;
}
helper_options=(--build-arg "ALPINE_IMAGE=$alpine_image")
if [[ "${TUNLIVO_REFRESH:-1}" == 1 ]]; then helper_options+=(--pull --no-cache); fi
docker build "${helper_options[@]}" -t tunlivo-source-helper:local \
  -f "$root/release/Source.Dockerfile" "$root/release"
bash "$root/release/test-permissions.sh" tunlivo-source-helper:local
docker run --rm --security-opt no-new-privileges:true \
  -e "TUNLIVO_OUTPUT_UID=$(id -u)" -e "TUNLIVO_OUTPUT_GID=$(id -g)" \
  -v "$output:/output" -v "$cache:/cache" tunlivo-source-helper:local
# Collected third-party copyrights/licenses also accompany the final runtime.
mkdir -p "$root/image/legal/alpine"
cp -R "$output/licenses/alpine/." "$root/image/legal/alpine/"
cat > "$root/image/legal/release.json" <<JSON
{"project":"Tunlivo","version":"$version","source_archive":"tunlivo-$version-sources.tar.gz","distribution":"Publish the matching source archive and checksums alongside this image; see THIRD_PARTY_NOTICES.md."}
JSON
# Recreate the generated staging directory so removed/private files cannot survive a previous run.
rm -rf "$output/project"
mkdir -p "$output/project/examples" "$output/go" "$output/metadata"
for architecture in amd64 arm64; do
  cp "$output/seed/linux_$architecture/runtime-files.sha256" "$output/metadata/runtime-files-$architecture.sha256"
  cp "$output/seed/linux_$architecture/packages.tsv" "$output/metadata/packages-$architecture.tsv"
done
# Explicit allowlist: no local Compose instances, .env, keys, volumes or caches.
cp "$root/LICENSE" "$root/NOTICE" "$root/README.md" "$root/THIRD_PARTY_NOTICES.md" \
  "$root/.gitignore" "$root/VERSION" "$root/test-integration.sh" "$output/project/"
cp "$root/package.json" "$root/package-lock.json" "$root/.prettierrc.json" \
  "$root/.prettierignore" "$root/.npmrc" "$root/.node-version" "$output/project/"
mkdir -p "$output/project/docs"
cp "$root/SECURITY.md" "$root/AGENTS.md" "$root/FEATURES.md" "$root/DEPENDENCIES.md" "$output/project/"
cp "$root/docs/OPERATIONS.md" "$root/docs/VERSIONING.md" \
  "$root/docs/RELEASE_CHECKLIST.md" "$output/project/docs/"
mkdir -p "$output/project/.husky" "$output/project/.vscode"
cp "$root/.husky/pre-commit" "$root/.husky/pre-push" "$output/project/.husky/"
cp "$root/.vscode/settings.json" "$root/.vscode/extensions.json" "$output/project/.vscode/"
mkdir -p "$output/project/.github/workflows"
cp "$root/.github/dependabot.yml" "$root/.github/README.md" "$root/.github/"*.cjs "$output/project/.github/"
cp "$root/.github/workflows/"*.yml "$output/project/.github/workflows/"
cp "$root/.github/scan.sh" "$output/project/.github/"
mkdir -p "$output/project/.github/scanner"
cp "$root/.github/scanner/Dockerfile" "$output/project/.github/scanner/"
cp "$root/examples/CONFIGURATION.md" "$root"/examples/compose.*.yaml "$output/project/examples/"
mkdir -p "$output/project/image/pairing" "$output/project/release"
cp "$root/image/Dockerfile" "$root/image/.dockerignore" "$root/image/inventory.awk" \
  "$root/image/entrypoint.sh" "$root/image/configure.sh" "$root/image/healthcheck.sh" \
  "$output/project/image/"
cp "$root/image/pairing/"*.go "$root/image/pairing/go.mod" "$output/project/image/pairing/"
cp -R "$root/image/legal" "$output/project/image/"
cp "$root/release/"*Dockerfile "$root/release/"*.sh "$output/project/release/"
cp -R "$output/seed/linux_amd64/go/." "$output/go/"
cp -R "$output/seed/linux_amd64/licenses/go" "$output/licenses/"
# Inventory, source recipes/patches, upstream archives, own code, Go sources and licenses.
tar -czf "$output/tunlivo-$version-sources.tar.gz" -C "$output" \
  project alpine go licenses metadata packages.tsv
cp -R "$output/seed/linux_amd64/licenses/." "$output/licenses/"
cp -R "$root/image/legal/." "$output/licenses/"
tar -czf "$output/tunlivo-$version-licenses.tar.gz" -C "$output" licenses
(
  cd "$output"
  shasum -a 256 "tunlivo-$version-sources.tar.gz" "tunlivo-$version-licenses.tar.gz" packages.tsv > SHA256SUMS
)
printf 'Sources collected and verified. Publish artifacts before uploading the image.\n' > "$output/COMPLETE"
echo "Release-Unterlagen vorbereitet: $output"
