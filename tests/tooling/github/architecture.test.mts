// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { files, read, root } from '../../../scripts/lib.mts';
import { parse } from 'yaml';
test('own tests live under tests/ and no nested manifests or obsolete languages remain', () => {
  for (const directory of ['image', 'scripts', 'release', 'tests', '.github'])
    for (const file of files(join(root, directory))) {
      if (file.includes('/legal/')) continue;
      const name = relative(root, file);
      assert(
        !/\.(sh|py|go|cjs|js)$/.test(name),
        'Obsolete own script: ' + name,
      );
      assert(
        !name.endsWith('/package.json') && !name.endsWith('/package-lock.json'),
        'Nested manifest: ' + name,
      );
      if (name.endsWith('.test.mts') || read(file).includes("from 'node:test'"))
        assert(name.startsWith('tests/'), 'Test outside tests/: ' + name);
    }
});
test('Node type declaration major follows the supported Node runtime and Dependabot policy', () => {
  const pkg = JSON.parse(read(join(root, 'package.json'))) as {
    devDependencies: Record<string, string>;
  };
  const major = read(join(root, '.node-version')).trim();
  assert.equal(pkg.devDependencies['@types/node'].split('.')[0], major);
  const config = parse(read(join(root, '.github/dependabot.yml'))) as {
    updates: {
      'package-ecosystem': string;
      ignore?: { 'dependency-name': string; 'update-types'?: string[] }[];
    }[];
  };
  assert(
    config.updates
      .find((item) => item['package-ecosystem'] === 'npm')
      ?.ignore?.some(
        (item) =>
          item['dependency-name'] === '@types/node' &&
          item['update-types']?.includes('version-update:semver-major'),
      ),
  );
});
