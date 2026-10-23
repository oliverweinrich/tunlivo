// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pruneNotices } from '../../../.github/prune-notices.mts';
test('partial release retries retain current provenance and remove stale sources/notices only', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-notices-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ['alpine', 'licenses/alpine'])
    for (const name of [`nodejs-${'a'.repeat(40)}`, `old-${'b'.repeat(40)}`])
      fs.mkdirSync(path.join(root, dir, name), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages.tsv'),
    `package\tversion\tlicense\torigin\tcommit\tarchitecture\nnodejs\t24\tMIT\tnodejs\t${'a'.repeat(40)}\taarch64\n`,
  );
  pruneNotices(root);
  for (const dir of ['alpine', 'licenses/alpine'])
    assert.deepEqual(fs.readdirSync(path.join(root, dir)), [
      `nodejs-${'a'.repeat(40)}`,
    ]);
  fs.writeFileSync(path.join(root, 'packages.tsv'), 'header\nbroken');
  assert.throws(() => pruneNotices(root), /Invalid/);
  assert(
    fs.existsSync(
      path.join(root, 'licenses/alpine', `nodejs-${'a'.repeat(40)}`),
    ),
  );
});
