// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  collect,
  coverage,
  runtimeInventory,
  render,
} from './dependencies.mts';

test('coverage distinguishes Compose, missing updaters and release-managed images', () => {
  const config = {
    updates: [
      {
        'package-ecosystem': 'docker-compose',
        directory: '/examples',
        schedule: { interval: 'weekly' },
        ignore: [{ 'dependency-name': 'oliverweinrich/tunlivo' }],
      },
    ],
  };
  assert.match(
    coverage(config, 'docker-compose', 'examples/compose.demo.yaml', 'nginx'),
    /^Yes/,
  );
  assert.match(
    coverage(
      config,
      'docker-compose',
      'examples/compose.demo.yaml',
      'oliverweinrich/tunlivo',
    ),
    /^Excluded/,
  );
  assert.equal(
    coverage(config, 'docker', 'image/Dockerfile', 'alpine'),
    'Not configured',
  );
});

test('runtime inventory preserves architecture-specific version differences', () => {
  const tsv =
    'package\tversion\tlicense\torigin\tcommit\tarchitecture\nlib\t1.0\tMIT\tlib\tabc\tx86_64\nlib\t1.1\tMIT\tlib\tabc\taarch64\nsame\t2\tMIT\tsame\tabc\tx86_64\nsame\t2\tMIT\tsame\tabc\taarch64\n';
  const rows = runtimeInventory(tsv);
  assert.equal(rows[0].version, 'x86_64: 1.0; aarch64: 1.1');
  assert.equal(rows[1].version, '2');
  assert.throws(() => runtimeInventory('header\nbroken'), /Invalid/);
});

test('every declared image, action and npm dependency has an update policy', () => {
  const rows = collect(path.resolve(import.meta.dirname, '..'));
  assert(rows.some((r) => r.name === 'alpine' && r.coverage.startsWith('Yes')));
  assert(
    rows.some(
      (r) => r.name === 'nginx' && r.coverage.includes('docker-compose'),
    ),
  );
  assert(rows.some((r) => r.name === 'yaml (direct)'));
  assert(rows.some((r) => r.name === 'picomatch (transitive)'));
  assert(rows.some((r) => r.name === 'actions/checkout'));
  assert.deepEqual(
    rows.filter((r) => r.coverage === 'Not configured'),
    [],
  );
});

test('offline reports do not invent installed versions or upstream update dates', () => {
  const output = render([], null);
  assert.match(output, /Offline report/);
  assert.match(output, /not the upstream publication date/);
  assert.match(output, /manual major-version review/);
  assert.doesNotMatch(output, /Published-image snapshot:/);
});

test('example names are discoverable by the official Compose updater', () => {
  // Mirrors dependabot-core docker_compose/file_fetcher.rb; this updater only
  // accepts a single dot suffix, e.g. compose.manual-client.yaml.
  const pattern = /^(docker-)?compose(-[\w]+)?(\.[\w-]+)?\.ya?ml$/i;

  for (const name of fs
    .readdirSync(path.resolve(import.meta.dirname, '../examples'))
    .filter((f) => f.endsWith('.yaml'))) {
    assert.match(name, pattern);
  }
});
