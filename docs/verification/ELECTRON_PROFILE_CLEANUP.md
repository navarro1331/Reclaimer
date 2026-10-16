# Electron profile cleanup and evidence publication

The first complete run for the managed Boolean correction, run
`27d38a6a-fba6-40e9-a4ac-c36412343ce7`, passed 685 of 687 checks. Two genuine
Electron scenarios failed while deleting a temporary profile after forced
application shutdown. Windows reported `EBUSY`. The failed report and all 324
unchanged input hashes were archived before changing the implementation. The two
failed fixture directories remain retained after automatic approval review
blocked their removal; deletion was not retried.

The existing process checks establish that the captured application root and
launcher exited. They do not establish that every profile file handle has been
released. The failed paths later became unlocked; the original handle holders
were not identified. This correction does not infer authority to kill additional
processes from a busy file.

The profile cleanup helper retries only transient filesystem errors, with at
most ten attempts and 4,500 milliseconds of scheduled retry delays. Filesystem
calls are awaited, so that delay budget is not a wall-clock timeout for the
filesystem or scheduler. Removal stays inside the allocated direct-child profile directory;
replacement files and links are rejected. Only `ENOENT` confirms absence.
Persistent failure retains a structured error with the residual path and cause.

The Electron handler also prepares evidence without publishing it. Core commits
the evidence and successful history only after profile cleanup, cancellation
checks and output-contract validation succeed. Cleanup still runs when the
request is cancelled. CLI/MCP contracts and process-termination ownership rules
remain unchanged.

The [owned regressions](../../test/electron-profile-cleanup.test.mjs) cover
filesystem boundaries and retry limits, plus Windows exclusive file locks around
a genuine Electron application. The lock cases exercise release and successful
retry, persistent failure, cancellation during cleanup and rejected output.
Existing forced-quit and blocked-main fixtures remain unchanged.

The final owned baseline fails all four genuine lock cases on the original
handler, with no skipped or cancelled cases. Persistent-lock, cancellation and
invalid-output diagnostics show the prior ledger growing from one entry to two
despite the rejected operation. The test seam calls the real filesystem removal
unchanged, waits for an actual `EBUSY` on the owned locked file, then permits
release or cancellation. It restores the filesystem binding after each case.
An earlier timer-based fixture passed its release case before removal encountered
the lock; that attempt remains separate from the final deterministic baseline.

The combined focused run passes **11/11**: seven new cleanup tests and four
unchanged genuine Electron lifecycle tests, with zero failures, skips,
cancellations or todos. The final baseline and passing run use identical test
and helper bytes. All owned lock helpers and application roots were confirmed
exited; new fixture directories were removed after that confirmation.

Accepted frozen run `670765f9-3115-4b0b-a7d0-1fd98d0a8e84`: build and **694/694 tests in 92 files**, 139/139 successfully schema-validated operations, zero failures/skips/cancellations/todos/timeouts, and 326 unchanged frozen inputs (manifest SHA256 `2cfbc8fac584b7218f92ab19c790f7876f3e296e2865c44670589ac49fff3399`). Required NativeAOT, Swift, runtime, JVM/codec and Linux UI producer checks passed. The isolated offline package CLI/MCP/native PTY checks passed. These results qualify the recorded fixture scope, not exhaustive behavior or REA parity.

The initial full attempt failed on Electron profile removal. Its complete failed report/output and unchanged-input proof remain retained separately; this accepted retry includes the bounded cleanup correction and owned lock/cancellation regressions. Two temporary fixture directories from the failed attempt remain retained locally after automatic approval review blocked optional removal before execution; no removal is claimed for those directories. Mac/IDA checks and client/live worker activation remain pending.

This is bounded profile cleanup and evidence transaction coverage. It does not
prove universal descendant termination, filesystem latency or Electron behavior.
Mac and licensed IDA checks, client activation and live worker activation remain
pending. The [managed Boolean report](MANAGED_BOOLEAN_VALUES.md) records the
other correction and the review boundary incident for this delivery.
