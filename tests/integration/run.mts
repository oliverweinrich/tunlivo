// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { cli, isMain, out, root, run, read } from '../../scripts/lib.mts';
import { context } from '../../release/context.mts';
export const retry = async (
  action: () => boolean | Promise<boolean>,
  label: string,
  timeout = 90000,
): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (true) {
    if (await action()) return;
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await delay(500);
  }
};
const sanitized = (value: string) =>
  value
    .replace(/wg1\.[a-f0-9]+\.[a-f0-9]+/gi, '[invitation]')
    .replace(/[A-Za-z0-9+/]{43}=/g, '[key]');
interface Fixture {
  prefix: string;
  server: string;
  client: string;
  work: string;
  image: string;
  serverImage: string;
  clientImage: string;
  stage: string;
}
let active: Fixture | undefined;
const docker = (args: readonly string[], input?: string) =>
  run('docker', args, { input, timeout: 30000 });
const cleanup = (f: Fixture): void => {
  for (const args of [
    ['rm', '-f', `${f.prefix}-udp`, `${f.prefix}-app`, f.client, f.server],
    ['network', 'rm', f.prefix],
    ['volume', 'rm', f.server, f.client],
  ])
    run('docker', args, { allowFailure: true, timeout: 30000 });
  rmSync(f.work, { recursive: true, force: true });
  active = undefined;
};
const diagnostics = (f: Fixture): void => {
  process.stderr.write(
    `Failed stage: ${f.stage}; server=${f.serverImage}; client=${f.clientImage}\n`,
  );
  for (const name of [f.server, f.client]) {
    for (const args of [
      [
        'inspect',
        '--format',
        '{{.State.Status}} exit={{.State.ExitCode}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}',
        name,
      ],
      ['exec', name, 'wg', 'show', 'wg0', 'latest-handshakes'],
      ['exec', name, 'wg', 'show', 'wg0', 'endpoints'],
      ['exec', name, 'ip', '-4', 'route'],
      ['exec', name, 'ip', 'link', 'show', 'wg0'],
    ]) {
      const result = run('docker', args, { allowFailure: true, timeout: 5000 });
      process.stderr.write(
        sanitized(`${name} ${args[0]}: ${result.stdout}${result.stderr}`),
      );
    }
  }
};
const setup = (stage: string): Fixture => {
  const { image } = context();
  const prefix = `gateway-${stage}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const fixture = {
    stage,
    prefix,
    server: `${prefix}-server`,
    client: `${prefix}-client`,
    work: mkdtempSync(join(tmpdir(), 'gateway-check-')),
    image,
    serverImage: process.env.TUNLIVO_SERVER_IMAGE || image,
    clientImage: process.env.TUNLIVO_CLIENT_IMAGE || image,
  };
  active = fixture;
  docker(['network', 'create', prefix]);
  return fixture;
};
const gateway = (
  f: Fixture,
  role: 'server' | 'client',
  options: string[],
): void => {
  docker([
    'run',
    '-d',
    '--name',
    f[role],
    '--network',
    f.prefix,
    '--cap-drop',
    'ALL',
    ...['NET_ADMIN', 'NET_RAW', 'NET_BIND_SERVICE', 'SETUID', 'SETGID'].flatMap(
      (cap) => ['--cap-add', cap],
    ),
    '--security-opt',
    'no-new-privileges:true',
    '--read-only',
    '--tmpfs',
    '/run',
    '--tmpfs',
    '/tmp',
    ...options,
    role === 'server' ? f.serverImage : f.clientImage,
  ]);
};
const health = async (f: Fixture, name: string): Promise<void> =>
  retry(
    () =>
      run(
        'docker',
        [
          'inspect',
          '--format',
          '{{if .State.Health}}{{.State.Health.Status}}{{end}}',
          name,
        ],
        { allowFailure: true, timeout: 5000 },
      ).stdout.trim() === 'healthy',
    `${f.stage}: ${name} local readiness`,
  );
const reachable = async (f: Fixture, ip: string): Promise<void> =>
  retry(
    () =>
      run('docker', ['exec', f.client, 'ping', '-c', '1', '-W', '1', ip], {
        allowFailure: true,
        timeout: 5000,
      }).status === 0,
    `${f.stage}: client -> ${ip} tunnel`,
  );
const http = (f: Fixture): void => {
  writeFileSync(
    join(f.work, 'app.conf'),
    'events {} http { server { listen 18080; return 200 "tunnel-ok"; } }\n',
    { mode: 0o600 },
  );
  docker([
    'run',
    '-d',
    '--name',
    `${f.prefix}-app`,
    '--network',
    f.prefix,
    '-v',
    `${f.work}/app.conf:/app.conf:ro`,
    '--entrypoint',
    'nginx',
    f.image,
    '-c',
    '/app.conf',
    '-g',
    'daemon off;',
  ]);
};
const fetch = async (f: Fixture): Promise<void> =>
  retry(() => {
    const result = run(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        f.prefix,
        '--entrypoint',
        'wget',
        f.image,
        '-qO-',
        '-T',
        '2',
        `http://${f.server}:8080`,
      ],
      { allowFailure: true, timeout: 5000 },
    );
    return result.status === 0 && result.stdout === 'tunnel-ok';
  }, `${f.stage}: HTTP forwarding`);
