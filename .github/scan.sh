#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
image="${1:?Usage: bash .github/scan.sh IMAGE [linux/amd64|linux/arm64]}"
platform="${2:-}"
[[ -z "$platform" || "$platform" == linux/amd64 || "$platform" == linux/arm64 ]] || exit 1
report="${TUNLIVO_SCAN_REPORT:-$root/reports/trivy.json}"
mkdir -p "$(dirname "$report")" "$root/release-cache/trivy"
report_directory="$(cd "$(dirname "$report")" && pwd)"
report_name="$(basename "$report")"
work="$(mktemp -d "${TMPDIR:-/tmp}/tunlivo-scan.XXXXXX")"
trap 'rm -rf "$work"' EXIT
docker build -t tunlivo-scanner:local "$root/.github/scanner"
save_options=(-o "$work/image.tar")
if [[ -n "$platform" ]]; then save_options+=(--platform "$platform"); fi
docker image save "${save_options[@]}" "$image"
# No Docker socket: inspect the exported image read-only and write only reports/cache.
docker run --rm --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges:true \
  --read-only --tmpfs /tmp \
  -v "$work:/scan:ro" -v "$root/release-cache/trivy:/cache" -v "$report_directory:/reports" \
  tunlivo-scanner:local image --cache-dir /cache --scanners vuln --severity HIGH,CRITICAL \
  --format json --output "/reports/$report_name" --exit-code 1 --input /scan/image.tar
