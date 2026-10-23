// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, join, resolve } from 'node:path';
import { cli, isMain, root, run } from './lib.mts';
export const scan = (
  image: string,
  platform = '',
  destination = process.env.TUNLIVO_SCAN_REPORT ||
    join(root, 'reports/trivy.json'),
): void => {
  if (
    !image ||
    (platform && !['linux/amd64', 'linux/arm64'].includes(platform))
  )
    throw new Error('Expected image and optional platform');
  const directory = mkdtempSync(join(tmpdir(), 'tunlivo-scan-'));
  const cache = join(root, 'release-cache/trivy');
  const report = resolve(destination);
  mkdirSync(cache, { recursive: true });
  mkdirSync(dirname(report), { recursive: true });
  try {
    run(
      'docker',
      ['build', '-t', 'tunlivo-scanner:local', join(root, '.github/scanner')],
      { live: true },
    );
    run('docker', [
      'image',
      'save',
      ...(platform ? ['--platform', platform] : []),
      '-o',
      join(directory, 'image.tar'),
      image,
    ]);
    run(
      'docker',
      [
        'run',
        '--rm',
        '--user',
        `${process.getuid?.() || 0}:${process.getgid?.() || 0}`,
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '-v',
        `${directory}:/scan:ro`,
        '-v',
        `${cache}:/cache`,
        '-v',
        `${dirname(report)}:/reports`,
        'tunlivo-scanner:local',
        'image',
        '--cache-dir',
        '/cache',
        '--scanners',
        'vuln',
        '--severity',
        'HIGH,CRITICAL',
        '--format',
        'json',
        '--output',
        '/reports/' + basename(report),
        '--exit-code',
        '1',
        '--input',
        '/scan/image.tar',
      ],
      { live: true },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
if (isMain(import.meta.url))
  await cli(() => {
    scan(process.argv[2] || '', process.argv[3]);
  });
