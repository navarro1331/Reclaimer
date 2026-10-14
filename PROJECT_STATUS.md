# Reclaimer project status

As of 2026-10-14, Reclaimer is an independently implemented local application,
package version 0.2.0. The current NativeAOT identity, Swift declaration and project
documentation changes passed complete strict verification and are verified for
scoped publication. The public branch history and fetched-remote receipt identify
the published revision.

## Evidence currently available

| Evidence | Observed scope | Status |
| --- | --- | --- |
| Previous frozen delivery | 357/357 tests, 53 files, zero failures/skips/cancellations/todos; 139 successful schema-validated operations | Retained baseline; [report](docs/verification/RECOVERY_DELIVERY.md) |
| NativeAOT focused reader/context checks | 66/66 scoped checks, owned packets and a retained compiler specimen | Passed; [scope](docs/verification/NATIVEAOT_IDENTITY.md) |
| Swift focused checks | 45/45; actual compiler/modulewrap output with 14 normalized and 38 raw declarations | Passed; [scope](docs/verification/SWIFT_DECLARATIONS.md) |
| Actual transport integration | Separate NativeAOT 5/5 and Swift 4/4 checks, including evidence export/import and failure preservation | Passed in their documented scope |
| Provisional sanitized public snapshot | Build and 106/106 focused tests; private provider settings absent | Provisional pass; final snapshot verification is bound separately to the published manifest |
| Accepted current strict run | 421/421 tests across 59 files; 139/139 operations; zero failures/skips/cancellations/todos/timeout | Passed; run c077cb0c-96f2-45f4-a4a5-73ec14af76c6; [delivery scope](docs/verification/IDENTITY_DECLARATION_DELIVERY.md) |
| Compatibility and notices | Two contract digests unchanged; all 57 application notice files retained | Verified and retained |

The initial build attempt reached its syntax deadline. A later run passed build
but reached the former 20-minute suite deadline. Another run ended across a turn
change without a final summary. Their available failure/fixture receipts remain
local. The incomplete TAP also included an obsolete generated-only NativeAOT
expectation and a Node fixture endpoint-discovery timeout; the latter passed in
the latest complete run. Its fixture launch allowance is now bounded to 30 seconds.
The suite has a verification-only 60-minute allowance; product timers and
substantive observation assertions are unchanged. The generated-only NativeAOT
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
The recorded provider-only local embedding issue is a separate follow-up.

Publication targets the existing codex/reclaimer-public branch in
[navarro1331/Reclaimer](https://github.com/navarro1331/Reclaimer).
It excludes private historical Git, provider configuration, raw diagnostics,
toolchains and generated artifacts. No Mega worker, global install, client setup
or schedule activation is part of this delivery.

See the [roadmap](ROADMAP.md), [completion contract](COMPLETION_CONTRACT.md)
and [changelog](CHANGELOG.md) for scope and follow-up.
