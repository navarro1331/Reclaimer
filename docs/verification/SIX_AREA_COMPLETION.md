# Six-area capability extension

This delivery addresses the operator's NativeAOT, Swift, artifact, JavaScript,
runtime/provider and session-reporting gap list with independent implementation
and owned fixtures. CLI/MCP request and response schemas remain unchanged.
The earlier [capability delivery](CAPABILITY_COMPLETION.md) is historical evidence;
the table below describes the additional scope of this delivery.

Accepted frozen run `70fb842b-1aa2-4aef-b6c6-cd16267847e1`: build and **679/679 tests in 90 files**, 139/139 successfully schema-validated operations, and zero failures, skips, cancellations, todos or timeouts. All 322 frozen inputs remained unchanged (manifest SHA256 `f13a162bc454c092e5fc25a3de27e330a07e4e099ddfb8d9474e571710dc757d`). Native, Swift, runtime, JVM/codec and isolated Linux UI producer checks were required. The same frozen runtime passed 18 actual stock-SDK transport cases and 411 calls plus the existing CLI annotation flow, with zero SDK notices. Offline isolated package CLI/MCP/native PTY checks and the contained Linux worker passed with source preservation and physical cleanup. These measurements qualify the documented finite scope; they do not establish exhaustive branch coverage, arbitrary reconstruction or full REA parity.

Raw run, producer, installation, transport and publication receipts remain local.
The sanitized publication has separate snapshot, parent, fetched-tree and blob
verification. Mac/IDA checks and client/live worker activation remain pending.

## Implemented scope and remaining work

| Area | Added implementation and owned proof | Still incomplete and why |
| --- | --- | --- |
| NativeAOT | Observed two-argument relative generic composition with scope-bound argument identities; readonly instance reflection-map facts; request-wide association proof budget. A fresh .NET 8 Windows x64 producer qualifies `Duo<int,long>`, mapped `Echo` code and recorded field offsets. | Canonical/shared/universal and other generic/reflection-map profiles, static/thread-static fields and complete GC/runtime layouts need separate byte-backed decoders and producer profiles. Trimming and native compilation can erase original IL and source structure. Recorded native entrypoints do not recreate lost IL or prove all method-body relationships. |
| Swift | Standalone serialized modules use the existing `analysis-database` alias and retain physical offsets with null runtime addresses. Pack, pack-element/expansion, integer and supported InlineArray type records extend exact profiles 0.871/0.903/0.944. Genuine SDK-free x86_64/ARM64 objects qualify supported unsigned/subtractor relocation pairs. | Text interfaces, COFF Swift routes, unsupported serialized versions and additional SIL/opaque/lifetime grammar need their own parsers and owned producers. PAGE/GOT, authenticated/chained/external runtime fixups and instantiated layouts remain unknown. A declaration database has no linked-image runtime address. |
| Artifact formats | DEX 041 physical-container offsets and multiple logical files; JVM class/JAR inventory and Code decoding for owned non-preview majors 52/55/61/65/69; binary CPIO in both word byte orders; supported auxiliary CIL signatures; HFS+/HFSX catalog/data-fork overflow chains; explicitly configured Python stdlib XAR bzip2/lzma/xz decoding. | APFS, segmented/encrypted DMGs, additional DMG codecs, compressed/resource forks and broader filesystem states remain unimplemented. Encrypted or multi-part extraction also needs an explicit key/part selection design; no keys or unrelated files are inferred. Compiled NIB creation/live Apple qualification requires unavailable Apple tools; the source boundary excludes adopting third-party reverse-engineered implementation. Compact/optimized DEX, remaining JVM/managed forms and Java/source decompilation are separate work. |
| JavaScript | Native observations now affect version comparison IDs, graph items and evidence links. Retained package fallback arrays, explicit custom conditions, package-import targets and finite TypeScript path candidates extend resolution. Immutable lexical Node resource handles and named promise chains/aggregates produce bounded ownership candidates. Source-map coordinate partitions distinguish split, merged and duplicated associations with digest binding. An explicitly selected closed synchronous CommonJS table can be reconstructed with dependency maps and module caching. | This is not a full flow-sensitive heap/callback/promise interpreter. Dynamic mutation, aliasing, loader hooks and arbitrary compiler/bundler transformations remain unknown. TypeScript paths and source-map associations are declared candidates, not runtime loading/equivalence proof. Captured outer variables, asynchronous/custom loaders and unsupported wrapper grammar prevent general bundle reconstruction; erased originals cannot be invented. |
| Runtime/providers | Additional post-attachment Electron hooks; public-API Hopper ranges/blocks/instructions/references/signatures and explicit uncertainty; LLDB non-breakpoint stops and cooperative target cleanup on cancellation. Selected Linux X11/AT-SPI observation/actions/screenshots have an isolated GTK proof with exact PID/window/identity checks, spoof/ambiguity negatives and helper cleanup. PTY comparisons now evaluate finite/partial-order journal traces and capture freshness. | Mac native UI, Apple SDK/runtime, live Objective-C, Hopper and assetutil checks remain pending because the Mac is unavailable. Licensed IDA is unavailable. Hopper fixture/public-API checks are not a live-provider run. Wayland, arbitrary toolkit/desktop profiles, pre-attachment Electron history, unexposed platform state and complete debugger enrichment remain outside qualified scope. |
| Session reporting | Capability availability, run IDs, active operations, elapsed time, cancellation state, failure/retry health and observed model/source bindings replace empty/fixed defaults. Existing output schemas are retained. | Process lineage stays `not_observed` without a real observation. Transport/provider queue depth still needs dedicated instrumentation; the local request observations do not measure external queues. Missing provider versions, exit codes and packaged build identity remain null rather than invented. Availability describes the selected route/session; it is not exhaustive format coverage, a provider-health monitor, authenticated identity or activation proof. |

