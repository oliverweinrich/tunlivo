// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('yaml');

function gitDate(root, file, needle) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  const needles = Array.isArray(needle) ? needle : [needle];
  let index = -1;
  for (const part of needles)
    index = lines.findIndex((line, i) => i > index && line.includes(part));
  if (index < 0) return 'Unknown';
  try {
    const blame = execFileSync(
      'git',
      [
        'blame',
        '--line-porcelain',
        '-L',
        `${index + 1},${index + 1}`,
        '--',
        file,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (/^0{40} /.test(blame)) return 'Uncommitted';
    const time = /^committer-time (\d+)$/m.exec(blame);
    return time
      ? new Date(Number(time[1]) * 1000).toISOString().slice(0, 10)
      : 'Unknown';
  } catch {
    return 'Unknown (no Git history)';
  }
}

function coverage(config, ecosystem, file, name) {
  const directory = path.posix.dirname(`/${file}`);
  const entry = config.updates.find(
    (item) =>
      item['package-ecosystem'] === ecosystem &&
      (item.directories || [item.directory]).includes(
        ecosystem === 'github-actions' ? '/' : directory,
      ),
  );
  if (!entry) return 'Not configured';
  if (
    (entry.ignore || []).some(
      (item) =>
        item['dependency-name'] === name &&
        !item['update-types'] &&
        !item.versions,
    )
  )
    return 'Excluded; release-managed';
  return `Yes (${ecosystem}; ${entry.schedule.interval})`;
}

function collect(root) {
  const config = parse(
    fs.readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8'),
  );
  const rows = [];
  function add(
    section,
    ecosystem,
    file,
    name,
    version,
    needle = version,
    note,
  ) {
    rows.push({
      section,
      name,
      version,
      file,
      updated: gitDate(root, file, needle),
      coverage: note || coverage(config, ecosystem, file, name),
    });
  }
  for (const file of ['image/Dockerfile', '.github/scanner/Dockerfile']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(
      /^FROM\s+(?:--platform=\S+\s+)?([^\s]+).*$/gm,
    )) {
      const pin = match[1];
      if (['scratch', 'runtime'].includes(pin)) continue;
      const [image, digest] = pin.split('@');
      const colon = image.lastIndexOf(':');
      add(
        'Images',
        'docker',
        file,
        image.slice(0, colon),
        `${image.slice(colon + 1)}${digest ? ` (${digest.slice(0, 19)}…)` : ''}`,
        pin,
      );
    }
  }
  for (const name of fs
    .readdirSync(path.join(root, 'examples'))
    .filter((f) => /^compose\..*\.yaml$/.test(f))
    .sort()) {
    const file = `examples/${name}`;
    const document = parse(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const service of Object.values(document.services)) {
      const pin = service.image;
      const [image, digest] = pin.split('@');
      const colon = image.lastIndexOf(':');
      add(
        'Example images',
        'docker-compose',
        file,
        image.slice(0, colon),
        `${image.slice(colon + 1)}${digest ? ` (${digest.slice(0, 19)}…)` : ''}`,
        pin,
      );
    }
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
  );
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location) continue;
    const name = location.split('node_modules/').pop();
    const direct =
      Object.hasOwn(pkg.devDependencies || {}, name) ||
      Object.hasOwn(pkg.dependencies || {}, name);
    add(
      'npm tooling',
      'npm',
      direct ? 'package.json' : 'package-lock.json',
      `${name}${direct ? ' (direct)' : ' (transitive)'}`,
      entry.version,
      direct
        ? `"${name}":`
        : [`"${location}":`, `"version": "${entry.version}"`],
      direct
        ? undefined
        : `${coverage(config, 'npm', 'package-lock.json', name)}; lockfile/parent constraints apply`,
    );
  }
  const actions = new Map();
  for (const name of fs
    .readdirSync(path.join(root, '.github/workflows'))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()) {
    const file = `.github/workflows/${name}`;
    for (const match of fs
      .readFileSync(path.join(root, file), 'utf8')
      .matchAll(/uses:\s*([\w./-]+)@([a-f0-9]{40})\s*#\s*(v[\w.-]+)/g)) {
      const key = `${match[1]}@${match[2]}`;
      if (!actions.has(key)) {
        add(
          'GitHub Actions',
          'github-actions',
          file,
          match[1],
          `${match[3]} (${match[2].slice(0, 12)}…)`,
          `${match[1]}@${match[2]}`,
        );
        actions.set(key, true);
      }
    }
  }
  const goFile = 'image/pairing/go.mod';
  const go = fs.readFileSync(path.join(root, goFile), 'utf8');
  add(
    'Toolchains and modules',
    'gomod',
    goFile,
    'Go language directive',
    /^go (\S+)/m.exec(go)[1],
    'go ',
    'Manual alignment with the Docker Go toolchain; gomod monitors module dependencies',
  );
  for (const match of go.matchAll(
    /^\s*(?:require\s+)?([\w.-]+\/[\w./-]+)\s+(v\S+)/gm,
  ))
    add('Toolchains and modules', 'gomod', goFile, match[1], match[2]);
  add(
    'Toolchains and modules',
    'manual',
    '.node-version',
    'Node.js major',
    fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim(),
    fs.readFileSync(path.join(root, '.node-version'), 'utf8').trim(),
    'Manual major upgrades; setup-node resolves patches within this major',
  );
  return rows;
}

