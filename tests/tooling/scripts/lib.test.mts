// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  readlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyTree, equalFiles, hash } from '../../../scripts/lib.mts';
test('streamed copies preserve multi-chunk files, permissions and symlinks through overwrite and retry', () => {
  const work = mkdtempSync(join(tmpdir(), 'tunlivo-copy-'));
  try {
    mkdirSync(join(work, 'source'));
    const content = Buffer.alloc(2 * 1024 * 1024 + 17, 0x79);
    writeFileSync(join(work, 'source/archive'), content, { mode: 0o640 });
    symlinkSync('archive', join(work, 'source/link'));
    for (let i = 0; i < 2; i++)
      copyTree(join(work, 'source'), join(work, 'target'));
    assert.deepEqual(readFileSync(join(work, 'target/archive')), content);
    assert.equal(statSync(join(work, 'target/archive')).mode & 0o777, 0o640);
    assert.equal(readlinkSync(join(work, 'target/link')), 'archive');
    equalFiles(join(work, 'source/archive'), join(work, 'target/archive'));
    writeFileSync(
      join(work, 'target/archive'),
      Buffer.alloc(content.length, 0x78),
    );
    assert.throws(() =>
      equalFiles(join(work, 'source/archive'), join(work, 'target/archive')),
    );
    assert.notEqual(
      hash(join(work, 'source/archive')),
      hash(join(work, 'target/archive')),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
