# Changelog

Entries record changes supported by the retained delivery reports. The package
version is currently 0.2.0.

## Unreleased — evidence-bundle import transaction, 2026-10-14

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
