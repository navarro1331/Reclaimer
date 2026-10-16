# Finite artifact-format completion

This independent extension keeps the public CLI/MCP contracts unchanged. The
decoders consume artifact bytes and preserve raw facts; they do not execute the
target, installation scripts, Java classes or managed methods. Registered routes
and passing fixtures do not establish support for every variant of a format.

## Qualified behavior

| Area | Implemented slice | Evidence and remaining limits |
| --- | --- | --- |
| DEX | Existing 035/037/038/039/040 plus the 120-byte 041 logical header, physical-container offsets, later shared data and multiple logical files | Owned two-header packet, second-file public class/method routes, inconsistent headers/ranges and cancellation. Android documents 041 as experimental. Compact DEX, annotations/debug records and invoke-custom call-site metadata remain undecoded. |
| JVM class/JAR | Exact non-preview class majors 52/55/61/65/69; modified UTF-8 constants, descriptors, class/field/method identities, finite standard attributes and Code operands/references/switches/exception/line records | Owned packets plus actual configured javac 25 producers using `--release 8/11/17/21/25`, two classes per release. No Java source reconstruction, operand-stack verification, bootstrap evaluation, loading or execution. Other versions and annotation/stack-map/generic-signature attribute semantics remain explicit raw/unsupported facts. |
| Managed metadata | Bounded auxiliary StandAloneSig locals/call signatures, Property, TypeSpec and MethodSpec blobs, alongside existing member signatures/CIL | Raw evidence retains row/token/blob identity and decoded types/arguments without adding normalized wire fields. Unknown grammar stays unsupported; token strings do not establish runtime type binding or successful verification. |
| PKG/CPIO | Existing ASCII newc/crc/odc plus documented Unix binary CPIO in either 16-bit word byte order, including high-word-first 32-bit lengths | Owned packets include a 65,539-byte file. Names, alignment/padding, duplicate paths, link/special-file declarations, quotas and cancellation are checked. PWB/HP device variants are not inferred. |
| Configured XAR codecs | Bzip2, XZ and LZMA-alone member streams through an explicitly configured Python stdlib adapter | Actual owned compressed bytes, XAR hashes, CPIO expansion and public inventory/extraction. Exact output size, EOF, trailing-stream refusal, timeout, abort, child shutdown and owned temporary cleanup are checked. Stored/zlib `xarEntries` stays synchronous. PBZX and concatenated streams remain unsupported. |
| HFS+/HFSX | Catalog and regular-file data-fork overflow allocation chains using sorted extents keys and linked leaves | Owned positive volumes require overflow records for both catalog and a ten-fragment file; malformed keys/links/allocation ranges fail. The extents tree must bootstrap from its volume-header extents. No allocation-bitmap verification, index repair or journal replay is claimed. |

Generic JAR inventory opens through the existing ZIP route. Parsed class models
are retained in `raw_result.jvm_classes`; the frozen normalized observation enum
is preserved. The Android class/method/reference routes also accept explicit
class/JAR inputs. A JVM method has no reconstructed Java source: its normalized
body remains unavailable and its observed Code inventory is raw evidence.
Multi-release/duplicate class identities stay ambiguous rather than selecting a
runtime release that was never supplied.

The operator configuration `pkgCodecPythonArgv` selects an existing absolute
Python executable and literal argv. There is no ambient PATH discovery or
installation. The decoder uses isolated Python mode with bytecode-cache writes
disabled (`-I -B -S`), a sparse environment and
an owned empty working directory. Expanded bytes stay under the member's
declared size and the 256 MiB archive ceiling; LZMA uses a 64 MiB decoder-memory
limit. Codec children have a lower-only 60-second ceiling and an aggregate
publication deadline. Termination escalates from TERM to KILL after 250 ms and
allows a further two seconds for exit confirmation. Confirmed cancellation waits
for physical child close and cleanup, then preserves the caller's exact reason.
An unconfirmed exit instead records its owned PID and retained temporary path;
it never claims successful cleanup. Failed results are never published.

## Verification

`test/artifact-format-completion.test.mjs` contains portable owned packets and
public-route checks. `test/artifact-format-producers.test.mjs` separately requires
explicit `RECLAIMER_FORMAT_JAVAC` and `RECLAIMER_FORMAT_PYTHON` selections for the
actual producer checks. Setting `RECLAIMER_REQUIRE_FORMAT_PRODUCERS=1` makes a
missing selection fail. No compiler or codec executable is bundled or activated.

`test/artifact-format-source-binding.test.mjs` covers eight JVM/managed source
swap, late-swap, late-cancellation and same-byte session-replacement cases. The
routes retain their parsed source digest, recheck it before return and stage
evidence until final contract/cancellation validation. They cannot relabel a
model parsed from old bytes with a newly reread source digest.

`test/artifact-format-codec-posix.test.mjs` separately uses explicit
`REAL_TEST_DOCKER` and `REAL_TEST_LINUX_UI_IMAGE` selections for an owned Linux
container proof. Its three owned children ignore TERM and test cancellation,
timeout and output overflow, KILL escalation, physical process/container absence
and cleanup. Only explicit source/dependency copies and owned artifacts are
mounted; runtime network access is disabled. This is a finite process-lifecycle
proof, not general hostile-program isolation or Mac runtime verification.

The producer reports retain compiler/executable/helper and app source hashes,
argv/stdout/stderr/exit/close receipts, owned source/class/package artifacts and
verified workspace cleanup. JVM output is compiled and parsed, never executed.
Private raw red/green receipts remain outside the public project. The focused
artifact-gap/parity/container tests remain part of regression coverage.

## Deliberate residuals

APFS extraction, encrypted or segmented DMG input selection, additional UDIF
codecs, resource forks/compressed HFS files, compiled NIB/CAR decoding and Apple
tool-backed verification are not implemented by this slice. XAR codec support
does not imply the corresponding UDIF codec exists. Mac/IDA live checks and
client activation remain pending; owned byte fixtures do not replace them.

## Primary format references

- [Android DEX format](https://source.android.com/docs/core/runtime/dex-format)
- [Oracle JVMS 25 class-file format](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-4.html)
- [Oracle JVMS 25 instruction set](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-6.html)
- [ECMA-335, Partition II metadata and signatures](https://ecma-international.org/publications-and-standards/standards/ecma-335/)
- [FreeBSD CPIO format manual](https://man.freebsd.org/cgi/man.cgi?manpath=FreeBSD+12.2-RELEASE&query=cpio&sektion=5)
- [Apple HFS Plus volume format, TN1150](https://developer.apple.com/library/archive/technotes/tn/tn1150.html)
- [Apple XAR format project](https://github.com/apple-oss-distributions/xar)
- [Python 3.11 incremental BZ2 API](https://docs.python.org/3.11/library/bz2.html)
- [Python 3.11 incremental LZMA API](https://docs.python.org/3.11/library/lzma.html)
