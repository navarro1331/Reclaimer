# ADR-003: Use local execution authority and retain external authentication boundaries

**Status:** Proposed decision record of existing implementation; separate approval is not recorded

**Date:** 2026-10-14

**Decider:** Local project operator; no new login or authorization gate is introduced

## Context

The product's documented entry points are a local CLI and stdio MCP.
Providers and selected browser/debugger endpoints may have their own access
requirements. Protocol metadata and evidence hashes must not be mistaken for
authenticated user identity.

## Decision

Use the launching operator's existing host/process/file authority for the local
application. Do not add an application account database, login flow or token issuer
for this deployment. The stdio MCP initialization handshake negotiates protocol
capabilities; clientInfo names are client-supplied metadata.

Keep provider and endpoint authentication with those external systems. An
unsupported authenticated transport remains an explicit prerequisite/error; it is
not replaced with a weaker connection. Configured endpoints and executable paths
do not independently prove access permission or target identity.

## Options considered

| Option | Benefits | Costs |
| --- | --- | --- |
| Local authority and external boundaries — selected | Matches current CLI/stdio operation and avoids a new credential service | Not sufficient for exposing a shared network service |
| Application-managed accounts/tokens | Could identify callers in a hosted product | Adds credential handling, revocation and authorization policy outside current scope |
| External identity proxy for a future remote service | Could delegate identity lifecycle | Still requires explicit service, tenancy, authorization and transport design |

## Consequences

Protect local artifacts and provider configuration with appropriate host controls.
Content hashes establish consistency, not signing trust or authorization.
Selected-origin and process-ownership checks limit observations; they are not a
user login mechanism or a complete host sandbox.

A future network service needs a separately reviewed authentication, authorization,
tenant isolation and data-handling design before that deployment is claimed.

## Follow-up and evidence

Keep private provider settings and sensitive captures out of the public snapshot.
Do not infer hosted-service readiness from local fixtures.
Source evidence: [stdio protocol](../lib/protocol.mjs), [engine configuration](../lib/engine.mjs),
[runtime transport boundaries](../docs/architecture/RUNTIME.md),
[architecture](../ARCHITECTURE.md).
