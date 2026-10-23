// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { cli, isMain, out, write, read, hash } from '../../../scripts/lib.mts';
import { collectSources } from '../../../release/collect-sources.mts';
export const probe = async (): Promise<void> => {
  process.env.TUNLIVO_OUTPUT_UID = '0';
  process.env.TUNLIVO_OUTPUT_GID = '0';
  const identity = 'fixture-' + 'a'.repeat(40);
  const source = join('/output/alpine', identity, 'sources/archive.tar.gz');
  const recipe = join(
    '/output/alpine',
    identity,
    'recipe/main/fixture/APKBUILD',
  );
  const content = 'verified test-only upstream source';
  const checksum = createHash('sha512').update(content).digest('hex');
  write(source, content);
  write(
    recipe,
    `pkgname=fixture
pkgver=1
pkgrel=0
pkgdesc="Offline cached-source integrity fixture"
url="https://example.invalid"
arch="all"
license="MIT"
source="https://example.invalid/archive.tar.gz"
sha512sums="${checksum}  archive.tar.gz"
`,
  );
  write(
    join('/output/alpine', identity, 'VERIFIED'),
    'previous successful collection\n',
  );
  write(
    join('/output/licenses/alpine', identity, 'source-notices.tar.gz'),
    'fixture marker',
  );
  const inventory = (version: string) =>
    `package\tversion\tlicense\torigin\tcommit\tarchitecture\nfixture\t${version}\tMIT\tfixture\t${'a'.repeat(40)}\tx86_64\n`;
  write('/output/packages.tsv', inventory('1-r0'));
  await collectSources('/output', '/cache');
  assert.equal(read(source), content);
  write(source, 'corrupted cached source');
  const before = hash(source);
  await assert.rejects(collectSources('/output', '/cache'), /abuild failed/);
  assert.equal(
    hash(source),
    before,
    'Rejected cache must not be silently refetched or rewritten',
  );
  write(source, content);
  write('/output/packages.tsv', inventory('2-r0'));
  await assert.rejects(
    collectSources('/output', '/cache'),
    /Cached recipe version mismatch/,
  );
  out(
    'Cached sources are reverified offline; damaged bytes and mismatched versions block collection.',
  );
};
if (isMain(import.meta.url)) await cli(probe);
