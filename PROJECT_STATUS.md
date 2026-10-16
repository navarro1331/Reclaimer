# Reclaimer project status

Current delivery: the [managed Boolean correction](docs/verification/MANAGED_BOOLEAN_VALUES.md) fixes typed custom-attribute values. The [Electron cleanup correction](docs/verification/ELECTRON_PROFILE_CLEANUP.md) addresses transient profile locks and evidence publication after cleanup. Its complete frozen verification passed. The [six-area extension](docs/verification/SIX_AREA_COMPLETION.md) retains the broader implementation, information-loss and unavailable-provider limits; its accepted measurements below describe the preceding delivery.

Accepted frozen run `670765f9-3115-4b0b-a7d0-1fd98d0a8e84`: build and **694/694 tests in 92 files**, 139/139 successfully schema-validated operations, zero failures/skips/cancellations/todos/timeouts, and 326 unchanged frozen inputs (manifest SHA256 `2cfbc8fac584b7218f92ab19c790f7876f3e296e2865c44670589ac49fff3399`). Required NativeAOT, Swift, runtime, JVM/codec and Linux UI producer checks passed. The isolated offline package CLI/MCP/native PTY checks passed. These results qualify the recorded fixture scope, not exhaustive behavior or REA parity.

Previous accepted baseline: as of 2026-10-16, Reclaimer is an independently implemented local application, package version 0.2.0. Accepted frozen run `70fb842b-1aa2-4aef-b6c6-cd16267847e1`: build and **679/679 tests in 90 files**, 139/139 successfully schema-validated operations, and zero failures, skips, cancellations, todos or timeouts. All 322 frozen inputs remained unchanged (manifest SHA256 `f13a162bc454c092e5fc25a3de27e330a07e4e099ddfb8d9474e571710dc757d`). Native, Swift, runtime, JVM/codec and isolated Linux UI producer checks were required. The same frozen runtime passed 18 actual stock-SDK transport cases and 411 calls plus the existing CLI annotation flow, with zero SDK notices. Offline isolated package CLI/MCP/native PTY checks and the contained Linux worker passed with source preservation and physical cleanup. These measurements qualify the documented finite scope; they do not establish exhaustive branch coverage, arbitrary reconstruction or full REA parity.

Mac and licensed IDA are unavailable. Client and live Mega worker activation remain pending as directed by the operator.

## Evidence currently available

| Evidence | Observed scope | Status |
| --- | --- | --- |
| Current Boolean and Electron cleanup strict run | 694/694 tests across 92 files; 139/139 operations; zero fail/skip/cancel/todo/timeout; 326 unchanged inputs | Passed; run 670765f9-3115-4b0b-a7d0-1fd98d0a8e84; [scope](docs/verification/MANAGED_BOOLEAN_VALUES.md) |
| Previous six-area strict run | 679/679 tests across 90 files; 139/139 operations; zero fail/skip/cancel/todo/timeout; 322 unchanged inputs | Passed; run 70fb842b-1aa2-4aef-b6c6-cd16267847e1; [scope and remaining reasons](docs/verification/SIX_AREA_COMPLETION.md) |
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
| Previous startup-recovery strict run | 466/466 tests across 63 files; 139/139 operations; zero fail/skip/cancel/todo/timeout | Retained accepted run 466a7a6c-2424-4fa9-9573-b11024655358; 193 unchanged inputs |
| Native address-name batch validation | Final 14 owned cases: baseline 8 failures and 6 passing controls; fixed combined focused checks 36/36; actual MCP retry/snapshot and existing CLI flow | Passed; [validation-only scope](docs/verification/NAME_BATCH_VALIDATION.md) |
| Previous name-batch strict run | 480/480 tests across 64 files; 139/139 operations; zero fail/skip/cancel/todo/timeout | Retained accepted run d12f2b0d-3c85-4734-862d-dd60eae5be94; 194 unchanged inputs |
| Manual native annotation transaction | Final 52 owned baseline cases: 47 failures, 5 passing controls; combined focused 123/123; 18 actual transport cases and stock CLI annotation | Passed; [bounded scope](docs/verification/ANNOTATION_TRANSACTION.md) |
| Previous accepted annotation strict run | 532/532 tests across 65 files; 139/139 operations; zero fail/skip/cancel/todo/timeout | Passed; run 1c301034-1bc0-46e0-8296-2564834d9a9f; 197 unchanged inputs |
| NativeAOT completion extension | Generic definitions and bounded constructed identities, signatures, recorded method entrypoints and object/unboxed field offsets | Passed focused and integrated checks; [scope](docs/verification/NATIVEAOT_COMPLETION.md) |
| Swift completion extension | Three real producer versions with exact 0.871/0.903/0.944 profiles, richer signatures and bounded declaration expansion | Passed focused and integrated checks; [scope](docs/verification/SWIFT_COMPLETION.md) |
| MCP cancellation response ownership | Corrected explicit-abort baseline: 7 failures/4 passing controls; fixed combined checks 65/65, zero SDK notices | Passed; [scope](docs/verification/MCP_CANCELLATION.md) |
| Owned reconstruction scenarios | Seven original/recovered CLI scenario pairs and a mutation control; exact outputs, exits and file effects | Passed 1/1; [scope](docs/verification/OWNED_RECONSTRUCTION.md) |
| Previous accepted capability strict run | 595/595 tests across 72 files; 139/139 operations; zero fail/skip/cancel/todo/timeout | Passed; run 9862b2d1-87c2-4cbf-a3b4-7216fe8bbaa5; 278 unchanged inputs |
| Frozen actual transport | 18 cases/411 calls plus existing CLI annotation; preserved state/retry/source/cleanup; zero SDK notices | Passed; [scope](docs/verification/MCP_CANCELLATION.md) |
| Local package and worker preparation | Current correction reruns the isolated package CLI/MCP/native PTY checks; the worker-image qualification belongs to the previous six-area delivery | Worker image is not rebuilt by this correction; client/live worker activation remains pending; [guide](docs/operations/LOCAL_INSTALL.md) |
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