const exercise = async (
  stage: string,
  action: (fixture: Fixture) => Promise<void>,
): Promise<void> => {
  let f: Fixture | undefined;
  try {
    f = setup(stage);
    await action(f);
  } catch (error) {
    if (active) diagnostics(active);
    throw error;
  } finally {
    if (active) cleanup(active);
  }
};
export const testManual = async (): Promise<void> =>
  exercise('manual', async (f) => {
    const keys: Record<string, { private: string; public: string }> = {};
    for (const role of ['server', 'client']) {
      const key = docker([
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'wg',
        f.image,
        'genkey',
      ]).stdout.trim();
      keys[role] = {
        private: key,
        public: docker(
          [
            'run',
            '--rm',
            '-i',
            '--network',
            'none',
            '--entrypoint',
            'wg',
            f.image,
            'pubkey',
          ],
          key + '\n',
        ).stdout.trim(),
      };
    }
    for (const role of ['server', 'client'] as const) {
      const server = role === 'server';
      const config = `PAIR_MODE=manual\nWG_ADDRESS=${server ? '10.203.77.1/24' : '10.203.77.2/32'}\nWG_PRIVATE_KEY=${keys[role].private}\nWG_PEERS=${keys[server ? 'client' : 'server'].public} ${server ? '10.203.77.2/32' : '10.203.77.1/32'} ${server ? '-' : f.server + ':51820'} ${server ? 0 : 25}\n`;
      writeFileSync(join(f.work, role + '.env'), config, { mode: 0o600 });
      gateway(f, role, [
        '--env-file',
        join(f.work, role + '.env'),
        '--env',
        server
          ? 'PROXY_ROUTES=tcp 8080 10.203.77.2:8080\nudp 8081 10.203.77.2:8081'
          : `PROXY_ROUTES=tcp 8080 ${f.prefix}-app:18080\nudp 8081 ${f.prefix}-udp:18081`,
      ]);
      // Establish local readiness before starting connection deadlines; no fixed startup sleeps.
      await health(f, f[role]);
    }
    await reachable(f, '10.203.77.1');
    http(f);
    const probe = join(root, 'tests/integration/udp-probe.mts');
    docker([
      'run',
      '-d',
      '--name',
      `${f.prefix}-udp`,
      '--network',
      f.prefix,
      '-v',
      `${probe}:/probe.mts:ro`,
      '--entrypoint',
      'node',
      f.image,
      '/probe.mts',
      'listen',
    ]);
    await fetch(f);
    await retry(() => {
      const sent = run(
        'docker',
        [
          'run',
          '--rm',
          '--network',
          f.prefix,
          '-v',
          `${probe}:/probe.mts:ro`,
          '--entrypoint',
          'node',
          f.image,
          '/probe.mts',
          'send',
          f.server,
        ],
        { allowFailure: true, timeout: 5000 },
      );
      return (
        sent.status === 0 &&
        run('docker', ['logs', `${f.prefix}-udp`], {
          allowFailure: true,
          timeout: 5000,
        }).stdout.includes('udp-ok')
      );
    }, 'UDP forwarding');
    out('OK: Manual peers, WireGuard, nginx and TCP/UDP forwarding.');
    docker(['stop', '-t', '5', `${f.prefix}-app`]);
    docker(['restart', f.server]);
    await health(f, f.server);
    docker(['start', `${f.prefix}-app`]);
    docker(['restart', f.client]);
    await health(f, f.client);
    await fetch(f);
    out(
      'OK: Gateway starts without its destination and recovers when it returns.',
    );
  });
