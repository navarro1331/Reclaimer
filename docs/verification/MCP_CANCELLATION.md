# MCP cancellation response ownership

## Focused verification

The final 11-case owned fixture reproduces seven failures and four passing
controls against the preceding protocol implementation. The corrected combined
protocol, CLI/MCP compatibility and annotation checks pass 65/65 with zero
failures, skips, cancellations or todos. Raw TAP and exact implementation/fixture
hashes are retained in the local completion-phase receipt. This focused result
is included in accepted strict run `9862b2d1-87c2-4cbf-a3b4-7216fe8bbaa5` (595/595 tests).

A separate replay on the same frozen runtime passes 18 actual stock-SDK cases
and 411 calls plus the existing CLI annotation flow: eight deliberate
cancellations, eight evidence failures and two independently successful writes.
Complete prior bundles, snapshots, retries and selected source bytes are checked;
the SDK reports zero late-response notices and the owned server/workspace
physically retire. Raw proof and the unchanged frozen manifest remain local.

The [owned fixture](../../test/protocol-cancellation.test.mjs) uses real stream
messages and the installed, unmodified MCP SDK. It verifies active and queued
cancellation, numeric/string request IDs, discarded errors and EOF responses,
progress ownership, ignored malformed/unknown/completed cancellation messages,
request-ID reuse, initialization and unchanged provider error responses.

## Behavior

A valid cancellation notification aborts only its matching pending request.
The initialization request is excluded. A cancelled queued request never invokes
its handler. Active work still finishes its existing cancellation/cleanup path,
but the server sends neither a final result/error nor further progress for the
discarded request. An ordinary provider AbortError without a client cancellation
still returns the existing operation_cancelled tool error envelope.

The actual SDK case cancels an annotation paused at evidence preparation,
observes the server request signal, compares the complete retained annotation,
evidence and history state, then completes a valid retry. A subsequent ping and
bundle request form a completed queue barrier; the SDK reports no unknown-ID
notice. The owned server physically exits and the selected source bytes remain
unchanged. No SDK patch, warning filter, new request field or schema change is
used.

The fixture passes SDK request options in the second argument, requires rejection
within five seconds of the explicit abort, and checks the SDK's retained caller
abort reason. Its separate request deadline is fifteen seconds. This distinguishes
the deliberate abort from an SDK timeout. An earlier development probe used an
ignored third argument and reached that timeout; its logs are retained locally
and are superseded by the corrected before/after proof.

This follows the negotiated [MCP 2025-11-25 cancellation specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation).
Replies already sent before a late cancellation cannot be retracted. This proof
does not establish universal provider teardown or rollback for every operation.

## Historical scope

The earlier [manual annotation proof](ANNOTATION_TRANSACTION.md) retains its
observed eight SDK notices and passing rollback/retry result. Those historical
receipts remain unchanged. The response-ownership correction and zero-notice
observation above are a separate follow-up.

Mac/IDA checks and live client/worker activation remain pending. CLI/MCP contract
bytes and required third-party notices are unchanged.
