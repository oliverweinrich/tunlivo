// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  cli,
  copyTree,
  equalFiles,
  isMain,
  out,
  read,
  run,
  write,
} from '../scripts/lib.mts';
import { context } from './context.mts';
import { pruneNotices } from '../.github/prune-notices.mts';
import { packageProject } from './package-project.mts';
import { writeChecksums } from './checksums.mts';
import {
  testPermissions,
  testSourceCache,
} from '../tests/tooling/release/run-permissions.mts';
export const prepare = (): void => {
  const { root, version, output, cache } = context();
  if (existsSync(join(output, 'COMPLETE')))
    throw new Error(
      'Release already prepared; use a new version or separate output',
    );
  for (const [canonical, copy] of [
    ['LICENSE', 'APACHE-2.0.txt'],
    ['NOTICE', 'NOTICE'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ])
    equalFiles(join(root, canonical), join(root, 'image/legal', copy));
  const refresh = process.env.TUNLIVO_REFRESH || '1';
  if (!['0', '1'].includes(refresh))
    throw new Error('TUNLIVO_REFRESH must be 0 or 1');
  mkdirSync(output, { recursive: true });
  mkdirSync(cache, { recursive: true });
  run(
    'docker',
    [
      'buildx',
      'build',
      ...(refresh === '1' ? ['--pull', '--no-cache-filter', 'runtime'] : []),
      '--build-arg',
      `VERSION=${version}`,
      '--platform',
      'linux/amd64,linux/arm64',
      '--target',
      'release-sources',
      '--output',
      `type=local,dest=${join(output, 'seed')}`,
      '-f',
      join(root, 'image/Dockerfile'),
      root,
    ],
    { live: true, timeout: 1200000 },
  );
  write(
    join(output, 'packages.tsv'),
    read(join(output, 'seed/linux_amd64/packages.tsv')) +
      read(join(output, 'seed/linux_arm64/packages.tsv'))
        .split('\n')
        .slice(1)
        .join('\n'),
  );
  pruneNotices(output);
  const alpine = /^FROM (alpine:[\d.]+@sha256:[a-f0-9]{64}) AS runtime$/m.exec(
    read(join(root, 'image/Dockerfile')),
  )?.[1];
  if (!alpine) throw new Error('Cannot determine pinned Alpine base');
  run(
    'docker',
    [
      'build',
      ...(refresh === '1' ? ['--pull', '--no-cache'] : []),
      '--build-arg',
      `ALPINE_IMAGE=${alpine}`,
      '-t',
      'tunlivo-source-helper:local',
      '-f',
      join(root, 'release/Source.Dockerfile'),
      root,
    ],
    { live: true, timeout: 600000 },
  );
  testPermissions('tunlivo-source-helper:local');
  testSourceCache('tunlivo-source-helper:local');
  run(
    'docker',
    [
      'run',
      '--rm',
      '--security-opt',
      'no-new-privileges:true',
      '-e',
      `TUNLIVO_OUTPUT_UID=${process.getuid?.() || 0}`,
      '-e',
      `TUNLIVO_OUTPUT_GID=${process.getgid?.() || 0}`,
      '-v',
      `${output}:/output`,
      '-v',
      `${cache}:/cache`,
      'tunlivo-source-helper:local',
    ],
    { live: true, timeout: 3600000 },
  );
  rmSync(join(root, 'image/legal/alpine'), { recursive: true, force: true });
  copyTree(join(output, 'licenses/alpine'), join(root, 'image/legal/alpine'));
  write(
    join(root, 'image/legal/release.json'),
    JSON.stringify({
      project: 'Tunlivo',
      version,
      source_archive: `tunlivo-${version}-sources.tar.gz`,
      distribution:
        'Publish the matching source archive and checksums alongside this image; see THIRD_PARTY_NOTICES.md.',
    }) + '\n',
  );
  packageProject(root, join(output, 'project'));
  for (const arch of ['amd64', 'arm64']) {
    write(
      join(output, `metadata/runtime-files-${arch}.sha256`),
      read(join(output, `seed/linux_${arch}/runtime-files.sha256`)),
    );
    write(
      join(output, `metadata/packages-${arch}.tsv`),
      read(join(output, `seed/linux_${arch}/packages.tsv`)),
    );
  }
  const source = `tunlivo-${version}-sources.tar.gz`,
    license = `tunlivo-${version}-licenses.tar.gz`;
  const options = {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    timeout: 1200000,
  };
  run(
    'tar',
    [
      '-czf',
      join(output, source),
      '-C',
      output,
      'project',
      'alpine',
      'licenses',
      'metadata',
      'packages.tsv',
    ],
    options,
  );
  copyTree(join(root, 'image/legal'), join(output, 'licenses'));
  run(
    'tar',
    ['-czf', join(output, license), '-C', output, 'licenses'],
    options,
  );
  writeChecksums(output, [source, license, 'packages.tsv']);
  write(
    join(output, 'COMPLETE'),
    'Matching sources collected and verified. Publish before runtime images.\n',
  );
  out('Release prepared: ' + output);
};
if (isMain(import.meta.url)) await cli(prepare);
