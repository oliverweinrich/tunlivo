// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { files, copyTree } from '../scripts/lib.mts';
export const packageProject = (root: string, target: string): void => {
  rmSync(target, { recursive: true, force: true });
  for (const file of [
    'LICENSE',
    'NOTICE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'SECURITY.md',
    'AGENTS.md',
    'FEATURES.md',
    'DEPENDENCIES.md',
    'VERSION',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    '.dockerignore',
    '.gitignore',
    '.prettierrc.json',
    '.prettierignore',
    '.npmrc',
    '.node-version',
  ])
    copyTree(join(root, file), join(target, file));
  for (const directory of [
    'scripts',
    'tests',
    'release',
    'docs',
    'examples',
    '.github',
    '.husky',
    '.vscode',
    'image',
  ])
    for (const file of files(join(root, directory))) {
      const name = relative(root, file);
      if (name.startsWith('.husky/_/')) continue;
      if (
        !name.startsWith('image/legal/') &&
        !/\.(mts|md|yaml|yml|json|txt)$/.test(name) &&
        !name.endsWith('Dockerfile') &&
        !['.husky/pre-commit', '.husky/pre-push'].includes(name)
      )
        continue;
      copyTree(file, join(target, name));
    }
};
