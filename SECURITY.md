# Security policy

## Supported versions

Security fixes are provided for the latest published stable Tunlivo release. Older releases, unreleased commits and development images do not receive separate security backports. Check the [latest release](https://github.com/oliverweinrich/tunlivo/releases/latest) and use a specific version tag or digest for deployments; `latest` is a moving tag, not a separate support channel.

This is an independently maintained project. Response and fix times are best-effort; there is no guaranteed support period or response deadline. A successful vulnerability scan does not guarantee that an image has no vulnerabilities.

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting](https://github.com/oliverweinrich/tunlivo/security/advisories/new) when available, or open **Security → Advisories → Report a vulnerability** in this repository.

If private reporting is unavailable, do not publish the vulnerability in an issue or pull request. You may open an issue asking the maintainer to enable a private reporting channel, without including vulnerability details, affected deployments or exploit instructions. Wait for that channel before sharing sensitive information. No private email reporting address is currently published.

Include the affected image tag/digest and architecture, expected and actual behavior, a minimal reproduction, impact and any proposed mitigation. Use disposable test deployments and sanitized configuration. Do not attach private keys, invitation codes, `/data/state.json`, credentials or unredacted logs. Do not test systems you do not own or have permission to test.

The maintainer will assess the report, coordinate a fix and agree on disclosure where practical. Public advisories/release notes should describe affected versions, the fixed version and any required migration or mitigation after a fix is available.

## Deployment boundaries

The host or Docker VM supplies the WireGuard kernel implementation. Host OS, kernel, Docker and application updates remain the operator's responsibility. Tunlivo intentionally exposes the configured service ports; it does not add authentication to those services. Apply their own access controls and restrict published ports/firewall rules to the intended audience.

Keep private configuration, invitation codes, state and backups confidential. A backup contains keys and may contain pairing credentials. See [operations and recovery](docs/OPERATIONS.md) for handling and [versioning](docs/VERSIONING.md) before upgrading.
