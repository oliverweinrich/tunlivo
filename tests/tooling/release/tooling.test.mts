// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setVersion } from '../../../release/set-version.mts';
import { preflight } from '../../../release/publish.mts';
import {
  verifyChecksums,
  writeChecksums,
} from '../../../release/checksums.mts';
import { read } from '../../../scripts/lib.mts';
import { retry } from '../../integration/run.mts';
test('version updates references and rejects invalid input without mutation', () => {
  const work = mkdtempSync(join(tmpdir(), 'tunlivo-version-'));
  try {
    mkdirSync(join(work, 'examples'));
    writeFileSync(join(work, 'VERSION'), '1.0.0\n');
    writeFileSync(join(work, 'README.md'), 'tunlivo:1.0.0\n');
    writeFileSync(
      join(work, 'examples/compose.manual-server.yaml'),
      'image: oliverweinrich/tunlivo:1.0.0\n',
    );
    setVersion('1.0.1', work);
    assert.equal(read(join(work, 'VERSION')), '1.0.1\n');
    assert.match(
      read(join(work, 'examples/compose.manual-server.yaml')),
      /:1.0.1/,
    );
    for (const invalid of ['v1.0.2', '01.0.2', '1.2', '1.2.3;touch forbidden'])
      assert.throws(() => setVersion(invalid, work));
    assert.equal(read(join(work, 'VERSION')), '1.0.1\n');
    for (const lower of ['1.0.0', '0.999.999'])
      assert.throws(() => setVersion(lower, work), /must be greater/);
    setVersion('1.0.1', work);
    setVersion('1.10.0', work);
    assert.throws(() => setVersion('1.9.99', work), /must be greater/);
    assert.equal(read(join(work, 'VERSION')), '1.10.0\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
test('publication preflight permits only confirmed absence and makes no writes', () => {
  for (const status of ['200', '401', '429', '500', '404']) {
    const commands: string[] = [];
    const invoke: Parameters<typeof preflight>[0] = (command, args) => {
      commands.push(command + ' ' + args.join(' '));
      if (command === 'curl') return { status: 0, stdout: status, stderr: '' };
      assert.equal(command, 'gh');
      if (args[0] === 'repo')
        return { status: 0, stdout: 'example/test', stderr: '' };
      return { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
    };
    if (status === '404') assert.doesNotThrow(() => preflight(invoke));
    else assert.throws(() => preflight(invoke));
    assert(
      commands.every(
        (command) =>
          !command.startsWith('docker') && !command.includes('release create'),
      ),
    );
  }
  assert.throws(() =>
    preflight((command, args) =>
      command === 'curl'
        ? { status: 0, stdout: '404', stderr: '' }
        : args[0] === 'repo'
          ? { status: 0, stdout: 'example/test', stderr: '' }
          : { status: 1, stdout: '', stderr: 'HTTP 401' },
    ),
  );
});
test('release checksums reject altered artifacts and unsafe manifest paths', () => {
  const work = mkdtempSync(join(tmpdir(), 'tunlivo-hash-'));
  try {
    writeFileSync(join(work, 'artifact'), 'matching');
    writeChecksums(work, ['artifact']);
    verifyChecksums(work);
    writeFileSync(join(work, 'artifact'), 'changed');
    assert.throws(() => verifyChecksums(work));
    writeFileSync(join(work, 'SHA256SUMS'), 'a'.repeat(64) + '  ../outside\n');
    assert.throws(() => verifyChecksums(work));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
test('connection deadlines distinguish a successful probe from a timed out phase', async () => {
  await retry(() => true, 'ready', 0);
  await assert.rejects(
    retry(() => false, 'tunnel handshake', 0),
    /Timed out: tunnel handshake/,
  );
});