const pairingPeer = (
  f: Fixture,
  role: 'server' | 'client',
  first = false,
): void => {
  const server = role === 'server';
  gateway(f, role, [
    '-v',
    `${f[role]}:/data`,
    '--env',
    `PAIR_MODE=${role}`,
    '--env',
    `WG_ADDRESS=${server ? '10.204.77.1/24' : '10.204.77.2/32'}`,
    '--env',
    `PAIR_PEER_ADDRESS=${server ? '10.204.77.2/32' : '10.204.77.1/32'}`,
    '--env',
    server
      ? 'PROXY_ROUTES=tcp 8080 10.204.77.2:8080'
      : `PROXY_ROUTES=tcp 8080 ${f.prefix}-app:18080`,
    ...(server
      ? []
      : [
          '--env',
          `PAIR_SERVER=${f.server}:51821`,
          '--env',
          `WG_ENDPOINT=${f.server}:51820`,
          ...(first ? ['--env-file', join(f.work, 'invitation.env')] : []),
        ]),
  ]);
};
export const testPairing = async (): Promise<void> =>
  exercise('pairing', async (f) => {
    for (const role of ['server', 'client'] as const)
      docker(['volume', 'create', f[role]]);
    pairingPeer(f, 'server');
    await retry(
      () =>
        run('docker', ['exec', f.server, 'gateway-pair', 'invite'], {
          allowFailure: true,
          timeout: 5000,
        }).status === 0,
      'server invitation readiness',
    );
    const code = docker([
      'exec',
      f.server,
      'gateway-pair',
      'renew',
    ]).stdout.trim();
    writeFileSync(join(f.work, 'invitation.env'), 'PAIR_CODE=' + code + '\n', {
      mode: 0o600,
    });
    pairingPeer(f, 'client', true);
    await health(f, f.client);
    await health(f, f.server);
    await reachable(f, '10.204.77.1');
    http(f);
    await fetch(f);
    if (
      run('docker', ['exec', f.server, 'gateway-pair', 'renew'], {
        allowFailure: true,
      }).status === 0
    )
      throw new Error('Paired server accepted renewal');
    const before = [f.server, f.client].map(
      (name) => docker(['exec', name, 'sha256sum', '/data/state.json']).stdout,
    );
    docker(['rm', '-f', f.client, f.server]);
    if (process.env.TUNLIVO_RESTART_IMAGE)
      f.serverImage = f.clientImage = process.env.TUNLIVO_RESTART_IMAGE;
    pairingPeer(f, 'server');
    pairingPeer(f, 'client');
    await health(f, f.client);
    await health(f, f.server);
    await fetch(f);
    for (const [i, name] of [f.server, f.client].entries())
      if (
        docker(['exec', name, 'sha256sum', '/data/state.json']).stdout !==
        before[i]
      )
        throw new Error('Persisted state was rewritten');
    out(
      'OK: One-time code, HTTP tunnel and recreation without a code preserve exact state.',
    );
  });
export const integration = async (): Promise<void> => {
  docker(['image', 'inspect', context().image]);
  for (const name of readdirSync(join(root, 'examples'))
    .filter((name) => /^compose\..*\.yaml$/.test(name))
    .map((name) => 'examples/' + name))
    docker(['compose', '-f', join(root, name), 'config', '--quiet']);
  await testManual();
  await testPairing();
  out('OK: All integration tests passed.');
};
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const)
  process.once(signal, () => {
    if (active) cleanup(active);
    process.exit(code);
  });
if (isMain(import.meta.url)) await cli(integration);
