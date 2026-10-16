# Owned reconstruction scenarios

The fixture in `test/reconstruction-owned-e2e.test.mjs` authors a small CommonJS
arithmetic CLI and a bundle containing its embedded source map. It calls the
unchanged `recover_javascript_sources` operation, validates its public envelopes,
selects the recovered source by its digest, and verifies every returned artifact's
bytes. Recovery itself does not execute the input.

The test explicitly executes only its known authored program. Seven original and
recovered CLI scenarios compare stdout, stderr, exit status, signal and exact file
effects: addition, signed operands, fractional division, division by zero,
malformed operands, an unknown operation and a file-writing operation. A separately
authored mutation changes addition to subtraction; the same comparison detects
the disagreement. Each child uses an argv list, sparse environment, a finite
30-second deadline and a 64-KiB capture bound. Owned temporary paths are checked
before cleanup. Source bytes remain unchanged.

The focused check passes 1/1, with seven paired scenarios and one mutation control
(15 program processes). The initial five-second fixture deadline failed before a
program completed on this host; its observed failure is retained locally. The
correction changes only the test allowance. Product execution policy is unchanged.

This establishes finite behavior comparison for recovered embedded source in an
owned fixture. It does not reconstruct missing source, prove arbitrary project
equivalence or compare every REA behavior. The recovery response correctly keeps
`runtime_equivalence: unknown`; the additional test evidence has this separate,
narrow scope. A working reference executable and an agreed capability matrix are
still needed for a full REA comparison. Mac and licensed IDA checks remain pending.
