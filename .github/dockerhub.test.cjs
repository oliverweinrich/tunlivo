// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { parse } = require('yaml');
const { render, publish } = require('./dockerhub.cjs');
const root = path.resolve(__dirname, '..');
const env = { DOCKERHUB_USERNAME: 'test-user', DOCKERHUB_TOKEN: 'test-secret' };

test('overview uses current version, immutable links and actual Compose examples', () => {
  const ref = 'a'.repeat(40);
  const result = render(root, {
    sourceRef: ref,
    repository: 'example/gateway',
  });
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  assert(result.overview.includes(`example/gateway:${version}-sources`));
  assert(result.overview.includes(`/blob/${ref}/examples/CONFIGURATION.md`));
  assert(!result.overview.includes('{{'));
  const examples = [...result.overview.matchAll(/```yaml\n([\s\S]*?)```/g)];
  assert.equal(examples.length, 2);
  for (const [, text] of examples)
    assert.equal(
      parse(text).services.gateway.image,
      `example/gateway:${version}`,
    );
  assert.equal(
    parse(examples[1][1]).services.hello.image,
    parse(
      fs.readFileSync(
        path.join(root, 'examples/compose.pairing-client.yaml'),
        'utf8',
      ),
    ).services.hello.image,
  );
  assert.throws(() => render(root, { sourceRef: 'main' }), /commit SHA/);
  assert.throws(
    () => render(root, { sourceRef: ref, repository: '../invalid' }),
    /repository/,
  );
});

function hub(options = {}) {
  const calls = [];
  const candidate = {
    repository: 'example/gateway',
    version: '1.2.3',
    overview: '# Test overview\n',
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    let value;
    if (url.endsWith('/tags/1.2.3')) value = { digest: 'sha256:tested' };
    else if (url.endsWith('/tags/latest'))
      value = { digest: options.mismatch ? 'sha256:other' : 'sha256:tested' };
    else if (url.endsWith('/auth/token'))
      value = { access_token: 'mock-access-token' };
    else
      value = {
        full_description: options.badReadback ? 'old text' : candidate.overview,
      };
    return {
      ok: !(options.patchDenied && init.method === 'PATCH'),
      status: options.patchDenied && init.method === 'PATCH' ? 403 : 200,
      json: async () => value,
    };
  };
  return { calls, candidate, fetchImpl };
}

test('sync modifies only full_description and verifies the saved content', async () => {
  const h = hub();
  await publish(h.candidate, env, h.fetchImpl);
  const patch = h.calls.find((call) => call.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch.body), {
    full_description: h.candidate.overview,
  });
  assert.equal(patch.headers.Authorization, 'Bearer mock-access-token');
  assert(
    h.calls.every(
      (call) =>
        call.url.startsWith('https://hub.docker.com/v2/') &&
        call.redirect === 'error',
    ),
  );
});

test('sync refuses an old/unpublished version before authentication or mutation', async () => {
  const h = hub({ mismatch: true });
  await assert.rejects(
    publish(h.candidate, env, h.fetchImpl),
    /published latest/,
  );
  assert.equal(h.calls.length, 2);
  await assert.rejects(
    publish(h.candidate, {}, h.fetchImpl),
    /DOCKERHUB_USERNAME/,
  );
});

test('permission and readback failures are actionable and do not expose credentials', async () => {
  for (const options of [{ patchDenied: true }, { badReadback: true }]) {
    const h = hub(options);
    await assert.rejects(publish(h.candidate, env, h.fetchImpl), (error) => {
      assert(!error.message.includes(env.DOCKERHUB_TOKEN));
      return /retry/.test(error.message);
    });
  }
});
