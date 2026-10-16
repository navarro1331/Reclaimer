# Independent artifact and native analysis

The implementation reads supplied bytes and keeps original files unchanged. Format
parsers, fixtures and vendor bridges were authored for this staging tree using the
observed public protocol and official format/API references. The public wire
contract contains several fixed identifiers and conservative status values; these
are retained for compatibility and do not name the implementation's source.

## Byte parsers

| Family | Implemented observations | Remaining limits |
| --- | --- | --- |
| ELF | Headers, sections, segments, symbol tables, REL/RELA/RELR, dynamic dependencies, interpreter and static mitigation indicators | Public layout operation is restricted to little-endian x86-64. Sectionless relocation streams and architecture-specific relocation meanings remain unknown. |
| Mach-O | Thin and universal headers, load commands, segments/sections, UUID, build versions, dylib/rpath commands and symbol tables | Export trie, chained fixups and bind streams are not decoded. Universal load-command detail uses the first slice, with all slices inventoried separately. |
| Signing | Embedded superblob/CodeDirectory inventory, identifier/team fields, SHA-256 CDHashes and XML entitlements | No certificate trust, cryptographic validation, notarization or signing time is asserted. SHA-1/SHA-384 CDHashes and DER entitlements remain unparsed. |
| Property lists | XML and binary plist objects, explicit UIDs, NSKeyedArchive object/reference tables | Unknown object kinds remain explicit. Archived classes are never instantiated. |
| Archives | ZIP/APK/IPA/MSIX/AppX and packed ASAR; XAR PKG files with default raw/gzip CPIO payload expansion; single-segment UDIF raw/zlib/sparse images with direct/APM/GPT HFS+/HFSX file data forks | Extraction rejects links, unsafe/duplicate paths and preexisting destinations. Raw and decoded PKG members share quotas. APFS, encrypted/segmented images, PBZX, unsupported codecs, HFS resource/overflow forks and general filesystem consistency remain unsupported or unverified. |
| Apple UI/resources | XML storyboard/XIB containment and connections; keyed NIB object inventory; source asset metadata and image declarations; exact literal UI resource keys correlated with named source/CAR records, preserving duplicate-name ambiguity and source namespaces | Compiled non-plist NIB decoding and archived UI semantics remain unknown. Catalog membership does not prove build-target inclusion, runtime rendition selection or action invocation. |
| Dylibs | Architecture-aware resolution among supplied artifact members | System libraries, dyld shared caches, environment variables and inherited rpath stacks are not searched. |
| Managed PE | CLI header, ECMA-335 tables 0-44, module MVID, assemblies/references/resources, types/members/signatures, CIL operands/references and small/fat/chained exception clauses; decoded fixed/named attributes and declared TargetFramework; P/Invoke/native/runtime/abstract implementation classification before CIL parsing | Unsupported signatures/attributes preserve raw facts. External enum resolution, complete stack/runtime validity, loader/native binding and strong-name trust remain unknown. Declared framework metadata does not prove a running runtime. |
| Android | DEX 035/037/038/039/040 tables, modified UTF-8, supported operands, bounded Smali text with registers/branches/catches and chunk-confined binary XML | DEX 041/compact/optimized variants, complete annotations/debug data and some Smali/custom-call variants are unsupported. Reflection, runtime-generated calls and JNI remain unknown. Java source requires configured JADX. |
| EVM | evmole selector, argument and mutability inference | Source ABI, deployment identity, hardfork and completeness remain unknown; no execution occurs. |
| Recorded crashes | ELF core segment/note bytes, bounded generic note inventory | Register layouts, historical thread context and debugger observations are not invented from raw descriptors. No live process is contacted. |
| Firmware | Bounded magic scan and declared-length carving for recognized regions | Heuristic confidence is a parser indicator, not calibrated correctness. Filesystem recursion, decompression and encrypted payloads need additional format support. |

Managed comparison uses exact declared type, name and signature matches, preserving
ambiguity and build-local token scope. Native-boundary verification compares
supplied static module/export observations; it does not establish actual loader
binding. Reconstruction imports check exact static member identity and text hashes,
keep the inference authority, and never compile or execute supplied text.

## Native providers

