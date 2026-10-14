# Reclaimer roadmap

This roadmap sequences work from the current implementation. It contains no
promised dates or inferred percentage of completion. A milestone closes when its
owned proof and documented limits satisfy the [completion contract](COMPLETION_CONTRACT.md).

| Milestone | State | Required outcome and proof |
| --- | --- | --- |
| Independent implementation and Reclaimer identity | Implemented baseline | Preserve CLI/MCP compatibility, owned implementation and fixtures, notices and separate public history. See [prior delivery](docs/verification/RECOVERY_DELIVERY.md). |
| NativeAOT identity and Swift declaration extension | Implemented and strictly verified | Verify byte-bound names, generated aliases, additional mapped types, actual Swift declaration traits, atomic failure behavior and unchanged contracts. See [current status](PROJECT_STATUS.md). |
| Project documentation and decision records | Created and reviewed | Maintain the requested root documents, three ADRs, working links and evidence-backed status. |
| Mac-only provider validation | Pending operator environment | Use owned artifacts on macOS with Hopper/Apple assetutil and the relevant Apple SDK/runtime. Record genuine provider output and platform limitations. |
| Broader NativeAOT recovery | Open | Independently prove generic/parameterized associations, original instance layouts, optional/GC/dispatch structures and method code-target bindings before promoting them. |
| Broader Swift recovery | Open | Prove additional serialized versions, richer type/signature grammars, external references and genuine platform/runtime variants. Preserve explicit unsupported dispositions. |
| Additional provider and runtime breadth | Open | Exercise licensed/installed IDA and other unverified provider branches; extend selected-platform and lifecycle fixtures without implying universal cleanup or execution equivalence. |
| Behavioral parity assessment | Open | Define a capability/branch matrix and compare independent, working programs on the same owned artifacts. Record matched behavior, disagreements and untested branches. |

## Sequencing

Use the verified identity/declaration update and its documentation as the baseline.
Mac checks remain pending until the operator's machine and tools are available. Each later recovery
extension should start with an owned producer or byte fixture, a negative control,
resource/cancellation cases and the existing public transport.

Use the unchanged normalized schema where it can represent a proven fact.
Retain richer facts in raw evidence where it cannot. Any future schema revision
needs a separately agreed compatibility plan.

## Follow-up boundaries

The final read-only projection review recorded a pre-existing provider-only
local embedding response-aliasing issue. The new NativeAOT datatype and raw identity
paths are detached, and serialized CLI/MCP replies do not expose object references.
Track that local embedding issue separately from recovery equivalence.

Distribution licensing, packaged installation, hosted service operation and
Mega worker/client activation each require their own defined scope. This roadmap
does not schedule, authorize or claim those outcomes.
