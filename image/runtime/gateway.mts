// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import * as fs from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { isIPv4 } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { address, keyOK, endpointOK, load, pairedConfig } from './pair.mts';
const directory = '/run/gateway';
const command = (name: string, args: string[]) => {
  const result = spawnSync(name, args, {
    encoding: 'utf8',
    stdio:
      name === 'nginx'
        ? ['ignore', 'ignore', 'inherit']
        : ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error(`${name} failed`);
  return result.stdout || '';
};
function port(value: string): number {
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error('Invalid port');
  return Number(value);
}
export function configure(): void {
  const env = process.env;
  address(env.WG_ADDRESS || '');
  if (!keyOK(env.WG_PRIVATE_KEY)) throw new Error('Invalid WG_PRIVATE_KEY');
  if (!env.WG_PEERS?.trim()) throw new Error('WG_PEERS is required');
  const listen = port(env.WG_LISTEN_PORT || '51820');
  const mtu = env.WG_MTU || '1420';
  if (!/^\d{3,4}$/.test(mtu) || Number(mtu) < 576 || Number(mtu) > 9000)
    throw new Error('Invalid WG_MTU');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let wireguard = `[Interface]\nAddress = ${env.WG_ADDRESS}\nPrivateKey = ${env.WG_PRIVATE_KEY}\nListenPort = ${listen}\nMTU = ${mtu}\n`;
  for (const line of env.WG_PEERS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [publicKey, allowed, endpoint, keepalive, extra] =
      trimmed.split(/\s+/);
    if (
      !keyOK(publicKey) ||
      !allowed ||
      extra ||
      !/^\d{1,5}$/.test(keepalive || '') ||
      Number(keepalive) > 65535
    )
      throw new Error('Invalid WG_PEERS line');
    for (const cidr of allowed.split(',')) address(cidr);
    if (endpoint !== '-' && !endpointOK(endpoint || ''))
      throw new Error('Invalid peer endpoint');
    wireguard += `\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${allowed}\nPersistentKeepalive = ${Number(keepalive)}\n`;
    if (endpoint !== '-') wireguard += `Endpoint = ${endpoint}\n`;
  }
  fs.writeFileSync(`${directory}/wg0.conf`, wireguard, { mode: 0o600 });
  fs.writeFileSync(
    `${directory}/nginx.conf`,
    `load_module /usr/lib/nginx/modules/ngx_stream_module.so;
user nginx;
worker_processes 1;
pid /run/gateway/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
stream {
    resolver 127.0.0.11 ipv6=off valid=5s;
    resolver_timeout 3s;
    include /run/gateway/proxies.conf;
}
`,
    { mode: 0o600 },
  );
  let proxies = '',
    count = 0;
  const used = new Set<string>();
  for (const line of (env.PROXY_ROUTES || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [protocol, listenPort, target, extra] = trimmed.split(/\s+/);
    if (
      !['tcp', 'udp'].includes(protocol) ||
      !endpointOK(target || '') ||
      extra
    )
      throw new Error('Invalid PROXY_ROUTES line');
    const numeric = port(listenPort || '');
    if (used.has(`${protocol}:${numeric}`))
      throw new Error('Duplicate proxy listener');
    used.add(`${protocol}:${numeric}`);
    count++;
    proxies += `upstream route_${count} { zone route_${count} 64k; server ${target} resolve; }
server {
    listen ${numeric}${protocol === 'udp' ? ' udp' : ''};
    proxy_connect_timeout 5s;
    proxy_timeout ${protocol === 'udp' ? '60s' : '1h'};
    proxy_pass route_${count};
}
`;
  }
  fs.writeFileSync(`${directory}/proxies.conf`, proxies, { mode: 0o600 });
  command('nginx', ['-t', '-c', `${directory}/nginx.conf`]);
}
export function health(): boolean {
  try {
    if (!fs.existsSync(`${directory}/ready`)) return false;
    command('wg', ['show', 'wg0']);
    if (!/\bUP\b/.test(command('ip', ['link', 'show', 'wg0']))) return false;
    const pid = fs.readFileSync(`${directory}/nginx.pid`, 'utf8').trim();
    if (!/^\d+$/.test(pid) || Number(pid) < 1) return false;
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
async function start(): Promise<void> {
  const children: ChildProcess[] = [];
  let closing = false,
    failure = false;
  async function cleanup(code: number): Promise<void> {
    if (closing) return;
    closing = true;
    fs.rmSync(`${directory}/ready`, { force: true });
    for (const child of children)
      if (child.exitCode === null) child.kill('SIGTERM');
    await Promise.race([
      Promise.all(
        children.map((child) =>
          child.exitCode !== null || child.signalCode
            ? Promise.resolve()
            : new Promise<void>((resolve) =>
                child.once('exit', () => resolve()),
              ),
        ),
      ),
      delay(5000),
    ]);
    for (const child of children)
      if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
    const up =
      spawnSync('wg', ['show', 'wg0'], { stdio: 'ignore' }).status === 0;
    if (up)
      spawnSync('wg-quick', ['down', `${directory}/wg0.conf`], {
        stdio: 'ignore',
      });
    process.exit(code);
  }
  process.on('SIGTERM', () => void cleanup(0));
  process.on('SIGINT', () => void cleanup(0));
  function child(name: string, args: string[]): ChildProcess {
    const c = spawn(name, args, { stdio: 'inherit' });
    children.push(c);
    c.on('error', () => {
      failure = true;
      void cleanup(1);
    });
    c.on('exit', () => {
      failure = true;
      if (fs.existsSync(`${directory}/ready`)) void cleanup(1);
    });
    return c;
  }
  try {
    const mode = process.env.PAIR_MODE || 'manual';
    if (!['manual', 'server', 'client'].includes(mode))
      throw new Error('Invalid PAIR_MODE');
    if (mode === 'server') {
      child(process.execPath, ['/opt/tunlivo/image/runtime/pair.mts', 'serve']);
      while (true) {
        if (closing || failure) throw new Error('Pairing service stopped');
        try {
          if (load().Peer) break;
        } catch {
          /* Server may still be initializing. */
        }
        await delay(250);
      }
    } else if (mode === 'client') {
      await new Promise<void>((resolve, reject) => {
        const c = child(process.execPath, [
          '/opt/tunlivo/image/runtime/pair.mts',
          'join',
        ]);
        c.once('exit', (code) =>
          code === 0 ? resolve() : reject(new Error('Pairing failed')),
        );
        c.once('error', reject);
      });
    }
    if (mode !== 'manual') {
      pairedConfig();
      process.env.WG_PRIVATE_KEY = fs.readFileSync(
        `${directory}/private.key`,
        'utf8',
      );
      process.env.WG_PEERS = fs.readFileSync(`${directory}/peer`, 'utf8');
    }
    configure();
    command('wg-quick', ['up', `${directory}/wg0.conf`]);
    child('nginx', ['-c', `${directory}/nginx.conf`, '-g', 'daemon off;']);
    fs.writeFileSync(`${directory}/ready`, '', { mode: 0o600 });
    console.log(
      'Gateway ready: WireGuard and nginx. Check peer handshake separately.',
    );
  } catch {
    console.error(
      'Gateway startup failed; check configuration and saved pairing.',
    );
    await cleanup(1);
  }
}
const mode = process.argv[2];
if (mode === 'health') process.exitCode = health() ? 0 : 1;
else if (mode === 'configure') {
  try {
    configure();
  } catch {
    console.error('Invalid gateway configuration');
    process.exitCode = 1;
  }
} else if (mode === 'start') await start();
