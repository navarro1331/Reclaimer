# Transactional evidence-bundle import

## Reproduced gap and fixed behavior

`import_evidence_bundle` previously inserted evidence records and unknown revisions
before awaiting creation of a historical-identifier integrity binding. Failure or
cancellation at that step left imported state behind. Cancellation after a native
bundle read could also commit before the final request cancellation check.

The importer now checks cancellation after read, validates the incoming bundle
and retained conflicts, and prepares any historical binding with `publish:false`.
After that await it checks retained records and revisions again. It stages owned
values, checks cancellation and commits synchronously. Identical retained values
are left in place. Records, unknown IDs/revisions and historical binding contents
retain their existing formats; imported/unknowns_added/total retain their meanings.

The second retained-state check prevents an import from overwriting an intervening
unknown revision during binding preparation. This is tested in the local Context
API. MCP continues to serialize tool calls and process cancellation notifications.
No protocol, schema, product deadline or execution-authority gate changes.

## Owned fixtures

[Thirteen owned cases](../../test/evidence-import-transaction.test.mjs) build
native records and unknowns through Reclaimer's writer. Compatibility packets
with historical opaque identifiers are independently authored from those values;
no original REA implementation, fixtures or prose were read or reused.

Before the fix **7 cases failed** and **6 compatibility controls passed**. After
the fix all **13/13 pass**. The seven regressions cover native/historical
cancellation after read, injected binding-capacity failure, cancellation before
and after binding preparation, observation of pending state and an intervening
unknown revision. Controls cover exact native import/repeat counts, historical
IDs and export round trips, mixed records, valid next revisions, changed-content
rejection and pre-cancelled requests.

Every failure case checks both map references/content, unrelated records/unknowns,
request history and selected target. Owned file bytes remain unchanged during
import; temporary-location checks precede cleanup. The combined new import,
existing evidence and native snapshot fixtures passed **44/44** with no failures,
skips, cancellations or todos. Raw red/green TAP remains local.

## Actual transport proof

Actual stdio MCP tests use a disclosed, child-only Context.evidence fixture hook
to inject one binding-capacity failure and hold one binding for cancellation.
The hook records pending counts and the server's aborted signal. Full bundles are
compared after failure/cancellation, respecting the serialized MCP tool queue.
Both cases preserve the complete prior bundle; a valid historical retry and native
import afterward retain exact records/revisions/opaque IDs and repeat counts.
The standard resource-constraint response is retained for the injected failure.
This is controlled fault injection, not actual memory exhaustion or proof of
concurrent MCP tool execution.

The stock CLI process also imports the owned historical bundle using `--json`,
returning the expected imported, unknowns_added and total values. Initial fixture
launch/ordering/formatter errors were corrected in the external test harness;
product code and timers were not adjusted for them. SDK shutdown was awaited and
owned workspace cleanup completed. This transport fixture executes no vendor or
target program; the full strict suite retains its separately recorded provider scope.

## Complete regression and publication

The initial complete run `88d4955b-2fc5-4c26-895a-dcb2f9bcf657` passed
449/452 counted tests with three failures: two existing Swift deadline fixtures
expired before reaching their intended second-read/second-child branches, and
their observation-report hook consequently failed. Its complete output, report,
frozen manifest and relevant source bytes are preserved locally.

Owned Swift fixture setup windows now use 1-second deadlines for the packet/final
read cases and a 4-second deadline for the real child case. Deliberate waits still
exceed those deadlines; the child's delayed action remains at 6 seconds. The same
branch, marker, process-exit, error and no-publication assertions are retained.
The related fixture/import check passed 27/27. Swift product code, default budgets
and CLI/MCP contracts are unchanged. This is fixture timing hardening, not proof
of universal host startup latency or actual Swift child teardown.

Accepted frozen run `2b93c705-bd49-42f5-b30f-d251b968a7b1` passed **451/451 tests** across **62 files**,
build and **139/139 schema-validated operations**, with zero fail/skip/cancel/todo
or timeout. Native, Swift and runtime prerequisites were required. All **192
frozen inputs** stayed unchanged; manifest SHA-256:
`028628c8feed89dc087940c94c415729ad722ddf77e4c1ad63bd68c747b9e5ce`.

CLI/MCP contract files, package/lock selections and all **57 application notices**
remain unchanged. Existing `real`/`REAL_*` aliases and historical wire compatibility
remain. The sanitized public snapshot receives separate build/focused tests;
publication receives fetched commit/tree/blob verification bound to its actual
revision. Raw diagnostics, configuration, toolchains and private Git history stay
local. The package version remains 0.2.0.

## Limits and pending checks

This closes the selected bundle-import transaction and awaited-binding conflict
branches. It does not make all Context operations transactional or establish
arbitrary resource limits/concurrency behavior. Historical integrity bindings
detect changes relative to imported content; they do not certify source history,
truth or execution authority. Prior snapshot and provider isolation reports retain
their documented scope.

Mac-only Hopper, Apple assetutil, Apple SDK/runtime and Objective-C checks remain
pending. Broader NativeAOT/Swift recovery, live provider coverage and complete REA
parity remain unestablished. No new global ownership audit/legal certification,
Mega worker/client integration, global install or schedule activation is claimed.
