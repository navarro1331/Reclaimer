# Reclaimer architecture

Reclaimer is a local investigation application. It reads selected artifacts,
observes explicitly selected runtime scenarios, and retains evidence for comparison.
The implementation is separate from Mega-Crossover's control plane.

The compatibility boundary is the existing 95 CLI commands, 139 MCP operations
and six prompts. The Reclaimer executable and legacy real alias reach the same
engine. Public contract files remain the authoritative request/response definitions.

The [six-area extension](docs/verification/SIX_AREA_COMPLETION.md) adds bounded language/format decoders, cooperative debugger cleanup, configured stdlib archive codecs and measured session reporting. Native/JVM inventory stages evidence before committing it; unsupported fields remain explicit. Mega execution and client activation remain separate operator actions.

## Components and data flow

```mermaid
flowchart TD
    CLI["CLI: reclaimer / real"] --> Context["Context: validation, cancellation, dispatch"]
    MCP["MCP: queued stdio requests"] --> Context
    Context --> Artifacts["Artifact and native readers"]
    Context --> JS["JavaScript analysis"]
    Context --> Runtime["Selected runtime observations"]
    Artifacts --> Providers["Operator-configured native providers"]
    Runtime --> Targets["Explicit browser, process or window targets"]
    Artifacts --> Evidence["Validated evidence and unknowns"]
    JS --> Evidence
    Runtime --> Evidence
    Evidence --> Ledger["Context-owned in-memory ledger"]
    Ledger --> Bundles["Explicit JSON export, import and comparison"]
```

| Component | Responsibility | Implementation |
| --- | --- | --- |
| Entry points | Resolve CLI routes or start stdio MCP | [scripts/reclaimer.mjs](scripts/reclaimer.mjs), [lib/cli.mjs](lib/cli.mjs), [lib/protocol.mjs](lib/protocol.mjs) |
| Engine and context | Compose handlers; validate input and successful output; retain evidence | [lib/engine.mjs](lib/engine.mjs), [lib/core.mjs](lib/core.mjs) |
| Static investigation | Bounded file parsing and explicit provider bridges | [Artifact design](docs/architecture/ARTIFACTS.md) |
| JavaScript investigation | Syntax, imports, source maps, relationships and reconstruction obligations | [JavaScript design](docs/architecture/JAVASCRIPT.md) |
| Runtime investigation | Selected browser, inspector, PTY, debugger, Windows UI and bounded Linux X11/AT-SPI observations | [Runtime design](docs/architecture/RUNTIME.md) |
| Evidence storage | Context-scoped maps, content bindings, unknown revisions and JSON exchange | [lib/evidence.mjs](lib/evidence.mjs), [storage decision](decisions/ADR-002-database.md) |

MCP requests share one context and execute through a queue. Cancellation uses
request abort signals. Cancelled requests finish their cleanup path without a
late result/error or progress response; initialize requests cannot be cancelled.
CLI invocations create their own engine context; a command
does not implicitly share an in-memory ledger with a later process.

## Recovery boundaries

NativeAOT readers reconstruct supported bytes, decode embedded metadata and
validate method-table associations. Generic definitions and the qualified
constructed-generic profile require exact metadata, fixup, layout and identity
bindings. Supported reflection-map packets expose recorded entrypoints and field
offsets separately from metadata layout hints. Per-type raw member evidence and
load responses are detached from committed state. Normalized fields still describe
method-table storage; generated aliases and existing IDs remain available. An
entrypoint may be a stub, and an offset does not establish a complete layout or
execution. See the [NativeAOT scope](docs/verification/NATIVEAOT_COMPLETION.md).

Swift readers interpret selected Mach-O metadata and exact serialized formats
0.871, 0.903 and 0.944, each qualified against an owned real producer. Nominal
declarations, actors, supported inheritance and genuine globals enter the
normalized schema. Richer function/generic/dependent types and callable signatures
stay in raw evidence where the schema has no corresponding representation.
Unknown access and unsupported grammars retain explicit dispositions. Recovery
never follows serialized source paths or invokes a compiler. See the
[Swift scope](docs/verification/SWIFT_COMPLETION.md).

## Ownership and authority

Artifact reads and provider output retain their documented selected-source
bindings. Supported branches apply their documented resource, integrity and
cancellation controls. The new recovery paths stage results before publishing
session annotations and evidence; Context dispatch is not a general transaction.
Content digests establish internal consistency; they do not establish caller
identity, signing trust, execution truth or permission.

Local CLI and stdio MCP execution use the launching operator's host authority.
External providers and runtime endpoints retain their own access requirements.
Static investigation does not execute the selected native artifact; runtime
capture is an explicit capability with its own selected targets and limitations.
The application is not a host sandbox.

Private provider settings, toolchains, generated artifacts and raw machine receipts
stay outside the curated public snapshot. Required dependency notices remain in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Mega-Crossover retains only its
external-project metadata and receipts; this repository owns the product.

The [local package builder](docs/operations/LOCAL_INSTALL.md) creates a
host-specific dependency bundle for an isolated prefix. The Docker worker example
uses a sanitized context, explicit project/artifact mounts and a labelled owned
container lifecycle with exact-ID cleanup. Neither package testing nor the worker
example registers a live Mega worker or activates an MCP client.

## Decisions and verification

- [ADR-001: modular local architecture](decisions/ADR-001-architecture.md)
- [ADR-002: in-memory evidence with explicit JSON persistence](decisions/ADR-002-database.md)
- [ADR-003: local execution authority and external authentication boundaries](decisions/ADR-003-authentication.md)
- [Completion contract](COMPLETION_CONTRACT.md)
- [Current project status](PROJECT_STATUS.md)

The [independent design record](docs/architecture/INDEPENDENT_DESIGN.md) explains
ownership and provenance. Passing owned fixtures and validating schemas establish
their stated scope; full REA behavioral equivalence remains unestablished.
