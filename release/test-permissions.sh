#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
image="${1:?Pass an Alpine image with Bash}"
# Use Linux container storage, not macOS bind-mount ownership translation.
docker run --rm -i --network none --user 0:0 --entrypoint /bin/bash \
  -v "$root/release/collect-sources.sh:/collector.sh:ro" "$image" -s <<'TEST'
set -euo pipefail
addgroup -g 12345 release-test
adduser -D -u 12345 -G release-test release-test
mkdir -p /output /cache
export TUNLIVO_OUTPUT_UID=12345 TUNLIVO_OUTPUT_GID=12345
printf 'architecture\tversion\tpackage\torigin\tcommit\n' > /output/packages.tsv
bash /collector.sh
su release-test -s /bin/sh -c 'mkdir /output/licenses/go; touch /cache/host-write'
# A failed source lookup must retain its failure status and restore permissions.
printf 'arch\t1\tpackage\tinvalid/origin\tinvalid\n' >> /output/packages.tsv
chown -R 0:0 /output /cache
if bash /collector.sh; then
  echo 'Invalid provenance unexpectedly succeeded.' >&2; exit 1
fi
su release-test -s /bin/sh -c 'touch /output/licenses/go/retry; rm -rf /cache/recipes'
echo 'OK: Source output is writable by the non-root host user after success and failure.'
TEST
