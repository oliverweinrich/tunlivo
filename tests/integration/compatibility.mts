// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const baseline = JSON.parse(
  fs.readFileSync(
    path.join(root, 'tests/integration/compatibility-baseline.json'),
    'utf8',
  ),
) as { image: string };
if (
  !/^oliverweinrich\/tunlivo:1\.0\.3@sha256:[a-f0-9]{64}$/.test(baseline.image)
)
  throw new Error('Invalid immutable migration baseline');
execFileSync('docker', ['pull', baseline.image], { stdio: 'inherit' });
const candidate =
  process.env.TUNLIVO_TEST_IMAGE ||
  `tunlivo:${fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()}`;
for (const [server, client, restart] of [
  [baseline.image, candidate, candidate],
  [candidate, baseline.image, candidate],
  [baseline.image, baseline.image, candidate],
  [candidate, candidate, baseline.image],
]) {
  console.log(
    `Checking compatibility: server=${server === baseline.image ? 'Go' : 'TypeScript'}, client=${client === baseline.image ? 'Go' : 'TypeScript'}, recreate=${restart === baseline.image ? 'Go' : 'TypeScript'}.`,
  );
  execFileSync(process.execPath, ['tests/integration/run.mts'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TUNLIVO_TEST_IMAGE: candidate,
      TUNLIVO_SERVER_IMAGE: server,
      TUNLIVO_CLIENT_IMAGE: client,
      TUNLIVO_RESTART_IMAGE: restart,
    },
  });
}