`open_binary` selects a byte identity. Session names, comments and bookmarks are
stored in an owned in-memory analysis database. Closing deletes the provider's
owned temporary roots. Optional snapshots contain that session overlay and evidence
records. Restore checks the selected artifact SHA-256, stages recognized annotation
maps and validates evidence with the existing bundle-import record rules before
committing target/session state. Conflicting retained identifiers are rejected;
identical records remain in place. Malformed input and late cancellation leave
the prior context unchanged. Snapshots do not transfer the complete unknown ledger.
See the [owned transaction scope](../verification/NATIVE_SNAPSHOT_TRANSACTION.md).

`set_addresses_names` stages every original key, parsed address and name in
`Object.entries` order before any write to the existing name map. A malformed
later address preserves the source, target/session, all prior annotation maps,
ledger and history. Successful replies keep original keys; canonical aliases
keep ordered last-write-wins behavior. Empty batches, targetless-empty behavior,
missing-session precedence, empty names, named spaces and ignored `document`
retain their existing behavior. The [owned naming scope](../verification/NAME_BATCH_VALIDATION.md)
records the historical validation-only fix and actual MCP/snapshot compatibility.

Seven manual native annotation operations now prepare request-local names,
comments, inline comments and bookmarks and unpublished evidence. `Context.call`
uses private WeakMap commit metadata after awaited preparation, original caller
cancellation and output validation. The final synchronous section checks prepared
reply content, session/model/map identity and touched-key conflicts, then commits
only staged deltas and evidence before successful history append. Annotation
dossiers also bind their wider name/comment read set. Independent successful
keys, evidence and nested calls remain retained. The
[owned annotation transaction scope](../verification/ANNOTATION_TRANSACTION.md)
records failure/cancellation, retry, compatibility, controlled races, cold model
ownership and actual transport proof. This covers the seven manual operations;
automatic NativeAOT names, navigation and native snapshots keep separate scopes.

The separate evidence-bundle importer stages records, unknown revisions and any
historical integrity binding before committing. Retained-state checks are repeated
after awaited binding preparation; failed/cancelled preparation preserves prior
maps. The [owned import scope](../verification/EVIDENCE_IMPORT_TRANSACTION.md)
records Context race and actual transport proof. Historical bindings preserve
opaque identifiers without certifying their original source/history.

Unknown creation/update stages unpublished mutation evidence, rechecks retained
unknown state after await and commits event/revision together after cancellation
checks. The [owned mutation scope](../verification/UNKNOWN_MUTATION_TRANSACTION.md)
records the focused proof and accepted full regression after
[startup recovery](../verification/STARTUP_RECOVERY.md). MCP tools remain
serialized; ledger events do not verify the truth of their assertions.

Native byte and cached-provider reads recheck the physical source. Ordinary MCP
sessions reject changed selected bytes. CLI analysis defaults to the same failure;
explicit `record-and-continue` analyzes the retained opening byte view, preserves
its original subject digest, and records the before/after source mismatch. This
policy does not authenticate an externally supplied model or recover source bytes
that were never retained.

The independent byte parser supplies source address mappings, recorded symbols and
bounded file-backed ASCII strings. Configuring a vendor provider enables inferred
functions, instruction decoding, references, basic blocks and decompilation.

| Provider | Configuration | Route |
| --- | --- | --- |
| Ghidra | `ghidraArgv` or JSON array `REAL_GHIDRA_ARGV`; optional `javaHome` | Original `bridge/independent/RealExport.java` in a private headless project, importing a copied artifact and deleting the project afterward. |
| Hopper | `hopperArgv` or JSON array `REAL_HOPPER_ARGV`, on macOS | Original public Python API export script over an owned artifact copy. Assembly/pseudocode coverage is narrower than Ghidra. |
| IDA MCP | `idaMcpUrl` / `REAL_IDA_MCP_URL` and `idaMcpTools.exportModel` | Operator-supplied loopback MCP endpoint/tool mapping. No endpoint, tool name or active IDA database identity is guessed. |
| Custom | `nativeProviderArgv` / JSON array `REAL_NATIVE_PROVIDER_ARGV` | Explicit original model adapter protocol; arguments contain owned request/response paths. |

