// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../../../scripts/lib.mts';
import { loadCandidate } from '../../../scripts/ci.mts';
test('candidate loading verifies bytes before Docker and refuses non-native runners', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'tunlivo-candidate-'));
  const previous = process.env.EXPECTED_ARCH;
  process.env.EXPECTED_ARCH = 'arm64';
  t.after(() => {
    if (previous === undefined) delete process.env.EXPECTED_ARCH;
    else process.env.EXPECTED_ARCH = previous;
    rmSync(directory, { recursive: true, force: true });
  });
  mkdirSync(join(directory, 'candidate'));
  const image = join(directory, 'candidate/image.tar');
  writeFileSync(image, 'verified candidate bytes');
  writeFileSync(
    join(directory, 'candidate/image.tar.sha256'),
    `${hash(image)}  image.tar\n`,
  );
  const calls: string[] = [];
  let native = true;
  const invoke: Parameters<typeof loadCandidate>[1] = (command, args) => {
    assert.equal(command, 'docker');
    calls.push(args.join(' '));
    return {
      status: 0,
      stderr: '',
      stdout:
        args[0] === 'info'
          ? native
            ? 'aarch64'
            : 'x86_64'
          : args[1] === 'inspect'
            ? 'arm64'
            : '',
    };
  };
  loadCandidate(false, invoke, directory);
  assert(calls.some((call) => call.startsWith('image load')));
  native = false;
  assert.throws(
    () => loadCandidate(false, invoke, directory),
    /Native image\/runner architecture mismatch/,
  );
  calls.length = 0;
  writeFileSync(image, 'tampered candidate bytes');
  assert.throws(
    () => loadCandidate(false, invoke, directory),
    /checksum mismatch/,
  );
  assert.deepEqual(calls, []);
});
