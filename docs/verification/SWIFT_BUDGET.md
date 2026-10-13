# Swift aggregate batch budget

Owned batch fixtures verify the limits below. The current frozen global results appear in [RECOVERY_DELIVERY.md](RECOVERY_DELIVERY.md); historical raw receipts remain local.

## Runtime limits and compatibility

| Limit | Default and maximum | Counted scope |
| --- | --- | --- |
| maxSymbols | 1,024 | All supplied symbols, rejected before executable/file/process access |
| maxInputBytes | 1,048,576 | Combined UTF-8 symbol text, rejected before executable/file/process access |
| maxOutputBytes | 16,777,216 | Combined captured UTF-8 stdout and stderr from the version query and every symbol, including failed packets |
| timeoutMs | 120,000 | Monotonic handler deadline through identity reads, child calls, final identity and staged evidence construction |

The existing per-child maximums remain 10 seconds and 16 MiB; each call receives the smaller remaining batch allowance. Node's [installed-version process documentation](https://raw.githubusercontent.com/nodejs/node/v24.14.1/doc/api/child_process.md) describes maxBuffer as a per-stream limit. The helper separately checks combined streams before accepting a packet. One child's transient capture can therefore exceed the remaining combined allowance before rejection; no packet over the aggregate quota is accepted or published. This is not a whole-process RSS bound.

Provider configuration may lower the ceilings through **swiftBatchBudget**. Missing settings use defaults; explicit nonobjects, unknown keys, nonpositive/noninteger/unsafe values and raised ceilings fail as input errors before provider access. Example for an already selected tool:

    {
      "swiftDemangle": "D:\\path\\swift-demangle.exe",
      "swiftBatchBudget": {
        "maxSymbols": 128,
        "maxInputBytes": 65536,
        "maxOutputBytes": 1048576,
        "timeoutMs": 30000
      }
    }

No CLI flags, MCP fields, schemas or successful-response shapes changed. Both public contract files retain their exact baseline hashes. Exhaustion uses the existing **resource_constraint** error envelope, with reason **swift_batch_budget_exhausted**, the exhausted dimension and bounded diagnostic details. Split or reduce the batch to retry. Capacity errors never convert earlier results into a successful partial batch.

Each request owns its deadline controller and signal. The original Context signal is not changed, caller cancellation retains precedence, and a timed-out request cannot abort another request sharing that Context. Evidence is constructed in a private staging ledger, then the deadline and caller cancellation are rechecked before the single record is transferred to the original ledger. Failure preserves unrelated records and history. Deadline timers and caller listeners are removed at completion.

## Owned verification

| Fixture group | Observed assertions |
| --- | --- |
| Input/configuration | Default count overrun and multibyte input overrun make zero identity reads/child calls; invalid or raised configuration rejects |
| Exact and combined bytes | A batch at exactly ten output bytes succeeds, counting version stderr and multibyte symbol output; child quotas shrink to 10, 5 and 2 bytes |
| Failed/version packets | Version streams, nonzero version output and a later failed symbol consume the shared allowance; overruns preserve no prior batch results |
| Shared Context and publication | A fast concurrent request succeeds while a slow request expires; final identity-read and evidence-construction delays cannot publish expired evidence |
| Cancellation/reuse | Caller cancellation remains distinct; a subsequent success survives the prior request's former deadline |
| Actual owned child deadline | A real Node child is observed started, then physically absent after budget exhaustion, before its delayed filesystem action |
| Actual owned child output | The remaining allowance produces a real ERR_CHILD_PROCESS_STDIO_MAXBUFFER error, mapped to capacity; recorded owned child PIDs are physically absent |
| Actual CLI/MCP | CLI keeps its target/positional-symbol route and returns the existing resource error; an unmodified official MCP SDK receives the same error and an empty retained evidence bundle |

The injected packet cases test decisions; they do not claim real Swift provider execution. The final identity case tests both delayed success and delayed rejection after expiry. Cleanup is registered immediately after creating each owned fixture folder. The actual process cases run the independently authored [Node child fixture](../../test/fixtures/swift-budget-child.mjs), not a vendor tool. [swift-budget.test.mjs](../../test/swift-budget.test.mjs) records all fourteen cases and verifies source preservation. The separate existing [Swift proof](SWIFT_COVERAGE.md) runs the actual compiler and demangler under the new default budget.

## Remaining scope

Input ceilings apply inside this handler after generic request parsing, schema validation and cloning. Output ceilings count decoded captured UTF-8 text, not wire encoding, all transient allocation, OS pipe buffers or total resident memory. Synchronous work cannot be preempted by a JavaScript timer; monotonic checks reject late results before publication. Owned Windows child observations do not establish arbitrary descendant-tree cleanup, hostile signal handling or every Swift/platform teardown variation. Macro symbols, full Swift metadata interpretation, other toolchain/platform versions and full original behavioral parity remain unsupported or unproved. No publication, global install or runtime integration activation occurred. All 57 application notices and the two separate private Swift/LLVM notice files remain checksum-verified.
