# Changelog

Entries record changes supported by the retained delivery reports. The package
version is currently 0.2.0.

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
