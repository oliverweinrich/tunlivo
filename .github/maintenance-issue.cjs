// Copyright 2026 Oliver Weinrich
// SPDX-License-Identifier: Apache-2.0
const fs = require('fs');
const path = require('path');

module.exports = async ({ github, context, result }) => {
  const differences = [];
  const vulnerabilities = [];
  const errors = [];
  let reports = 0;
  for (const directory of fs.existsSync('reports')
    ? fs.readdirSync('reports')
    : []) {
    const report = path.join('reports', directory);
    if (!fs.statSync(report).isDirectory()) continue;
    reports++;
    const diff = path.join(report, 'packages.diff');
    if (fs.existsSync(diff) && fs.statSync(diff).size > 0) {
      differences.push(
        `### ${directory}\n\`\`\`diff\n${fs.readFileSync(diff, 'utf8').slice(0, 6000)}\n\`\`\``,
      );
    }
    const scan = path.join(report, 'trivy.json');
    if (!fs.existsSync(scan)) {
      errors.push(`${directory}: vulnerability report missing`);
      continue;
    }
    try {
      for (const entry of JSON.parse(fs.readFileSync(scan, 'utf8')).Results ||
        []) {
        for (const item of entry.Vulnerabilities || []) {
          if (['HIGH', 'CRITICAL'].includes(item.Severity)) {
            vulnerabilities.push(
              `${directory}: ${item.VulnerabilityID} — ${item.PkgName} ${item.InstalledVersion} (${item.Severity})`,
            );
          }
        }
      }
    } catch {
      errors.push(`${directory}: vulnerability report unreadable`);
    }
  }
  const title = 'Dependency maintenance';
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: 'open',
    creator: 'github-actions[bot]',
    per_page: 100,
  });
  const existing = issues.find(
    (issue) => issue.title === title && !issue.pull_request,
  );
  const attention =
    differences.length ||
    vulnerabilities.length ||
    errors.length ||
    reports !== 2 ||
    result !== 'success';
  if (!attention) {
    if (existing)
      await github.rest.issues.update({
        ...context.repo,
        issue_number: existing.number,
        state: 'closed',
      });
    return;
  }
  const run = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const body = [
    'Automated weekly/manual dependency review. No image has been published.',
    `Checks: **${result}**. [Reports and logs](${run})`,
    ...errors,
    reports !== 2
      ? `Expected two architecture reports; found ${reports}. Inspect the workflow run.`
      : '',
    vulnerabilities.length
      ? '### Known high/critical vulnerabilities\n' +
        vulnerabilities
          .slice(0, 40)
          .map((item) => `- ${item}`)
          .join('\n')
      : '',
    ...differences,
    'Review Dependabot pull requests and these reports, then prepare a new version using the maintenance guide in `.github/README.md`.',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (existing) {
    await github.rest.issues.update({
      ...context.repo,
      issue_number: existing.number,
      body,
    });
  } else {
    await github.rest.issues.create({ ...context.repo, title, body });
  }
};
