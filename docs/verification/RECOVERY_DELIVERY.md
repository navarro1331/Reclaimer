# Reclaimer recovery delivery

The independently implemented product is now named **Reclaimer**. Its canonical
entry point is `scripts/reclaimer.mjs`; `scripts/real.mjs`, REAL_* settings and
historical wire identifiers remain compatible. Both entry points were tested
against the same public CLI and MCP schemas. The existing 95 CLI commands,
139 MCP operations and six prompts are unchanged.

## Frozen verification

Run **6e71a942-c3f5-4653-ae0e-9363722bbeb2** passed **357/357 tests** across
**53 files**, with zero failures, skips, cancellations or todos.
Native, Swift and runtime prerequisites were required. All **139/139 operations**
had successful schema-validated observations. **169 implementation,
fixture and configuration inputs** retained their frozen SHA256 values.
The complete local TAP output has SHA256 **f82ca20b134ff724971b3ded148e26f8f49f36ded4ef8edda3cbac5e6218c137**. Raw logs and
machine-specific provider receipts remain private. These are bounded execution
and operation-coverage observations, not proof of complete REA equivalence.

| Recovery | Observed behavior | Owned proof and limits |
| --- | --- | --- |
| NativeAOT | Rehydrated memory, anchored fixed method-table layouts, frozen string/array/boxed storage, queryable transient definitions and derived byte reads | Fresh SDK 8.0.425/ILCompiler 8.0.31 specimen: 296 method tables and 781 static instances; exact source-owned Unicode string, seven-byte array and boxed Int32=173. 1460736 bytes, SHA256 4aefb98c07057310709facc048cc4810b7f33f65bdeb37c742ea664ca8797202. Target never executed. [Scope](NATIVEAOT_RECOVERY.md). |
| Swift ABI | Generic contexts, resilient/singleton initialization, conformances, witness templates, dispatch slots and bounded object relocations | Actual Windows Swift 6.1.3 frontend produced owned x86_64 Mach-O objects; templates and unresolved external pointers remain explicit. [Scope](SWIFT_RECOVERY.md). |
| Swift declarations | Eight nonempty serialized nominal rows, five representable access levels and explicit Final presence/absence | Selected modulewrap __swift_ast bytes, pinned module format 0.903; stored source paths never followed. Required/convenience/override booleans derive from nominal-kind applicability. Unsupported member/inherited forms remain suppressed. [Scope](SWIFT_RECOVERY.md). |
| Swift literal input | Macro-form demangling and literal @-path input through a bounded closed pipe; atomic mixed-batch failure | Actual Swift provider plus owned child delivery/cancellation fixtures; the macro input is an authored ABI literal. [Scope](SWIFT_STDIN.md), [aggregate budget](SWIFT_BUDGET.md). |

Both contract file digests are unchanged:

- lib/api-contracts.json: `66f7c612d12b0771095b3717c193669b86eed3f242f6bdfe4594384c5fc89f29`
- lib/cli-contracts.json: `ca942e7ad48933c827a2f6b1f07cc4e23fc531c366c41a1535f8a5642dec1909`

Dependency selections and all non-root lock entries are unchanged. All **57 application
notice files** for the inventory's 55 packages/interface references passed checksum
verification. Two private Swift and ten private NativeAOT package notices remain
with their local tools, which are excluded from the public repository. The package
remains private/UNLICENSED; a new distribution license has not been selected.

## Remaining limits

Original NativeAOT metadata identities, arbitrary original field names, generic
composition, optional/GC/interface-dispatch structures and runtime validity remain
unrecovered. Generated labels preserve these unknowns. Swift recovery is limited
to the documented ABI/serialized versions, nominal declaration forms and relocation
variants; metadata-only binaries do not gain invented access/finality traits.
Full REA behavior parity and broader SDK/platform/artifact coverage remain unestablished.

**Mac-only provider checks remain pending**, including Hopper, Apple assetutil,
Apple SDK/runtime interoperability and macOS Objective-C breakpoint execution.
IDA/JADX provider branches were not validated by this phase. Cross-target compiler
output does not establish Mac runtime or proprietary-provider behavior.

One earlier SDK CLI restore reported installing an ASP.NET Core HTTPS development
certificate. Actual certificate-store state was not inspected or changed. Successful
subsequent builds used direct MSBuild with certificate generation disabled. A failed
CLI build retained locked generated analyzer files; its cache junction was removed.
Successful direct-MSBuild fixtures completed owned-directory cleanup. Historical
ignored fixture directories and empty pre-rename remnants remain retained locally;
they are excluded from publication. See the NativeAOT scope for the incident limits.

## Publication and ownership

The requested destination is [navarro1331/Reclaimer](https://github.com/navarro1331/Reclaimer),
on `codex/reclaimer-public`. The public snapshot includes separately authored code,
fixture sources, portable docs and required notices. It excludes private provider
configuration, raw diagnostics, toolchains, generated runtimes and prior private
Git history. Detailed preflight, commit and remote verification receipts remain local.
The original REA checkout and former derived recovery copy remain preserved separately.
An engineering byte-duplication audit does not certify legal clean-room status or
distribution clearance; the earlier parent conversation had source exposure.
