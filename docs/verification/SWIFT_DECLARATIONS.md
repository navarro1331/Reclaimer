# Serialized Swift declaration verification

This independently authored extension was verified in Reclaimer from private
baseline `85ba929` and public baseline `484b031`. Public CLI/MCP schemas remain
unchanged. No REA implementation, prose, fixtures or recovery files were used.
No Mac provider, Apple SDK, compiled Swift function or Apple runtime was executed.
This report describes bounded observed branches, not behavioral parity.

The combined scoped run passed **45/45**, with zero failures, cancellations,
skips or todos, in `73104.4593 ms`:

```text
node --test --test-concurrency=1 test/swift-declaration-gaps.test.mjs test/swift-declaration-compiler.test.mjs test/swift-declarations.test.mjs test/swift-declarations-compiler.test.mjs test/native-apple-parity.test.mjs test/native-ui-parity.test.mjs test/swift-recovery-metadata.test.mjs
```

This comprises eleven new cases, ten existing declaration cases, twelve
Apple/UI cases and twelve ABI metadata cases. Six declaration cases use fresh
actual compiler/modulewrap output. Schema acceptance alone is not counted as
proof of recovered traits.

## Actual producer evidence

The configured private Windows frontend reports Swift 6.1.3
(`swift-6.1.3-RELEASE`), with default target
`x86_64-unknown-windows-msvc`. Its calculated SHA256 is
`38298f10adb0a7034b16692ac5272b3090cd3f2b307075b28b04ff25110ce2f3`.
The owned producer explicitly requested `x86_64-apple-macosx10.15`,
`-parse-stdlib`, disabled ObjC interop and implicit concurrency import,
library evolution and testing. It emitted a module and wrapped that module
into a Mach-O object. Cross-target object production is not Mac execution.

The scoped receipt is retained under the private Swift evidence directory as
`scoped-varied-declarations-a268e4d9b46bfbf678313830b6f5d6356845022e13f5901982681caf5ea90fc8.json`,
snapshot `2026-10-14T16:23:37.462Z`, SHA256
`a268e4d9b46bfbf678313830b6f5d6356845022e13f5901982681caf5ea90fc8`.
For this run the selected evidence root was the private
`reclaimer-identities-20261014` directory. The receipt retains real argv,
version output, exit/stream counts, selected byte identities, decoded records
and source-preservation checks. Private provider configuration and receipts
are separate from the public source snapshot.

| Owned input/output | Bytes | Calculated SHA256 |
| --- | ---: | --- |
| `test/fixtures/swift-declaration-varied.swift` | 1287 | `3611b3ec7af4cbce912bd809b5f1b9ea3a10af32e5f60cfd61acec042204a22b` |
| `OwnedVariedDeclarations.swiftmodule` | 24332 | `7ba963b99fcaf728d2e397ec6f506e18d056d567a4ecee2e68b587eeaeb801f1` |
| `owned-varied-declarations.o` | 24984 | `be864f8588496a82d6d02dd583bdd18fd228f001847b01ed3c9f2478b220283c` |

The selected object's `__swift_ast` starts at physical file offset 552.
Its 24332 bytes exactly equal the retained serialized module. Original source
and compiler bytes remained unchanged. The earlier owned declaration source
also retains its historical hash
`8b33f49f735f15dbf4c4437f5e5f54d1950d4f5b1103115e95cb7d6873daf161`;
its existing expectations now positively prove `SealedBox` conformance/finality
and `ChildBox` superclass rather than expecting their previous omission.
Historical evidence directories were not overwritten.

Host cold starts exceeded the earlier ten-second frontend version fixture
bound with empty captured output. Compiler-fixture version setup uses a documented
**30-second bound** after observed host cold starts, recorded explicitly in the receipt.
Compilation and wrapping use 30 seconds; captures use one MiB per stream.
Failed preparation promises are memoized to avoid repeated provider attempts.
Product execution/decode deadlines remain unchanged. The successful run
performed fresh compilation and wrapping; stale outputs did not substitute
for failed producer calls.

## Proven declaration branches

Full `Context.call('inspect_native_dispatch_metadata', ...)` produces fourteen
normalized declarations: `Reading`, `RefinedReading`, `Token`, `Base`,
`Base.Nested`, `Child`, `GenericBase`, `Specialized`, `Container`, `Selection`,
`identity(_:)`, `make(_:)`, `globalToken`, and `Store`.

The fixture proves protocol refinement, local class inheritance, a nested
struct, an actor record, genuine module-scope functions and a global variable.
`Base` has open access and its own `Reading` conformance. `Child` names
`OwnedVariedDeclarations.Base` as superclass. The final `Specialized` class
resolves an alias to
`OwnedVariedDeclarations.GenericBase<OwnedVariedDeclarations.Token>`.
Bound generic arguments retain selected type/decl references. Recorded
`Builtin.Copyable` and `Builtin.Escapable` identities are not presented as
source-written clauses or runtime witness observations.

Thirty-eight structured rows in `raw_result.swift_ast_modules[].decoded_declarations`
also retain members, initializers, properties, accessors, enum cases,
typealiases and extensions. The tests assert unique declaration IDs, actual
owner context IDs, explicit override target IDs and physical bit bindings for
every row. File coordinates equal `__swift_ast.file_offset + floor(bit_offset/8)`;
the remaining bit position is retained separately.

