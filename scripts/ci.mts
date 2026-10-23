// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cli, isMain, run, root, read, write } from './lib.mts';
import { context, stableVersion } from '../release/context.mts';
import { scan } from './scan.mts';
import { check } from '../release/check.mts';
import { testSourceCache } from '../tests/tooling/release/run-permissions.mts';
import { verifyChecksums, writeChecksums } from '../release/checksums.mts';
export const buildCandidate = (): void => {
  const { version, image } = context();
  run(
    'docker',
    [
      'buildx',
      'build',
      '--platform',
      'linux/amd64,linux/arm64',
      '--load',
      '--build-arg',
      `VERSION=${version}`,
      '-t',
      image,
      '-f',
      'image/Dockerfile',
      '.',
    ],
    { live: true, timeout: 1200000 },
  );
  check(true);
};
export const helperInventory = (
  image = 'tunlivo:source-helper-check',
): void => {
  const alpine = /^FROM (alpine:[\d.]+@sha256:[a-f0-9]{64}) AS runtime$/m.exec(
    read(join(root, 'image/Dockerfile')),
  )?.[1];
  if (!alpine) throw new Error('Cannot determine pinned Alpine base');
  run(
    'docker',
    [
      'build',
      '--pull',
      '--no-cache',
      '--build-arg',
      `ALPINE_IMAGE=${alpine}`,
      '-f',
      'release/Source.Dockerfile',
      '-t',
      image,
      '.',
    ],
    { live: true, timeout: 600000 },
  );
  testSourceCache(image);
  write(
    join(root, 'reports/source-helper-packages.tsv'),
    run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--entrypoint',
      'node',
      '-v',
      `${root}/image/runtime/inventory.mts:/inventory.mts:ro`,
      image,
      '/inventory.mts',
      '/lib/apk/db/installed',
    ]).stdout,
  );
  run('npm', ['run', 'dependencies:report'], { live: true });
  scan(image, '', join(root, 'reports/trivy-source-helper.json'));
};
export const comparePackages = (): void => {
  for (const [name, image] of [
    ['candidate', 'tunlivo:ci'],
    ['published', 'oliverweinrich/tunlivo:latest'],
  ]) {
    if (name === 'published') run('docker', ['pull', image], { live: true });
    write(
      join(root, `reports/packages-${name}.tsv`),
      run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'cat',
        image,
        '/usr/share/licenses/tunlivo/packages.tsv',
      ]).stdout,
    );
  }
  const diff = run(
    'diff',
    ['-u', 'reports/packages-published.tsv', 'reports/packages-candidate.tsv'],
    { allowFailure: true },
  );
  if (diff.status > 1) throw new Error('Package comparison failed');
  write(join(root, 'reports/packages.diff'), diff.stdout);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      diff.stdout
        ? '### Package changes compared with latest\n```diff\n' +
            diff.stdout +
            '\n```\n'
        : 'Installed package inventory matches the published image.\n',
    );
};
export const releaseRef = (): void => {
  const { version } = context();
  stableVersion(version);
  run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
  if (
    process.env.GITHUB_REF_TYPE === 'tag'
      ? process.env.GITHUB_REF_NAME !== `v${version}`
      : process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error('Release ref does not match VERSION/main');
};
export const scanCandidate = (): void => {
  const { image, output } = context();
  for (const arch of ['amd64', 'arm64'])
    scan(image, `linux/${arch}`, join(output, `trivy-${arch}.json`));
};
export const exportCandidate = (): void => {
  const { image, version } = context();
  const candidate = join(root, 'candidate');
  mkdirSync(candidate, { recursive: true });
  run('docker', ['image', 'save', '-o', join(candidate, 'image.tar'), image], {
    timeout: 1200000,
  });
  writeChecksums(candidate, ['image.tar']);
  // Keep the transfer artifact name stable for the existing workflow contract.
  write(
    join(candidate, 'image.tar.sha256'),
    read(join(candidate, 'SHA256SUMS')),
  );
  run(
    'tar',
    [
      '-czf',
      join(candidate, 'release-state.tar.gz'),
      `release-output/${version}`,
    ],
    { timeout: 1200000 },
  );
};
export const loadCandidate = (
  restore = false,
  invoke: typeof run = run,
  directory = root,
): void => {
  const { image } = context();
  const candidate = join(directory, 'candidate');
  write(
    join(candidate, 'SHA256SUMS'),
    read(join(candidate, 'image.tar.sha256')),
  );
  verifyChecksums(candidate);
  invoke('docker', ['image', 'load', '-i', join(candidate, 'image.tar')], {
    live: true,
    timeout: 1200000,
  });
  if (restore) {
    invoke('tar', ['-xzf', join(candidate, 'release-state.tar.gz')], {
      timeout: 1200000,
    });
    check(true);
    return;
  }
  const arch = process.env.EXPECTED_ARCH;
  if (!['amd64', 'arm64'].includes(arch || ''))
    throw new Error('Expected native architecture');
  const daemon = invoke('docker', [
    'info',
    '--format',
    '{{.Architecture}}',
  ]).stdout.trim();
  if (
    daemon !== (arch === 'amd64' ? 'x86_64' : 'aarch64') ||
    invoke('docker', [
      'image',
      'inspect',
      '--platform',
      `linux/${arch}`,
      '--format',
      '{{.Architecture}}',
      image,
    ]).stdout.trim() !== arch
  )
    throw new Error('Native image/runner architecture mismatch');
};
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error('Set ' + name);
  return value;
};
const actions: Record<string, () => void> = {
  host: () => {
    mkdirSync(join(root, 'reports'), { recursive: true });
    run('npm', ['run', 'test:tooling'], { live: true });
    run('npm', ['run', 'dockerhub:preview'], { live: true });
  },
  'helper-inventory': () => helperInventory(),
  'compare-packages': comparePackages,
  'release-ref': releaseRef,
  'build-candidate': buildCandidate,
  'scan-candidate': scanCandidate,
  'export-candidate': exportCandidate,
  'load-candidate': () => loadCandidate(),
  'restore-release': () => loadCandidate(true),
  'check-overview-token': () => {
    required('DOCKERHUB_OVERVIEW_TOKEN');
  },
  'docker-login': () => {
    run(
      'docker',
      [
        'login',
        '--username',
        required('DOCKERHUB_USERNAME'),
        '--password-stdin',
      ],
      { input: required('DOCKERHUB_TOKEN') },
    );
  },
};
if (isMain(import.meta.url))
  await cli(() => {
    const action = actions[process.argv[2] || ''];
    if (!action) throw new Error('Unknown CI command');
    action();
  });
