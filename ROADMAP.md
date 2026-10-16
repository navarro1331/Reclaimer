# Reclaimer roadmap

This roadmap sequences work from the current implementation. It contains no
promised dates or inferred percentage of completion. A milestone closes when its
owned proof and documented limits satisfy the [completion contract](COMPLETION_CONTRACT.md).

| Milestone | State | Required outcome and proof |
| --- | --- | --- |
| Independent implementation and Reclaimer identity | Implemented baseline | Preserve CLI/MCP compatibility, owned implementation and fixtures, notices and separate public history. See [prior delivery](docs/verification/RECOVERY_DELIVERY.md). |
| NativeAOT identity and Swift declaration extension | Implemented and strictly verified | Verify byte-bound names, generated aliases, additional mapped types, actual Swift declaration traits, atomic failure behavior and unchanged contracts. See [current status](PROJECT_STATUS.md). |
| Cached provider datatype response isolation | Closed in owned fixture scope | Clone cached DTOs before address projection; prove name/ID/address caller mutation isolation and earlier-reply stability after cache updates. See [scope](docs/verification/PROVIDER_DATATYPE_ISOLATION.md). |
| Native snapshot restore transaction | Closed in owned fixture scope | Stage validated annotations/evidence before state changes, reject conflicts and preserve failed/cancelled restores. Verify actual MCP retry. See [scope](docs/verification/NATIVE_SNAPSHOT_TRANSACTION.md). |
| Evidence-bundle import transaction | Closed in owned fixture scope | Prepare unpublished historical bindings, recheck retained state after await and commit only after cancellation checks. Verify controlled Context races and actual transports. See [scope](docs/verification/EVIDENCE_IMPORT_TRANSACTION.md). |
| Unknown-ledger mutation transaction | Closed in owned fixture scope | Prepare unpublished events, recheck retained state after await and commit event/revision together. Verify failure/cancellation/retry and competing Context writes. See [scope](docs/verification/UNKNOWN_MUTATION_TRANSACTION.md). |
| Bounded startup and lifecycle recovery | Closed in owned fixture scope | Verify real provider replies, readiness, observation windows, physical exit and quotas without dropping compiler symbols. Full suite passes. See [scope](docs/verification/STARTUP_RECOVERY.md). |
| Native address-name batch validation | Closed in owned validation scope | Parse every ordered address before name writes; prove late-invalid preservation, valid retry, compatibility and actual MCP/snapshot flow. See [scope](docs/verification/NAME_BATCH_VALIDATION.md). |
| Manual native annotation transaction | Closed in owned fixture scope | Stage four manual maps and unpublished evidence for seven operations; validate original caller cancellation, output and retained state before synchronous delta/evidence/history commit. Preserve failed attempts and independent successful writes. See [scope](docs/verification/ANNOTATION_TRANSACTION.md). |
| Project documentation and decision records | Created and reviewed | Maintain the requested root documents, three ADRs, working links and evidence-backed status. |
| Mac-only provider validation | Pending operator environment | Use owned artifacts on macOS with Hopper/Apple assetutil and the relevant Apple SDK/runtime. Record genuine provider output and platform limitations. |
| NativeAOT generic and member extension | Strictly verified finite scope | Prove generic definitions, the one-argument .NET 8 win-x64 constructed profile, compound signatures and strict reflection-map entrypoints/offsets; preserve ambiguous identities and unknown complete layouts. See [scope](docs/verification/NATIVEAOT_COMPLETION.md). |
| Additional NativeAOT breadth | Open | Prove other constructed arities, optional/dynamic/imported layouts, GC/dispatch structures and complete code/layout relationships before promoting them. |
| Swift version/signature extension | Strictly verified finite scope | Verify exact 0.871/0.903/0.944 profiles with three real owned producers, richer callable/type facts and preallocation output bounds. See [scope](docs/verification/SWIFT_COMPLETION.md). |
| Additional Swift breadth | Open | Prove unsupported SIL/opaque/pack/InlineArray/lifetime forms, other formats and genuine platform/runtime variants. Preserve explicit unsupported dispositions. |
| MCP cancellation response ownership | Closed in owned strict/transport scope | Omit discarded replies/progress, preserve queued-request ownership and explicit stock SDK abort/retry without unknown-ID notices. See [scope](docs/verification/MCP_CANCELLATION.md). |
| Local package and contained worker | Frozen local package/image verified; activation pending | Install the host-specific bundle offline in an isolated prefix; verify installed CLI/MCP and exact Docker mounts, resource limits and owned cleanup. Keep client/live worker activation pending. See [guide](docs/operations/LOCAL_INSTALL.md). |
| Additional provider and runtime breadth | Open | Exercise licensed/installed IDA and other unverified provider branches; extend selected-platform and lifecycle fixtures without implying universal cleanup or execution equivalence. |
| Behavioral parity assessment | Open | Define a capability/branch matrix and compare independent, working programs on the same owned artifacts. Record matched behavior, disagreements and untested branches. |

## Sequencing

Use accepted capability run `9862b2d1-87c2-4cbf-a3b4-7216fe8bbaa5` as the current full-suite
baseline: 595/595 checks, 278 unchanged inputs and 139 observed operations.
Recovery, cancellation, reconstruction and package proofs retain their explicit
scope; the same frozen runtime has 18 actual transport cases with zero SDK notices.
Mac checks remain pending until the operator's machine and tools are available. Each later recovery
extension should start with an owned producer or byte fixture, a negative control,
resource/cancellation cases and the existing public transport.

Use the unchanged normalized schema where it can represent a proven fact.
Retain richer facts in raw evidence where it cannot. Any future schema revision
needs a separately agreed compatibility plan.

## Follow-up boundaries

The provider datatype local embedding response-aliasing issue is closed with
owned name/ID/address fixtures and cache-update checks. Cached provider DTOs are
now detached before address projection, alongside the existing NativeAOT paths.
This proves local response ownership; live vendor datatype inference and broader
recovery equivalence retain their separate pending scope.

The native snapshot restore transaction gap is closed for the documented malformed
input, evidence conflict and cancellation cases. Complete unknown-ledger transfer
remains a separate evidence-bundle capability; this fix does not add it to snapshots.

The bundle-import transaction gap is closed for the documented failure,
cancellation and awaited-binding conflict cases. General operation transactions,
resource/concurrency breadth and historical source authenticity remain separate
scopes; the local Context race proof does not change MCP's serialized tool queue.

The native name-batch proof retains its validation-only historical scope. The
subsequent manual annotation transaction closes the owned later evidence failure,
cancellation and `annotate_native_function` dossier branches for seven operations.
Controlled Context races preserve independent successful writes and reject stale
conflicts. NativeAOT automatic naming, navigation, snapshot restore and general
operation transactions retain their separate scopes. See the
[annotation transaction report](docs/verification/ANNOTATION_TRANSACTION.md).

The operator authorized local packaging and contained worker tests, with client
activation pending. Those tests do not authorize live Mega registration.
Distribution licensing, hosted service operation, global installation and live
worker/client activation retain separate scopes. A seven-scenario
[owned reconstruction comparison](docs/verification/OWNED_RECONSTRUCTION.md) adds
finite execution evidence; arbitrary reconstruction and full REA parity remain
unestablished.
