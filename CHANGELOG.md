# Changelog

Entries record changes supported by the retained delivery reports. The package
version is currently 0.2.0.

## Managed Boolean values and Electron cleanup - 2026-10-16

- Preserve decoded custom-attribute Booleans as JSON `false` and `true`, including
  boxed values and array elements. Reject invalid Boolean bytes as before.
- Add owned regression coverage and scalar representation controls. See the
  [scope and verification](docs/verification/MANAGED_BOOLEAN_VALUES.md).
- Retry transient owned Electron profile locks within a bounded attempt budget
  and defer evidence publication until cleanup and final validation succeed.
  See the [cleanup correction](docs/verification/ELECTRON_PROFILE_CLEANUP.md).
- Preserve CLI/MCP contracts, dependencies and required notices. Mac/IDA checks
  and client/live worker activation remain pending.

Accepted frozen run `670765f9-3115-4b0b-a7d0-1fd98d0a8e84`: build and **694/694 tests in 92 files**, 139/139 successfully schema-validated operations, zero failures/skips/cancellations/todos/timeouts, and 326 unchanged frozen inputs (manifest SHA256 `2cfbc8fac584b7218f92ab19c790f7876f3e296e2865c44670589ac49fff3399`). Required NativeAOT, Swift, runtime, JVM/codec and Linux UI producer checks passed. The isolated offline package CLI/MCP/native PTY checks passed. These results qualify the recorded fixture scope, not exhaustive behavior or REA parity.

## Six-area capability extension - 2026-10-16

- Extend observed NativeAOT generic/readonly profiles and Swift standalone, pack/InlineArray and ARM64 relocation routes with owned compiler fixtures.
- Add DEX041/JVM Code profiles, auxiliary managed signatures, binary CPIO, HFS overflow and explicitly configured bounded XAR codecs.
- Consume native observations in JavaScript comparison, classify digest-bound source-map partitions, enrich finite resource/promise ownership and package routing, and reconstruct selected closed CommonJS tables.
- Add Electron observation hooks, public Hopper metadata/uncertainty, cooperative LLDB cancellation and selected Linux X11/AT-SPI UI proof.
- Evaluate PTY trace/freshness options and report observed session lifecycle/capabilities/bindings. See [scope and remaining reasons](docs/verification/SIX_AREA_COMPLETION.md).
- Bind newly decoded JVM/managed/archive output to exact parsed source bytes and stage extraction evidence/output rollback for late cancellation or invalid replies.

Accepted frozen run `70fb842b-1aa2-4aef-b6c6-cd16267847e1`: build and **679/679 tests in 90 files**, 139/139 successfully schema-validated operations, and zero failures, skips, cancellations, todos or timeouts. All 322 frozen inputs remained unchanged (manifest SHA256 `f13a162bc454c092e5fc25a3de27e330a07e4e099ddfb8d9474e571710dc757d`). Native, Swift, runtime, JVM/codec and isolated Linux UI producer checks were required. The same frozen runtime passed 18 actual stock-SDK transport cases and 411 calls plus the existing CLI annotation flow, with zero SDK notices. Offline isolated package CLI/MCP/native PTY checks and the contained Linux worker passed with source preservation and physical cleanup. These measurements qualify the documented finite scope; they do not establish exhaustive branch coverage, arbitrary reconstruction or full REA parity.

## Local capability extension — 2026-10-16

- Recover generic definitions and the qualified NativeAOT constructed-generic
  profile, compound metadata signatures, recorded reflection entrypoints and
  object/unboxed field offsets with selected-byte bindings and conflict controls.
- Keep declared layout hints separate from runtime offsets, fixed method-table
  storage separate from instance fields, generated aliases intact and per-type
  raw member/load responses detached from committed state.
- Qualify Swift serialized formats 0.871/0.903/0.944 with real owned producers;
  retain richer function/generic/dependent types and callable signature facts in
  existing raw evidence. Bound retained JSON expansion before allocation and
  deduplicate NativeAOT signature provenance under a shared cancellable work cap.
- Suppress discarded MCP replies and progress after request cancellation. Verify
  explicit stock SDK abort reason, preserved annotation state, retry and zero
  late unknown-ID notices without an SDK patch or warning filter.
- Compare seven owned original/recovered CLI scenarios and file effects, with an
  arithmetic mutation control; retain unknown general runtime equivalence.
- Add a host-specific local dependency bundle, offline isolated CLI/MCP checks
  and a sanitized Docker worker example. Reject self-nested output, detect
  capture overflow and retire only the exact labelled container on failure or
  timeout. Keep live worker/client activation pending.
- Preserve CLI/MCP contracts, dependency selections, lock bytes and 57 notices.
  Package metadata adds only the local build script and explicit file selection.

