# Reclaimer identity and declaration delivery

NativeAOT recovery now reads embedded NativeFormat assembly, namespace, type,
method and field identities. A semantic type name requires an explicit non-generic
TypeMap token, a uniquely mapped CommonFixups pointer, a validated fixed
method-table layout and matching recorded hash/bucket. This includes supported
types without frozen-instance anchors. Metadata-only names remain inventories;
conflicting identities suppress annotations. Existing type IDs, address queries
and generated aliases remain valid. Selected-byte hashes and association details
are retained in raw evidence. The existing original_name field remains null.
Fresh CLI type inspection recovers directly from selected bytes and publishes only
the requested evidence. Fields describe method-table storage; original managed
instance layouts and method entry-point bindings are not fabricated.
See [NativeAOT identity scope](NATIVEAOT_IDENTITY.md).

Swift declaration recovery covers actors, nested types, protocol relationships,
superclasses, supported generic/alias-bound expressions, genuine global functions
and variables, and raw constructor/member traits. The owned Swift 6.1.3 fixture
produces 14 normalized declarations and 38 raw declaration rows, with nondefault
required, convenience, override and final facts. Unsupported normalized member
kinds, unknown extension access, package access and unresolved expressions retain
explicit dispositions. Record, operand, output and semantic-work budgets aggregate
across all selected AST sections. Source contradictions and cancellation preserve
prior evidence. See [Swift declaration scope](SWIFT_DECLARATIONS.md).

## Verification

Frozen run **c077cb0c-96f2-45f4-a4a5-73ec14af76c6** passed **421/421 tests**
across **59 files**, with zero failures, skips, cancellations,
todos or timeout. All **139/139 operations** had successful schema-validated calls;
**188 implementation, fixture and configuration inputs** retained
their frozen SHA256 values. Actual owned compiler fixtures, CLI dispatch and
official stdio MCP clients exercise selected-byte recovery, failure preservation
and exact evidence export/import. This is bounded fixture and operation coverage,
not proof of complete REA equivalence. The local combined output SHA256 is
`6de8794ad10fcf7e8dca804375d9aeb124a669604b0982082e79029f468abe54`; raw diagnostics remain local.

The fresh global NativeAOT fixture `reclaimer-aot-identity-0h6Oau` produced
1862144 bytes, SHA256 `0d1a9690aa5709891fe04d79434c5af97986c639c0b29ddf1f8d868523daac52`, and was
never executed. Its static inventory includes 764
metadata types, 562 associated identities,
1086 fixed tables and
950 frozen records. Original method targets
and field offsets remain null; these are specimen counts, not coverage percentages.

The first strict attempt stopped at the 180-second syntax-build deadline before
running tests; its failure receipt remains local. Repeated probes measured about
ten seconds per syntax child with and without coverage instrumentation. Syntax
validation now runs the same Node --check commands with at most 16 concurrent
children, each bounded to 30 seconds and one MiB of captured output. The build
deadline, product deadlines and substantive test assertions remain unchanged.
The next strict attempt passed its build but reached the former 20-minute whole-suite
deadline before completing all test files. Its incomplete TAP also contained an
obsolete generated-only NativeAOT assertion and an owned Node endpoint-discovery
timeout. Both were initially missed in the incomplete-output review. That failure
receipt remains local. A later complete run passed 420/421 tests and all 139
operations, with only the obsolete NativeAOT expectation failing. That expectation
now checks actual identity associations and generated aliases; the Node fixture
has a separate 30-second launch allowance after observed cold starts. Substantive
observation assertions and product timers remain unchanged. The verification-only
whole-suite allowance is 60 minutes.
Another strict attempt ended across a turn change without a final test summary.
Its frozen-input snapshot and available owned fixture receipts remain local;
completion of that interrupted run's remaining cleanup was not independently
verified. The accepted run above has its own complete result and fixture scope.

The requested root README, architecture, roadmap, project status, completion
contract and changelog, plus three ADRs and a detailed-documentation index, are
maintained as owned project records. The ADRs describe current implementation and
remain proposed records without a separately recorded approval. Storage uses
Context maps and explicit JSON persistence; native snapshots have narrower source
binding than fully validated evidence-bundle imports. Local CLI/stdio authority
and external provider authentication boundaries are recorded without new gates.

The 95 CLI commands, 139 MCP operations and six prompts retain existing request
and response contracts. Contract hashes remain:

- API: `66f7c612d12b0771095b3717c193669b86eed3f242f6bdfe4594384c5fc89f29`
- CLI: `ca942e7ad48933c827a2f6b1f07cc4e23fc531c366c41a1535f8a5642dec1909`

Dependency selections and non-root lock entries are unchanged. All **57 application
notice files** remain intact; two private Swift and ten private NativeAOT notices
remain with their excluded local tools. The ownership audit found zero unexpected
source-identical code, documentation or fixtures among **226 authored
files**, comparing raw hashes against 2452 original tracked
files. Byte comparison is not legal clean-room certification; prior parent source
exposure remains disclosed. The package stays private/UNLICENSED.

## Remaining scope and publication

NativeAOT generic associations, arbitrary original field layouts, optional dispatch
maps, code-entry associations and runtime validity remain unsupported or unverified.
Swift recovery stays pinned to serialized format 0.903 and documented ABI/object
variants; unsupported expressions and kinds remain explicit. Metadata-only binaries
do not acquire invented source traits. Broader artifact, SDK and runtime coverage
and full REA behavioral parity remain unestablished.

**Mac-only checks remain pending**: Hopper, Apple assetutil, Apple SDK/runtime
interoperability and macOS Objective-C breakpoints. Cross-target static compiler
output does not verify Mac runtime behavior. This phase does not validate IDA/JADX.

The authorized destination is [navarro1331/Reclaimer](https://github.com/navarro1331/Reclaimer)
on `codex/reclaimer-public`. A sanitized fast-forward update preserves existing
public history and excludes private provider configuration, toolchains, raw logs,
generated artifacts and private Git ancestry. Snapshot build/tests and fetched
remote commit/tree/blob verification are recorded separately. No Mega runtime,
worker mount, client configuration, global install or schedule is activated.
The [previous recovery baseline](RECOVERY_DELIVERY.md) remains available.
