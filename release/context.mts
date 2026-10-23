// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from 'node:path';
import { root, read } from '../scripts/lib.mts';
export const stableVersion = (value: string): string => {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    throw new Error('Expected stable VERSION');
  return value;
};
export const context = () => {
  const version = stableVersion(read(join(root, 'VERSION')).trim());
  return {
    root,
    version,
    output: resolve(
      process.env.TUNLIVO_RELEASE_DIR || join(root, 'release-output', version),
    ),
    cache: resolve(
      process.env.TUNLIVO_CACHE_DIR || join(root, 'release-cache'),
    ),
    image: process.env.TUNLIVO_TEST_IMAGE || `tunlivo:${version}`,
  };
};
export const artifacts = (version: string) => [
  `tunlivo-${version}-sources.tar.gz`,
  `tunlivo-${version}-licenses.tar.gz`,
  'packages.tsv',
  'SHA256SUMS',
];
export const runtimeFiles = [
  '/opt/tunlivo/image/runtime/gateway.mts',
  '/opt/tunlivo/image/runtime/pair.mts',
  '/opt/tunlivo/image/runtime/inventory.mts',
];