Owned process fixtures also require genuine completion before their semantic
assertions: the comparison fixture uses a bounded 15-second window and explicit
natural-exit checks, retaining all terminal bytes and unchanged/changed controls.
Those earlier cleanup-fixture wait corrections are limited to their recorded
source hashes and proof in [the name-batch scope](docs/verification/NAME_BATCH_VALIDATION.md).
That delivery left product cleanup behavior unchanged. The current Electron
correction changes profile-removal retries and evidence publication as described
in [its scope](docs/verification/ELECTRON_PROFILE_CLEANUP.md).

## Capability disposition

- NativeAOT: validated generic definitions and a finite .NET 8 win-x64 constructed
  profile expose inferred identities while preserving generated aliases and null
  original_name. Supported reflection maps expose raw entrypoints and field offsets
  with object/unboxed bases. Metadata layout declarations remain separate.
- Swift: exact serialized versions 0.871/0.903/0.944, richer function/generic and
  dependent types, indexed callable signatures and supported declaration traits
  retain their normalized/raw scope. Other versions and grammars stay explicit.
- Database: context-scoped evidence and unknown maps, with explicit JSON
  export/import and native snapshots. No relational database is configured.
- Authentication: local CLI and stdio MCP use host/operator authority.
  No application user-account or login service is implemented.
- Ownership: required third-party notices are retained. Byte-duplication audits
  establish their measured engineering scope, not legal clean-room certification.

## Pending and unestablished

The later naming-wrapper and seven manual native annotation failure/cancellation
branches are closed in the [owned transaction scope](docs/verification/ANNOTATION_TRANSACTION.md).
General operation transactions, automatic NativeAOT names, navigation and native
snapshot restoration keep their separate scopes. No universal atomicity or broad
provider/resource guarantee is established.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending, as does licensed live IDA verification. The linked completion scopes
qualify finite NativeAOT generic/layout/code-target and Swift version/grammar
extensions. Arbitrary original layouts, other generic/runtime profiles, unsupported
Swift forms, arbitrary reconstruction and full REA behavioral equivalence remain
unestablished.
The recorded provider datatype local embedding response-aliasing gap is closed
for cached plain model observations. Owned fixture proof does not establish live
vendor datatype inference.

Publication targets the existing codex/reclaimer-public branch in
[navarro1331/Reclaimer](https://github.com/navarro1331/Reclaimer).
It excludes private historical Git, provider configuration, raw diagnostics,
toolchains and generated artifacts. The local package and contained worker example are test preparation. No live
Mega worker registration, global install, client setup or schedule activation is
performed. See the [completion scope](docs/verification/CAPABILITY_COMPLETION.md).

See the [roadmap](ROADMAP.md), [completion contract](COMPLETION_CONTRACT.md)
and [changelog](CHANGELOG.md) for scope and follow-up.
