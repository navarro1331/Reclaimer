# Reclaimer

Reclaimer investigates local artifacts, traces application relationships, captures selected runtime scenarios, and compares retained evidence. It is independently implemented around the existing CLI/MCP contracts. The project was previously named `{real}`.

## Project documentation

| Document | Purpose |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Components, data flow, ownership and integration boundaries |
| [Roadmap](ROADMAP.md) | Sequenced remaining work and the evidence each milestone needs |
| [Project status](PROJECT_STATUS.md) | Verified baseline, current delivery and pending checks |
| [Completion contract](COMPLETION_CONTRACT.md) | Testable conditions for completing a scoped delivery |
| [Changelog](CHANGELOG.md) | Recorded implementation and documentation changes |
| [Architecture decisions](decisions/ADR-001-architecture.md) | Architecture, [storage](decisions/ADR-002-database.md) and [authentication](decisions/ADR-003-authentication.md) choices |

Detailed subsystem descriptions and fixture reports live under [docs](docs/README.md).

## Local use

Use Node.js 24.11 or later:

```powershell
npm ci --ignore-scripts
npm run build
npm test
node scripts/reclaimer.mjs --help
node scripts/reclaimer.mjs --llms-full --format json
node scripts/reclaimer.mjs mcp
```

The canonical executable is `reclaimer`. The `real` alias, `REAL_*` settings and historical protocol identifiers remain compatible. Both entry points expose the same 95 CLI commands, 139 MCP operations and six prompts; public request/response contract files are unchanged.

`npm run package:local -- --output <new-owned-directory>` builds a host-specific runtime archive with production dependencies, required notices and a SHA-256 receipt. Install it into an isolated prefix for offline CLI/MCP checks. The [local installation guide](docs/operations/LOCAL_INSTALL.md) also describes the contained Docker worker example. Client setup and live Mega worker activation remain pending; building or testing a package does not activate either.

Artifact routes include bounded ELF, Mach-O, PE, plist, archive, managed metadata, Android, firmware and EVM analysis. JavaScript routes build syntax and relationship graphs, recover embedded source-map content and evaluate reconstruction obligations. Runtime routes use selected targets through PTYs, CDP, V8 inspector and Windows UI Automation. See [artifacts](docs/architecture/ARTIFACTS.md), [JavaScript](docs/architecture/JAVASCRIPT.md), [runtime capture](docs/architecture/RUNTIME.md) and the [independent design](docs/architecture/INDEPENDENT_DESIGN.md).

NativeAOT recovery reconstructs dehydrated bytes, validates supported method-table and frozen-storage layouts, and commits queryable definitions into an owned transient session. Byte-bound metadata, generic definitions and a finite constructed-generic pattern receive identities; supported reflection maps provide recorded method entrypoints and instance field offsets in raw evidence. Declared layout hints remain separate from runtime offsets, and generated aliases stay queryable. See the [NativeAOT scope](docs/verification/NATIVEAOT_COMPLETION.md). Swift recovery handles bounded metadata and relocations plus exact serialized formats 0.871, 0.903 and 0.944, qualified with owned Swift 6.0.3, 6.1.3 and 6.2 producers. Richer signatures and declarations retain explicit raw dispositions where the unchanged schema cannot represent them. See the [Swift scope](docs/verification/SWIFT_COMPLETION.md) and [current status](PROJECT_STATUS.md) for proof and remaining limits.

Native decompilation needs an operator-configured Ghidra, Hopper or IDA provider. Swift demangling needs an explicitly selected Swift executable. Adapt Ghidra (raw receipt retained locally) or Swift (raw receipt retained locally) examples to your installation and select your JSON file with `REAL_CONFIG`. Example paths are placeholders. Hopper and Apple assetutil checks require macOS and remain pending. Selected native artifacts are not executed during static analysis.

Swift demangling treats @-prefixed macro-form input as literal closed-pipe data, preventing response-file interpretation. Its aggregate request limits are 1,024 symbols, 1 MiB UTF-8 input, 16 MiB captured output and two minutes; configuration may lower them. Failed batches publish no partial Swift evidence. See [batch budgets](docs/verification/SWIFT_BUDGET.md) and [literal-input verification](docs/verification/SWIFT_STDIN.md).

`npm test` skips provider fixtures when their declared prerequisites are absent. Strict local verification requires `REAL_RUN_NATIVE_VARIATIONS=1`, `REAL_RUN_SWIFT_VARIATIONS=1` and `REAL_RUN_RUNTIME_VARIATIONS=1`. Test-only vendor roots/executables can be selected with `REAL_TEST_VENDOR_ROOT`, `REAL_TEST_EVIDENCE_ROOT`, `REAL_TEST_CHROME`, `REAL_TEST_ELECTRON`, `REAL_TEST_LLDB`, `REAL_TEST_CLANG`, `REAL_TEST_LLD_LINK`, `REAL_TEST_PYTHON` and `REAL_TEST_POWERSHELL`. `RECLAIMER_RECOVERY_EVIDENCE` selects owned compiler-proof output. Local Swift tests read an operator-created `config/local-swift.json`; private toolchains, package caches and raw provider receipts are excluded from the public repository. The .NET producer fixtures require the recorded SDK/ILCompiler cache described in their scope report. The additional Swift completion producers require `RECLAIMER_REQUIRE_SWIFT_COMPLETION_PRODUCERS=1`, the configured Windows frontend and the two already-fetched pinned official images; their test file records exact versions and isolation.

Use `setup --dry-run` to inspect client entries. `setup --yes` applies additive entries with backups and an ownership manifest. Uninstall preserves later user changes. `--integrityPolicy fail` rejects changed source bytes; `record-and-continue` retains the opened byte view and records contradictions. Provider bindings still check their own source integrity.

Required dependency/interface notices remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party/`. The npm package remains `private: true` and `UNLICENSED`; no new distribution license has been selected. The original REA code, docs, fixtures and Git history are excluded. The earlier parent conversation had source exposure, so the engineering ownership audit does not certify a legal clean-room process or distribution clearance.

Passing controlled fixtures and successful schema validation do not establish full REA behavioral equivalence. Raw local logs and private historical Git history are retained separately. The public repository contains independently authored source, fixtures, portable documentation and required notices.
