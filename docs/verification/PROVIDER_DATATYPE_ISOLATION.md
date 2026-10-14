# Cached provider datatype response isolation

## Fixed behavior

`inspect_native_data_type` now clones the selected cached provider datatype before
applying an optional address projection and recording evidence. Name, ID and
address selectors return an independent value, including nested fields, members
and limitations. A local caller may mutate its returned value without changing
the provider cache, retained evidence or later replies. Subsequent cache changes
also cannot rewrite an earlier reply.

Previously, name/ID lookups returned the cache object directly and address lookups
made a shallow copy. Nested arrays therefore remained shared in all three cases.
The fix changes this existing fallback branch only; request/response shapes,
address normalization and evidence identifiers retain their contracts.

## Owned fixture proof

The independently authored [fixture](../../test/native-provider-isolation.test.mjs)
opens an owned synthetic ELF, inserts an owned plain cached provider observation,
and forbids provider or target launch. It exercises the ordinary Context handler
and evidence path with four regressions:

- Name lookup: caller edits top-level and nested values, adds array entries,
  then checks the cache, saved evidence and later name/ID/address replies.
- ID lookup: the same mutation and subsequent-reply checks.
- Address lookup: the same checks with the address projection retained.
- Cache update after a reply: later provider observations cannot alter that reply
  or its saved evidence; a subsequent reply reflects the new observation.

All cases also check that source bytes remain unchanged. Each fixture owns its
temporary directory and verifies its location before cleanup. No original REA
implementation, prose or fixtures were used for this change.

All **4 regressions failed before the fix** and pass after it. The combined
provider-isolation, NativeAOT projection and recovery-context check passed
**19/19**, with zero failures, skips, cancellations or todos. The red and green
TAP outputs remain local.

## Complete regression and compatibility evidence

Accepted frozen run `8ff7e3d6-3bb2-43c8-8e3b-6350eeaf4e74` passed **425/425 tests** across **60 files**,
build and **139/139 schema-validated operations**, with zero failures, skips,
cancellations, todos or timeout. Native, Swift and runtime prerequisite checks
were required. All **189 frozen implementation, fixture and configuration inputs**
were unchanged throughout verification. The frozen manifest SHA-256 is
`5ef5ae45ca72ed1b7fbc0904c878df01609be85a2bcf4ec64b0804a12563d176`.

Both CLI/MCP contract files remain byte-identical to the previous private
checkpoint. Package and lock selections are unchanged; all **57 application
notice files** retain their recorded hashes. Existing `real`/`REAL_*` compatibility
continues. Raw diagnostics, manifests and receipts remain local.

The sanitized public snapshot receives separate build/focused-test verification,
and publication receives fetched commit, tree and blob verification. Those
receipts bind the actual published revision; this report does not predict their
outcome or introduce a new package release version.

## Scope and pending checks

This proof covers in-process ownership of cached plain datatype observations.
The owned model does not establish live Ghidra, Hopper or IDA datatype inference.
CLI/MCP serialization already separates object references across process
boundaries; their schemas remain unchanged and their existing regression cases
are included in the full run.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT recovery, Swift formats/platforms and full REA
behavioral equivalence remain unestablished. Historical ownership audits and
identity/declaration proofs retain their original scopes; no new global ownership
or legal certification is claimed. No Mega worker, client, global install or
schedule activation is part of this delivery.
