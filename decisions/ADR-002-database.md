# ADR-002: Retain evidence in memory and persist explicit JSON artifacts

**Status:** Proposed decision record of existing implementation; separate approval is not recorded

**Date:** 2026-10-14

**Decider:** Local project operator; no database migration is introduced

## Context

Reclaimer owns investigation evidence, unknown revisions and transient native
annotations. CLI invocations and MCP sessions have different process lifetimes.
The implementation currently needs portable retained artifacts, not a shared
multi-user database.

## Decision

Use Context-owned maps for evidence and unknowns. Persist through explicit
JSON evidence export/import and selected native session snapshots.

Evidence-bundle imports validate bundle shape, operation contracts, content
bindings, references and revision conflicts before inserting records. Historical
identifiers and revisions remain opaque reference data with a local integrity
binding; their original producer digest or authenticity is not established.

Native snapshots are selected-source-bound local session files. The current
snapshot loader checks its protocol and target SHA256, then restores annotations
and evidence directly. These snapshots omit the unknown ledger. They do not
perform the evidence-bundle contract, reference or revision validation described
above. Export files use ordinary file writes, not an atomic backup protocol.

The evidence ledger lives for the context lifetime. Closing a native binary
releases selected-session state but does not purge the retained evidence ledger.
CLI processes do not implicitly share these maps.

## Options considered

| Option | Benefits | Costs |
| --- | --- | --- |
| In-memory maps plus JSON — selected | Simple local ownership; portable evidence; no database service or credentials | Explicit persistence; no shared query engine or automatic crash recovery |
| Embedded SQL store | Could support indexed durable local queries | Needs schema/migration/concurrency design and contract-preserving tests |
| Remote relational/document store | Could support shared investigation state | Adds service operation, authentication, tenancy and data custody requirements |

## Consequences

Evidence must be exported when persistence is wanted. Content digests and unknown
revision links detect internal inconsistencies; they do not authenticate an
author. A JSON export is not a general transactional backup system. Native vendor
temporary projects are provider-owned working artifacts, not Reclaimer's database.

## Follow-up and evidence

Revisit storage when measured persistence, query or shared-session requirements
justify it. Keep future migrations explicit and compatible.
Source evidence: [Context](../lib/core.mjs), [bundle validation and exchange](../lib/evidence.mjs),
[native snapshots](../lib/native.mjs), [completion contract](../COMPLETION_CONTRACT.md).
