# Swift serialized declaration completion

The decoder qualifies a finite declaration and source-type slice for exact
serialized formats **0.871, 0.903 and 0.944**. Other minor versions remain
unsupported. Public CLI/MCP declaration DTOs are unchanged. Associated types,
members, aliases and extensions retain structured raw facts and explicit
dispositions when the public declaration schema cannot represent them.

| Actual owned producer | Serialized minor | Complex fixture | Varied fixture |
| --- | --- | --- | --- |
| Swift 6.0.3, official Linux image | 871 | 10 public / 17 raw declarations | 14 public / 38 raw declarations |
| Swift 6.1.3, configured Windows frontend | 903 | 10 public / 17 raw declarations | 14 public / 38 raw declarations |
| Swift 6.2, official Linux image | 944 | 10 public / 17 raw declarations | 14 public / 38 raw declarations |

The owned sources exercise function-typed results and properties, escaping
closure parameters, an async protocol requirement, generic parameters and
conformance requirements, dependent associated types, metatypes and dynamic
`Self`. The varied source also checks generic-alias superclass relationships,
actors, nested declarations, required and convenience initializers, overrides,
and final members. Recovery reads the selected wrapped Mach-O object only;
stored source paths never authorize reads. Source, compiler and produced-byte
hashes, original wire record codes, bit offsets and successful closure are
checked.

The release profiles are distinct. Format 871 retains a parenthesized type
record, a different declaration code range, a three-field generic parameter
type and a legacy parameter flag. Format 944 inserts InlineArray in its type
table, changes alias records, expands parameter and isolation fields, and
uses seven low bits in inherited-type packets. Its conformance options and
global-actor references are decoded using its own layout. Original record
codes and operand arrays remain in raw observations.

New raw `callable_signature` observations recover indexed function parameter
lists, labels, ownership, default-argument facts and generic requirements.
An unsupported signature retains a reason. Display expressions do not prove
that a declaration belongs to linked executable code or runs on a device.

`test/swift-completion.test.mjs` contains fourteen portable checks, including
qualified-profile packets, malformed extents/flags/references, cycles, output
limits, cancellation and evidence preservation. The three actual producer
checks live in `test/swift-completion-producers.test.mjs`. Set
`RECLAIMER_REQUIRE_SWIFT_COMPLETION_PRODUCERS=1` for strict verification:
missing configured 6.1.3 or either previously fetched image fails the check.
Without that strict setting, unavailable producers are explicitly skipped.
Portable publication verification runs the portable file without private
toolchain requirements.

The official image pins used by the producer tests are:

| Producer | Image digest | Frontend SHA-256 |
| --- | --- | --- |
| 6.0.3 | `sha256:b394f699c1844fabf5c01d8a5673639141dc007f500661a4fa56f4ba1f23d87b` | `6243ab0357756987086a5620c1a280a243e9cebe5170ddc27f2066354cd7d4bd` |
| 6.2 | `sha256:f7efcc22a7fb242fd3e23aeac1385cd84c05b574e469136f5ef18a6474314a1e` | `cc7f04f1609262acb9115c6f283f93771f8c330a881285a9e12d1b3521db94bc` |

After the recorded image fetch, tests use `--pull never`, network `none`, a
read-only root, an unprivileged user, two CPUs, 3 GiB memory, 128 PIDs and a
512 MiB temporary filesystem. Only owned source (read-only) and artifact
(read-write) directories are mounted. Each compiler invocation has a
container and host timeout. Tests verify named-container removal and owned
workspace cleanup. No target artifact is executed; no Apple SDK is used.

Existing aggregate bounds remain: 64 MiB module bytes, one million operands,
16 MiB serialized output, 20,000 records by default, bounded traversal work,
128 reference depth, 32 bitstream block depth and 65,536-byte expressions.
JSON output bytes and traversal work are charged incrementally before output
expansion. An owned 728-byte acyclic generic-signature DAG that previously
exhausted a bounded child now returns a capacity error at its output limit.
Escaping, omitted keys, sparse arrays and primitive counts match native JSON
serialization for the tested values.
Malformed known packets fail before evidence publication. Cancellation is
checked during traversal and before publication.

SIL function types, opaque/archetype forms, pack expansion, InlineArray and
lifetime-dependence grammars remain partial or unsupported. A version profile
does not claim all language features or all releases in that version family.
The installed SDK-free Windows 6.1.3 frontend crashed when generating an async
closure body; the retained failed run records that compiler limitation. The
successful async fixture uses a protocol requirement with no generated body.
Live macOS runtime and IDA checks remain pending because those hosts/tools
are unavailable. Client activation remains a separate pending operator step.

Private raw evidence is retained in the external capability-completion phase:
`swift-completion-final-receipt.json` binds source hashes, red/green logs and the
three producer reports. It also binds the container producer and varied
fixture reports. Private paths, toolchains, receipts and generated objects are
excluded from publication.

Format facts were checked against official release sources:
[serialization design](https://github.com/swiftlang/swift/blob/swift-6.1.3-RELEASE/docs/Serialization.md),
[6.0.3 layouts](https://github.com/swiftlang/swift/blob/swift-6.0.3-RELEASE/lib/Serialization/ModuleFormat.h),
[6.1.3 layouts](https://github.com/swiftlang/swift/blob/swift-6.1.3-RELEASE/lib/Serialization/ModuleFormat.h),
[6.2 layouts](https://github.com/swiftlang/swift/blob/swift-6.2-RELEASE/lib/Serialization/ModuleFormat.h),
[6.2 conformance flags](https://github.com/swiftlang/swift/blob/swift-6.2-RELEASE/include/swift/AST/ProtocolConformanceOptions.h)
and the [official Swift image](https://hub.docker.com/_/swift).
