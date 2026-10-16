# Managed custom-attribute Boolean values

The managed attribute reader previously converted valid Boolean values to JSON
strings. A serialized zero became `"false"`, and one became `"true"`. This was
visible in `inspect_managed_artifact` raw evidence, including array elements and
boxed values. The numeric fallback used `Number.isFinite` after converting the
byte to a Boolean; both Boolean values failed that numeric check.

The reader now returns a validated Boolean directly. This preserves `false` and
`true` through evidence serialization without changing any CLI/MCP schema,
command, operation or argument. Invalid Boolean encodings still produce an
attribute decoding issue. Integer, floating-point, string, enum and null
representations retain their existing behavior.

The [owned regression fixtures](../../test/managed-boolean-values.test.mjs) use a
[separately authored metadata builder](../../test/managed-boolean-fixtures.mjs).
The corrected baseline has six semantic failures and two passing controls. The
same eight tests pass after the fix, and the combined managed/artifact focused
run passes 45/45. Fixed arguments, named fields/properties, boxed values and
Boolean arrays retain their types; empty and null arrays remain distinct.
Invalid bytes 2 and 255 retain explicit issues. Numeric controls cover finite
values, signed zero, large integers and nonfinite floating-point values. Stock
CLI JSON and the official MCP stdio client preserve the Boolean types with no
SDK notices. Source bytes and evidence digests are checked.

An independent review additionally exercised all 256 byte values: zero and one
decode as Booleans, and the remaining 254 produce invalid-value issues. This
matches [ECMA-335, sixth edition, II.23.3](https://ecma-international.org/wp-content/uploads/ECMA-335_6th_edition_june_2012.pdf#page=294).
The first baseline attempt had an MCP test-envelope mistake; it is retained as
a harness attempt, not counted as a semantic regression. The corrected baseline
and green run use identical test and fixture bytes.

Accepted frozen run `670765f9-3115-4b0b-a7d0-1fd98d0a8e84`: build and **694/694 tests in 92 files**, 139/139 successfully schema-validated operations, zero failures/skips/cancellations/todos/timeouts, and 326 unchanged frozen inputs (manifest SHA256 `2cfbc8fac584b7218f92ab19c790f7876f3e296e2865c44670589ac49fff3399`). Required NativeAOT, Swift, runtime, JVM/codec and Linux UI producer checks passed. The isolated offline package CLI/MCP/native PTY checks passed. These results qualify the recorded fixture scope, not exhaustive behavior or REA parity.

Raw baseline, focused, independent review and full-suite receipts are retained
locally. Sanitized public snapshot checks and fetched Git tree/blob verification
are recorded separately. Contracts, package/lock files and all 57 required notice
files remain unchanged.

During review, a content search configured to return filenames accidentally
scanned an excluded historical reference-runtime folder. It returned a matching
path; no source text was displayed.
The reviewer stopped the search and recorded the boundary violation; no reference
implementation text was adopted. These engineering receipts do not certify a
clean-room process.

This correction does not add unsupported CIL forms or recover erased IL. The
[six-area report](SIX_AREA_COMPLETION.md) retains the broader capability limits.
Mac and licensed IDA checks, client activation and live worker activation remain
pending. No selected managed assembly is executed by attribute inspection.
