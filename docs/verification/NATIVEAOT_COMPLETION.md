# NativeAOT capability completion

The [six-area extension](SIX_AREA_COMPLETION.md) adds the current qualified profiles and remaining-work reasons. The measurements below retain their earlier delivery scope.

This phase extends the independently authored reader with bounded generic identities, metadata signatures, recorded reflection entrypoints and instance field offsets. It does not establish arbitrary NativeAOT reconstruction, original IL recovery, target execution or platform-wide parity. Public CLI/MCP schemas remain unchanged; `metadata_recovery.original_name` remains null and generated identifiers/aliases remain stable.

## Supported slice

`lib/native-aot-types.mjs` now recognizes a validated generic-definition fixed header. The lower ushort is an arity, not an array/string component size. A definition must have an allowed element kind, zero base/related/slot/interface fields, a nonzero bounded arity and no dynamic/constructed-instance flags. TypeMap metadata arity must agree. These headers cannot serve as frozen instance layouts.

`lib/native-aot-signatures.mjs` expands bounded TypeDefinitions/TypeReferences, generic parameters and constraints, type/method variables, instantiations, vectors, multidimensional shapes, pointers, byrefs, modifiers and basic function-pointer signatures. Method return/parameter signatures and field types are raw metadata facts with selected-byte bindings. Type size/packing hints and explicit field offsets are recorded separately as declared metadata. They do not establish runtime placement or field width.

`lib/native-aot-generics.mjs` supports one finite constructed profile: PE AMD64, pointer width 8, NativeAOT directory version 9.1, canonical class header, one validated argument, and the observed .NET 8 win-x64 relative tail without optional, dispatch, finalizer, sealed, variance, dynamic or imported forms. A supported reflection member packet must root the exact owner. Its fixed header/hash, generic-definition link, argument link, metadata member ownership and both named table identities must agree. No CommonFixups scan, name scan or plausible-header search grants an identity.

Constructed records retain their definition token and explicit argument identity/scope. Metadata-only definition/member inventories remain present; separate contextual member records bind a particular constructed method table. Unknown shared-canonical arguments remain unresolved. Cross-module conflicts include argument scope/key material and address. A conflicted definition or argument suppresses dependent constructed annotations.

`lib/native-aot-members.mjs` supports non-generic InvokeMap packets with flags `0x24` or `0x2c`, and instance/direct/metadata FieldAccessMap packets with flags `0x28`. A unique associated owner, matching member token/ownership, owner hash/bucket and bounded fixups are required. Method targets require uniquely mapped executable selected-file bytes. A recorded reflection entrypoint can be a stub; no complete method extent or original IL body is inferred. Contradictory targets/offsets are retained as conflicts and receive no association.

Field offsets explicitly identify their basis: `object-address` for reference types or `unboxed-value-data` for value storage. Offsets must fit the fixed owner extent; widths remain null. This is distinct from declared explicit-layout metadata, even when the numbers happen to agree. Fixed method-table datatype fields and frozen object storage are not renamed to imitate original instance fields.

The Context projection exposes detached proven members through `inspect_native_data_type.raw_result.nativeaot_members`. Normalized datatype fields, slot names and `original_name` are unchanged. A returned load result initially aliased the committed raw inventory; the load boundary now clones it before publication. Both load and datatype response mutation are covered.

## Independent format references

Field/handle declarations come from the official .NET 8.0.31 [NativeFormat schema](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Metadata/NativeFormat/Generator/SchemaDef.cs) and [handle/enum declarations](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Metadata/NativeFormat/NativeFormatReaderCommonGen.cs). Fixed kinds and flag values use [MethodTable constants](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Runtime/MethodTable.Constants.cs); map flags use [MappingTableFlags](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Runtime/MappingTableFlags.cs), and blob IDs use [MetadataBlob](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Runtime/MetadataBlob.cs). Packet order, relative-tail offsets and supported producer forms were checked against independently authored packets and owned compiler output. No REA implementation, recovery source, authored fixture or vendor deserializer algorithm was copied or translated.

## Authored packets and Context verification

`test/native-aot-completion.test.mjs` contains 19 portable tests, all executed without a private SDK or skipped producer branch. They cover:

