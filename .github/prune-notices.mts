// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
export function pruneNotices(output: string): void {
  const required = new Set<string>();
  const rows = fs
    .readFileSync(path.join(output, 'packages.tsv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1);
  for (const row of rows) {
    const fields = row.split('\t');
    if (
      fields.length !== 6 ||
      !/^[a-zA-Z0-9_+.-]+$/.test(fields[3]) ||
      !/^[a-f0-9]{40}$/.test(fields[4])
    )
      throw new Error('Invalid package provenance; nothing pruned');
    required.add(`${fields[3]}-${fields[4]}`);
  }
  if (!required.size) throw new Error('Empty inventory; nothing pruned');
  for (const relative of ['alpine', 'licenses/alpine']) {
    const directory = path.join(output, relative);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory)) {
      if (!required.has(entry))
        fs.rmSync(path.join(directory, entry), {
          recursive: true,
          force: true,
        });
    }
  }
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  pruneNotices(path.resolve(process.argv[2] || '.'));
