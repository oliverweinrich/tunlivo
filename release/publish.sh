#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
source "$(dirname "$0")/common.sh"
repository="${TUNLIVO_REPOSITORY:-oliverweinrich/tunlivo}"
[[ "$repository" =~ ^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_.-]*$ ]] || exit 1
for command in docker gh curl jq; do command -v "$command" >/dev/null; done
github_repository="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
work="$(mktemp -d "${TMPDIR:-/tmp}/tunlivo-publish.XXXXXX")"
trap 'rm -rf "$work"' EXIT
# Only an explicit 404 permits a new immutable version. Auth/network errors fail closed.
for tag in "$version" "$version-sources"; do
  status="$(curl --silent --show-error --location --max-time 30 -o "$work/tag.json" \
    -w '%{http_code}' "https://hub.docker.com/v2/repositories/$repository/tags/$tag/")"
  [[ "$status" == 404 ]] || { echo "Tag $repository:$tag exists or cannot be checked (HTTP $status). Choose a new VERSION." >&2; exit 1; }
done
if gh api "repos/$github_repository/releases/tags/v$version" > "$work/release.json" 2> "$work/release-error"; then
  echo "GitHub release v$version already exists. Inspect it before retrying; do not overwrite a release." >&2
  exit 1
elif ! grep -q 'HTTP 404' "$work/release-error"; then
  cat "$work/release-error" >&2; exit 1
fi
if [[ "${1:-}" == --check ]]; then echo "Version $version is available for a new release."; exit 0; fi
[[ $# == 0 ]] || { echo 'Usage: publish.sh [--check]' >&2; exit 1; }
bash "$root/release/check.sh" --local
mkdir -p "$work/sources"
for artifact in "tunlivo-$version-sources.tar.gz" "tunlivo-$version-licenses.tar.gz" packages.tsv SHA256SUMS; do
  cp "$output/$artifact" "$work/sources/"
done
cp "$root/release/Archives.Dockerfile" "$work/sources/Dockerfile"
docker buildx build --platform linux/amd64,linux/arm64 --load --build-arg "VERSION=$version" \
  -t "$repository:$version-sources" "$work/sources"
# Publish complete sources before making the executable images available.
gh release create "v$version" --repo "$github_repository" --target "$(git -C "$root" rev-parse HEAD)" \
  --title "Tunlivo $version" --generate-notes --draft
gh release upload "v$version" --repo "$github_repository" \
  "$output/tunlivo-$version-sources.tar.gz" "$output/tunlivo-$version-licenses.tar.gz" \
  "$output/packages.tsv" "$output/SHA256SUMS"
gh release edit "v$version" --repo "$github_repository" --draft=false
RELEASE_URL="https://github.com/$github_repository/releases/download/v$version" \
  bash "$root/release/check.sh"
docker push "$repository:$version-sources"
docker tag "$image" "$repository:$version"
docker push "$repository:$version"
docker tag "$image" "$repository:latest"
docker push "$repository:latest"
for tag in "$version" latest "$version-sources"; do
  docker manifest inspect "$repository:$tag" > "$work/$tag.json"
  jq -e '[.manifests[].platform | .os+"/"+.architecture] | (index("linux/amd64") != null) and (index("linux/arm64") != null)' \
    "$work/$tag.json" >/dev/null
done
cmp "$work/$version.json" "$work/latest.json"
echo "Published $repository:$version, :latest and :$version-sources; GitHub release v$version."
