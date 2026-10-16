# JavaScript and application graphs

The independent JavaScript subsystem reads explicitly selected local directories
and ASAR archives. It hashes retained bytes, parses JavaScript/JSX and
TypeScript/TSX with Babel, and records two separate representations: an
application graph for artifact and API relationships, and a semantic graph for
lexical bindings, expressions, calls and data flow. No application code is
executed during analysis.

## Inputs and identities

Directory inventories are deterministic path/digest lists. When resource limits
or unreadable entries prevent full enumeration, their root digest describes the
retained inventory and coverage is partial. ASAR roots use the archive byte
digest. Symlinks are not followed. Unpacked ASAR members must resolve beneath the
explicit archive companion directory. Declared SHA-256 integrity disagreements
fail by default; the requested record-and-continue mode records both digests and
marks the bytes untrusted.

Analysis retains at most 4,096 files, 64 MiB of file bytes, 16 MiB per file and
200,000 visited AST nodes. Traversal depth is bounded at 256. Nested ASAR
containers are not recursively expanded. Unsupported containers, malformed
syntax, dynamic calls and computed properties remain explicit limitations or
unknown frontiers.

Application node identities distinguish artifact-local paths from source-map
original metadata and content digests. Observations and relationships include
their authority, location, extractor and evidence references. Source-map original
names never authorize external source-file access. Embedded source content is
hashed; declared source names alone are not proof that a source was shipped.

## Static interpretation

The AST visitor creates lexical scopes, function and parameter nodes, variable
bindings, primitive literals, expression nodes, call sites, return sites and
property slots. Definitions, reads, primitive expression consumption, parameter
arguments and straightforward local function aliases produce resolved static
relations. Unresolved lexical references and dynamic call targets are recorded.
An artifact-wide pass resolves constant ESM imports, namespace members, named
and star re-exports, and selected top-level CommonJS require/export aliases.
Imported function calls can join argument nodes to parameters in the defining
module. Static object aliases and resolvable spreads retain their shapes. Cycles,
conflicting star exports and invalidated mutable bindings remain unknown. The
analysis is not a flow-sensitive abstract interpreter: arbitrary aliases,
mutations, prototypes, dynamic scope, generated code and monkey-patched APIs are
not established.

Named Electron, IPC, context-bridge, storage, request, timer and child-process
syntax produces observations or candidate relations. Literal IPC channels are
paired only when exactly one matching main handler exists. Duplicate handlers
remain ambiguous. API spellings do not prove that a package import or runtime
implementation was invoked. Semantic family coverage stays partial or unsupported
where full lifecycle, promise ownership, event dispatch or cancellation semantics
have not been implemented.

Feature traces traverse the recorded application graph. Semantic queries traverse
retained semantic relations, apply direction and relation filters, and report
relevant unknowns. Trace traversal is bounded to 4,096 nodes. Absence in a partial
graph is never promoted to proof of removal or non-execution.

## Comparisons and recovery

Version comparisons prefer exact identity or byte digests, then artifact path and
semantic labels. Ambiguous correspondence remains unknown. Source-to-bundle
comparison returns visible digest, original-path, current-path, basename and
extension signals. Export-shape comparison handles static primitive object fields,
including nested objects and resolvable spreads. Computed fields, opaque spreads
and dynamic values preserve unknown coverage. The public wire schema requires
two legacy algorithm-name literals; those strings identify the compatible field,
not inherited algorithm code or verified equivalence.

Recovery creates an exclusive output directory and retains the input bytes and
each recovered original separately. Flat version-3 and recursively inline
indexed maps supply embedded `sourcesContent`; maps may be standalone files,
inline JSON data URLs or adjacent files discovered in parsed mapping comments.
Generated VLQ coordinates, UTF-16 source positions, nested section offsets and
strict section ordering are decoded. Overlap rejection covers declared mapping
points; unmapped section extents remain unknown. A bounded loader captures local
external index sections and composes supported downstream maps, preserving
ambiguous positions, missing text and conflicts. Remote maps are not fetched.
Adjacent and referenced maps must resolve beneath the selected input boundary. Map-declared original paths are metadata, never read paths or
write destinations. Repeated declared names receive distinct output files.

