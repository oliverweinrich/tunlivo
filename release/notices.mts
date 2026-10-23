// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { files, run } from '../scripts/lib.mts';
const copyright =
  'copyright|spdx-license-identifier|mozilla public license|permission is hereby granted|redistribution and use';
export const archiveNotices = (
  source: string,
  directories: readonly string[],
  destination: string,
  extra: readonly string[] = [],
): void => {
  const result = run('grep', ['-rIlZiE', copyright, ...directories], {
    cwd: source,
    allowFailure: true,
  });
  if (result.status > 1) throw new Error('Copyright discovery failed');
  const names = [
    ...new Set([...extra, ...result.stdout.split('\0').filter(Boolean)]),
  ];
  run('tar', ['-czf', destination, '--null', '-T', '-'], {
    cwd: source,
    input: names.map((name) => name + '\0').join(''),
  });
};
export const collectNotices = (source: string, destination: string): void => {
  mkdirSync(destination, { recursive: true });
  for (const directory of ['recipe', 'unpacked']) {
    for (const file of files(join(source, directory))) {
      if (
        !/license|copying|copyright|notice/i.test(file.split('/').at(-1) || '')
      )
        continue;
      const target = join(destination, relative(source, file));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(file, target);
    }
  }
  archiveNotices(
    source,
    ['recipe', 'unpacked'],
    join(destination, 'source-notices.tar.gz'),
    files(join(source, 'recipe'))
      .filter((file) => file.endsWith('/APKBUILD'))
      .map((file) => relative(source, file)),
  );
};