- 32/64-bit generic definitions, wrong arity/base rejection, generic parameter names/constraints, return/parameter types and compound signature records.
- Invalid variable/rank/owner/ordinal/cycle cases, signature/name capacity and cancellation.
- Recorded code/field maps with nonempty selected bytes, exact instance offsets, wrong owners, non-code targets, impossible offsets, unsupported flags, malformed packets, owner hash contradictions and conflicting map values.
- Separate declared explicit layout, normal Context datatype/member queries, detached response mutation and unchanged source bytes.
- Late cancellation, source mutation and evidence-publication rejection preserving prior committed maps/names/ledger.
- A model-aware authored one-argument relative profile, contextual member separation, unresolved arguments/optional tails/definition/tag/hash mutations, aggregate type capacity, and two modules with identical display assembly identity but different argument key material. The latter suppresses constructed annotation and retains the distinction without claiming signature trust.
- A repeated constraint-reference packet smaller than 300 KiB, rejected at the output limit inside a 64 MiB Node child without constructing its expanded JSON string. This is adverse owned metadata, not a runtime-valid executable specimen.
- The same amplified packet through Context, preserving names, ledger, uncommitted recovery state and physical source identity on rejection. Selected bytes remain readable and an ordinary member-bearing artifact remains usable. Internal sizing-work limits can be lowered but cannot exceed their fixed ceiling.
- A separate provenance-heavy packet smaller than 200 KiB: one compound child contains 1,024 distinct 20-record specification chains, and a method or constraint list repeats that cached child 1,024 times. Both 64 MiB child profiles now reject at the provenance-work limit without flattening the repeated lists. A shared-reader budget, lowered ceiling, mid-collector cancellation and atomic Context rejection are covered.

The initial generic-definition test failed on the missing fixed-header record; its exact red log is retained. An earlier NativeAOT family run passed 88/88 with no skips, including three fresh SDK producers and the pinned earlier compiler specimen. The scope-dependency refinement then passed 81/81 portable cases. After incremental output sizing, an 88/88 portable-plus-pinned run and separate 1/1 fresh compiler run established a further historical 89-test scope. A later review reproduced the separate provenance-allocation defect described below. After its remedy, the final focused portable-plus-pinned run passed 90/90 and the separate fresh compiler test passed 1/1, with no skips, failures or cancellations. The current global verification report records broader acceptance separately.

## Owned compiler evidence

`test/native-aot-completion-producer.test.mjs` is a separate required producer test when `REAL_RUN_NATIVE_VARIATIONS=1`. It uses SDK 8.0.425/ILCompiler 8.0.31, direct `dotnet exec MSBuild.dll`, offline private packages, contained profiles/temp directories, certificate generation disabled and shared compilation disabled. Each argv-only child is bounded to 120 seconds and receives the test cancellation signal. Owned cleanup verifies the resolved temporary directory boundary before removal. Every run retains exact C#/project hashes, compiler logs, executable hash, build receipt and analysis receipt. No executable target is launched.

The authored source roots `Box<T>`/`Box<int>`, a generic `Echo<U>` signature, an automatic-layout class, and an explicit-layout value with size 32, packing 4 and declared offsets 0/8. Public member-name enumeration emits the needed maps without invoking the target. The resulting static proof includes:

| Observation | Proved relationship |
|---|---|
| Generic definition | ``Box`1``, arity 1, parameter `T` |
| Generic method metadata | `Echo<U>` returns `!!0`, with parameters `!0` and `!!0` |
| Constructed identity | ``Box`1<System.Int32>``, with exact definition/argument relative links |
| Contextual code | Constructed `Identity` has a recorded executable entrypoint; original definition inventory remains metadata-only |
| Unsupported generic method route | Contextual `Echo` packet `0x36` has no invented code association |
| Automatic instance fields | `AutoLedger.Label` at 8 and `Serial` at 16, based at object address |
| Explicit value storage | Declared and independently mapped offsets 0/8, with unboxed-value basis |
| Public query | Inferred constructed datatype name, stable generated/ID aliases, null original name and detached raw members |

Exact final run hashes, addresses and counts are in the phase receipts under `reclaimer-capability-completion-20261016/owned-aot-completion`. The earlier narrowed producer artifact `6fc0ed99bc89d888044f9d899db1bb031f50a8e79a299ef24722ef99e72b4814` established the profile before the final scope-dependency refinement. Its addresses/counts are specimen-specific and are not predictions for later builds.

The final-source dedicated producer passed 1/1 with no skips. Run `reclaimer-aot-completion-obU1FT` retained executable SHA256 `fee025076919ca36f92b24f51814a361fb750d7a45c9552af407b3194099c68a`, C# SHA256 `951ddaa1ccda8c7f082bab55759efff3d34e06b41ebc5acfc9f36fc73e9dc0bb`, and project SHA256 `b398104dbaaea6748c06683eef9f94e6a25801975b103deb10a319fc3b2f1b93`. Its analysis receipt records 1,223 fixed tables, 136 generic definitions, 12 constructed contexts, 710 associated type identities, 90 recorded reflection entrypoints, 4 field offsets and 950 frozen records. Identity JSON is 7,177,292 bytes; conservative output charge is 7,521,003 bytes, both below 8 MiB. The public constructed datatype binds to `0x140147e00`, its definition to `0x140130068`, and contextual `Identity` to selected executable bytes at `0x1400ebe00`. Cleanup completed. These counts include system-library records retained by this owned compilation and are not application coverage percentages. Earlier runs `reclaimer-aot-completion-dQRDa9` and `reclaimer-aot-completion-1MhRz3` retain their distinct hashes and earlier implementation scopes; they are not substituted for the final-source producer.

