#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
output="$root/release-output/1.0.0"
mode="${1:-public}"
image="${TUNLIVO_TEST_IMAGE:-tunlivo:1.0.0}"
[[ "$mode" == public || "$mode" == --local ]] || { echo 'Aufruf: check.sh [--local]' >&2; exit 1; }
if [[ "$mode" == public ]]; then
  : "${RELEASE_URL:?Öffentliche HTTPS-Adresse des Release-Verzeichnisses mit Quellen, Lizenzen und Checksummen setzen}"
  [[ "$RELEASE_URL" == https://* ]] || exit 1
fi
test -f "$output/COMPLETE"
(cd "$output" && shasum -a 256 -c SHA256SUMS)
work="$(mktemp -d "${TMPDIR:-/tmp}/tunlivo-release-check.XXXXXX")"
trap 'rm -rf "$work"' EXIT
if [[ "$mode" == public ]]; then
for artifact in tunlivo-1.0.0-sources.tar.gz tunlivo-1.0.0-licenses.tar.gz packages.tsv SHA256SUMS; do
  curl --fail --location --proto '=https' --proto-redir '=https' --max-time 300 \
    "$RELEASE_URL/$artifact" -o "$work/$artifact"
  cmp "$work/$artifact" "$output/$artifact"
done
fi
# Compare release sources against the actual locally prepared multi-arch image.
for architecture in amd64 arm64; do
  docker run --rm --platform "linux/$architecture" --network none --entrypoint cat \
    "$image" /usr/share/licenses/tunlivo/packages.tsv > "$work/packages-$architecture.tsv"
  cmp "$work/packages-$architecture.tsv" "$output/seed/linux_$architecture/packages.tsv"
  docker run --rm --platform "linux/$architecture" --network none --entrypoint sha256sum \
    "$image" /usr/local/bin/gateway-pair /usr/local/bin/entrypoint.sh \
    /usr/local/bin/healthcheck.sh /usr/local/bin/configure.sh /usr/local/share/tunlivo/inventory.awk \
    > "$work/runtime-files-$architecture.sha256"
  cmp "$work/runtime-files-$architecture.sha256" "$output/seed/linux_$architecture/runtime-files.sha256"
  # Verify the notices actually shipped in the image, not only package/code hashes.
  test -f "$output/project/image/legal/release.json"
  license_dir="$work/licenses-$architecture"
  mkdir -p "$license_dir"
  docker run --rm --platform "linux/$architecture" --network none --entrypoint tar \
    "$image" -C /usr/share/licenses/tunlivo -cf - . > "$work/licenses-$architecture.tar"
  tar -xf "$work/licenses-$architecture.tar" -C "$license_dir"
  while IFS= read -r -d '' notice; do
    relative="${notice#"$output/project/image/legal/"}"
    cmp "$notice" "$license_dir/$relative"
  done < <(find "$output/project/image/legal" -type f -print0)
  diff -r "$output/seed/linux_$architecture/licenses/go" "$license_dir/go"
done
if [[ "$mode" == --local ]]; then
  echo 'Lokale Artefakte und Image stimmen überein. Öffentliche Quellenbereitstellung noch nicht geprüft.'
else
  echo 'Technische Release-Prüfung erfolgreich. Keine rechtliche Freigabe/Markenprüfung.'
fi