function table(rows) {
  const escape = (value) =>
    String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    '| Dependency | Configured version / pin | Last pin change | Source | Dependabot / maintenance |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${[r.name, r.version, r.updated, `\`${r.file}\``, r.coverage].map(escape).join(' | ')} |`,
    ),
  ].join('\n');
}

function runtimeInventory(tsv) {
  const result = new Map();
  for (const line of tsv.trim().split('\n').slice(1)) {
    const [name, version, license, origin, commit, architecture] =
      line.split('\t');
    if (!name || !version || !architecture)
      throw new Error('Invalid runtime package inventory');
    if (!result.has(name)) result.set(name, new Map());
    result.get(name).set(architecture, version);
  }
  return [...result]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, versions]) => ({
      name,
      version:
        new Set(versions.values()).size === 1
          ? [...versions.values()][0]
          : [...versions].map(([a, v]) => `${a}: ${v}`).join('; '),
    }));
}

function publishedInventory() {
  const curl = (url) =>
    execFileSync(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--max-time',
        '60',
        url,
      ],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
  const release = JSON.parse(
    curl('https://api.github.com/repos/oliverweinrich/tunlivo/releases/latest'),
  );
  const asset = release.assets.find((a) => a.name === 'packages.tsv');
  if (!asset) throw new Error('Latest published release has no packages.tsv');
  return {
    tag: release.tag_name,
    date: release.published_at.slice(0, 10),
    url: asset.browser_download_url,
    packages: runtimeInventory(curl(asset.browser_download_url)),
  };
}

