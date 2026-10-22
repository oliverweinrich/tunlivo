// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  createHash,
  randomBytes,
  timingSafeEqual,
  X509Certificate,
} from 'node:crypto';
import * as https from 'node:https';
import * as http from 'node:http';
import * as tls from 'node:tls';
import { isIPv4 } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

// PascalCase and base64-encoded PEM fields deliberately match Go's encoding/json.
export interface PairState {
  Role: 'server' | 'client';
  Private: string;
  Public: string;
  Peer: string;
  PeerAddress: string;
  Endpoint: string;
  Certificate: string | null;
  TLSKey: string | null;
  Token: string;
  Expires: string;
  [key: string]: unknown;
}
interface Registration {
  Public: string;
  Address: string;
}
interface Reply {
  status: number;
  body?: Registration;
}
export const dataDir = () => process.env.PAIR_DATA_DIR || '/data';
const statePath = () => path.join(dataDir(), 'state.json');
const execute = (command: string, args: string[], input?: string) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
export function keyOK(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9+/]{43}=$/.test(value) &&
    Buffer.from(value, 'base64').length === 32 &&
    Buffer.from(value, 'base64').some((byte) => byte !== 0)
  );
}
export function address(value: string): string {
  const [ip, prefix, extra] = value.split('/');
  if (
    !ip ||
    !isIPv4(ip) ||
    prefix === undefined ||
    !/^\d{1,2}$/.test(prefix) ||
    Number(prefix) > 32 ||
    extra !== undefined
  )
    throw new Error('IPv4 tunnel address with prefix required');
  return `${ip}/32`;
}
export function endpointOK(value: string): boolean {
  return (
    /^[A-Za-z0-9_.-]+:\d{1,5}$/.test(value) &&
    Number(value.split(':')[1]) > 0 &&
    Number(value.split(':')[1]) <= 65535
  );
}
export function load(): PairState {
  const value: unknown = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  if (!value || typeof value !== 'object')
    throw new Error('Invalid pairing state');
  const s = value as PairState;
  if (
    !['server', 'client'].includes(s.Role) ||
    !keyOK(s.Private) ||
    !keyOK(s.Public) ||
    typeof s.Peer !== 'string' ||
    (s.Peer !== '' && !keyOK(s.Peer)) ||
    typeof s.PeerAddress !== 'string' ||
    typeof s.Endpoint !== 'string' ||
    typeof s.Token !== 'string' ||
    !Number.isFinite(Date.parse(s.Expires))
  )
    throw new Error('Invalid pairing state');
  if (
    s.Role === 'server' &&
    (typeof s.Certificate !== 'string' || typeof s.TLSKey !== 'string')
  )
    throw new Error('Invalid server identity');
  return s;
}
export function save(s: PairState): void {
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const temporary = path.join(
    dataDir(),
    `.state-${randomBytes(12).toString('hex')}`,
  );
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(s));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, statePath());
    const directory = fs.openSync(dataDir(), 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
export function invitation(s: PairState): string {
  if (!s.Certificate) throw new Error('Missing certificate');
  return `wg1.${createHash('sha256')
    .update(new X509Certificate(Buffer.from(s.Certificate, 'base64')).raw)
    .digest('hex')}.${s.Token}`;
}
function newToken(s: PairState): void {
  s.Token = randomBytes(32).toString('hex');
  s.Expires = new Date(Date.now() + 600_000).toISOString();
}
function initialize(role: string): void {
  if (role !== 'server' && role !== 'client') throw new Error('Invalid role');
  try {
    if (load().Role !== role) throw new Error('Volume belongs to another role');
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const privateKey = execute('wg', ['genkey']);
  const s: PairState = {
    Role: role,
    Private: privateKey,
    Public: execute('wg', ['pubkey'], privateKey + '\n'),
    Peer: '',
    PeerAddress: '',
    Endpoint: '',
    Certificate: null,
    TLSKey: null,
    Token: '',
    Expires: '0001-01-01T00:00:00Z',
  };
  if (role === 'server') {
    const temporary = fs.mkdtempSync('/tmp/tunlivo-cert-');
    try {
      fs.chmodSync(temporary, 0o700);
      execute('openssl', [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:P-256',
        '-nodes',
        '-days',
        '3650',
        '-subj',
        '/CN=Tunlivo enrollment',
        '-keyout',
        `${temporary}/key.pem`,
        '-out',
        `${temporary}/cert.pem`,
      ]);
      s.Certificate = fs
        .readFileSync(`${temporary}/cert.pem`)
        .toString('base64');
      s.TLSKey = fs.readFileSync(`${temporary}/key.pem`).toString('base64');
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
    newToken(s);
  }
  save(s);
}
// flock uses the same lock file/inode as the previous Go implementation.
// Secret values travel on stdin, never in process arguments.
export function locked(task: string, args: string[] = [], input = ''): string {
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  const lock = path.join(dataDir(), 'state.lock');
  const fd = fs.openSync(lock, 'a', 0o600);
  fs.closeSync(fd);
  const result = spawnSync(
    'flock',
    [
      '-x',
      '-o',
      lock,
      process.execPath,
      import.meta.filename,
      '--locked',
      task,
      ...args,
    ],
    { input, encoding: 'utf8', env: process.env },
  );
  if (result.error || result.status !== 0)
    throw new Error('Pairing state operation failed');
  return result.stdout.trim();
}
export function registration(
  s: PairState,
  supplied: string,
  body: unknown,
  own: string,
  expected: string,
): Reply {
  const suppliedBytes = Buffer.from(supplied),
    tokenBytes = Buffer.from(s.Token);
  if (
    Date.now() > Date.parse(s.Expires) ||
    suppliedBytes.length !== tokenBytes.length ||
    !timingSafeEqual(suppliedBytes, tokenBytes)
  )
    return { status: 403 };
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { status: 400 };
  const r = body as Record<string, unknown>;
  if (
    Object.keys(r).sort().join(',') !== 'Address,Public' ||
    !keyOK(r.Public) ||
    r.Address !== expected ||
    r.Public === s.Public
  )
    return { status: 400 };
  if (s.Peer && s.Peer !== r.Public) return { status: 409 };
  if (!s.Peer) {
    s.Peer = r.Public;
    s.PeerAddress = expected;
    save(s);
  }
  return { status: 200, body: { Public: s.Public, Address: own } };
}
function lockedTask(task: string, args: string[], input: string): string {
  if (task === 'initialize') {
    initialize(args[0] || '');
    return '';
  }
  const s = load();
  if (task === 'register') {
    const request = JSON.parse(input) as { token: string; body: unknown };
    return JSON.stringify(
      registration(s, request.token, request.body, args[0], args[1]),
    );
  }
  if (task === 'associate') {
    const update = JSON.parse(input) as Registration & { Endpoint: string };
    if (
      s.Role !== 'client' ||
      !keyOK(update.Public) ||
      !endpointOK(update.Endpoint)
    )
      throw new Error('Invalid association');
    if (s.Peer && s.Peer !== update.Public)
      throw new Error('Association changed concurrently');
    s.Peer = update.Public;
    s.PeerAddress = update.Address;
    s.Endpoint = update.Endpoint;
    save(s);
    return '';
  }
  if (task === 'invite' || task === 'renew') {
    if (s.Role !== 'server' || s.Peer)
      throw new Error('Invitations require an unpaired server');
    if (task === 'renew') {
      newToken(s);
      save(s);
    }
    if (Date.now() > Date.parse(s.Expires))
      throw new Error('Invitation expired');
    return invitation(s);
  }
  throw new Error('Unknown state operation');
}
export function pairingServer(): https.Server {
  locked('initialize', ['server']);
  const own = address(process.env.WG_ADDRESS || '');
  const expected = address(process.env.PAIR_PEER_ADDRESS || '10.66.66.2/32');
  const s = load();
  if (s.Peer && s.PeerAddress !== expected)
    throw new Error('Saved peer address differs from configuration');
  const server = https.createServer(
    {
      cert: Buffer.from(s.Certificate!, 'base64'),
      key: Buffer.from(s.TLSKey!, 'base64'),
      minVersion: 'TLSv1.3',
      handshakeTimeout: 10000,
      connectionsCheckingInterval: 1000,
      maxHeaderSize: 4096,
    },
    (req, res) => {
      if (req.url !== '/pair') {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      req.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length <= 1024) chunks.push(chunk);
        else {
          res.writeHead(413).end();
          req.destroy();
        }
      });
      req.on('error', () => {
        if (!res.writableEnded) res.destroy();
      });
      req.on('end', () => {
        if (length > 1024 || res.writableEnded) return;
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400).end();
          return;
        }
        try {
          const result = JSON.parse(
            locked(
              'register',
              [own, expected],
              JSON.stringify({
                token: (req.headers.authorization || '').replace(
                  /^Bearer /,
                  '',
                ),
                body,
              }),
            ),
          ) as Reply;
          res
            .writeHead(result.status, {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            })
            .end(result.body ? JSON.stringify(result.body) : '');
        } catch {
          res.writeHead(500).end();
        }
      });
    },
  );
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 10000;
  server.on('tlsClientError', () => {});
  return server;
}
// Authenticate the TLS peer BEFORE an HTTP request (and bearer token) is sent.
export async function pinnedRequest(
  host: string,
  pin: Buffer,
  token: string,
  body: Registration,
): Promise<Registration> {
  const [hostname, port] = host.split(':');
  const socket = tls.connect({
    host: hostname,
    port: Number(port),
    minVersion: 'TLSv1.3',
    rejectUnauthorized: false,
  });
  const agent = new http.Agent({ keepAlive: false });
  const deadline = setTimeout(
    () => socket.destroy(new Error('Pairing timeout')),
    10000,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      socket.setTimeout(10000, () => socket.destroy(new Error('TLS timeout')));
      socket.once('error', reject);
      socket.once('secureConnect', () => {
        const raw = socket.getPeerCertificate(true).raw;
        if (
          !raw ||
          pin.length !== 32 ||
          !timingSafeEqual(createHash('sha256').update(raw).digest(), pin)
        ) {
          socket.destroy();
          reject(new Error('Server fingerprint mismatch'));
        } else resolve();
      });
    });
    agent.createConnection = () => socket;
    return await new Promise<Registration>((resolve, reject) => {
      const encoded = JSON.stringify(body);
      const req = http.request(
        {
          host: hostname,
          port,
          method: 'POST',
          path: '/pair',
          agent,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(encoded),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let length = 0;
          res.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > 1024)
              res.destroy(new Error('Pairing response too large'));
            else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`Pairing rejected (HTTP ${res.statusCode})`));
              return;
            }
            try {
              resolve(
                JSON.parse(
                  Buffer.concat(chunks).toString('utf8'),
                ) as Registration,
              );
            } catch {
              reject(new Error('Invalid pairing response'));
            }
          });
        },
      );
      req.setTimeout(10000, () => req.destroy(new Error('Pairing timeout')));
      req.on('error', reject);
      req.end(encoded);
    });
  } finally {
    clearTimeout(deadline);
    agent.destroy();
    socket.destroy();
  }
}
export async function join(): Promise<void> {
  locked('initialize', ['client']);
  if (load().Peer) return;
  const code = /^wg1\.([a-fA-F0-9]{64})\.([a-fA-F0-9]{64})$/.exec(
    process.env.PAIR_CODE || '',
  );
  if (!code) throw new Error('Invalid or missing PAIR_CODE');
  const endpoint = process.env.WG_ENDPOINT || '',
    host = process.env.PAIR_SERVER || '';
  if (!endpointOK(endpoint) || !endpointOK(host))
    throw new Error('PAIR_SERVER and WG_ENDPOINT must be HOST:PORT');
  const own = address(process.env.WG_ADDRESS || '');
  const expected = address(process.env.PAIR_PEER_ADDRESS || '10.66.66.1/32');
  for (let attempt = 0; attempt < 30; attempt++) {
    let reply: Registration;
    try {
      reply = await pinnedRequest(host, Buffer.from(code[1], 'hex'), code[2], {
        Public: load().Public,
        Address: own,
      });
    } catch (error) {
      if ((error as Error).message.startsWith('Pairing rejected')) throw error;
      await delay(2000);
      continue;
    }
    if (!keyOK(reply.Public) || reply.Address !== expected)
      throw new Error('Invalid pairing response');
    locked('associate', [], JSON.stringify({ ...reply, Endpoint: endpoint }));
    return;
  }
  throw new Error('Pairing unavailable or server fingerprint incorrect');
}
export function pairedConfig(): void {
  const s = load();
  if (!s.Peer) throw new Error('Pairing pending');
  const endpoint =
    s.Role === 'client' ? process.env.WG_ENDPOINT || s.Endpoint : '-';
  if (s.Role === 'client' && !endpointOK(endpoint))
    throw new Error('Invalid WG_ENDPOINT');
  if ((process.env.PAIR_PEER_ADDRESS || s.PeerAddress) !== s.PeerAddress)
    throw new Error('Tunnel address differs from saved pairing');
  fs.mkdirSync('/run/gateway', { recursive: true, mode: 0o700 });
  fs.writeFileSync('/run/gateway/private.key', s.Private, { mode: 0o600 });
  fs.writeFileSync(
    '/run/gateway/peer',
    `${s.Peer} ${s.PeerAddress} ${endpoint} ${s.Role === 'client' ? 25 : 0}`,
    { mode: 0o600 },
  );
}
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== '--locked' && args.length)
    throw new Error('Unexpected command arguments');
  if (command === '--locked') {
    const input = fs.readFileSync(0, 'utf8');
    const result = lockedTask(args[0], args.slice(1), input);
    if (result) console.log(result);
    return;
  }
  if (command === 'serve') {
    const server = pairingServer(),
      s = load();
    const port = process.env.PAIR_PORT || '51821';
    if (!endpointOK(`localhost:${port}`)) throw new Error('Invalid PAIR_PORT');
    server.listen(Number(port), '0.0.0.0', () => {
      if (!s.Peer) {
        if (Date.now() < Date.parse(s.Expires))
          console.log('Invitation (valid for ten minutes): ' + invitation(s));
        else console.log('Invitation expired; use gateway-pair renew.');
      }
    });
    return;
  }
  if (command === 'join') {
    await join();
    return;
  }
  if (command === 'config') {
    pairedConfig();
    return;
  }
  if (command === 'ready') {
    if (!load().Peer) throw new Error('Pairing pending');
    return;
  }
  if (command === 'invite' || command === 'renew') {
    console.log(locked(command));
    return;
  }
  throw new Error('Command: serve, join, ready, config, invite or renew');
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main().catch(() => {
    console.error(
      'Pairing command failed; check configuration and saved state.',
    );
    process.exitCode = 1;
  });