The first broader producer retained `GetValue`/`Invoke`/`GetParameters` paths and produced a 2,298,880-byte artifact, SHA256 `f1797af07f0bc1e81de2c829440d433513a848ed4e5bdabe26c0aec013652612`. Reading it exceeded the unchanged 8 MiB output budget. The exact failed test, sources, successful build receipt and executable remain retained; it is a real capacity negative, not a claimed recovery success. The smaller member-name retention fixture is a separate positive. No product budget was widened.

The older pinned `OwnedProbe.exe` remains SHA256 `276ad7a50b8f0941b6001e2c84b4f1f1b0f3094e853f8d1f078ff7e397b3dda0`. Its current observations are 766 fixed tables, 118 generic definitions, 11 named constructed contexts on already recovered tables, 536 total associated identities and 230 generated names. Its 778 frozen records and 216,368 reconstructed bytes are preserved. The original 588/79/135 metadata inventory remains distinguishable from contextual records. These new observations supplement the earlier 648-table/407-associated receipt; prior receipts are not overwritten. The ordinary scoped test regenerates the current private provider report with these precise limits.

## Resource and remaining limits

Existing request ceilings remain: 64 modules, 16 MiB reconstructed bytes, 10,000 types, 10,000 objects, 100,000 layout fields, 100,000 decoded nodes/hash iterations, bounded collections/captures, 4 MiB raw/expanded name dimensions, and 8 MiB final serialized identity output. Expanded names are bounded to 64 KiB and method/generic arities to 1,024. Redundant transient references are shared rather than charged as duplicate captures; all published repeated output, conflicts and final serialization remain bounded. Lookup indexes avoid scanning complete member/type inventories for every map packet. Cancellation/source checks and atomic staging remain in force.

Incremental JSON accounting now charges retained DTOs and validates the complete final result without first allocating an expanded JSON string. A new finite allowance of 8,388,608 cancellable sizing-work units covers both walks; the internal `maxJsonWork` option can only lower it. The initial 2,000,000-unit development allowance falsely rejected valid existing output and was calibrated before freeze, without widening byte, node, name or capture limits. Final count-only external instrumentation measured 2,016,289 units for pinned `OwnedProbe.exe` and 2,639,608 units for the fresh completion specimen. These observations, instrumented-source hash and unchanged product-source hash are retained separately. The amplified JSON packet previously returned partial success instead of a capacity failure; its failed test is retained. That observation did not establish an out-of-memory termination.

A later, distinct provenance packet did establish explicit V8 heap-limit failures in both 64 MiB child profiles before JSON charging. Its red log and packet/source hashes remain retained. Signature provenance now deduplicates directly from record groups, with no intermediate flattened child list or argument spread. One cancellable request-wide ceiling of 1,000,000 visited provenance records spans every metadata reader/module; `maxSignatureProvenanceWork` may lower it. The final pinned and fresh specimens consumed 4,653 and 5,682 visits respectively. Capacity propagates before session adoption, and final JSON sizing remains a separate limit. The post-fix children reject with capacity; Context rejection publishes no partial annotations or evidence. The earlier 89-pass receipt remains historical and is supplemented by the final 91-test scoped receipt.

Residuals are explicit:

- Multi-argument, recursively constructed, imported, dynamic, optional-tail and shared-canonical argument identities remain unsupported. `List<int>` forms with dispatch/other optional tail fields are not covered by the `Box<int>` profile.
- Generic methods requiring instantiation arguments, universal-canonical entries, virtual invoke maps, interface dispatch and unsupported reflection-map flags remain unassociated.
- Recovered offsets do not supply field widths, GC descriptors, reference ownership, complete original instance layouts, static/thread-static addresses, optional layout fields or a runtime allocation.
- Method entrypoints do not reconstruct complete native bodies, original IL, eliminated code, inlining provenance or arbitrary call relationships.
- Real producer proof is .NET 8.0.425/ILCompiler 8.0.31 Windows x64. Synthetic 32-bit packets do not establish real 32-bit/ARM64/Mac producer or execution coverage. IDA/Mac/deployment activation are outside this slice.
- Public names and scope key material are static byte associations, not authenticated assembly identity, runtime loading or signature trust.
