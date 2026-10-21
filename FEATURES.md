# Planned features

Ideas and a proposed implementation order. Unchecked items below have not yet
been implemented; version numbers are planning targets, not commitments.
The gateway should remain easy to configure and operate through Compose.

## Next step: Status, diagnostics and logs

Proposed scope for version 1.1:

- [ ] **Status command:** Show pairing state, peer, last handshake time,
      received/sent bytes and configured forwarding rules.
      Also provide machine-readable JSON output.
- [ ] **Diagnostics command:** Check configuration, DNS resolution, the WireGuard
      interface, handshake and TCP destination ports separately. Identify the
      affected component when a check fails; do not infer UDP reachability from
      a simple port test.
- [ ] **Consistent operational logs:** Timestamps, log levels and clear events
      for startup, pairing, errors and recovery; support text or JSON output.
- [ ] **Protect sensitive values:** Exclude private keys and invitation tokens
      from normal operational and diagnostic logs. Allow invitations to be
      retrieved explicitly through the existing invitation command.
- [ ] **Summarize repeated errors:** Avoid identical messages every second;
      make state transitions and recovery visible.
- [ ] **Distinguish local health from reachability:** An offline client should
      not cause unnecessary restarts through the local healthcheck. Report peer
      and destination status separately, including when each check was performed.

Success criterion: Users can determine whether pairing is missing, the tunnel
is not responding or the destination is unreachable without manually combining
several tools. An old handshake alone does not reliably mean “offline”.

## After that: Observability and operation

- [ ] **Optional Prometheus metrics:** Transferred bytes and last handshake time
      per peer, plus successful/rejected pairing attempts. Add destination
      checks as separate metrics only when those checks are enabled.
- [ ] **Keep monitoring internal:** Do not expose metrics publicly by default.
      Do not use keys, invitation tokens or arbitrary visitor addresses as
      metric labels.
- [ ] **Optional connection logs:** Log the rule, protocol, duration, bytes and
      result of a proxy session. Do not record payloads; make visitor IP logging
      explicitly opt-in. Session logs are written when a session ends and do
      not replace a live view of active connections.
- [ ] **Configurable timeouts:** Configure connection establishment and TCP/UDP
      idle timeouts through documented environment variables.
- [ ] **Replace a specific client:** Revoke the existing pairing and generate
      a new invitation without manually deleting the entire volume. Require
      explicit confirmation of the impact on the running tunnel.
- [x] **Backup and recovery:** A documented procedure for gateway state,
      including protection of the keys stored in it. See
      [operations and recovery](docs/OPERATIONS.md).

Metrics provide current measurements. External tools can handle long-term
storage, charts and alerting; the gateway does not need its own time-series
database for this.

## Later: Optional web interface

Start with a read-only interface; all operations remain available without a UI:

- [ ] Overview of local health, pairing, peer and latest measurement times.
- [ ] Show traffic and handshake age; do not infer an unverified online/offline
      state from handshake age alone.
- [ ] List forwarding rules with incoming port, protocol and destination.
- [ ] Show filtered operational logs and the results of requested diagnostics.
- [ ] Link to historical charts when monitoring is connected.

Later management features could include invitations, revocation and rule
changes. First, decide whether Compose remains the sole configuration source.
An initial editor could export Compose configuration instead of silently
storing a second, divergent configuration.

The interface remains optional, with no public port exposure by default.
Management access that can change settings requires authentication, protected
transport and safeguards against unintended actions. It does not control the
Docker host or application containers; a Docker socket mount is not required
for a gateway status interface.

## Later: Automatic pairing for multiple clients

Automatic pairing currently supports one server-client pair. Multiple peers
can already be configured manually. This extension would allow convenient
registration of several independent client gateways.

Example with one public server:

| Public port | Client gateway              | Destination service     |
| ----------- | --------------------------- | ----------------------- |
| TCP 8080    | Home server                 | Web application         |
| TCP 8081    | Server at a second location | Another web application |
| TCP 9000    | Test machine                | Development service     |

- [ ] Manage a separate invitation, identity and tunnel address for each client.
- [ ] Provide names instead of just keys to identify clients and their rules.
- [ ] Revoke individual clients without interrupting other tunnels.
- [ ] Assign forwarding rules to a specific client and detect port conflicts.
- [ ] Prevent separate clients from reaching one another by default.
- [ ] Add tests for concurrent registrations, restarts and revocation.

A client here means a **gateway container at a destination site**, not a
visitor to an exposed service. Many visitors or players using the same
service do not require additional WireGuard clients. Multiple services on
the same machine can also share a single client gateway.