## Boundaries and operation

Static readers do not execute selected targets. JVM compiler fixtures compile
owned source but do not execute the classes. CommonJS reconstruction executes
only the independently authored positive fixture during tests; production
recovery leaves `runtime_equivalence` unknown and retains source/context bytes.
Split/merge classifications describe recorded source-map relationships and do
not assert complete generated-code extents or equivalent execution.

Additional XAR codecs require an explicitly selected Python executable via
`pkgCodecPythonArgv`; see the configuration example (raw receipt retained locally).
The adapter uses bounded stdin/stdout, decoder memory, aggregate deadline,
cancellation and physical child cleanup. It does not install packages, execute
installer scripts or discover a Python interpreter from PATH. Raw/zlib XAR
remains available without that optional adapter.

Archive inventory and extraction bind parsed bytes to the recorded source
digest and reject changes to the selected session or file. Extraction stages
its evidence until final cancellation and output validation pass. Rejected
results remove only their own output directory and confirm its absence before
reporting rollback; prior evidence and source files remain intact. POSIX codec
children that ignore termination are escalated to a forced kill and checked
for physical absence.

Linux UI requires a real local X11, D-Bus and AT-SPI session plus the documented
Python GI/Xlib prerequisites. The caller selects an exact PID and X11 window ID.
Client-set PID metadata alone is insufficient: XRes ownership and process
identity must agree, and an ambiguous accessible/window match is rejected.
The owned fixture provisions those dependencies only inside its labelled,
network-disabled, non-root, read-only test container with two explicit mounts.
No desktop service, MCP client or live Mega worker is activated.

Hopper reference kind metadata stays unavailable when the public API reports
only addresses/call membership; genuine call membership still supports call
navigation. Missing image base cannot be represented by the frozen segment
response, so that route reports unavailable rather than inventing zero.
`binary_overview` still reports observed segment ranges.

## Verification sources

- [NativeAOT owned extension](../../test/native-aot-extension.test.mjs) and [fresh producer](../../test/native-aot-extension-producer.test.mjs).
- [Swift packets and standalone routes](../../test/swift-extension.test.mjs), [Windows producer](../../test/swift-extension-producer.test.mjs) and [Swift 6.2 producer](../../test/swift-extension-inline-producer.test.mjs).
- [Format positive/negative packets](../../test/artifact-format-completion.test.mjs) and [producer fixtures](../../test/artifact-format-producers.test.mjs).
- [Archive binding and rejected-extraction rollback](../../test/artifact-source-binding.test.mjs) and [POSIX codec termination](../../test/artifact-format-codec-posix.test.mjs).
- [JavaScript extension fixtures](../../test/javascript-completion.test.mjs), including contradictory historical digests and unresolved captures.
- [Trace/freshness fixtures](../../test/process-trace-completion.test.mjs), [session lifecycle fixtures](../../test/session-reporting-completion.test.mjs) and [provider uncertainty](../../test/native-provider-uncertainty.test.mjs).
- [Electron hooks](../../test/runtime-completion-electron.test.mjs), [debugger stops/cleanup](../../test/runtime-completion-debugger.test.mjs), [Hopper API model](../../test/hopper-export.test.mjs) and [isolated Linux UI producer](../../test/runtime-completion-linux-ui-producer.test.mjs).

Trace evaluation uses captured journal order and whole-record equality after
the selected top-level ignored fields. Required/optional cardinalities mean
one/zero-or-one; exact/range forms are explicit. Finite variants match complete
event-ID sequences with unordered buckets. Partial order checks captured
happens-before, not-before, prefix and suffix constraints. Truncated, ambiguous,
missing or inconsistent journals remain unknown; observed violations remain
nonconforming. This does not recover PTY output ordering lost during coalescing.

Official reference facts include the [Node package resolution rules](https://nodejs.org/api/packages.html),
[TypeScript path semantics](https://www.typescriptlang.org/docs/handbook/modules/reference),
[Android DEX format](https://source.android.com/docs/core/runtime/dex-format),
[JVM class-file format](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-4.html)
and vendor format/API references recorded with the corresponding local producer
receipts. Vendor algorithms and REA implementation files were not adopted.

Full REA equivalence and faithful rebuilding of arbitrary applications remain
unestablished. A future claim needs a finite capability matrix and matching
owned input/output observations. Mac/IDA live checks, client activation and live
worker registration remain pending by the operator's earlier clarification.
