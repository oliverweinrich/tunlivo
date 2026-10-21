#!/bin/bash
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
umask 022
# Bind-mounted files must remain writable by the host release process on Linux.
# Return ownership even when collection fails so a retry can clean up its output.
output_uid="${TUNLIVO_OUTPUT_UID:?Set the host output UID}"
output_gid="${TUNLIVO_OUTPUT_GID:?Set the host output GID}"
[[ "$output_uid" =~ ^[0-9]+$ && "$output_gid" =~ ^[0-9]+$ ]] || {
  echo 'Output UID and GID must be numeric.' >&2; exit 1;
}
restore_output_owner() {
  result=$?
  trap - EXIT
  chown -R "$output_uid:$output_gid" /output /cache || result=1
  exit "$result"
}
trap restore_output_owner EXIT
export CARCH="$(apk --print-arch)"
alpine_branch="$(cut -d. -f1,2 /etc/alpine-release)"
export DISTFILES_MIRROR="https://distfiles.alpinelinux.org/distfiles/v$alpine_branch"
# This helper only runs isolated in Docker, with release output/cache mounts.
mkdir -p /output/alpine /output/licenses/alpine /cache/recipes /cache/distfiles
awk -F '\t' 'NR>1 { print $4 "\t" $5 "\t" $2 }' /output/packages.tsv | sort -u > /tmp/origins
while IFS=$'\t' read -r origin commit version; do
  [[ "$origin" =~ ^[a-zA-Z0-9_+.-]+$ && "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo "Missing source provenance: $origin" >&2; exit 1; }
  destination="/output/alpine/$origin-$commit"
  if [[ -f "$destination/VERIFIED" && -f "/output/licenses/alpine/$origin-$commit/source-notices.tar.gz" ]]; then continue; fi
  recipe="/cache/recipes/$origin-$commit.tar.gz"
  if [[ ! -s "$recipe" ]]; then
    found=false
    for repository in main community; do
      url="https://gitlab.alpinelinux.org/api/v4/projects/alpine%2Faports/repository/archive.tar.gz?sha=$commit&path=$repository/$origin"
      if curl --fail --silent --show-error --location --retry 2 --max-time 120 "$url" -o "$recipe.tmp" && tar -tzf "$recipe.tmp" > /tmp/recipe-files && grep -q '/APKBUILD$' /tmp/recipe-files; then
        mv "$recipe.tmp" "$recipe"; found=true; break
      fi
      rm -f "$recipe.tmp"
    done
    [[ "$found" == true ]] || { echo "Cannot retrieve recipe for $origin at $commit" >&2; exit 1; }
  fi
  mkdir -p "$destination/recipe" "$destination/distfiles"
  tar -xzf "$recipe" -C "$destination/recipe" --strip-components=1
  buildfile="$(find "$destination/recipe" -name APKBUILD -type f)"
  [[ -n "$buildfile" && "$buildfile" != *$'\n'* ]] || exit 1
  directory="$(dirname "$buildfile")"
  echo "Collecting $origin ($version)"
  # APKBUILD is official Alpine build code, executed only in this disposable helper.
  (
    cd "$directory"
    actual="$(bash -c '. ./APKBUILD; printf "%s-r%s" "$pkgver" "$pkgrel"')"
    [[ "$actual" == "$version" ]] || { echo "Recipe version mismatch: $origin $actual != $version" >&2; exit 1; }
    export SRCDEST="$destination/distfiles"
    # A shared cache speeds retries; verify always runs against this exact recipe.
    source_cache="/cache/distfiles/$origin-$commit"
    mkdir -p "$source_cache"
    cp -a "$source_cache/." "$SRCDEST/"
    abuild -F fetch verify 2>&1 | tee "$destination/verification.log"
    # Keep only the source files requested by this origin, not the shared cache.
    # abuild's checksum list is authoritative and also includes local patches.
    bash -c '. ./APKBUILD; printf "%s\n" "${sha512sums:-${sha256sums:-}}"' > "$destination/checksums.txt"
    mkdir -p "$destination/sources"
    # Custom fetch functions can verify extra archives/patches not listed in the
    # top-level checksum variable (for example GNU Bash patch releases).
    # Preserve every file fetched for this origin, including those extra patches.
    cp -a "$SRCDEST/." "$destination/sources/"
    cp -a "$SRCDEST/." "$source_cache/"
    rm -rf "$destination/distfiles"
    # Unpack only the verified, upstream archives to retain their license notices.
    mkdir -p "$destination/unpacked"
    for archive in "$destination/sources/"*; do
      [[ -f "$archive" ]] || continue
      if tar -tf "$archive" >/dev/null 2>&1; then
        tar -xf "$archive" -C "$destination/unpacked"
      fi
    done
    license_root="/output/licenses/alpine/$origin-$commit"
    mkdir -p "$license_root"
    while IFS= read -r -d '' license; do
      relative="${license#"$destination/"}"
      mkdir -p "$license_root/$(dirname "$relative")"
      cp "$license" "$license_root/$relative"
    done < <(find "$destination/recipe" "$destination/unpacked" -type f \( -iname '*license*' -o -iname '*copying*' -o -iname '*copyright*' -o -iname 'notice*' \) -print0)
    # Some projects place attribution/license terms only in source-file headers
    # (for example Mozilla certdata.txt). Preserve those files verbatim in a
    # compressed bundle, including recipe authorship, rather than guessing where
    # a notice ends or relying only on LICENSE/COPYING filenames.
    (
      cd "$destination"
      find recipe -name APKBUILD -type f -print0 > "$destination/notice-files.list"
      grep -rIlZiE 'copyright|spdx-license-identifier|mozilla public license|permission is hereby granted|redistribution and use' \
        recipe unpacked >> "$destination/notice-files.list" || [[ $? == 1 ]]
      tar -czf "$license_root/source-notices.tar.gz" --null -T "$destination/notice-files.list"
    )
    rm -f "$destination/notice-files.list"
    rm -rf "$destination/unpacked"
  )
  printf '%s\t%s\t%s\n' "$origin" "$version" "$commit" > "$destination/VERIFIED"
done < /tmp/origins
# For the supported targets, source definitions must agree. Architecture-specific
# build configuration and patches are already retained in the complete recipe.
# Refuse publication rather than silently omit a target-specific source archive.
while IFS=$'\t' read -r origin commit version; do
  destination="/output/alpine/$origin-$commit"
  buildfile="$(find "$destination/recipe" -name APKBUILD -type f)"
  for architecture in aarch64 x86_64; do
    (
      cd "$(dirname "$buildfile")"
      CARCH="$architecture" bash -c '. ./APKBUILD; printf "%s\n%s\n%s\n" "$source" "${sha512sums:-}" "${sha256sums:-}"'
    ) > "$destination/source-definition-$architecture.txt"
  done
  cmp "$destination/source-definition-aarch64.txt" "$destination/source-definition-x86_64.txt" || {
    echo "Architecture-specific sources for $origin require separate collection; release blocked." >&2
    exit 1
  }
done < /tmp/origins
