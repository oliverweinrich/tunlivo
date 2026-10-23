// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  cli,
  equalFiles,
  files,
  isMain,
  out,
  run,
  write,
} from '../scripts/lib.mts';
import { context, artifacts, runtimeFiles } from './context.mts';
import { verifyChecksums } from './checksums.mts';
export const check = (local = false): void => {
  const { version, output, image } = context();
  if (!existsSync(join(output, 'COMPLETE')))
    throw new Error('Release preparation is incomplete');
  verifyChecksums(output);
  const work = mkdtempSync(join(tmpdir(), 'tunlivo-release-check-'));
  try {
    if (!local) {
      const url = process.env.RELEASE_URL || '';
      if (!url.startsWith('https://')) throw new Error('Set HTTPS RELEASE_URL');
      for (const name of artifacts(version)) {
        run('curl', [
          '--fail',
          '--location',
          '--proto',
          '=https',
          '--proto-redir',
          '=https',
          '--max-time',
          '300',
          `${url}/${name}`,
          '-o',
          join(work, name),
        ]);
        equalFiles(join(work, name), join(output, name));
      }
    }
    for (const arch of ['amd64', 'arm64']) {
      const platform = `linux/${arch}`;
      const actual = run('docker', [
        'image',
        'inspect',
        '--platform',
        platform,
        '--format',
        '{{index .Config.Labels "org.opencontainers.image.version"}}',
        image,
      ]).stdout.trim();
      if (actual !== version)
        throw new Error(`Image version ${actual} != ${version}`);
      const invoke = (entry: string, args: readonly string[]) =>
        run('docker', [
          'run',
          '--rm',
          '--platform',
          platform,
          '--network',
          'none',
          '--entrypoint',
          entry,
          image,
          ...args,
        ]);
      write(
        join(work, `packages-${arch}.tsv`),
        invoke('cat', ['/usr/share/licenses/tunlivo/packages.tsv']).stdout,
      );
      equalFiles(
        join(work, `packages-${arch}.tsv`),
        join(output, `seed/linux_${arch}/packages.tsv`),
      );
      write(
        join(work, `runtime-files-${arch}.sha256`),
        invoke('sha256sum', runtimeFiles).stdout,
      );
      equalFiles(
        join(work, `runtime-files-${arch}.sha256`),
        join(output, `seed/linux_${arch}/runtime-files.sha256`),
      );
      const notices = join(work, `licenses-${arch}`);
      mkdirSync(notices);
      // Stream the potentially large binary TAR without converting bytes to UTF-8.
      run('docker', [
        'create',
        '--platform',
        platform,
        '--name',
        `tunlivo-notices-${process.pid}-${arch}`,
        '--entrypoint',
        'true',
        image,
      ]);
      try {
        run('docker', [
          'cp',
          `tunlivo-notices-${process.pid}-${arch}:/usr/share/licenses/tunlivo/.`,
          notices,
        ]);
      } finally {
        run('docker', ['rm', `tunlivo-notices-${process.pid}-${arch}`]);
      }
      if (!existsSync(join(output, 'project/image/legal/release.json')))
        throw new Error('Missing release metadata');
      for (const file of files(join(output, 'project/image/legal')))
        equalFiles(
          file,
          join(notices, relative(join(output, 'project/image/legal'), file)),
        );
    }
    out(
      local
        ? 'Local artifacts match both images. Public availability has not been checked.'
        : 'Release artifacts and public downloads verified; no legal clearance implied.',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};
if (isMain(import.meta.url))
  await cli(() => {
    if (process.argv.slice(2).some((arg) => arg !== '--local'))
      throw new Error('Usage: check.mts [--local]');
    check(process.argv.includes('--local'));
  });
