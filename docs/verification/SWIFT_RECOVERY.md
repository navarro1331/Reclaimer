# Swift metadata recovery verification

Verified in the owned local checkout on branch `codex/reclaimer-recovery`,
starting at `ca3bc5c585d91c36f99d8890b3c03541e834e6b6`. This is an independently
authored implementation and owned-fixture result, not a claim of REA behavioral
parity. No REA implementation, documentation, fixtures or recovery files were
used. No compiled Swift function or Apple runtime was executed.

Final scoped verification: **40/40 passed**, zero failures, cancellations,
skips or todos; `14792.8764 ms`. The run contains **28 new tests** and **12 existing
Apple/UI tests**, including nine actual compiler producer cases:

```text
node --test --test-concurrency=1 test/swift-declarations.test.mjs test/swift-declarations-compiler.test.mjs test/swift-recovery-metadata.test.mjs test/swift-recovery-compiler.test.mjs test/native-apple-parity.test.mjs test/native-ui-parity.test.mjs
```

Syntax and owned-path `git diff --check` passed. The public MCP and CLI schema
files were not changed. Their SHA256 values remain
`66f7c612d12b0771095b3717c193669b86eed3f242f6bdfe4594384c5fc89f29` and
`ca942e7ad48933c827a2f6b1f07cc4e23fc531c366c41a1535f8a5642dec1909`.
Schema acceptance is separate from the behavioral observations below.

## Actual compiler-produced observations

The existing private Windows `swift-frontend.exe` reports **Swift 6.1.3
(swift-6.1.3-RELEASE)** and default target `x86_64-unknown-windows-msvc`.
Its measured SHA256 is
`38298f10adb0a7034b16692ac5272b3090cd3f2b307075b28b04ff25110ce2f3`.
The owned fixture explicitly requested `x86_64-apple-macosx10.15`,
`-parse-stdlib`, `-disable-objc-interop` and `-enable-library-evolution`.
It produced a Mach-O object without an Apple SDK. The bundled linker rejected
macOS linking; linked Apple application behavior is therefore unobserved.

The receipt is
`SWIFT_RECOVERY_COMPILER_REPORT.json` (retained locally),
snapshot timestamp `2026-10-13T22:56:07.521Z`, SHA256
`8671f5e1d58002afb654f08852613cca026bf931c2b9c2337e0115d8625fccef`.
It records actual argv, successful exits, empty stdout/stderr, executable and
source hashes, retained outputs, and source-preservation checks.

| Retained artifact | Bytes | SHA256 | Proven behavior |
| --- | ---: | --- | --- |
| `owned-recovery.o` | 18680 | `8fcf6fb833b151f23dd411e3038150b12d8ee2fb6af84638414be5b36396d5cb` | Seven nominal/protocol identities, two conformances, eight static dispatch slots, 211 indexed local relocation records; no decoder issues. |
| `owned-resilient-child.o` | 4824 | `9864a5064f79c40ccea2c0047faa706d4b1c09ac9df55f0168aeb5b92f6eb4d4` | Actual resilient child singleton cache `0x420`, pattern `0x238` and completion function `0x150`; external superclass and override dispatch remain unresolved. |
| `OwnedResilience.swiftmodule` | — | `d00dea2b0f3e263e9ab7b850fff4f4cd0aed1c463bd4fa0e97baad061ff8f64a` | Separately compiled owned superclass module used by the client compiler; this ABI case does not select its serialized bytes. |

The first object contains `Parcel`, `Holder`, `OwnedBase`, `OwnedChild`,
`GenericOwner`, `OwnedChoice`, and `OwnedTap`. Full `Context.call` integration
through `open_binary`, `analyze_swift_types` and
`inspect_native_dispatch_metadata` verifies their names/categories, generic
parameter records, `Holder.value`, contextual enum payload references, class
vtable/override entries, and the conditional `Parcel<Element: OwnedTap>`
generic witness template. Implementation addresses match actual compiler
symbols. Every published slot retains physical-file evidence and the original
artifact hash. Original relocation bytes are retained separately from derived
values. Object addresses are unlinked address coordinates, not process pointers.

## Actual serialized declarations

