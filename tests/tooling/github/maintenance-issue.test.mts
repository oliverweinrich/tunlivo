// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import notify from '../../../.github/maintenance-issue.mts';
import type {
  Issue,
  IssueChange,
} from '../../../.github/maintenance-issue.mts';
import type { TestContext } from 'node:test';

function fixture(t: TestContext, existing: Issue[] = []) {
  const cwd = process.cwd();
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'tunlivo-issue-test-'),
  );
  process.chdir(directory);
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true });
  });
  for (const arch of ['amd64', 'arm64']) {
    const report = `reports/maintenance-${arch}`;
    fs.mkdirSync(report, { recursive: true });
    fs.writeFileSync(`${report}/packages.diff`, '');
    fs.writeFileSync(`${report}/trivy.json`, JSON.stringify({ Results: [] }));
  }
  const writes: (IssueChange & { action: string })[] = [];
  const github = {
    paginate: async () => existing,
    rest: {
      issues: {
        listForRepo: () => {},
        create: async (value: IssueChange) =>
          writes.push({ action: 'create', ...value }),
        update: async (value: IssueChange) =>
          writes.push({ action: 'update', ...value }),
      },
    },
  };
  const context = {
    repo: { owner: 'example', repo: 'gateway' },
    serverUrl: 'https://github.com',
    runId: 123,
  };
  return { github, context, writes };
}

test('clean reports do not create an issue', async (t) => {
  const f = fixture(t);
  await notify({ ...f, result: 'success' });
  assert.equal(f.writes.length, 0);
});
test('package updates create an actionable issue', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    'reports/maintenance-amd64/packages.diff',
    '-nginx old\n+nginx new',
  );
  await notify({ ...f, result: 'success' });
  assert.equal(f.writes[0].action, 'create');
  assert.match(f.writes[0].body!, /nginx new/);
  assert.match(f.writes[0].body!, /actions\/runs\/123/);
});
test('known vulnerabilities update the existing issue', async (t) => {
  const f = fixture(t, [{ title: 'Dependency maintenance', number: 7 }]);
  fs.writeFileSync(
    'reports/maintenance-arm64/trivy.json',
    JSON.stringify({
      Results: [
        {
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-TEST',
              PkgName: 'test',
              InstalledVersion: '1',
              Severity: 'HIGH',
            },
          ],
        },
      ],
    }),
  );
  await notify({ ...f, result: 'failure' });
  assert.equal(f.writes[0].action, 'update');
  assert.equal(f.writes[0].issue_number, 7);
  assert.match(f.writes[0].body!, /CVE-TEST/);
});
test('resolved checks close the existing issue', async (t) => {
  const f = fixture(t, [{ title: 'Dependency maintenance', number: 7 }]);
  await notify({ ...f, result: 'success' });
  assert.equal(f.writes[0].state, 'closed');
});
test('missing or unreadable reports remain visible', async (t) => {
  const f = fixture(t);
  fs.writeFileSync('reports/maintenance-amd64/trivy.json', 'broken');
  fs.rmSync('reports/maintenance-arm64/trivy.json');
  await notify({ ...f, result: 'success' });
  assert.match(f.writes[0].body!, /unreadable/);
  assert.match(f.writes[0].body!, /missing/);
});
test('failed checks are reported even when no artifacts exist', async (t) => {
  const f = fixture(t);
  fs.rmSync('reports', { recursive: true });
  await notify({ ...f, result: 'failure' });
  assert.match(f.writes[0].body!, /found 0/);
});
