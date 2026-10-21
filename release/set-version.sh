#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
source "$(dirname "$0")/common.sh"
next="${1:?Usage: bash release/set-version.sh 1.0.1}"
[[ "$next" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Use a stable version such as 1.0.1.' >&2; exit 1;
}
[[ "$next" != "$version" ]] || { echo "Already at $version"; exit 0; }
for file in "$root/README.md" "$root"/examples/compose.*.yaml; do
  temporary="$(mktemp "$file.XXXXXX")"
  awk -v old="tunlivo:$version" -v new="tunlivo:$next" '{
    while ((position=index($0,old))>0) {
      result=result substr($0,1,position-1) new
      $0=substr($0,position+length(old))
    }
    print result $0; result=""
  }' "$file" > "$temporary"
  cat "$temporary" > "$file"
  rm -f "$temporary"
done
printf '%s\n' "$next" > "$root/VERSION"
echo "Version $version -> $next. Review and commit VERSION, README.md and examples before tagging v$next."