function render(rows, runtime, helper = null) {
  let text = `# Dependencies\n\nGenerated with \`npm run dependencies\`. This is an informational snapshot, not an update lockfile or a claim that every pin is the latest upstream release. Re-run after dependency changes and before release review. CI also generates an offline report artifact, so Dependabot PRs do not need to edit this snapshot to pass.\n\n“Last pin change” is the UTC date of the Git commit last changing the cited declaration line, not the upstream publication date. Uncommitted files/lines and source archives without Git history are marked accordingly. Full digests/commit pins remain in the cited manifests. Transitive npm dates refer to their lockfile entry. Runtime package dates below refer to the published release as a whole.\n\n`;
  for (const section of [...new Set(rows.map((r) => r.section))])
    text += `## ${section}\n\n${table(rows.filter((r) => r.section === section))}\n\n`;
  text += `## Runtime OS packages\n\nDependabot does not update individual \`apk\` packages. Scheduled native CI builds run \`apk upgrade\`/\`apk add\`, compare installed packages with the published image and run vulnerability scans. A maintainer still reviews, merges and releases updates. The Go standard library is provided by the pinned Go builder; there are currently no external Go modules.\n\n`;
  if (runtime)
    text += `Published-image snapshot: [${runtime.tag}](${runtime.url}), published ${runtime.date}. These are the installed package versions in that release, including transitive/base packages; a fresh local build can differ. All rows have **no direct Dependabot coverage** and share that release publication date. The TSV retains per-architecture versions, licenses, origin commits and package provenance.\n\n| Package | Installed version |\n| --- | --- |\n${runtime.packages.map((p) => `| ${p.name} | ${p.version} |`).join('\n')}\n\n`;
  else
    text += `Offline report: exact published package versions are not fetched. See \`packages.tsv\` on the [latest release](https://github.com/oliverweinrich/tunlivo/releases/latest), or extract \`/usr/share/licenses/tunlivo/packages.tsv\` from the specific image. Run \`npm run dependencies\` for a published-image snapshot.\n\n`;
  if (helper)
    text += `## Source helper OS packages\n\nLocal/CI helper inventory observed ${helper.observed}, from \`reports/source-helper-packages.tsv\`. This is a build snapshot, not part of the published runtime inventory and not a per-package update date. All packages below are maintained through fresh Alpine helper builds and scans, **not direct Dependabot PRs**. Download the native maintenance report artifacts for the other architecture.\n\n| Package | Installed version |\n| --- | --- |\n${helper.packages.map((p) => `| ${p.name} | ${p.version} |`).join('\n')}\n\n`;
  else
    text += `## Source helper OS packages\n\nNo local helper inventory is available. Exact helper package versions are in the native CI maintenance artifact \`source-helper-packages.tsv\`; place it in \`reports/\` before regenerating to include that snapshot here. Do not infer helper package versions from the runtime inventory.\n\n`;
  text += `## Coverage boundaries\n\n- The source helper inherits \`ALPINE_IMAGE\` from the pinned runtime base; it has no separate image pin for Dependabot to update. Its \`bash abuild curl grep tar xz zstd\` packages (and their dependencies) resolve when that helper is built, not from the runtime TSV. CI rebuilds and scans this helper; its exact inventory is a separate report artifact.\n- \`oliverweinrich/tunlivo\` in the examples is this project's output, explicitly excluded from Dependabot. \`release/set-version.sh\` owns those references.\n- \`.node-version\` and the Node engine requirement need manual major-version review. GitHub-hosted runner OS, Docker/Compose and QEMU installed by setup actions follow their providers/action inputs; host OS/kernel/Docker maintenance remains the operator's responsibility.\n- Dependabot tracks future external modules in \`image/pairing/go.mod\`. Review the Go language directive alongside Docker toolchain updates; do not assume it is independently upgraded. npm security updates/alerts additionally require GitHub repository settings to be enabled; lockfile updates must respect parent constraints.\n- Trivy's vulnerability database refreshes during scans. The scanner image pin is maintained by Dependabot; software inside third-party images/actions is maintained indirectly through those upstream releases, not as separate Tunlivo manifests.\n- Optional local tools such as \`actionlint\`, Git and the VS Code Prettier extension are not repository-pinned dependencies and require local maintenance.\n\nThe machine-readable sources of truth are manifests/lockfiles and each release's package inventory. For a standardized full image SBOM (SPDX/CycloneDX), use an image-aware SBOM tool against an immutable image digest; this Markdown file and \`packages.tsv\` are not substitutes for a complete SBOM.\n\nReferences: [Dependabot ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories), [maintenance workflow](.github/README.md).\n`;
  return text;
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const args = process.argv.slice(2);
    const offline = args.includes('--offline');
    const outputIndex = args.indexOf('--output');
    const output =
      outputIndex >= 0
        ? args[outputIndex + 1]
        : args.includes('--write')
          ? 'DEPENDENCIES.md'
          : null;
    if (outputIndex >= 0 && !output)
      throw new Error('--output requires a path');
    const helperFile = path.join(root, 'reports/source-helper-packages.tsv');
    const helper = fs.existsSync(helperFile)
      ? {
          packages: runtimeInventory(fs.readFileSync(helperFile, 'utf8')),
          observed: fs.statSync(helperFile).mtime.toISOString().slice(0, 10),
        }
      : null;
    const text = render(
      collect(root),
      offline ? null : publishedInventory(),
      helper,
    );
    if (output) {
      const target = path.resolve(root, output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
      console.log(`Dependency inventory written to ${output}`);
    } else process.stdout.write(text);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { collect, coverage, gitDate, runtimeInventory, render };