The new owned source `test/fixtures/swift-declarations-owned.swift` was compiled
with the same private frontend using `-emit-module`, then wrapped using
`-modulewrap`. The resulting Mach-O `__swift_ast` section exactly equals the
retained module bytes. Production recovery reads the selected object twice for
identity checks, invokes no provider, and follows no stored source paths.

`SWIFT_DECLARATIONS_REPORT.json` in the same external `swift` evidence directory
records snapshot `2026-10-13T22:56:02.247Z`, SHA256
`4fa73bad35a5cf750c3f52ed87c82c4253218cd19c0e74c7522ef4b35ee33f08`.
The owned source hash is
`8b33f49f735f15dbf4c4437f5e5f54d1950d4f5b1103115e95cb7d6873daf161`;
source and compiler bytes remained unchanged.

| Retained artifact | Bytes | SHA256 | Observation |
| --- | ---: | --- | --- |
| `OwnedDeclarations.swiftmodule` | 21224 | `6b22104c34075bdc2bfd9205909d4f41c2637f31012628e40d1130fc61e0de5b` | Actual serialized format 0.903, declaration/type/identifier indexes and attribute bundles. |
| `owned-serialized-declarations.o` | 21872 | `a8c7f524536c4eaa830e1602cb947045ef251c646956b23ac52e085fed2db792` | Actual `MH_OBJECT`; `__swift_ast` begins at file offset 552 and contains the entire module. |

Full `Context.call` emits eight nonempty `swift_decls` rows:
`OwnedProtocol`, `FinalLeaf`, `ExtensibleBox`, `PublicPacket`, `InternalPacket`,
`FilePacket`, `PrivatePacket`, and `Choice`. They cover protocol/class/struct/enum
kinds and private/fileprivate/internal/public/open access. `FinalLeaf` has the
serialized Final attribute and projects `is_final: true`; `ExtensibleBox` has
open access and no Final attribute. Each raw declaration retains its exact
record and attribute bit coordinates, physical file coordinates, indexed
values and fact basis. Serialized `Builtin.Copyable` and `Builtin.Escapable`
protocol identities remain visible; they are not labeled source-written clauses.

Access comes from the nominal record. Finality comes from the complete indexed
attribute bundle. Required, convenience-initializer and override flags are
false because the explicit nominal declaration kind makes those member or
initializer attributes inapplicable. These booleans are not inferred from ABI
symbol names or filled from schema defaults. Contradictory attributes reject
the selected packet. [Swift attribute format declarations](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/include/swift/AST/DeclAttr.def)
define this applicability.

Two owned compiler declarations, `SealedBox` and `ChildBox`, remain suppressed:
their inherited-type arrays require a tagged encoding that is not completely
specified by the pinned record declaration. The reader does not infer that
layout from shifted values in observed output. It also suppresses package
access, which the fixed public access enum cannot represent.

## Owned ABI and negative branches

Fresh ABI packets prove generic requirements, parameter packs and pack-shape
tails; singleton and foreign initialization; local resilient superclass
records; generic/resilient class vtables and overrides; retroactive/conditional
conformance tails; generic witness patterns and resilient requirement pairs.
The main tail packet is checked at 32/64 bits in both byte orders. These are
owned synthetic format observations, not compiler coverage for every variant.

Meaningful negatives cover malformed generic parameters/counts, reserved
initialization, invalid pack classes/indices, truncated symbolic payloads,
unsupported contextual reference kinds, contradictory resilient witness
duplicates, async/unknown overrides, undefined object symbols, conflicting
relocations, relocation escapes, internal absolute addends with nonzero section bases, zero-fill file-backing refusal and unsupported
object architectures. Existing Apple negatives and symbol fallback behavior
remain passing.

Capacity and cancellation tests prove that excessive record counts,
pre-cancelled requests, cancellation during a synthetic traversal and
cancellation after an actual completed object read retain no success evidence.
The actual compiler is not interrupted mid-compilation by these tests. External
compiler calls are bounded to 30 seconds and 1 MiB per stream; version probing
uses 10 seconds. Decoder record counts use the existing public `max_records`
bound, context ancestry is bounded to 128, and individual strings to 65536 bytes.
Zero-fill storage may identify a cache address but never supplies invented
file bytes.

