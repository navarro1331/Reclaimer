# Transactional unknown-ledger mutations

## Reproduced gap and fixed behavior

`record_unknown` and `update_unknown` previously published mutation evidence before
awaited preparation returned to the handler. A late failure or cancellation could
leave an orphan event. Duplicate/revision checks ran before that await, allowing a
competing Context call to commit and then be overwritten by the pending request.

Mutation evidence is now prepared with `publish:false`. The handler rechecks the
retained unknown after the await: creation requires its identity still be absent;
update requires its complete prior content still match. It computes the next
revision digest, stages detached event/unknown values, checks cancellation and
commits both maps synchronously with no intervening await. Existing duplicate and
revision-conflict errors are retained. Successful event IDs, unknown IDs, revision
chains and response shapes keep their existing derivation and contracts.

## Owned fixtures

[Fourteen owned cases](../../test/unknown-mutation-transaction.test.mjs) author
questions, observations and revisions through Reclaimer's Context. No original
REA implementation, fixtures or prose were read or reused. **Eight cases failed
before the fix; six controls passed. All 14 pass after the fix.**

For each operation the regressions cover an injected failure after event
preparation, cancellation after preparation, pending-state observation and a
competing commit. Deterministic pause/release fixtures establish the interleaving
without timing guesses. The controls cover cancellation before preparation,
pre-aborted requests and successful revision/event/response ownership behavior.
Failed requests compare both map references and complete contents, unrelated
state, history and selected target. Successful retries append one event, preserve
prior evidence and revision links, and remain valid evidence bundles. Caller
mutation of a returned unknown cannot change its retained copy.

The combined new mutation, existing evidence, evidence-gap and bundle-import
checks pass **45/45** with zero failures, skips, cancellations or todos. Local
before/after output and source/input hashes remain retained separately.

## Actual transport proof

Actual SDK stdio MCP tests exercise both operations with a disclosed child-only
Context.evidence hook **after** event preparation. It injects a capacity error or
holds preparation for client cancellation. Complete pending bundles, server
cancellation acknowledgement and post-error bundles are compared with the prior
bundle. Both operations preserve prior state, then successfully retry with the
expected revision chain and one new event. Duplicate creation/stale update reject
without further state changes. Resource-constraint error envelopes are unchanged.

MCP tool calls remain serialized. Competing-write proof belongs to the local
Context tests. Injected capacity errors do not establish actual memory exhaustion
behavior. These fixtures run no vendor provider or target program.

The resulting owned ledger passes repeat MCP import and stock CLI `evidence-import
--json` with exact record/unknown counts and unchanged input bytes. The CLI has no
direct unknown-mutation command; this checks its existing bundle compatibility.
SDK shutdown was awaited and the owned workspace was removed after containment
checks. The hook and raw receipts remain local, outside shipped product code.

## Complete regression and publication

The complete run `35d2e51e-691c-4ba7-b3ec-9d5d81f24cd9` **failed**: build
passed, but tests passed **444/466** across **63 files**, with **22 failures**,
zero skips/cancellations/todos and no suite timeout. The extra counted test is
a failed Swift-budget reporting hook. Only **138/139** operations were observed;
`observe_native_calls` was unobserved. All 14 new mutation cases passed in this
run, alongside the separate 45/45 focused and actual CLI/MCP checks above.

Failures concern existing LLDB launch/cleanup, Node inspector and process-start
fixtures, real-child Swift budgets, Swift provider/version setup and dependent
compiler/pipe cases. This is a failed full regression, not an accepted strict run.
The failed output, reports and all **193 unchanged inputs** are archived locally
in 216 files before further verification; no product or fixture timers changed.

Independent probes without Reclaimer imports measured a plain Node child at
10,155 ms and Swift frontend `-version` at 10,306 ms. A second Node probe emitted
its first output after 10,199 ms while reporting only 0.049 seconds uptime. These
observations show startup delay outside the mutation implementation and explain
several missed 4-10 second fixture deadlines. They do not establish the cause of
every failed assertion. No system setting or security configuration was changed.

The operator requested fixes for all 22 failures before publication. Accepted run
`466a7a6c-2424-4fa9-9573-b11024655358` now passes **466/466 tests** across **63 files**, build
and **139/139 operations**, with zero fail/skip/cancel/todo/timeout and all required
native/Swift/runtime fixtures. All 193 frozen inputs stayed unchanged. The
[startup recovery report](STARTUP_RECOVERY.md) documents the separate provider and
fixture fixes. No failed strict run or scope exception is accepted.

CLI/MCP contract digests, package/lock selections and all **57 application notice
hashes** remain unchanged. Existing `real`/`REAL_*` compatibility aliases remain.
Package version stays 0.2.0, private/UNLICENSED. Publication requires separate
sanitized-snapshot build/focused verification and fetched commit/tree/blob receipts. Private historical Git, provider settings,
toolchains, generated artifacts and raw diagnostics remain excluded. Existing
local dependencies are reused for snapshot verification; fresh installation is
not claimed.

## Limits and pending checks

This closes the selected awaited-preparation mutation branches. It does not make
all operations transactional, add concurrent MCP tool execution, guarantee
rollback after a synchronous commit, or establish arbitrary resource/failure
behavior. Existing resolution semantics and uncertainty labels remain unchanged;
an unknown mutation is a ledger event, not proof that its assertion is true.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT/Swift recovery, live provider breadth and complete REA
behavioral parity remain unestablished. Prior import/snapshot/provider proofs keep
their recorded scope. No new ownership/legal certification or Mega worker/client,
global installation or schedule activation is claimed.
