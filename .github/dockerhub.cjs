// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function repository(value) {
  if (!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/.test(value))
    throw new Error('Invalid Docker Hub repository');
  return value;
}

function render(root, options = {}) {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error('Invalid VERSION');
  const repo = repository(options.repository || 'oliverweinrich/tunlivo');
  const github = options.githubRepository || 'oliverweinrich/tunlivo';
  if (!/^[\w.-]+\/[\w.-]+$/.test(github))
    throw new Error('Invalid GitHub repository');
  const ref =
    options.sourceRef ||
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  if (!/^[a-f0-9]{40}$/.test(ref))
    throw new Error('Source reference must be a full commit SHA');
  const compose = (role) => {
    const text = fs
      .readFileSync(
        path.join(root, `examples/compose.pairing-${role}.yaml`),
        'utf8',
      )
      .trim();
    if (!text.includes(`image: oliverweinrich/tunlivo:${version}\n`))
      throw new Error(`Pairing ${role} example does not match VERSION`);
    return `\`\`\`yaml\n${text.replaceAll(`image: oliverweinrich/tunlivo:${version}`, `image: ${repo}:${version}`)}\n\`\`\``;
  };
  const values = {
    VERSION: version,
    REPOSITORY: repo,
    PROJECT_URL: `https://github.com/${github}`,
    SOURCE_URL: `https://github.com/${github}/blob/${ref}`,
    SERVER_COMPOSE: compose('server'),
    CLIENT_COMPOSE: compose('client'),
  };
  const template = fs.readFileSync(
    path.join(root, 'docs/DOCKERHUB.template.md'),
    'utf8',
  );
  const overview = template.replace(/\{\{([^{}]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key))
      throw new Error(`Unknown overview placeholder: ${key}`);
    return values[key];
  });
  return { overview, version, repository: repo };
}

async function publish(candidate, env, fetchImpl = fetch) {
  repository(candidate.repository);
  if (!env.DOCKERHUB_USERNAME || !env.DOCKERHUB_TOKEN)
    throw new Error(
      'Set DOCKERHUB_USERNAME and DOCKERHUB_TOKEN with overview read/write/delete access',
    );
  async function request(endpoint, options = {}) {
    let response;
    try {
      response = await fetchImpl(`https://hub.docker.com/v2/${endpoint}`, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new Error(
        'Docker Hub request failed; no image rebuild is needed to retry the overview workflow',
      );
    }
    if (!response.ok)
      throw new Error(
        `Docker Hub returned HTTP ${response.status}; check repository access and retry the overview workflow`,
      );
    return response;
  }
  async function json(endpoint, options) {
    const response = await request(endpoint, options);
    try {
      return await response.json();
    } catch {
      throw new Error(
        'Docker Hub returned invalid JSON; retry the overview workflow',
      );
    }
  }
  // Refuse to advertise an unreleased/older version as the repository's current image.
  const tag = await json(
    `repositories/${candidate.repository}/tags/${candidate.version}`,
  );
  const latest = await json(`repositories/${candidate.repository}/tags/latest`);
  if (!tag.digest || tag.digest !== latest.digest)
    throw new Error(
      'VERSION must identify the published latest image; overview was not changed',
    );
  const auth = await json('auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: env.DOCKERHUB_USERNAME,
      secret: env.DOCKERHUB_TOKEN,
    }),
  });
  if (typeof auth.access_token !== 'string' || !auth.access_token)
    throw new Error('Docker Hub did not return an access token');
  await request(`repositories/${candidate.repository}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.access_token}`,
    },
    body: JSON.stringify({ full_description: candidate.overview }),
  });
  const saved = await json(`repositories/${candidate.repository}`);
  if (
    saved.full_description?.replaceAll('\r\n', '\n').trimEnd() !==
    candidate.overview.replaceAll('\r\n', '\n').trimEnd()
  )
    throw new Error(
      'Docker Hub overview verification failed; retry the overview-only workflow',
    );
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--publish', '--output']);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i]))
      throw new Error('Usage: dockerhub.cjs [--output FILE] [--publish]');
    if (args[i] === '--output' && (!args[++i] || args[i].startsWith('--')))
      throw new Error('--output requires a path');
  }
  const root = path.resolve(__dirname, '..');
  const candidate = render(root, {
    repository: process.env.TUNLIVO_REPOSITORY,
    githubRepository: process.env.GITHUB_REPOSITORY,
  });
  const output = args.indexOf('--output');
  if (output >= 0) {
    const target = path.resolve(root, args[output + 1]);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, candidate.overview);
    console.log(`Docker Hub overview written to ${args[output + 1]}`);
  } else if (!args.includes('--publish'))
    process.stdout.write(candidate.overview);
  if (args.includes('--publish')) {
    await publish(candidate, process.env);
    console.log(
      `Verified Docker Hub overview for ${candidate.repository}:${candidate.version}`,
    );
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { render, publish };
