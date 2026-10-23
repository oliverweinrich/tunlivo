// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
import { writeFileSync } from 'node:fs';
// Executed as the non-root UID inside the disposable source helper.
for (const directory of ['/output', '/cache'])
  writeFileSync(directory + '/host-write', 'ok');
