# Native address-name batch validation

## Accepted verification

Accepted run `d12f2b0d-3c85-4734-862d-dd60eae5be94` passes **480/480 tests** across **64 files**, build and **139/139 schema-validated operations**, with zero failures, skips, cancellations, todos or suite timeout. Native, Swift and runtime fixtures were required. All **194 frozen inputs** stayed unchanged; manifest SHA-256: `d1199dae8e5e775ac881129fef79cf5c425a0112ff0b1bb4d447394aa77d8a47`.

The previous accepted startup-recovery run `466a7a6c-2424-4fa9-9573-b11024655358` remains a previous 466/466-test delivery in [its recorded scope](STARTUP_RECOVERY.md). This report covers the new naming validation gap.

## Reproduced gap and bounded change

`set_addresses_names` previously wrote each parsed address into the existing name map as it iterated the supplied batch. A malformed later address rejected the request after earlier names had changed. The owned baseline reproduces **8 failures among the final 14 cases**; **6 controls** already pass.

The handler now obtains the existing session for a nonempty batch, stages every original key, parsed address and name in `Object.entries` order, and only then writes the staged entries to the existing name map. A validation error therefore occurs before any name write. Valid aliases retain their ordered last-write-wins behavior and replies retain the caller's original keys. This closes a validation-only partial-write gap.

## Owned fixtures and compatibility

The final [batch fixture](../../test/native-name-batch.test.mjs) contains **14 cases**. Four malformed forms (`not-address`, `0xno`, `ram:0xzz`, `module!:1`) appear in both middle and final positions. Each failure preserves the selected source bytes, target/session identity, all prior names/comments/inline-comment/bookmark maps and entries, the complete retained ledger and history; a valid retry then succeeds. A first-invalid-address control also preserves prior state. Combined owned focused checks pass **36/36**.

Compatibility controls retain bare/prefixed hexadecimal/`ram` aliases and order, named address spaces, unmapped addresses, empty name strings, original reply keys, unchanged existing map identity, unrelated annotations, and separation of returned replies from retained evidence. The `document` field remains ignored. Empty batches succeed with or without a selected target. A nonempty targetless batch keeps the missing-session error ahead of malformed-address parsing. A pre-aborted Context call preserves prior state.

These feature fixtures use independently authored ELF bytes and reject any `ctx.run` call; no provider or selected target is executed. Source and fixture hashes are bound to the accepted frozen inputs.

## Actual transport observations

The stock MCP SDK proof makes **34 actual calls** over an owned ELF. It verifies the existing `operation_failed`/`operation_failure` error for a late invalid batch, complete prior-bundle byte equality, old-name preservation and absence of the attempted new name. A valid retry preserves original result keys, ordered aliases and prior records. Native snapshot save, close and restore retain the observed names, comments, inline comments, bookmarks and evidence. Source bytes remain unchanged.

The existing CLI selected-artifact snapshot flow passes through `binary_overview` with the independent byte parser. The CLI has no batch-name command; this observation does not claim a CLI batch-naming route. CLI and verifier processes actually exit zero without timeout. MCP shutdown is observed through awaited stock-SDK close, `onclose` and physical PID exit; that public SDK does not expose a child exit status, so it remains null. The owned workspace is removed. No vendor argv is configured and selected-target execution is not requested.

## Owned process-fixture completion

The owned PTY comparison fixture now allows 15 seconds for natural completion instead of 5 seconds, and explicitly requires exit code 0, reason exited and no terminating signal before comparing terminal bytes. The retained alpha/alpha streams are byte-identical; the beta stream differs. Existing unchanged/changed expectations, process-unknown disposition and narrow verification assertions remain. Raw control bytes are retained; no stripping or extra normalization was added. This corrects fixture completion evidence rather than changing the comparator.

The owned runtime-cleanup fixture now waits up to 15 seconds for an explicit stdout READY marker installed after the stdin handler, before ownership and the exit request. Its existing 5-second post-command exit wait and cleanup deadline remain unchanged, along with natural exit, no-termination and live-mismatch assertions. Three external owned children exited naturally; the original 5-second failure was not reproduced, so its cause remains unestablished. This readiness refinement is not evidence for broader cleanup deadlines or a product cleanup-policy change.

An additional negative control extracts the final fixture helpers and selected test body, rebasing URLs and substituting only a test-only second child that never emits READY. The expected 15-second readiness rejection occurs; the helper catch and actual test finally each stop their owned child, and both PIDs are physically absent without emergency harness cleanup. This proves fixture acquisition-failure cleanup before product ownership calls; it does not prove product ownership behavior or arbitrary descendant cleanup.

The external PTY sequence observes equal 88-byte alpha streams and a distinct 87-byte beta stream, natural code-zero exits and absent owned PIDs. It does not reconstruct the unavailable exact raw bytes of the original full-suite failure or establish a universal startup-time guarantee. Only correction rows bound to the accepted frozen fixture hashes are reported here.

## Open branches and publication requirements

This is not a universal annotation transaction. A later wrapper evidence-publication failure or cancellation after synchronous name writes remains a separate open branch. General `annotate` rollback is also open. The pre-aborted Context control does not establish rollback for those later stages. Existing snapshot/import/unknown-ledger transaction proofs keep their separate scope.

CLI/MCP contract hashes, package/lock selections and all **57 application notice hashes** remain unchanged. Publication requires a separately built and checked sanitized snapshot, a normal fast-forward child of the existing public parent, and fetched public commit/tree/blob verification. Snapshot counts and new commit IDs come from those later receipts. Private history, configuration, toolchains, generated outputs and raw receipts remain local. Reused dependencies do not establish a fresh installation audit.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain pending. Broader NativeAOT/Swift recovery, live-provider breadth and full REA behavioral parity remain unestablished. No global installation, worker/client activation or schedule change is part of this scope.
