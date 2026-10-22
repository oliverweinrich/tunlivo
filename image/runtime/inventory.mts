// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
export function inventory(text: string): string {
  const columns = ['P', 'V', 'L', 'o', 'c', 'A'];
  const rows = ['package\tversion\tlicense\torigin\tcommit\tarchitecture'];
  for (const block of text.split(/\n\s*\n/)) {
    const fields = new Map(
      block
        .split('\n')
        .filter((line) => line[1] === ':')
        .map((line) => [line[0], line.slice(2)]),
    );
    if (fields.has('P'))
      rows.push(columns.map((key) => fields.get(key) || '').join('\t'));
  }
  return rows.join('\n') + '\n';
}
if (process.argv[2])
  process.stdout.write(inventory(readFileSync(process.argv[2], 'utf8')));
