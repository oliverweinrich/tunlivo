// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { hash, read, write } from '../scripts/lib.mts';
export const writeChecksums = (
  directory: string,
  names: readonly string[],
): void =>
  write(
    join(directory, 'SHA256SUMS'),
    names.map((name) => `${hash(join(directory, name))}  ${name}`).join('\n') +
      '\n',
  );
export const verifyChecksums = (directory: string): void => {
  const lines = read(join(directory, 'SHA256SUMS')).trim().split('\n');
  if (!lines.length) throw new Error('Empty checksum manifest');
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([\w.-]+)$/.exec(line);
    if (!match || hash(join(directory, match[2])) !== match[1])
      throw new Error('Release checksum mismatch');
  }
};
