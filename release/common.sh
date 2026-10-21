#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
# Shared release paths; source this file from Bash.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(cat "$root/VERSION")"
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'VERSION must contain a stable version such as 1.0.1.' >&2; return 1;
}
output="${TUNLIVO_RELEASE_DIR:-$root/release-output/$version}"
cache="${TUNLIVO_CACHE_DIR:-$root/release-cache}"
image="${TUNLIVO_TEST_IMAGE:-tunlivo:$version}"
