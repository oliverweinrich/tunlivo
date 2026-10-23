// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
export type PackageRow = Readonly<{
  package: string;
  version: string;
  license: string;
  origin: string;
  commit: string;
  architecture: string;
}>;
export const packageRows = (text: string): PackageRow[] =>
  text
    .trim()
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [name, version, license, origin, commit, architecture] =
        line.split('\t');
      if (!name || !version || !license || !origin || !commit || !architecture)
        throw new Error('Invalid runtime package inventory');
      return { package: name, version, license, origin, commit, architecture };
    });
export type NpmRow = Readonly<{
  name: string;
  version: string;
  license: string;
  location: string;
  integrity: string;
  notice_files: number;
}>;
