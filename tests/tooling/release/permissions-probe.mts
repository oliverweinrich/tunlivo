// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cli, isMain, out, run, write } from '../../../scripts/lib.mts';
import { collectSources } from '../../../release/collect-sources.mts';
const userProbe = (): void => {
  const result = spawnSync(
    process.execPath,
    ['tests/tooling/release/user-write-probe.mts'],
    {
      uid: 12345,
      gid: 12345,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
};
const probe = async (): Promise<void> => {
  for (const directory of ['/output', '/cache'])
    mkdirSync(directory, { recursive: true });
  process.env.TUNLIVO_OUTPUT_UID = '12345';
  process.env.TUNLIVO_OUTPUT_GID = '12345';
  write(
    '/output/packages.tsv',
    'package\tversion\tlicense\torigin\tcommit\tarchitecture\n',
  );
  await collectSources('/output', '/cache');
  userProbe();
  writeFileSync(
    '/output/packages.tsv',
    'package\tversion\tlicense\torigin\tcommit\tarchitecture\npkg\t1\tMIT\tinvalid/origin\tinvalid\tx86_64\n',
  );
  run('chown', ['-R', '0:0', '/output', '/cache']);
  await assert.rejects(
    collectSources('/output', '/cache'),
    /Invalid recipe provenance/,
  );
  userProbe();
  out('Source output ownership survives success and failure');
};
if (isMain(import.meta.url)) await cli(probe);
