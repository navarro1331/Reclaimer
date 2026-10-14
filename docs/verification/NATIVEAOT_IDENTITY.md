# NativeAOT identity recovery verification

This phase adds original, bounded NativeFormat metadata inventory and explicit non-generic TypeDefinition-to-method-table associations. It supplements the earlier [NativeAOT layout and frozen-object report](NATIVEAOT_RECOVERY.md). It does not establish complete NativeAOT recovery, target execution, live runtime identity, signature trust or Mac support. Public CLI/MCP schemas are unchanged; `metadata_recovery.original_name` remains null.

## Implementation and source facts

The reader follows field declarations in the official .NET runtime [NativeFormat schema](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Metadata/NativeFormat/Generator/SchemaDef.cs), handle-kind and metadata-header declarations, and the published [Native Format encoding description](https://github.com/dotnet/runtime/blob/v8.0.31/docs/design/coreclr/botr/readytorun-format.md#native-format). Blob identifiers come from the official [metadata blob enum](https://github.com/dotnet/runtime/blob/v8.0.31/src/coreclr/tools/Common/Internal/Runtime/MetadataBlob.cs). No REA implementation, authored prose, fixtures or recovery sources were consulted. No vendor deserializer or type-hash algorithm was translated or copied.

The prose hashtable example and four-byte integer description are insufficiently precise for several byte positions. Independently authored packets and owned .NET 8 compiler output establish the implemented tagged shifts, bucket table base and signed entry-relative offsets. The supported type association uses EmbeddedMetadata 313, TypeMap 301 and CommonFixupsTable 308. CommonFixupsTable and NativeReferences 331 are distinct blobs; this phase does not claim NativeReferences 331 decoding.

`lib/native-format.mjs` reads tagged unsigned/signed integers, bounded strings/collections and native hashtables. `lib/native-format-metadata.mjs` reads declared scope, namespace, type, method, field and basic signature records. It verifies reciprocal namespace/type/nested ownership, scope identity, cycles and declared ushort ranges. Namespace and type memoization avoids repeated scope hashing and ancestor expansion.

`lib/native-aot-identity.mjs` exports `recoverNativeAotIdentities(bytes, model, recovery, options)` and `attachNativeAotIdentities(recovery, identities, options)`. The pure result includes the selected-source digest, per-module raw type/method/field inventories, conflicts, diagnostics, resource usage and validated `extra_types`. Each type identity carries its metadata handle, qualified name, namespace, assembly name/version/culture, scope key-material digest and exact selected-byte bindings. Scope key material is a recorded identity discriminator, not verified assembly authenticity.

An associated type requires a non-generic TypeDefinition token, a bounded relative CommonFixups pointer, uniquely backed fixed method-table bytes, a supported canonical layout, and agreement between the entry low hash/bucket and recorded method-table hash. The reader does not recompute a name hash. Both frozen-root tables and additional TypeMap-anchored tables can associate. Structural resemblance, string scanning and metadata-only names cannot supply this anchor.

Same-address conflicting names/scopes and one token mapped to multiple addresses suppress semantic annotation. Cross-module version/key conflicts receive the same treatment. Additional tables are staged before attachment. Existing generated IDs/names and frozen-instance records remain stable; internal `type.identity` carries the association. The parent-owned transient session projection can expose the qualified name with origin `inferred`, retain the generated alias and store raw binding evidence. No external provider database or original binary is modified.

## Owned byte and compiler proof

The final reader suite contains 36 new cases in `test/native-aot-identity.test.mjs`. It proves nonempty type/member inventory and associations across current/legacy directories, authored 32/64-bit tables, high 64-bit addresses, Unicode names and nested empty namespaces in the same scope. Negative cases cover malformed packets/counts/UTF-8, hash ordering, unsupported layouts, bad TypeMap tokens/fixups/hashes, metadata-only controls, conflicting scopes/addresses, forged hierarchy membership, cycles, ushort overflow, capacities, source/reconstruction mismatch and cancellation without attachment.

A direct NativeFormat fixture repeats a 32 KiB namespace across 200 small types. It fails during inventory construction under the aggregate expanded-name budget, before any DTO output charge. This is a direct-reader capacity proof; its complete metadata buffer is used independently of the small ELF wrapper. Two-module version/key and aggregate-capacity fixtures exercise the pure reader API; their scope is separate from public transports.

Scoped reader plus prior pure recovery and Context regression checks passed 66/66, with no skips. The owned compiler test is `test/native-aot-identity-provider.test.mjs`, explicitly enabled by `REAL_RUN_NATIVE_VARIATIONS=1`. A fresh compiler-plus-reader run passed 32/32 before the final hierarchy/name-capacity refinements. The retained compiler artifact was subsequently revalidated against the final reader, retaining 562 canonical associations and zero parameterized associations. Final global rebuilds and their exact receipts are recorded separately in the parent test/delivery reports.

The fresh fixture uses SDK 8.0.425, ILCompiler 8.0.31 and win-x64 through direct `dotnet exec MSBuild.dll`, with offline private packages, contained profiles/temp directories, certificate generation disabled, shared compilation disabled and bounded argv-only children. The authored `Program.cs` roots reflection names for `Reclaimer.Owned.Identity.LedgerWidget` and its `NestedLeaf`, plus `Mix`, `Serial`, `Label` and `Depth`. The produced executable is parsed statically and never launched.

The scoped compiler receipt `owned-aot-identity/reclaimer-aot-identity-TF2wWO-build-receipt.json` records:

| Fact | Observed value |
|---|---|
| Artifact SHA256 | `93e5fe703fcbd9765dbf551aec5c4bc2c58be8292b3494b9fb7e262944da398f` |
| Artifact bytes | 1,862,144 |
| `Program.cs` SHA256 | `f99f46ca22202a3075b0207b6f128f7be1599c8d379e07f55b1961ea7f928122` |
| Project SHA256 | `6764556c0e599cd1ed3272542625c3ab6b64e07f5cf61b4df8a2a2009b21f8a6` |
| Raw metadata inventory | 764 types, 97 methods, 145 fields |
| Unambiguous type associations | 562 |
| Additional TypeMap-anchored tables | 470 |
| Total recovered fixed tables/static frozen records | 1,086 / 950 |
| Widget / nested table addresses | `0x140131ac8` / `0x140131b40` |
| Assembly | `Reclaimer.Identity.Proof`, version `1.0.0.0` |
| Method target / field offset | null / null |

These are specimen-specific static counts, not coverage percentages or execution evidence. Prior successful artifacts and per-run receipts are retained under hash/run-specific names. The initial compiled specimen failed association because the earlier frozen-root closure omitted the custom type. Its exact failure receipt remains `first-association-failure.json`; the missing anchor was corrected and a fresh build passed. The first two attempts used common log filenames, so the initial logs were superseded; later runs preserve separate logs and immutable receipt copies.

A read-only identity probe of the earlier owned `RecoveryProof.exe` (SHA256 `4aefb98c07057310709facc048cc4810b7f33f65bdeb37c742ea664ca8797202`) recovered 647 fixed tables, 781 frozen records and 406 associated identities. `System.String` associates to `0x1400f8248`, assembly `System.Private.CoreLib 8.0.0.0`, with recorded hash `0xb74f3361`. That probe does not replace previous receipts or predict counts for a later rebuild.

## Public transport and publication checks

The separate parent/transport integration run passed 5/5 with no skips using a self-describing authored ELF, normal `open_binary` and the original SDK/CLI/MCP boundaries. Fresh CLI address and legacy type selectors returned `Owned.Widget` with inferred origin and null original name. MCP load retained Widget/Leaf identities, semantic/generated/ID selectors, physical proof hashes and two actual derived-byte hashes. The unmapped witness remained metadata-only; missing-map and conflicting-map variants kept generated names. Nine full evidence records exported and imported with exact IDs/envelopes into a fresh SDK context whose target remained unselected. Source mutation and late evidence cancellation preserved prior/unrelated records and published no partial annotations. Owned process/workspace cleanup completed.

The receipt is `recovery-identities-native-45a1a859-cc7f-47c2-b712-e593e691c534.json` under the external `reclaimer-identities-20261014` evidence root. This proves the tested static transport flow, not arbitrary managed binaries or target execution. Latest global outcomes belong in the parent-owned test/delivery reports, not the historic scoped counts above.

## Request bounds and remaining limits

Across at most 64 modules, identity recovery permits at most 16 MiB declared metadata capture, 100,000 decoded nodes/hash entries, 250,000 collection items and binding records, 4 MiB decoded string bytes, 4 MiB conservatively charged expanded-name bytes, 16 MiB proof captures and 8 MiB conservatively charged staged/output DTO bytes. `NativeCursor.string()` limits each raw UTF-8 string payload to 64 KiB as well as the 4 MiB aggregate. Namespace/type construction and method/field `memberName()` construction each check the resulting qualified name against 64 KiB before concatenation and charge the expanded-name budget; cached scope-display overhead is also charged. These limits describe those reader strings and qualified names, not every downstream selector or display combination. Hierarchy depth is limited to 64, bucket count to 65,536 and fixed MT slots/interfaces to 1,024 each. All diagnostics, conflicts, raw inventories and copied binding records count toward output limits; a final serialized-envelope check enforces the cap. Existing request-wide ceilings of 16 MiB reconstructed bytes, 10,000 types, 10,000 objects and 100,000 layout fields also cover extra tables; the per-module type ceiling is 10,000. Options may lower these limits. They are explicit format/output limits, not a claim about exact peak heap usage.

Known residuals:

- Only unambiguous non-generic TypeDefinition mapping is promoted. Generic definitions/instantiations, TypeReferences/TypeSpecifications as runtime identities, arrays and optional/dynamic layouts require additional independently proved interpretations.
- Method/field names, owner handles and signature handles are raw metadata inventory. InvokeMap, MethodRvaToToken, executable entrypoint associations, parameter/return-type expansion, field-address/offset association and original IL reconstruction remain unsupported here.
- GC descriptors, optional fields, generic composition, interface dispatch maps and original instance field names/layouts remain outside the fixed-table reader. Frozen payloads do not gain arbitrary renamed fields from metadata inventory.
- Forwarders, custom attributes, properties/events, modified/compound signature records, NativeLayout and NativeReferences 331 are not fully decoded. Absent, malformed or conflicting blobs retain diagnostics and unknowns; they cannot prove original semantic identities.
- Real compiler proof covers the pinned .NET 8 win-x64 specimen only. Other compiler revisions, genuine 32-bit/ARM64 compiler outputs, platform-specific relocation variants and Mac execution/provider checks remain unverified. Synthetic format variations do not expand that real compiler scope.
- All recovered objects/tables are static file or reconstructed byte observations. Live allocations, runtime-loaded types, dynamic dispatch validity, signing/authentication and comprehensive parity are unproved.
- The older recovery phase's reported SDK certificate-initialization side effect and retained locked temporary directory remain explicit historical caveats. This phase does not inspect certificate stores or retry cleanup of prior remnants; its fresh direct-MSBuild runs record their own cleanup status.
