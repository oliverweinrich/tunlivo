// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { cli, isMain, run, root } from '../../../scripts/lib.mts';
const testProbe = (image: string, probe: string): void => {
  if (!image) throw new Error('Expected source-helper image');
  run(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '0:0',
      '--entrypoint',
      'node',
      '-v',
      `${root}/scripts:/tools/scripts:ro`,
      '-v',
      `${root}/release:/tools/release:ro`,
      '-v',
      `${root}/tests:/tools/tests:ro`,
      '-w',
      '/tools',
      image,
      `tests/tooling/release/${probe}.mts`,
    ],
    { live: true },
  );
};
export const testPermissions = (image: string): void =>
  testProbe(image, 'permissions-probe');
export const testSourceCache = (image: string): void =>
  testProbe(image, 'cache-probe');
if (isMain(import.meta.url))
  await cli(() => testPermissions(process.argv[2] || ''));
