# ADR-001: Use a modular local investigation engine

**Status:** Proposed decision record of existing implementation; separate approval is not recorded

**Date:** 2026-10-14

**Decider:** Local project operator; this record documents existing behavior

## Context

The operator requested an independent implementation preserving existing CLI/MCP
contracts. Static parsing, native providers, JavaScript analysis and runtime
observations need different prerequisites and ownership rules. Reclaimer remains
a separate product from Mega-Crossover.

## Decision

Use a Node.js ES-module engine with explicit subsystem handler ownership and a
shared validating Context. Local CLI and queued stdio MCP dispatch to that engine.
Keep bounded static readers separate from explicitly configured provider and
runtime calls. Preserve raw evidence and unsupported dispositions.

## Options considered

| Option | Benefits | Costs |
| --- | --- | --- |
| Modular local engine — selected | One compatibility boundary; testable pure readers; provider-specific ownership and limits | Requires disciplined composition and integration checks |
| One combined handler module | Simple initial dispatch | Couples provider lifecycle, parsing and evidence behavior |
| Hosted investigation service | Could support shared remote sessions | Adds deployment, tenant isolation, authentication and data custody scope that is not part of this product |

These are documented trade-offs, not a claim that every alternative was previously
implemented or benchmarked.

## Consequences

Handler ownership conflicts fail composition. Schema validation is shared, while
each branch retains its resource and prerequisite limits. Vendor availability
and successful static parsing do not establish behavioral parity. Context-scoped
state and local host authority require deliberate handling of provider resources
and selected runtime targets.

## Follow-up and evidence

Maintain the [architecture overview](../ARCHITECTURE.md) and
[completion contract](../COMPLETION_CONTRACT.md). Prove new branches with owned
fixtures and actual transport checks before promoting their claims.
Source evidence: [engine](../lib/engine.mjs), [Context](../lib/core.mjs),
[protocol](../lib/protocol.mjs), [independent design](../docs/architecture/INDEPENDENT_DESIGN.md).
