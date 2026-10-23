// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  cli,
  copyTree,
  equalFiles,
  files,
  isMain,
  out,
  read,
  run,
  write,
} from '../scripts/lib.mts';
import { packageRows } from './inventory.mts';
import { fetchRecipe } from './recipe.mts';
import { collectNotices } from './notices.mts';
import { tmpdir } from 'node:os';

const recipeInfo = (
  file: string,
  expression: string,
  env = process.env,
): string =>
  run('bash', ['-c', '. "$1"; ' + expression, 'recipe', file], {
    cwd: dirname(file),
    env,
  }).stdout;
const definition = (file: string, architecture: string): string =>
  recipeInfo(
    file,
    'printf "%s\\n%s\\n%s\\n" "$source" "${sha512sums:-}" "${sha256sums:-}"',
    { ...process.env, CARCH: architecture },
  );
export const collectSources = async (
  output: string,
  cache: string,
): Promise<void> => {
  const uid = process.env.TUNLIVO_OUTPUT_UID || '',
    gid = process.env.TUNLIVO_OUTPUT_GID || '';
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(gid))
    throw new Error('Set numeric output UID/GID');
  mkdirSync(output, { recursive: true });
  mkdirSync(cache, { recursive: true });
  let failure: unknown;
  try {
    for (const path of ['alpine', 'licenses/alpine'])
      mkdirSync(join(output, path), { recursive: true });
    for (const path of ['recipes', 'distfiles'])
      mkdirSync(join(cache, path), { recursive: true });
    const rows = packageRows(read(join(output, 'packages.tsv')));
    const unique = [
      ...new Map(
        rows.map((row) => [row.origin + '-' + row.commit, row]),
      ).values(),
    ];
    const arch = run('apk', ['--print-arch']).stdout.trim();
    process.env.CARCH = arch;
    const branch = read('/etc/alpine-release')
      .trim()
      .split('.')
      .slice(0, 2)
      .join('.');
    for (const row of unique) {
      const { origin, commit, version } = row;
      if (!/^[\w+.-]+$/.test(origin) || !/^[a-f0-9]{40}$/.test(commit))
        throw new Error('Invalid recipe provenance');
      const identity = origin + '-' + commit,
        destination = join(output, 'alpine', identity),
        licenses = join(output, 'licenses/alpine', identity);
      if (
        existsSync(join(destination, 'VERIFIED')) &&
        existsSync(join(licenses, 'source-notices.tar.gz'))
      ) {
        const builds = files(join(destination, 'recipe')).filter((file) =>
          file.endsWith('/APKBUILD'),
        );
        if (builds.length !== 1) throw new Error('Ambiguous cached recipe');
        if (
          recipeInfo(builds[0], 'printf "%s-r%s" "$pkgver" "$pkgrel"') !==
          version
        )
          throw new Error('Cached recipe version mismatch: ' + origin);
        // VERIFIED records past success, not the integrity of the files today.
        // Never refetch here: damage must block release instead of being hidden.
        // abuild removes bad inputs. Verify disposable copies so failure keeps
        // the retained evidence intact and never repairs damage implicitly.
        const temporary = mkdtempSync(join(tmpdir(), 'tunlivo-verify-'));
        try {
          copyTree(join(destination, 'recipe'), join(temporary, 'recipe'));
          copyTree(join(destination, 'sources'), join(temporary, 'sources'));
          const build = join(temporary, relative(destination, builds[0]));
          const verified = run('abuild', ['-F', 'verify'], {
            cwd: dirname(build),
            env: {
              ...process.env,
              CARCH: arch,
              SRCDEST: join(temporary, 'sources'),
            },
          });
          write(
            join(destination, 'verification.log'),
            verified.stdout + verified.stderr,
          );
        } finally {
          rmSync(temporary, { recursive: true, force: true });
        }
        for (const target of ['aarch64', 'x86_64'])
          write(
            join(destination, `source-definition-${target}.txt`),
            definition(builds[0], target),
          );
        equalFiles(
          join(destination, 'source-definition-aarch64.txt'),
          join(destination, 'source-definition-x86_64.txt'),
        );
        continue;
      }
      const recipe = join(cache, 'recipes', identity + '.tar.gz');
      await fetchRecipe(origin, commit, recipe);
      for (const path of ['recipe', 'sources', 'unpacked'])
        mkdirSync(join(destination, path), { recursive: true });
      run('tar', [
        '-xzf',
        recipe,
        '-C',
        join(destination, 'recipe'),
        '--strip-components=1',
      ]);
      const builds = files(join(destination, 'recipe')).filter((file) =>
        file.endsWith('/APKBUILD'),
      );
      if (builds.length !== 1 || !builds[0])
        throw new Error('Ambiguous recipe');
      const build = builds[0];
      if (recipeInfo(build, 'printf "%s-r%s" "$pkgver" "$pkgrel"') !== version)
        throw new Error('Recipe version mismatch: ' + origin);
      out(`Collecting ${origin} (${version})`);
      const sourceCache = join(cache, 'distfiles', identity);
      mkdirSync(sourceCache, { recursive: true });
      copyTree(sourceCache, join(destination, 'sources'));
      const verified = run('abuild', ['-F', 'fetch', 'verify'], {
        cwd: dirname(build),
        env: {
          ...process.env,
          CARCH: arch,
          SRCDEST: join(destination, 'sources'),
          DISTFILES_MIRROR: `https://distfiles.alpinelinux.org/distfiles/v${branch}`,
        },
      });
      write(
        join(destination, 'verification.log'),
        verified.stdout + verified.stderr,
      );
      write(
        join(destination, 'checksums.txt'),
        recipeInfo(build, 'printf "%s\\n" "${sha512sums:-${sha256sums:-}}"'),
      );
      copyTree(join(destination, 'sources'), sourceCache);
      for (const archive of files(join(destination, 'sources'))) {
        if (run('tar', ['-tf', archive], { allowFailure: true }).status === 0)
          run('tar', ['-xf', archive, '-C', join(destination, 'unpacked')]);
      }
      collectNotices(destination, licenses);
      rmSync(join(destination, 'unpacked'), { recursive: true, force: true });
      for (const target of ['aarch64', 'x86_64'])
        write(
          join(destination, `source-definition-${target}.txt`),
          definition(build, target),
        );
      equalFiles(
        join(destination, 'source-definition-aarch64.txt'),
        join(destination, 'source-definition-x86_64.txt'),
      );
      write(
        join(destination, 'VERIFIED'),
        `${origin}\t${version}\t${commit}\n`,
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    // Preserve the collection error if restoring host ownership also fails.
    try {
      run('chown', ['-hR', uid + ':' + gid, output, cache]);
    } catch (error) {
      if (!failure) failure = error;
      else
        process.stderr.write(
          'Additionally failed to restore output ownership.\n',
        );
    }
  }
  if (failure) throw failure;
};
if (isMain(import.meta.url))
  await cli(() => collectSources('/output', '/cache'));