Accepted strict run `9862b2d1-87c2-4cbf-a3b4-7216fe8bbaa5`: build, 595/595 tests
in 72 files, 139/139 operations and 278 unchanged frozen inputs, with
zero fail/skip/cancel/todo/timeout and required native/Swift/runtime plus fresh
NativeAOT and all three Swift producers. Actual transport passed 18 cases/411 calls
with zero SDK notices. The same frozen inputs passed offline isolated installation,
installed native PTY and the contained Linux worker/image checks. Historical
focused and failed attempts are retained separately. Mac and licensed IDA checks remain pending; unsupported
recovery and full REA parity remain explicit. See the
[capability scope](docs/verification/CAPABILITY_COMPLETION.md).

## Recorded native annotation transaction — 2026-10-16

- Prepare names, comments, inline comments and bookmarks in request-local drafts
  for seven manual operations; hold evidence unpublished until final validation.
- Capture the original caller signal and transfer private commit metadata through
  a WeakMap. Check final reply shape, prepared value, session/model/map identity,
  touched keys and wider annotation dossier reads before synchronous commit.
- Preserve complete prior maps, ledger and history on owned failure/cancellation,
  and retain successful independent writes instead of restoring an old snapshot.
- Bind cold provider model reads and closed-session resource ownership; preserve
  nested `this.call` work through the original Context.
- Reproduce 47 failures with 5 passing controls among
  52 final owned baseline cases; combined focused checks 123/123.
  Verify 18 actual MCP cases and the existing stock CLI annotation command.
- Keep CLI/MCP contracts, package/lock and 57 notices unchanged. Automatic
  NativeAOT names, navigation and native snapshot transactions keep their scope.

Accepted run `1c301034-1bc0-46e0-8296-2564834d9a9f` passes **532/532 tests** across **65 files**,
build and 139/139 operations, zero fail/skip/cancel/todo/timeout; 197 frozen
inputs stayed unchanged. The previous 480-test name-batch delivery and its
owned process-fixture corrections retain their historical proof. Mac checks remain
pending; broader parity is unestablished. Publication still requires separately
verified sanitized snapshot and fetched remote receipts. See
[scope](docs/verification/ANNOTATION_TRANSACTION.md).

## Recorded native name-batch validation — 2026-10-16

- Stage all ordered address parses before writing native names, preserving the
  existing map, original reply keys and alias order. A later malformed address
  leaves source bytes, prior maps, ledger and history unchanged; valid retry works.
- Reproduce 8 failures and 6 passing controls in the final 14-case owned baseline.
  Fixed combined focused checks pass 36/36 without provider or target execution.
- Verify actual MCP malformed-batch errors, complete prior-bundle preservation,
  valid retry and native snapshot close/restore, plus the existing CLI selected-
  artifact snapshot flow. There is no CLI batch-name command.
- Require genuine completion in owned PTY comparison/cleanup fixtures before
  semantic and physical-exit assertions; keep finite waits, terminal bytes and
  unchanged/changed expectations. Product comparison and cleanup policy stay intact.
- Retain targetless empty batches, missing-session precedence, ignored `document`,
  empty names, named spaces, aliases and all unchanged contracts/package/notices.

Accepted run `d12f2b0d-3c85-4734-862d-dd60eae5be94` passes **480/480 tests** across **64 files**,
build and 139/139 operations, zero fail/skip/cancel/todo/timeout; 194 frozen
inputs stayed unchanged. Previous accepted 466/466 startup proof retains its scope.
Later wrapper evidence failure/cancellation and general `annotate` rollback remain
open. Mac checks remain pending; broader parity is unestablished. Publication still
requires separate sanitized-snapshot and fetched remote receipts. See
[scope](docs/verification/NAME_BATCH_VALIDATION.md).

## Recorded startup recovery and unknown-ledger mutation update — 2026-10-15

- Prepare unpublished mutation evidence, recheck retained state after await and
  commit event/revision together. Fourteen owned cases and actual MCP/CLI checks
  cover failure, cancellation, competing writes and valid retries.
- Give Swift demangler children a 30-second ceiling within the unchanged
  120-second aggregate. Add a real pre-readiness deadline case; retain child-exit,
  output, input, symbol and no-partial-evidence checks.
- Start LLDB observation after launch, preserve the complete reply through a
  duplicated pipe descriptor, and clean up the target on extraction failure.
- Use bounded compiler/inspector/SDK readiness. Keep all 60 real compiler symbols
  in separate genuine bounded batches, and require all native/Swift/runtime files.
- Set the full suite's verification-only allowance to 90 minutes. Keep CLI/MCP
  contracts, package/lock and all 57 notice hashes unchanged.

Accepted run `466a7a6c-2424-4fa9-9573-b11024655358` passes **466/466 tests** in **63 files**,
build and 139/139 operations, zero fail/skip/cancel/todo or timeout; 193 frozen
inputs stayed unchanged. The earlier 22-failure run remains archived. Mac checks
remain pending. See [startup recovery](docs/verification/STARTUP_RECOVERY.md) and
[unknown mutations](docs/verification/UNKNOWN_MUTATION_TRANSACTION.md).

