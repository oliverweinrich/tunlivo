#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/tunlivo-release-tests.XXXXXX")"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/project/release" "$work/project/examples" "$work/bin"
cp "$root/release/common.sh" "$root/release/set-version.sh" "$root/release/publish.sh" "$work/project/release/"
printf '1.0.0\n' > "$work/project/VERSION"
printf 'image: oliverweinrich/tunlivo:1.0.0\n' > "$work/project/README.md"
printf 'image: oliverweinrich/tunlivo:1.0.0\n' > "$work/project/examples/compose.manual-server.yaml"
bash "$work/project/release/set-version.sh" 1.0.1
[[ "$(cat "$work/project/VERSION")" == 1.0.1 ]]
grep -q 'tunlivo:1.0.1' "$work/project/README.md"
grep -q 'tunlivo:1.0.1' "$work/project/examples/compose.manual-server.yaml"
for invalid in v1.0.2 01.0.2 1.2 '1.2.3;touch forbidden'; do
  if bash "$work/project/release/set-version.sh" "$invalid" >/dev/null 2>&1; then
    echo "Accepted invalid version: $invalid" >&2; exit 1
  fi
  [[ "$(cat "$work/project/VERSION")" == 1.0.1 ]]
done
echo 'OK: Version bump updates documentation/examples and rejects invalid versions without changing VERSION.'
cat > "$work/bin/curl" <<'STUB'
#!/bin/sh
printf '%s' "$TUNLIVO_STUB_HTTP"
STUB
cat > "$work/bin/docker" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "$TUNLIVO_STUB_DOCKER_LOG"
exit 99
STUB
cat > "$work/bin/gh" <<'STUB'
#!/bin/sh
case "$*" in
  api\ repos/*/releases/tags/*) printf 'gh: Not Found (HTTP 404)\n' >&2; exit 1 ;;
  *) printf 'Unexpected GitHub write in preflight\n' >&2; exit 99 ;;
esac
STUB
chmod +x "$work/bin/"*
export TUNLIVO_STUB_DOCKER_LOG="$work/docker.log"
for status in 200 401 429 500; do
  if PATH="$work/bin:$PATH" TUNLIVO_STUB_HTTP="$status" GITHUB_REPOSITORY=example/test \
    bash "$work/project/release/publish.sh" --check > "$work/check.log" 2>&1; then
    echo "Preflight accepted existing/uncheckable tag: HTTP $status" >&2; exit 1
  fi
done
PATH="$work/bin:$PATH" TUNLIVO_STUB_HTTP=404 GITHUB_REPOSITORY=example/test \
  bash "$work/project/release/publish.sh" --check
[[ ! -e "$work/docker.log" ]]
echo 'OK: Preflight permits only a confirmed unused version and never invokes Docker writes.'