| Actual selected-byte case | Nondefault observation |
| --- | --- |
| `Base.init(seed:)` | Required attribute 184; `is_required: true`. |
| `Base.init()` | Serialized initializer kind 1; `is_convenience_init: true`. |
| `Child.init(seed:)` | Required attribute and explicit base initializer reference; required and override true. |
| `Child.read()` and `Child.item` | Explicit references to the actual base method/property; override true. |
| `Base.sealed(_:)` | Indexed Final attribute 182; final true. |
| `Token` extension and `Token.read()` | Exact extension-to-nominal/member context; extension access stays unknown. |
| `Selection.empty` and `Selection.token(_:)` | Distinct selected enum-element records, including payload-name components; access stays unstored. |

Access comes from the selected access field. Final and Required come from
complete indexed attribute bundles and the constructor recovery bit where
specified. Convenience comes from the constructor kind; override comes from
an explicit referenced declaration. Inapplicable traits are false because of
the explicit declaration kind. These values do not come from public schema
defaults, mangled-name guesses, parent-class finality or source files.
[Swift's pinned module record layouts](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/lib/Serialization/ModuleFormat.h)
and [attribute applicability declarations](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/include/swift/AST/DeclAttr.def)
provide the field and modifier facts.

The nominal array ordering and three-bit inherited entry packing were
independently checked against these owned 0.903 compiler packets. Tagged
conformance references use the format's two-bit abstract/concrete/pack
dispatch. The reader resolves bounded direct, bound-generic, alias, generic
parameter, composition and selected wrapper type expressions. Inherited
entry low flags remain numeric `opaque_flags`; this phase does not claim
semantic interpretation of unchecked/retroactive/preconcurrency variations.

## Public schema dispositions and remaining gaps

The fixed `swift_decls.kind` enum includes nominal kinds, actor, extension,
global function and global variable. It has no method, property, constructor,
accessor, enum-case or typealias kind. Those byte-derived records remain
structured raw facts with explicit normalized dispositions. Members are not
relabeled globals. Extensions have no serialized source access field in the
selected record; a required non-null public access value cannot be guessed.

Metadata-only binaries remain unable to supply complete source declaration
access/finality. Standalone serialized module and textual interface routes
remain unsupported by the selected Mach-O handler. Serialized names are
recorded identifiers, not recovered unobfuscated originals. Arbitrary source
syntax, bodies, generic requirement signatures, associated/opaque/SIL/pack type
grammars, local closure reconstruction and full external/private cross-reference
identity remain partial or unsupported. Unsupported versions are unprojected.
The fixed schema cannot express complete signatures, generic argument trees,
source spellings or unknown access/trait values.

Mac-only providers, Apple SDK behavior, dyld binding, loaded actor/runtime
metadata, witness/vtable instantiation, field layouts, native execution/control
and broad Swift version/platform parity remain pending or unverified.
No arbitrary execution-equivalence claim follows from parser/compiler fixtures.

## Bounds, conflicts and atomic failures

Fresh independently authored packets prove required/convenience flags and
extension access barriers. Malformed tests cover boolean/kind values, protected
attribute payloads/duplicates/applicability, incompatible/self override
targets, reserved tagged conformance IDs, escaped type references and recursive
generic expressions. Every rejected request retains its existing ledger and
history without adding success evidence.

Record, byte, numeric operand, reconstructed UTF-8 output and semantic-work
charges span the entire request, including concatenated modules and separately
backed `__swift_ast` sections. Limits are 64 MiB selected AST bytes, one million
numeric operands, 16 MiB reconstructed row content, the existing public
`max_records`, and bounded semantic work derived from that record limit.
The output quota covers reconstructed declaration content, rather than every
general Evidence-envelope byte. Existing per-record/depth/string bounds remain:
65536 operands, 32 nested bitstream blocks, 4096 abbreviations per block,
256 abbreviation fields, 128 context/type steps and 65536 UTF-8 expression
bytes. Resolved types and identities are memoized. The original bounded reader
uses the published [LLVM bitstream envelope](https://llvm.org/docs/BitCodeFormat.html)
and pinned [Swift record identifiers](https://raw.githubusercontent.com/swiftlang/swift/swift-6.1.3-RELEASE/lib/Serialization/DeclTypeRecordNodes.def),
not a vendor deserializer algorithm.

Owned tests demonstrate aggregate record/operand/output exhaustion without
publication. Exact duplicate embedded modules deduplicate. Different retained
bytes for one module name mark every occurrence conflicting, including earlier
duplicates, and suppress its normalized declarations. Actual signature mutation
and cancellation after the final source read publish no additional evidence.
Stored source paths trigger no filesystem reads. The production reader reads
only the selected artifact for identity checks and invokes no compiler/provider.
Compiler interruption mid-production is not proved by these cancellation cases.

The public schema SHA256 values remain
`66f7c612d12b0771095b3717c193669b86eed3f242f6bdfe4594384c5fc89f29`
and `ca942e7ad48933c827a2f6b1f07cc4e23fc531c366c41a1535f8a5642dec1909`.
This slice adds no third-party package or installation. Existing notices remain
retained; no vendor reader code or fixture was copied.
