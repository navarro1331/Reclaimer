# Bounded startup and readiness recovery

## Accepted verification

Accepted run `466a7a6c-2424-4fa9-9573-b11024655358` passes **466/466 tests** across **63 files**,
build and **139/139 schema-validated operations**, with zero failures, skips,
cancellations, todos or suite timeout. Native, Swift and runtime prerequisites
were required. All **193 frozen inputs** stayed unchanged; manifest SHA-256:
`468a88189b2af2d559e4885c4e9b46254bc99eb0d05040013da357fbe928e06d`.

This supersedes the failed full regression `35d2e51e-691c-4ba7-b3ec-9d5d81f24cd9`
(444/466, 22 failures and 138/139 operations). Its failed reporting hook accounts
for the extra counted test. The complete diagnostics and 193 original inputs
remain in the immutable 216-file local failure archive. An accidentally rerun
startup probe was preserved separately and its historical file restored only
after matching its previously recorded SHA-256; that restoration has a local audit.

The subsequent run `01dc84ae-929d-4efd-b025-6d4e22c1a889` ended without a
final summary after 414 completed top-level checks and no reported test failures.
Its owned runner was no longer active after a monitoring-session interruption;
the external cause is unestablished. Its partial log, operation metadata and all
193 unchanged inputs remain in a separate 260-file local archive. That incomplete
run was not accepted. The complete accepted run above used the same application
and test sources.

## Reproduced startup behavior

Owned independent probes observed about 10 seconds before a fresh Node process
executed its first JavaScript, and similar cold Swift frontend startup. The Node
probe reported only 0.049 seconds uptime at its first output. These observations
explain missed short readiness/deadline fixtures without identifying a system-level
cause. No system or security setting was changed.

The previous failures crossed several boundaries: compiler/version setup, Swift
stdin and child budgets, Node inspector and SDK process readiness, and LLDB launch,
reply delivery and cleanup. They were investigated with owned Swift/JavaScript/C
sources and actual configured providers. No REA implementation or fixtures were used.

## Swift bounds and owned controls

Each demangler child has a bounded **30-second ceiling**, capped by the remaining
aggregate time. The aggregate limits remain **120 seconds, 1,024 symbols, 1 MiB
input and 16 MiB combined output**. Caller limits can only lower those bounds.
Failures/cancellation still retain no partial demangling evidence.

The [owned budget fixtures](SWIFT_BUDGET.md) now contain 15 cases. Budget and
boundary checks pass 25/25. Real-child controls cover a held child after readiness
at a 25-second batch deadline, a 3-second deadline before readiness, and output
capacity. The held-child fixture supplies an owned version packet to isolate the
one real child's lifecycle. Tests still require the actual child PID to disappear,
no delayed marker, exact byte accounting and unchanged evidence/history on failure.

All **60 symbols** emitted from the owned compiler specimen remain checked. They
run in 20 separate real provider batches, with 80 genuine version/symbol command
invocations; each batch keeps its own genuine provenance/evidence. No combined
provider envelope is fabricated. Literal input order, demangling results, executable
hashes, exit codes and semantic pattern assertions remain required. Compiler
fixtures allow 30 seconds for version setup and 60 seconds for compilation; the
finite compiler-symbol test allows 20 minutes while each product batch retains its
120-second bound. Stdin cancellation waits for an atomic receipt before aborting
and requires physical child exit. Windows cross-target static output does not
establish Apple SDK or runtime behavior.

## Debugger and process readiness

LLDB starts the requested observation clock after launch succeeds. A separate
45-second setup/cleanup allowance contains cold startup; the selected observation
duration and event limits retain their existing meaning. The helper writes its
reply through a duplicated stdout file descriptor: owned probes showed redirected
Python stdout could lose the beginning of a larger reply. Flush alone was not
sufficient. Cleanup kills an owned live target on extraction failure before
destroying the debugger, and reports cleanup failure instead of claiming success.

Owned live C fixtures require the real `owned_add` event, parameter register
values and exit code 24. Additional controls exercise unresolved filters, event
limit, duration expiry, an injected extraction failure and caller cancellation.
Failure/cancellation controls require an absent target PID and no additional
retained evidence.
These observations cover selected installed-LLDB branches, not universal process
tree or vendor behavior. Existing integer-second LLDB polling can round a short
observation up to the next poll.

The Node inspector fixture permits bounded 30-second readiness while retaining its
short requested observation. The SDK cancellation fixture waits up to 45 seconds
for the actual target PID/progress before cancelling; its outer test/request
allowances cover two cold processes. Physical-exit, ordered frame and no-evidence
assertions remain. Product observation durations were not increased for these
fixture readiness changes.

## Publication and limits

The complete suite's verification-only wall allowance is 90 minutes, with the same
required test files and provider flags. Product per-child Swift and LLDB setup
allowances changed as described above; the Swift aggregate budget did not change.
The [unknown-ledger mutation fix](UNKNOWN_MUTATION_TRANSACTION.md), held after the
previous failed regression, is included in this accepted full run.

CLI/MCP contracts, package/lock selections, compatibility aliases and all **57
application notice hashes** remain unchanged. Publication requires a separate
sanitized-snapshot build/focused check and fetched public commit/tree/blob hashes
after a normal fast-forward push. Existing local dependencies are reused; a fresh install
and full installed-tree checksum audit are outside this proof. Private history,
provider configuration, toolchains, generated outputs and raw receipts stay local.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT/Swift recovery, live provider breadth and complete REA
behavioral parity remain unestablished. No global installation, Mega worker/client
or schedule activation is part of this delivery.