The Ghidra bridge exports recovered prototype types, parameter/return storage,
calling convention, high p-code operations, SSA def-use edges, memory/control/call
effects, parameter uses and analysis database type layouts. Typed operand
components retain register/scalar/address facts within the fixed public wire
contract. Value tracing binds call arguments to recovered callee parameter
ordinals and equal-width callee return values to caller outputs, respecting
traversal and pagination limits. Computed or indirect references remain candidates
in call-target, UI and value traces. Runtime values, memory aliasing and aggregate
return semantics remain unknown.

The explicit DOS COM loader supplies a 16-bit entry at offset 0x100. MZ/COM load
verification compares reconstructed source bytes, relocations and entrypoints
with actual provider memory captures and the mapped source-file identity.
Missing captures/identity remain unsupported; mismatches remain explicit.
NativeAOT current and legacy section directories and bounded dehydrated data
are decoded separately from generic CoreCLR signatures. Structural method-table
candidates do not establish type identities or a committed table count.
Embedded NativeFormat metadata retains qualified type/member names and assembly
scope. Semantic type annotations require an explicit TypeMap token, a validated
CommonFixups method-table pointer and matching recorded hash/bucket. Metadata-only
names remain inventories; conflicts suppress annotation. IDs and generated aliases
are preserved, and the unchanged public original_name field remains null. Raw
evidence retains selected-byte bindings. Generic associations, arbitrary original
field layouts, method entry-point associations and runtime validity remain outside
this recovery scope.

Independent Mach-O readers follow file-backed Objective-C class, method, protocol,
category, ivar and property records, including small relative methods. Swift
nominal/field/conformance descriptors and supported static dispatch slots are
projected through existing native operations. Source declaration traits, chained
or authenticated pointers, resilient/generic layouts and runtime method changes
remain incomplete. Static selector links do not prove runtime UI invocation.
Serialized Swift module declarations use a pinned format reader over selected
__swift_ast bytes. Supported access/finality, nested ownership, superclass and
protocol relationships, actors and constructor/member traits retain record and
byte coordinates. Unsupported normalized member kinds and unknown extension
access remain explicit in raw evidence. Aggregate decode budgets cover all AST
sections, including malformed work; failure or cancellation publishes no partial
declaration evidence. These static cross-target fixtures do not perform Mac checks.

Owned variation fixtures now exercise nonempty ELF relocations/linkage/mitigations,
thin/universal Mach-O widths and byte orders, signature metadata/entitlements,
member dylib resolution, rich plist/keyed records, archive security limits,
PE32+/managed resources/generic CIL, DEX references/multidex and binary manifests.
They exposed genuine bounds, signed-value, wire-format and nullable-p-code defects
that were corrected. These are specific observations, not universal format parity;
see the artifact scope (raw receipt retained locally),
native scope (raw receipt retained locally) and
current parity report (raw receipt retained locally).

For a direct Java launcher, use an existing JDK executable, the Ghidra
`Utility.jar` classpath, `-Djava.system.class.loader=ghidra.GhidraClassLoader`,
`ghidra.GhidraLauncher`, and `ghidra.app.util.headless.AnalyzeHeadless` in the
configured argv. Match the JDK requirement to the installed Ghidra release.
Windows batch files require a shell and are deliberately not used. All subprocess
calls use argv arrays with `shell:false`, cancellation and timeout supervision.
Java `user.home`, HOME/USERPROFILE/APPDATA/LOCALAPPDATA and temporary directories
are assigned to the owned provider root. Additional provider environment keys are
explicit operator configuration.

