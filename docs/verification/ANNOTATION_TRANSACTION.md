# Manual native annotation transaction

## Accepted verification

Accepted run `1c301034-1bc0-46e0-8296-2564834d9a9f` passes **532/532 tests** across **65 files**, build and **139/139 schema-validated operations**, with zero failures, skips, cancellations, todos or suite timeout. Native, Swift and runtime fixtures were required. All **197 frozen inputs** stayed unchanged; manifest SHA-256: `ef035d63e7121f316d216a4d1b931c018e2b54fc9b640a347aba200ebf535bc0`.

The previous accepted name-batch run `d12f2b0d-3c85-4734-862d-dd60eae5be94` retains its **480/480** historical result and [validation-only scope](NAME_BATCH_VALIDATION.md), including its owned process-fixture corrections. The new proof closes later annotation preparation and commit branches; it does not broaden earlier receipts.

## Reproduced gap and bounded change

The prior implementation could change retained manual annotations before later evidence preparation, cancellation or the final annotation dossier failed. The final owned baseline has **52 cases**: **47 failures** reproduce uncovered behavior and **5 controls** already pass. Fixed combined focused checks pass **123/123**. Raw baseline and focused TAP, exit codes, final source hashes and the unchanged full-run manifest are retained in local receipts.

The transaction covers `annotate_native_function`, `set_comment`, `set_inline_comment`, `set_address_name`, `set_addresses_names`, `set_bookmark` and `unset_bookmark`. It prepares names, comments, inline comments and bookmarks in private draft maps while evidence remains unpublished. The [private finalizer handoff](../../lib/operation-commit.mjs) uses a WeakMap, so commit metadata does not enter CLI/MCP replies. `Context.call` retains the original caller signal and validates the final output before invoking the synchronous commit.

The [annotation preparation layer](../../lib/native-annotations.mjs) checks detached prepared reply content, selected target/session, ledger/history and map identity, model identity, and original presence/value of each touched key. Function annotation also checks the wider name/comment/inline-comment read set used by its dossier. No await separates final deltas, evidence publication and successful history append. Existing Map identities remain; independent committed keys and evidence survive instead of being overwritten by a full snapshot restore.

Analysis caches and owned provider roots retain their session owner. Cold model installation is bound as an observed model. After session retirement, the actual late-acquired root is removed through existing provider cleanup. This proof does not establish a general no-late-launch guarantee. Nested `this.call` work uses the original Context and keeps an independently successful winner. These are owned local observations, not broad provider or descendant-resource guarantees.

## Owned cases and compatibility

Owned cases cover evidence and annotation-dossier failure, cancellation during preparation and at public-handler handoff, draft invisibility while paused, invalid and changed final replies, original-signal replacement, close/reopen, same-key/no-op/present-null conflicts, map replacement, model changes, wider dossier changes, disjoint successful writes and nested successful calls. Failure cases preserve selected source bytes, map/session identity, all prior annotation entries, complete retained ledger and history; valid retry succeeds. A successful competitor remains retained when a stale outer call fails.

Compatibility controls retain original batch keys, ordered aliases, named spaces, unmapped addresses, empty name/comment values, ignored `document`, empty and targetless-empty batches, missing-session precedence, bookmark null/absence behavior, response ownership and model ownership. Final review reports no actionable findings against the exact five frozen implementation/fixture files. The initial review findings remain separate historical evidence. The additional 3 cold-provider/nested-receiver regressions failed against the intermediate implementation. The late-root acquisition case already passes the original baseline and detects an introduced intermediate regression; it is not presented as another original-baseline failure. Feature fixtures use owned bytes/models and controlled asynchronous seams; they do not run a selected target or vendor executable.

## Actual transport observations

The stock MCP SDK proof makes **411 actual calls** and passes **18 cases**: **8 evidence/dossier failures**, **8 cancellations** and **2 disjoint successful commits**. All seven operations exercise evidence failure and cancellation; function annotation also exercises second-dossier failure and cancellation. Negative attempts preserve the complete prior bundle and annotation state, then retry successfully. The two disjoint cases preserve earlier records and the independent committed additions. Map identity, unpublished pending state, source preservation and native snapshot close/restore are checked in every case.

The existing stock CLI `annotate-native-function` command succeeds on an owned artifact through the owned custom adapter, retaining its annotation/dossier reply and unchanged selected bytes. The transport proof runs an independently authored adapter, with no vendor executable configured and no selected-target execution requested. Verifier and CLI processes actually exit zero without timeout. MCP shutdown is observed through awaited stock-SDK close, `onclose` and physical PID exit; the public SDK exposes no child exit status, so that field remains null with its reason. The owned workspace is removed.

The installed SDK reports **8 unknown-message-ID notices** for late `operation_cancelled` replies after the eight intentional client aborts. The hash-bound correlation receipt matches every notice to its controlled case, server-side aborted signal, preserved state and raw response ID, with zero unmatched notices. The SDK labels those explicit client abort rejections `REQUEST_TIMEOUT`; the controlled abort reason and server checkpoint establish cancellation here, not an elapsed request deadline. Raw notices and the prior normalized receipt remain retained. This proof does not claim an error-free SDK cancellation stream.

## Boundaries and publication requirements

This is a transaction for seven manual native annotation operations. Automatic NativeAOT naming, navigation, native snapshot restoration, evidence import, unknown-ledger mutations and other operations retain their separately documented behavior and proof. The synchronous finalizer does not establish general operation transactions, broader provider/resource behavior or universal failure atomicity. Controlled Context races do not change MCP tool serialization.

CLI/MCP contracts, package/lock selections and all **57 application notice hashes** remain unchanged. Publication requires a separately built and checked sanitized snapshot, one normal fast-forward child of the fetched public parent, and fetched public SHA/tree/blob verification. Public file/test counts and commit IDs come from those later receipts. Private history, configurations, toolchains and raw receipts remain local. Reused dependencies do not establish a fresh installation audit.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain pending. Broader NativeAOT/Swift recovery, live-provider breadth and full REA behavioral parity remain unestablished. No global installation, worker/client activation or schedule change is part of this scope.
