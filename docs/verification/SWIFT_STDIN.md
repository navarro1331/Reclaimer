# Swift literal input and closed-pipe verification

@-prefixed symbols are submitted to `swift-demangle --compact` through a bounded,
closed stdin pipe. They never enter argv as response-file names. Ordinary symbols
retain the existing literal argv route. Public request/response schemas are unchanged.

Owned live provider fixtures verify that `@__swiftmacro_5Owned5ProbeV` demangles to
`Owned.Probe`, and that an @-prefixed path remains literal even when the named file
contains a valid mangled symbol. The macro-form symbol is an authored ABI literal;
it is not a compiler-generated macro-plugin expansion. No file named by a symbol
is read. Raw provenance records pipe byte length and SHA256.

An actual owned Node child verifies closed-pipe byte delivery and physical root
exit after cancellation. That assertion covers the owned child transport; it does
not claim interruption of a running Swift provider. A mixed argv/pipe failure
verifies request-level atomicity: no earlier successful evidence remains published.
The pipe accepts at most 1 MiB plus one delimiter; the symbol aggregate budget
retains its 1 MiB ceiling before that delimiter is added.

The final frozen verification report records current counts. Prior focused provider
and boundary runs are retained locally; private paths and raw diagnostics are not
published. Provider versions and ABI variants outside these fixtures remain unproved.