Optional format tools use `swiftDemangle`, `assetutilArgv`, and `jadxArgv`
(`REAL_JADX_ARGV` is a JSON array). Missing tools produce named prerequisite errors.
Swift demangling uses one explicit `swiftDemangle` executable path (or
`REAL_SWIFT_DEMANGLE`) and a captured version query. Ordinary symbols use separate
literal argv invocations after `--`. @-prefixed symbols use a bounded, closed stdin
pipe to `swift-demangle --compact`; their bytes never become response-file names.
See the [owned literal-input proof](../verification/SWIFT_STDIN.md).
Actual argv, exit, captured byte counts and before/after executable hashes are
retained. An unchanged echo does not classify a name as valid or invalid Swift.
Cancellation, inconsistent output and executable changes retain no partial batch.
The owned Swift proof (raw receipt retained locally) distinguishes the actual
compiler release from the demangler's reported LLVM version and bounds its claims.
Swift batches have default ceilings of 1,024 symbols, 1 MiB of UTF-8 symbol input,
16 MiB of combined captured provider stdout/stderr and a 120-second monotonic
deadline. `swiftBatchBudget` provider configuration may lower these values.
Child limits shrink to the remaining allowance. Exhaustion uses the existing
resource-constraint error, and evidence remains private until final deadline and
cancellation checks pass. [Owned budget verification](../verification/SWIFT_BUDGET.md)
records byte boundaries, shared-context isolation, actual owned child termination
and the unchanged CLI/MCP error route. These handler limits do not bound transport
parsing or whole-process resident memory.
Provider registration or configuration alone is not evidence of a successful
analysis run. The synthetic tests validate schemas and algorithms; they do not
establish live vendor behavior or comprehensive format parity.

## Verification and reference material

Fresh fixtures test every owned public handler through `Context.call`, including
its evidence envelope, required fixed wire values and nested output shapes. The
tests also exercise source preservation, nonempty SSA graphs, traversal rejection,
preexisting output preservation, binary-plist UIDs and exact-build reconstruction
validation. Asset fixtures assert matched, ambiguous and missing literal keys,
declared image-file presence, namespace handling and pagination without choosing a
runtime variant. Owned DMG/PKG positive fixtures assert actual decoded member
bytes; malformed/unsafe/quota fixtures assert rejection and no output publication.
Owned CIL fixtures distinguish supported managed bodies from non-IL declarations
and contradictory metadata. Provider integration receipts and remaining parity
gaps are reported separately.

The integration receipt `live-ghidra-report.json` records eight successful public
schema checks on one independently authored x86-64 ELF returning 42, using
Ghidra 12.1.4 and JDK 25.0.4.1+1. The checked operations were open, overview,
pseudocode, assembly, function dossier, API, value trace and byte reads. The source
SHA-256 `029995b0537a4a7f175731412994e737a2259f91d5a7b96217f4cc35eccb982c`
was preserved. This demonstrates that specific live route and fixture; it does
not establish multi-platform native parity or Hopper/IDA operation.

The additional [live variation receipt scope](../verification/RECOVERY_DELIVERY.md)
records a freestanding C specimen compiled by private LLVM 23.1.3 with DWARF4 and
analyzed by the same Ghidra/JDK versions. Actual assertions cover four functions,
two named integer parameters in EDI/ESI, interprocedural SSA/argument bindings,
seven switch-table entries, imported struct/union/enum/bitfield/typedef/pointer/array
layouts and navigation context. The bridge explicitly requests Ghidra jump-load
records; absent default-case classification stays unknown. The specimen is never
executed, and source/binary hashes are checked. Each receipt identifies its own
compiled bytes, including that run's debug paths.

Official references used to implement the format and vendor adapters:

- [ELF generic ABI](https://refspecs.linuxfoundation.org/elf/gabi4+/contents.html)
- [Apple Mach-O format declarations](https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h)
- [Apple asset catalog folders and namespaces](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/FolderStructure.html)
- [Apple image-set metadata](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/ImageSetType.html)
- [ECMA-335](https://ecma-international.org/publications-and-standards/standards/ecma-335/)
- [Android DEX format](https://source.android.com/docs/core/runtime/dex-format)
- [Android bytecode](https://source.android.com/docs/core/runtime/dalvik-bytecode)
- [Ghidra script API](https://ghidra.re/ghidra_docs/api/ghidra/app/script/GhidraScript.html)
- [Ghidra high-function API](https://ghidra.re/ghidra_docs/api/ghidra/program/model/pcode/HighFunction.html)
- [Ghidra function-prototype API](https://ghidra.re/ghidra_docs/api/ghidra/program/model/pcode/FunctionPrototype.html)
- [Ghidra data-type API](https://ghidra.re/ghidra_docs/api/ghidra/program/model/data/DataType.html)
- [Ghidra decompiler options and jump loads](https://ghidra.re/ghidra_docs/api/ghidra/app/decompiler/DecompInterface.html)