## Recorded evidence-bundle import transaction — 2026-10-14

- Prepare historical integrity bindings without publication before inserting
  records or unknown revisions. Recheck retained conflicts after binding await,
  stage owned values and check cancellation before synchronous commit.
- Add 13 owned cases for failure/cancellation preservation, a controlled Context
  revision race and native/historical import compatibility.
- Verify actual MCP fault/cancellation/retry with an explicit owned fixture hook
  and a stock CLI import. Keep schemas, dependency selections and 57 notices intact.
- Give owned Swift deadline fixtures sufficient setup time to reach the asserted
  branches after observed cold-start failures; product budgets are unchanged.

Focused verification passes 44/44. Accepted run `2b93c705-bd49-42f5-b30f-d251b968a7b1` passes **451/451 tests**
in **62 files**, build and 139/139 operations with zero fail/skip/cancel/todo or
timeout. Mac checks remain pending. See [scope](docs/verification/EVIDENCE_IMPORT_TRANSACTION.md).

## Recorded native snapshot restore transaction — 2026-10-14

- Stage snapshot annotation maps and validated evidence before selecting a target
  or changing the native session/ledger. Reject conflicting records and check
  cancellation before commit; retain identical records idempotently.
- Add 13 owned restore cases, including malformed input, failure preservation,
  late cancellation, writer round trips and compatibility controls.
- Verify actual MCP error envelopes, prior-evidence preservation and valid retry.
- Preserve CLI/MCP contracts, snapshot writer/protocol, dependency selections and
  all 57 application notices. Mac checks remain pending.

Focused verification passes 22/22. Accepted run `7d179bad-793c-4bbc-b66c-09d281313402` passes **438/438 tests**
in **61 files**, build and 139/139 operations with zero fail/skip/cancel/todo or
timeout. See [scope](docs/verification/NATIVE_SNAPSHOT_TRANSACTION.md).

## Recorded provider datatype isolation — 2026-10-14

- Clone cached provider datatype replies before optional address projection so
  name, ID and address responses do not share mutable values with the cache.
- Add four owned regressions covering caller mutation, retained evidence,
  subsequent lookups and earlier-reply stability after provider cache updates.
- Preserve CLI/MCP contracts, package/lock selections and all 57 application
  notice files. Mac checks remain pending.

All four regressions fail before the fix and pass afterward; the combined focused
check passes 19/19. Accepted frozen run `8ff7e3d6-3bb2-43c8-8e3b-6350eeaf4e74` passes **425/425 tests**
across **60 files**, build and 139/139 operations with zero fail/skip/cancel/todo
or timeout. See [the scoped report](docs/verification/PROVIDER_DATATYPE_ISOLATION.md).

## Recorded identity/declaration update — 2026-10-14

### Added

- Bounded NativeFormat assembly, namespace, type, method and field inventories.
- Validated non-generic TypeMap/CommonFixups associations, including additional
  fixed method tables without frozen-instance anchors.
- Owned NativeAOT compiler/packet fixtures and actual CLI/MCP identity flows.
- Swift actor/nested/global declarations, supported inherited type expressions
  and raw constructor/member traits from selected serialized 0.903 bytes.
- Aggregate Swift record, operand, output and semantic-work budgets, conflict
  suppression and owned malformed/source/cancellation fixtures.
- Root architecture, roadmap, status and completion documents; three ADRs and
  a detailed-documentation index.

### Changed

- NativeAOT semantic names use inferred origin and retain existing IDs/generated
  selectors and original_name:null under unchanged CLI/MCP contracts.
- Recovered datatype and raw identity replies remain detached from cached session
  definitions and retained evidence.
- Syntax verification runs bounded concurrent Node checks. The full suite's
  verification-only wall-clock allowance is 60 minutes; product limits are unchanged.
- Existing Swift fixture expectations now prove supported superclass/conformance
  branches instead of treating them as omitted.

Complete strict verification passed **421/421 tests** across
**59 files**, with 139/139 successful schema-validated operations and
zero failures, skips, cancellations, todos or timeout. Accepted run:
c077cb0c-96f2-45f4-a4a5-73ec14af76c6. Curated publication verification is recorded separately;
[PROJECT_STATUS.md](PROJECT_STATUS.md) links the delivery scope.
Mac checks and broader recovery/parity limits remain open.

## Recorded baseline — Reclaimer 0.2.0

- Renamed the independent application from {real} to Reclaimer, retaining the
  real executable alias, REAL_* settings and historical wire identifiers.
- Added supported NativeAOT rehydration/fixed storage and bounded Swift metadata
  and declaration recovery using owned fixtures.
- Added literal closed-pipe Swift input and an aggregate demangling batch budget.
- Retained the existing CLI/MCP contracts and required third-party notices.
- Recorded a frozen 357/357-test delivery and a separately curated public snapshot.

See the [baseline recovery report](docs/verification/RECOVERY_DELIVERY.md).
