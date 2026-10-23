// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import {
  address,
  endpointOK,
  load,
  save,
  locked,
  invitation,
  pairingServer,
  pinnedRequest,
} from '../../image/runtime/pair.mts';
import { inventory } from '../../image/runtime/inventory.mts';
const publicKey = (n: number) => Buffer.alloc(32, n).toString('base64');
function fixture(t: TestContext): string {
  const old = process.env.PAIR_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-test-'));
  process.env.PAIR_DATA_DIR = dir;
  t.after(() => {
    if (old === undefined) delete process.env.PAIR_DATA_DIR;
    else process.env.PAIR_DATA_DIR = old;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  locked('initialize', ['server']);
  return dir;
}
function redeem(token: string, key: string, address = '10.66.66.2/32'): number {
  return (
    JSON.parse(
      locked(
        'register',
        ['10.66.66.1/32', '10.66.66.2/32'],
        JSON.stringify({ token, body: { Public: key, Address: address } }),
      ),
    ) as { status: number }
  ).status;
}
test('registration enforces token, address, key, expiry and single identity; retry is idempotent', (t) => {
  fixture(t);
  const s = load();
  assert.equal(redeem('wrong', publicKey(2)), 403);
  assert.equal(redeem(s.Token, publicKey(2), '10.66.66.99/32'), 400);
  assert.equal(redeem(s.Token, 'invalid'), 400);
  assert.equal(redeem(s.Token, publicKey(2)), 200);
  assert.equal(redeem(s.Token, publicKey(2)), 200);
  assert.equal(redeem(s.Token, publicKey(3)), 409);
  const saved = load();
  saved.Expires = new Date(0).toISOString();
  save(saved);
  assert.equal(redeem(s.Token, publicKey(2)), 403);
});
test('concurrent processes redeem a token for only one distinct identity', async (t) => {
  fixture(t);
  const token = load().Token;
  async function redeemProcess(key: string): Promise<number> {
    const child = spawn(
      'flock',
      [
        '-x',
        '-o',
        path.join(process.env.PAIR_DATA_DIR!, 'state.lock'),
        process.execPath,
        new URL('../../image/runtime/pair.mts', import.meta.url).pathname,
        '--locked',
        'register',
        '10.66.66.1/32',
        '10.66.66.2/32',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stdin.end(
      JSON.stringify({
        token,
        body: { Public: key, Address: '10.66.66.2/32' },
      }),
    );
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
    return (JSON.parse(output) as { status: number }).status;
  }
  assert.deepEqual(
    (
      await Promise.all([
        redeemProcess(publicKey(2)),
        redeemProcess(publicKey(3)),
      ])
    ).sort(),
    [200, 409],
  );
});
test('legacy Go state encoding and existing invitations remain unchanged on initialization', (t) => {
  const dir = fixture(t),
    before = fs.readFileSync(path.join(dir, 'state.json'));
  const s = load();
  assert(
    s.Certificate &&
      Buffer.from(s.Certificate, 'base64')
        .toString()
        .startsWith('-----BEGIN CERTIFICATE-----'),
  );
  assert.equal(
    invitation(s),
    `wg1.${createHash('sha256')
      .update(new X509Certificate(Buffer.from(s.Certificate, 'base64')).raw)
      .digest('hex')}.${s.Token}`,
  );
  locked('initialize', ['server']);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'state.json')), before);
  assert.equal(fs.statSync(path.join(dir, 'state.json')).mode & 0o777, 0o600);
});
test('invalid state is never replaced and a different role is rejected', (t) => {
  const dir = fixture(t);
  assert.throws(() => locked('initialize', ['client']));
  fs.writeFileSync(path.join(dir, 'state.json'), 'broken', { mode: 0o600 });
  assert.throws(() => locked('initialize', ['server']));
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), 'broken');
});
test('pinned TLS rejects a wrong fingerprint before sending credentials and accepts the right one', async (t) => {
  fixture(t);
  const oldAddress = process.env.WG_ADDRESS;
  process.env.WG_ADDRESS = '10.66.66.1/24';
  t.after(() => {
    if (oldAddress === undefined) delete process.env.WG_ADDRESS;
    else process.env.WG_ADDRESS = oldAddress;
  });
  const server = pairingServer();
  let requests = 0;
  server.on('request', () => requests++);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const bound = server.address();
  assert(bound && typeof bound === 'object');
  const host = `127.0.0.1:${bound.port}`,
    s = load();
  await assert.rejects(
    pinnedRequest(host, Buffer.alloc(32), s.Token, {
      Public: publicKey(2),
      Address: '10.66.66.2/32',
    }),
    /fingerprint/,
  );
  assert.equal(requests, 0);
  const pin = createHash('sha256')
    .update(new X509Certificate(Buffer.from(s.Certificate!, 'base64')).raw)
    .digest();
  const reply = await pinnedRequest(host, pin, s.Token, {
    Public: publicKey(2),
    Address: '10.66.66.2/32',
  });
  assert.equal(reply.Public, s.Public);
  assert.equal(requests, 1);
});
test('address/endpoint validation rejects injection and inventory preserves APK provenance', () => {
  assert.equal(address('10.66.66.1/24'), '10.66.66.1/32');
  for (const invalid of [
    '999.1.1.1/24',
    '10.1.1.1/33',
    '10.1.1.1/24\nPublicKey=x',
    '::1/64',
  ])
    assert.throws(() => address(invalid));
  assert(endpointOK('example.com:51820'));
  assert(!endpointOK('host:0'));
  assert(!endpointOK('host:51820\nInjection'));
  assert.equal(
    inventory('P:nodejs\nV:24.18.1-r0\nL:MIT\no:nodejs\nc:abc\nA:aarch64\n'),
    'package\tversion\tlicense\torigin\tcommit\tarchitecture\nnodejs\t24.18.1-r0\tMIT\tnodejs\tabc\taarch64\n',
  );
});
