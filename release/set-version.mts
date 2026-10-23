// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cli, isMain, out, read, root, write } from '../scripts/lib.mts';
import { stableVersion } from './context.mts';
export const setVersion = (next: string, directory = root): void => {
  stableVersion(next);
  const current = stableVersion(read(join(directory, 'VERSION')).trim());
  if (next === current) return;
  const before = current.split('.').map(BigInt);
  const after = next.split('.').map(BigInt);
  const changed = after.findIndex((part, index) => part !== before[index]);
  if (after[changed] < before[changed])
    throw new Error('The new version must be greater than VERSION');
  for (const file of [
    'README.md',
    ...readdirSync(join(directory, 'examples'))
      .filter((name) => /^compose\..*\.yaml$/.test(name))
      .map((name) => `examples/${name}`),
  ]) {
    const path = join(directory, file);
    write(path, read(path).replaceAll(`tunlivo:${current}`, `tunlivo:${next}`));
  }
  write(join(directory, 'VERSION'), next + '\n');
  out(
    `Version ${current} -> ${next}. Review VERSION, README.md and examples before tagging v${next}.`,
  );
};
if (isMain(import.meta.url)) await cli(() => setVersion(process.argv[2] || ''));
