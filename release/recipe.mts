// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { existsSync, renameSync, rmSync } from 'node:fs';
import { run } from '../scripts/lib.mts';
export const fetchRecipe = async (
  origin: string,
  commit: string,
  destination: string,
): Promise<void> => {
  if (!/^[a-zA-Z0-9_+.-]+$/.test(origin) || !/^[0-9a-f]{40}$/.test(commit))
    throw new Error('Invalid recipe provenance');
  const valid = (file: string): boolean => {
    if (!existsSync(file)) return false;
    const result = run('tar', ['-tzf', file], { allowFailure: true });
    const names = result.stdout.split('\n').filter(Boolean);
    if (
      names.some(
        (name) => name.startsWith('/') || name.split('/').includes('..'),
      )
    )
      throw new Error('Unsafe recipe path');
    return (
      result.status === 0 &&
      names.filter((name) => name.endsWith('/APKBUILD')).length === 1
    );
  };
  if (valid(destination)) return;
  try {
    for (const repository of ['main', 'community']) {
      const url = `https://gitlab.alpinelinux.org/api/v4/projects/alpine%2Faports/repository/archive.tar.gz?sha=${commit}&path=${repository}/${origin}`;
      const result = run(
        'curl',
        [
          '--fail',
          '--silent',
          '--show-error',
          '--location',
          '--proto',
          '=https',
          '--proto-redir',
          '=https',
          '--retry',
          '2',
          '--max-time',
          '120',
          url,
          '-o',
          destination + '.tmp',
        ],
        { allowFailure: true },
      );
      if (result.status === 0 && valid(destination + '.tmp')) {
        renameSync(destination + '.tmp', destination);
        return;
      }
    }
    throw new Error(`Cannot retrieve recipe for ${origin} at ${commit}`);
  } finally {
    rmSync(destination + '.tmp', { force: true });
  }
};
