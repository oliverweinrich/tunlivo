// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cli,
  equalFiles,
  isMain,
  out,
  read,
  run,
  write,
} from '../scripts/lib.mts';
import { artifacts, context } from './context.mts';
import { check } from './check.mts';
export const preflight = (
  invoke: typeof run = run,
): { repository: string; github: string } => {
  const { version } = context();
  const repository = process.env.TUNLIVO_REPOSITORY || 'oliverweinrich/tunlivo';
  if (!/^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/.test(repository))
    throw new Error('Invalid repository');
  const github =
    process.env.GITHUB_REPOSITORY ||
    invoke('gh', [
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '--jq',
      '.nameWithOwner',
    ]).stdout.trim();
  for (const tag of [version, `${version}-sources`]) {
    const status = invoke('curl', [
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '30',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      `https://hub.docker.com/v2/repositories/${repository}/tags/${tag}/`,
    ]).stdout;
    if (status !== '404')
      throw new Error(
        `Tag ${repository}:${tag} exists or cannot be checked (HTTP ${status})`,
      );
  }
  const release = invoke(
    'gh',
    ['api', `repos/${github}/releases/tags/v${version}`],
    { allowFailure: true },
  );
  if (release.status === 0 || !release.stderr.includes('HTTP 404'))
    throw new Error(
      'GitHub release exists or cannot be checked; inspect before retrying',
    );
  return { repository, github };
};
export const publish = (onlyCheck = false): void => {
  const { root, version, output, image } = context();
  const { repository, github } = preflight();
  if (onlyCheck) {
    out(`Version ${version} is available for a new release.`);
    return;
  }
  check(true);
  const work = mkdtempSync(join(tmpdir(), 'tunlivo-publish-'));
  try {
    const source = join(work, 'sources');
    mkdirSync(source);
    for (const name of artifacts(version))
      cpSync(join(output, name), join(source, name));
    cpSync(
      join(root, 'release/Archives.Dockerfile'),
      join(source, 'Dockerfile'),
    );
    run(
      'docker',
      [
        'buildx',
        'build',
        '--platform',
        'linux/amd64,linux/arm64',
        '--load',
        '--build-arg',
        `VERSION=${version}`,
        '-t',
        `${repository}:${version}-sources`,
        source,
      ],
      { live: true, timeout: 1200000 },
    );
    run(
      'gh',
      [
        'release',
        'create',
        `v${version}`,
        '--repo',
        github,
        '--target',
        run('git', ['rev-parse', 'HEAD']).stdout.trim(),
        '--title',
        `Tunlivo ${version}`,
        '--generate-notes',
        '--draft',
      ],
      { live: true },
    );
    run(
      'gh',
      [
        'release',
        'upload',
        `v${version}`,
        '--repo',
        github,
        ...artifacts(version).map((name) => join(output, name)),
      ],
      { live: true, timeout: 1200000 },
    );
    run(
      'gh',
      ['release', 'edit', `v${version}`, '--repo', github, '--draft=false'],
      { live: true },
    );
    const previous = process.env.RELEASE_URL;
    try {
      process.env.RELEASE_URL = `https://github.com/${github}/releases/download/v${version}`;
      check();
    } finally {
      if (previous === undefined) delete process.env.RELEASE_URL;
      else process.env.RELEASE_URL = previous;
    }
    run('docker', ['push', `${repository}:${version}-sources`], {
      live: true,
      timeout: 1200000,
    });
    for (const tag of [version, 'latest']) {
      run('docker', ['tag', image, `${repository}:${tag}`]);
      run('docker', ['push', `${repository}:${tag}`], {
        live: true,
        timeout: 1200000,
      });
    }
    for (const tag of [version, 'latest', `${version}-sources`]) {
      const manifest = run('docker', [
        'manifest',
        'inspect',
        `${repository}:${tag}`,
      ]).stdout;
      const parsed = JSON.parse(manifest) as {
        manifests: { platform: { os: string; architecture: string } }[];
      };
      const platforms = parsed.manifests.map(
        (item) => `${item.platform.os}/${item.platform.architecture}`,
      );
      if (
        !['linux/amd64', 'linux/arm64'].every((value) =>
          platforms.includes(value),
        )
      )
        throw new Error('Published image is missing a platform');
      write(join(work, tag + '.json'), manifest);
    }
    equalFiles(join(work, version + '.json'), join(work, 'latest.json'));
    out(
      `Published ${repository}:${version}, :latest and :${version}-sources; GitHub release v${version}.`,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};
if (isMain(import.meta.url))
  await cli(() => {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some((arg) => arg !== '--check'))
      throw new Error('Usage: publish.mts [--check]');
    publish(args.includes('--check'));
  });
