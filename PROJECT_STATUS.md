# Reclaimer project status

As of 2026-10-15, Reclaimer is an independently implemented local application,
package version 0.2.0. The unknown-ledger mutation gap and the 22 failing startup,
Swift and debugger checks are fixed in their documented owned-fixture scope.
The complete suite passes with required native/Swift/runtime fixtures.
Previous bundle-import delivery retains its accepted verification scope.
Previous NativeAOT identity, Swift declaration and documentation proofs retain
their recorded scope.
The public branch history and fetched-remote receipt identify each published
revision.

## Evidence currently available

| Evidence | Observed scope | Status |
| --- | --- | --- |
| Previous frozen delivery | 357/357 tests, 53 files, zero failures/skips/cancellations/todos; 139 successful schema-validated operations | Retained baseline; [report](docs/verification/RECOVERY_DELIVERY.md) |
| NativeAOT focused reader/context checks | 66/66 scoped checks, owned packets and a retained compiler specimen | Passed; [scope](docs/verification/NATIVEAOT_IDENTITY.md) |
| Swift focused checks | 45/45; actual compiler/modulewrap output with 14 normalized and 38 raw declarations | Passed; [scope](docs/verification/SWIFT_DECLARATIONS.md) |
| Actual transport integration | Separate NativeAOT 5/5 and Swift 4/4 checks, including evidence export/import and failure preservation | Passed in their documented scope |
| Previous identity/declaration snapshot | Build and 106/106 focused tests; private provider settings absent | Retained previous delivery; snapshot verification is bound to its published manifest |
| Previous identity/declaration strict run | 421/421 tests across 59 files; 139/139 operations; zero failures/skips/cancellations/todos/timeout | Retained run c077cb0c-96f2-45f4-a4a5-73ec14af76c6; [scope](docs/verification/IDENTITY_DECLARATION_DELIVERY.md) |
| Provider datatype response ownership | Four regressions fail before the fix and pass after it; combined focused checks 19/19 | Passed; [scope](docs/verification/PROVIDER_DATATYPE_ISOLATION.md) |
| Previous provider-isolation strict run | 425/425 tests across 60 files; 139/139 operations; zero failures/skips/cancellations/todos/timeout | Retained run 8ff7e3d6-3bb2-43c8-8e3b-6350eeaf4e74; 189 unchanged inputs |
| Native snapshot restore transaction | 13/13 owned cases; combined focused checks 22/22; actual MCP failure preservation and valid retry | Passed; [scope](docs/verification/NATIVE_SNAPSHOT_TRANSACTION.md) |
| Previous snapshot-transaction strict run | 438/438 tests across 61 files; 139/139 operations; zero failures/skips/cancellations/todos/timeout | Retained run 7d179bad-793c-4bbc-b66c-09d281313402; 191 unchanged inputs |
| Evidence-bundle import transaction | 13/13 owned cases; combined focused checks 44/44; actual MCP fault/cancellation/retry and stock CLI import | Passed; [scope](docs/verification/EVIDENCE_IMPORT_TRANSACTION.md) |
| Previous accepted strict run | 451/451 tests across 62 files; 139/139 operations; zero failures/skips/cancellations/todos/timeout | Passed; run 2b93c705-bd49-42f5-b30f-d251b968a7b1; 192 unchanged inputs |
| Unknown-ledger mutation transaction | 14/14 owned cases; 45/45 combined focused checks; actual MCP failure/cancellation/retry for both mutations and stock CLI import | Passed; [scope](docs/verification/UNKNOWN_MUTATION_TRANSACTION.md) |
| Earlier failed full regression | Build passed; 444/466 tests, 22 failures; 138/139 operations | Archived run 35d2e51e-691c-4ba7-b3ec-9d5d81f24cd9 and all 193 inputs retained |
| Bounded startup recovery | Genuine LLDB lifecycle, Node readiness, Swift compiler/pipe and 15 budget cases; all 60 emitted symbols retained | Passed; [scope](docs/verification/STARTUP_RECOVERY.md) |
| Accepted current strict run | 466/466 tests across 63 files; 139/139 operations; zero fail/skip/cancel/todo/timeout | Passed; run 466a7a6c-2424-4fa9-9573-b11024655358; 193 unchanged inputs |
| Compatibility and notices | Two contract digests unchanged; all 57 application notice files retained | Verified and retained |

The initial build attempt reached its syntax deadline. A later run passed build
but reached the former 20-minute suite deadline. Another run ended across a turn
change without a final summary. Their available failure/fixture receipts remain
local. The incomplete TAP also included an obsolete generated-only NativeAOT
expectation and a Node fixture endpoint-discovery timeout; the latter passed in
the latest complete run. Its fixture launch allowance is now bounded to 30 seconds.
The suite now has a verification-only 90-minute allowance. Swift's per-child
ceiling is 30 seconds within the unchanged 120-second aggregate; LLDB separates
bounded setup from observation. Substantive observation, quota and cleanup
assertions remain required. See [startup recovery](docs/verification/STARTUP_RECOVERY.md). The generated-only NativeAOT
expectation was replaced with explicit association and legacy-alias checks; the
accepted complete run above passed after those corrections.

## Capability disposition

- NativeAOT: supported non-generic metadata-to-method-table associations can expose
  inferred semantic names, including mapped types without frozen instances.
  Metadata-only or conflicting names remain unpromoted. IDs and generated aliases
  remain queryable; original_name remains null.
- Swift: actors, nested declarations, supported superclass/protocol expressions,
  genuine globals and byte-derived member traits are available in their documented
  normalized/raw forms. Unsupported member kinds and unknown access stay explicit.
- Database: context-scoped evidence and unknown maps, with explicit JSON
  export/import and native snapshots. No relational database is configured.
- Authentication: local CLI and stdio MCP use host/operator authority.
  No application user-account or login service is implemented.
- Ownership: required third-party notices are retained. Byte-duplication audits
  establish their measured engineering scope, not legal clean-room certification.

## Pending and unestablished

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT generic/layout/code-target recovery, broader Swift
versions/grammars and full REA behavioral equivalence remain unestablished.
The recorded provider datatype local embedding response-aliasing gap is closed
for cached plain model observations. Owned fixture proof does not establish live
vendor datatype inference.

Publication targets the existing codex/reclaimer-public branch in
[navarro1331/Reclaimer](https://github.com/navarro1331/Reclaimer).
It excludes private historical Git, provider configuration, raw diagnostics,
toolchains and generated artifacts. No Mega worker, global install, client setup
or schedule activation is part of this delivery.

See the [roadmap](ROADMAP.md), [completion contract](COMPLETION_CONTRACT.md)
and [changelog](CHANGELOG.md) for scope and follow-up.
