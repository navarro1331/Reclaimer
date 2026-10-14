# Transactional native snapshot restore

## Gap and fixed behavior

`open_binary` previously selected the target and created the native session before
constructing annotation maps and importing evidence. A malformed later entry could
throw after those changes. Unchecked evidence could overwrite retained records,
and cancellation after snapshot read could leave the binary selected.

The restore now stages all four annotation maps and records before changing
Context state. Recognized annotation collections require two-element address/text
or null entries, valid address syntax and unique exact keys. Evidence uses the
existing bundle-import record schema, known-operation output and content-identity rules.
Retained identifier conflicts are rejected. Identical retained records keep their
existing objects. A final cancellation check precedes a synchronous commit.

The request/response contracts, snapshot protocol and writer format are unchanged.
Absent collections and ignored future annotation metadata remain compatible.
Rejected annotation/evidence values use the existing invalid-request envelope;
JSON parsing and source-mismatch error behavior is retained. Existing
historical opaque-reference handling is retained; content checks do not certify
source authenticity or execution authority.

## Owned proof

[Owned fixtures](../../test/native-snapshot-transaction.test.mjs) use a synthetic
ELF and snapshots produced by Reclaimer's own writer. They prohibit provider or
target launch and retain unrelated context markers. Cases cover late malformed
entries, invalid addresses and annotation values, duplicate keys, bad containers,
invalid or changed evidence, a retained-record collision, cancellation after read,
writer round trips, identical records and omitted collections/future metadata.

Before the fix, **11/13 cases failed**; two compatibility controls passed. After
the fix all **13/13 pass**. Together with existing native contracts and the cached
provider datatype isolation fixtures, the focused check passed **22/22** with
zero failures, skips, cancellations or todos. Source and snapshot bytes stay
unchanged. Failure cases check the target, session, ledger and unknown-map
references/content, history and successful subsequent selection. Each fixture
verifies its owned temporary location before cleanup. Raw TAP remains local.

Actual stdio MCP tests passed two negative cases: late malformed annotations and
changed evidence. Each returned `invalid_request`, preserved the complete prior
bundle and left the session closed. A valid restore afterward succeeded, preserved
unrelated records and restored the exact saved evidence ID/envelope. SDK shutdown
was awaited and the owned workspace cleanup completed. These are static fixture
flows; no vendor or target program executed.

## Complete regression and publication

Accepted frozen run `7d179bad-793c-4bbc-b66c-09d281313402` passed **438/438 tests** across **61 files**,
build and **139/139 schema-validated operations**, with zero failures, skips,
cancellations, todos or timeout. Native, Swift and runtime prerequisites were
required. All **191 frozen inputs** remained unchanged; manifest SHA-256:
`b7da247aec80a3c166e51554708bbec379f2af89f7d3be750bb4cb13baee362a`.

Both CLI/MCP contract files, package/lock selections and all **57 application
notice files** remain unchanged. Existing `real`/`REAL_*` compatibility remains.
The sanitized public snapshot gets separate build/focused-test verification;
publication gets fetched commit/tree/blob verification bound to the actual
revision. Raw receipts, private configuration, toolchains and private historical
Git remain local. The package version stays 0.2.0.

## Limits and pending checks

This closes the selected snapshot validation/transaction branches. Snapshots still
carry annotations and evidence records, not the complete unknown ledger or all
bundle inventories. Whole-bundle revision/reference validation retains its own
scope. Exact annotation key uniqueness does not assert semantic equivalence of
all address spellings. The fixtures do not establish arbitrary resource-bound
behavior, live vendor inference, target execution or complete REA parity.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT/Swift recovery limits remain documented. No fresh global
ownership audit, legal certification, Mega worker/client integration, global
installation or schedule activation is claimed by this delivery.