Seven new independently authored bitstream cases cover exact indexed traits,
bad record offsets, orphaned Final attributes, aliasing index claims, invalid
access and initializer-only attributes, unsupported version/package access,
duplicate or conflicting same-name embedded modules, truncated block extents,
missing signatures, operand/count bounds, pre/during-parse cancellation, and
untrusted stored paths. Three live declaration cases cover the actual producer
path, selected-byte signature mutation/decode quota, and cancellation after a
completed object read. Rejected malformed, capacity or cancelled requests add
no success evidence or history; unsupported format branches remain explicit
partial observations. Compiler acquisition or execution of compiled Swift is
not part of these negative proofs.

The original bitstream reader bounds selected bytes to 64 MiB, block nesting
to 32, abbreviations to 4096 per block, abbreviation fields to 256, numeric
operands to 65536 per record and one million per module, and VBR quantities to
64 bits. Shared metadata record charging preserves the public `max_records`
bound across embedded modules. Context/type chains are bounded to 128 and
resolved types are memoized. It rejects escaped extents, undefined
abbreviations, nonzero alignment, duplicate index offsets and missing block
termination. These bounds limit decoding; they do not establish arbitrary
malicious-input performance parity or an aggregate response-byte budget.

## Capability and information barriers

The public operations now expose nonempty compiler-derived Swift types,
conformances and static dispatch records. Generic/init/resilient details and
contextual reference segments remain in retained `raw_result`; the fixed
normalized schemas have no fields for those detailed tails.

`swift_decls` is nonempty only when selected declaration-bearing bytes supply
every required trait. Metadata-only objects retain empty declarations with
explicit unsupported coverage: nominal and reflection descriptors do not
supply the complete access/finality facts. The new path interprets indexed
nominal declarations only in embedded serialized format 0.903. It does not
recover arbitrary source syntax or substitute guesses for missing facts.

Remaining limits:

- Runtime metadata, witness/vtable instantiation, cache contents, field byte
  offsets, metadata-only access/finality and execution behavior are unobserved.
- Serialized functions, properties, constructors, closures, enum payload source
  syntax, arbitrary inherited/generic type expressions, standalone module
  inputs, textual interfaces and debug-source recovery remain unsupported.
  Actor and nested nominal projection branches are not covered by the live
  compiler fixture. A serialized module does not establish executable
  membership or runtime loading. Unknown module versions are unprojected;
  conflicting retained bytes for the same module name suppress its declarations.
- Object fixups support local x86_64 absolute pointers and defined-symbol subtractor pairs. Internal subtractor pairs, undefined,
  GOT, authenticated/chained, scattered and other architecture relocations
  remain unresolved or rejected. COFF/PE Swift metadata is unsupported.
- Contextual symbolic references resolve direct/indirect local context
  descriptors. Other reference kinds retain opaque bytes; arbitrary mangling
  grammar, full generic type expression reconstruction and metadata accessor
  execution are unsupported.
- Generic value/inverted-protocol tails, canonical prespecialization tails,
  full ObjC-tagged conformance type references and external/resilient override
  resolution remain partial or unsupported. Async method pointers are not
  labeled direct code implementations.
- Mac-only providers, Apple SDK interoperability, dyld binding, Apple runtime
  execution and broad Swift version/platform parity remain unavailable or
  unverified. Compiler cross-target output alone does not prove them.

## Format references

Record layouts and tag meanings were checked against official Swift 6.1.3
[metadata declarations](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/include/swift/ABI/Metadata.h),
[metadata flag declarations](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/include/swift/ABI/MetadataValues.h),
[generic-context declarations](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/include/swift/ABI/GenericContext.h),
and [contextual mangling format](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/docs/ABI/Mangling.rst).
Object fixup facts were checked against Apple's
[x86_64 relocation declarations](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/EXTERNAL_HEADERS/mach-o/x86_64/reloc.h).
The serialized reader uses LLVM's published
[bitstream envelope](https://llvm.org/docs/BitCodeFormat.html), Swift 6.1.3
[module record layouts](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/lib/Serialization/ModuleFormat.h)
and [record/attribute identifiers](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/lib/Serialization/DeclTypeRecordNodes.def).
No vendor deserializer algorithm was used or translated.
The reader and fixtures are original implementations, not translated vendor
algorithms. Existing private vendor notices remain retained; this slice adds
no third-party package, installation or copied source.
