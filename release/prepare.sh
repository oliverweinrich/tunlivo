#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
export COPYFILE_DISABLE=1
root="$(cd "$(dirname "$0")/.." && pwd)"
version=1.0.0
output="$root/release-output/$version"
cache="$root/release-cache"
mkdir -p "$output" "$cache"
cmp "$root/LICENSE" "$root/image/legal/APACHE-2.0.txt"
cmp "$root/NOTICE" "$root/image/legal/NOTICE"
# An unfinished/failed attempt must never leave a valid release marker behind.
rm -f "$output/COMPLETE"
docker buildx build --platform linux/amd64,linux/arm64 --target release-sources \
  --output "type=local,dest=$output/seed" "$root/image"
{
  head -n 1 "$output/seed/linux_amd64/packages.tsv"
  tail -n +2 "$output/seed/linux_amd64/packages.tsv"
  tail -n +2 "$output/seed/linux_arm64/packages.tsv"
} > "$output/packages.tsv"
docker build -t tunlivo-source-helper:local -f "$root/release/Source.Dockerfile" "$root/release"
docker run --rm --security-opt no-new-privileges:true \
  -v "$output:/output" -v "$cache:/cache" tunlivo-source-helper:local
# Collected third-party copyrights/licenses also accompany the final runtime.
mkdir -p "$root/image/legal/alpine"
cp -R "$output/licenses/alpine/." "$root/image/legal/alpine/"
cat > "$root/image/legal/release.json" <<'JSON'
{"project":"Tunlivo","version":"1.0.0","source_archive":"tunlivo-1.0.0-sources.tar.gz","distribution":"Publish the matching source archive and checksums alongside this image; see THIRD_PARTY_NOTICES.md."}
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
  "$root/.gitignore" "$root/test-integration.sh" "$output/project/"
cp "$root/examples/CONFIGURATION.md" "$root"/examples/compose.*.yaml "$output/project/examples/"
mkdir -p "$output/project/image/pairing" "$output/project/release"
cp "$root/image/Dockerfile" "$root/image/.dockerignore" "$root/image/inventory.awk" \
  "$root/image/entrypoint.sh" "$root/image/configure.sh" "$root/image/healthcheck.sh" \
  "$output/project/image/"
cp "$root/image/pairing/"*.go "$root/image/pairing/go.mod" "$output/project/image/pairing/"
cp -R "$root/image/legal" "$output/project/image/"
cp "$root/release/Source.Dockerfile" "$root/release/"*.sh "$output/project/release/"
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