Minimal recovery preserves valid UTF-8 input bytes, including a BOM. Standard
recovery removes mapping comments. Aggressive recovery also removes ordinary
comments while preserving recognizable copyright, SPDX and licensing notices,
semantic annotations and selected tool directives. Comment removal retains line
terminators and token-separating whitespace, and checks that the parsed program
digest is unchanged. Malformed inputs retain raw bytes with a warning instead of
claiming a successful rewrite. Transformed outputs do not retain a stale source
map pointer. Every emitted file has a byte count and SHA-256 receipt; provenance
identifies the actual original content rather than reusing the container digest.

Recovery never executes application code and always reports runtime equivalence
as unknown: parsed-program equality does not cover source reflection, debugger or
tool behavior. The source revision identifies the owned files as read; an
executed module revision is not independently attested. Heuristic and inspection
extraction modes currently reuse bounded structural discovery and report partial
coverage. Semantic rewrites and arbitrary bundle-wrapper reconstruction remain
unsupported. A separate [owned reconstruction test](../verification/OWNED_RECONSTRUCTION.md)
compares seven original/recovered CLI scenarios and a mutation control. That
finite execution proof does not change the recovery operation's unknown runtime
equivalence or establish arbitrary reconstruction.

## Evidence projections and closure checks

Android and Apple projections consume concrete supplied inventory entries.
Runtime-family and bridge candidates use path/format conventions and do not
prove initialization, native registration or signature validation. Managed
projections preserve artifact-scoped metadata tokens and static call edges; native
declarations do not prove a loaded native implementation.

Runtime reconciliation accepts concrete V8 and browser captures, including
observed frame/worker containment. Owned packet controls and a real browser
fixture cover these projections. They do not establish unobserved execution.
Byte matching hashes
retained captured source text and rejects conflicting declared digest or byte
count metadata. An explicit operator file-root/URL-prefix mapping can establish
a location candidate; URL mappings enforce origin and path-component boundaries.
Declared-only digests and CDP hashes are not promoted to byte observations.
Repeated mappings do not create duplicate candidates, while duplicated source
bytes and conflicting byte/location matches preserve ambiguity or uncertainty.
Source-map declarations are excluded from primary matching. Unmatched scripts
and absent bounded observations do not establish execution reachability.

Reconstruction ledgers distinguish generated static candidates from reviewed
obligations. Readiness requires owner, required original cases, fixture authority,
enumerated passing verifier evidence, parser bindings when requested, and closed
dependencies. Coverage evaluation checks the supplied artifact/owner digests,
dimensions, freshness, repetitions, package evidence, contradictions and unknowns.
Contradictory retained verifier results override asserted passing bindings.
Duplicate definitions, unavailable contradiction references, missing dependencies
and conflicting records cannot manufacture closure. These functions evaluate an
evidence packet; they never execute a verifier, recompute implementation owners,
inspect deployed packages or grant execution/approval authority.

## Validation

Owned fixtures exercise directory and ASAR bytes, tampered ASAR integrity,
per-file limits, pre-aborted recovery, malformed syntax, JSX/TypeScript, lexical
and cross-module relations, IPC pairing, traces, comparisons, indexed and embedded
source recovery, rewrite levels and notice retention. Projection fixtures pass
authored APK, IPA and managed PE bytes through the actual independent inspection
producers before graph projection. Runtime packet tests cover duplicate and
conflicting content candidates and location boundaries. Closure tests cover a
retained passing verifier result, retained failure, contradictions, malformed
bindings, freshness, normalization and dependency propagation. Public operations
are invoked through `Context.call`; selected bounded helpers are also tested
directly. These observations support the tested branches, not full behavioral
parity. The family coverage report records residual limits.

Third-party API references: [Babel parser](https://babeljs.io/docs/babel-parser),
[Electron ASAR](https://github.com/electron/asar), and
[ECMA-426 source maps](https://tc39.es/ecma426/).
