# Versioning and compatibility

Tunlivo uses stable `MAJOR.MINOR.PATCH` versions, recorded in the root `VERSION` file. Git tags use a `v` prefix; Docker tags do not. The tag, commit, image labels, examples and matching source/license archives must describe the same release.

| Change                                                                         | Version increment |
| ------------------------------------------------------------------------------ | ----------------- |
| Compatible bug fix, security fix or dependency/package refresh                 | Patch             |
| New optional capability with existing configurations still working             | Minor             |
| Breaking configuration, protocol, persisted-state or supported-platform change | Major             |

Assess dependency updates by their impact on Tunlivo. An Alpine or Go major/minor update does not automatically require a Tunlivo major release, but it still requires compatibility tests. Commit prefixes do not select or publish a release automatically. Documentation-only changes do not normally require a new runtime image.

## Compatibility contract

Treat environment variable names and accepted values, forwarding behavior, documented defaults, required privileges, supported architectures, the pairing protocol and persisted `/data` state as public interfaces. A change that makes an existing valid deployment fail or requires operator intervention is breaking unless it is a documented correction of unsafe/invalid behavior; explain any security-driven exception explicitly.

Both gateway sides should normally use the same release. Mixed-version protocol compatibility is not guaranteed unless explicitly tested and documented in release notes. Update both sides during a maintenance window when needed.

Before changing state or protocol formats:

- Define how existing state/configuration is detected, migrated or rejected with an actionable error. Never silently discard keys or create a fresh pairing in place of unreadable state.
- Add fixtures/tests for old supported state and, where relevant, old/new peer combinations. Do not claim compatibility based only on fresh pairing tests.
- Document whether migration is automatic, whether both sides must update together, and whether an older image can read the new state.
- Explain rollback before releasing. An image downgrade alone may be insufficient after a state migration; restore the matching pre-upgrade backup on both sides when necessary.

Current state is stored as JSON by the Go pairing helper and has no explicit schema-version field. Do not infer downgrade compatibility from successful JSON parsing. Changes to that structure require an explicit compatibility assessment; a future schema-version field is not implemented by this policy.

## Release identity and notes

Use `bash release/set-version.sh X.Y.Z` to update the central version and image references. Review the diff, merge through a PR, then tag the corrected commit on `main`. Choose a new unused version; do not move published tags or overwrite versioned images or archives.

Each release note should state the user-visible changes, relevant dependency/security updates, supported platforms, any configuration/state/protocol changes, upgrade steps and rollback limitations. Link matching source/license assets. Use the [release checklist](RELEASE_CHECKLIST.md) to verify publication.
