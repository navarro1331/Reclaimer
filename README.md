# Reclaimer

Reclaimer investigates local artifacts, traces application relationships, captures selected runtime scenarios, and compares retained evidence. It is independently implemented around the existing CLI/MCP contracts. The project was previously named `{real}`.

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

Artifact routes include bounded ELF, Mach-O, PE, plist, archive, managed metadata, Android, firmware and EVM analysis. JavaScript routes build syntax and relationship graphs, recover embedded source-map content and evaluate reconstruction obligations. Runtime routes use selected targets through PTYs, CDP, V8 inspector and Windows UI Automation. See [artifacts](docs/architecture/ARTIFACTS.md), [JavaScript](docs/architecture/JAVASCRIPT.md), [runtime capture](docs/architecture/RUNTIME.md) and the [independent design](docs/architecture/INDEPENDENT_DESIGN.md).

NativeAOT recovery reconstructs dehydrated bytes, validates anchored fixed method-table layouts and frozen string/array/object storage, and commits queryable definitions into an owned transient analysis session. Generated labels preserve uncertainty about original identities. Swift recovery handles bounded generic/resilient metadata and object relocations; serialized module declarations are reported only when their required traits can be recovered from the selected bytes. The [current recovery report](docs/verification/RECOVERY_DELIVERY.md) records actual fixture scope and remaining limits.

Native decompilation needs an operator-configured Ghidra, Hopper or IDA provider. Swift demangling needs an explicitly selected Swift executable. Adapt Ghidra (raw receipt retained locally) or Swift (raw receipt retained locally) examples to your installation and select your JSON file with `REAL_CONFIG`. Example paths are placeholders. Hopper and Apple assetutil checks require macOS and remain pending. Selected native artifacts are not executed during static analysis.

Swift demangling treats @-prefixed macro-form input as literal closed-pipe data, preventing response-file interpretation. Its aggregate request limits are 1,024 symbols, 1 MiB UTF-8 input, 16 MiB captured output and two minutes; configuration may lower them. Failed batches publish no partial Swift evidence. See [batch budgets](docs/verification/SWIFT_BUDGET.md) and [literal-input verification](docs/verification/SWIFT_STDIN.md).

`npm test` skips provider fixtures when their declared prerequisites are absent. Strict local verification requires `REAL_RUN_NATIVE_VARIATIONS=1`, `REAL_RUN_SWIFT_VARIATIONS=1` and `REAL_RUN_RUNTIME_VARIATIONS=1`. Test-only vendor roots/executables can be selected with `REAL_TEST_VENDOR_ROOT`, `REAL_TEST_EVIDENCE_ROOT`, `REAL_TEST_CHROME`, `REAL_TEST_ELECTRON`, `REAL_TEST_LLDB`, `REAL_TEST_CLANG`, `REAL_TEST_LLD_LINK`, `REAL_TEST_PYTHON` and `REAL_TEST_POWERSHELL`. `RECLAIMER_RECOVERY_EVIDENCE` selects owned compiler-proof output. Local Swift tests read an operator-created `config/local-swift.json`; private toolchains, package caches and raw provider receipts are excluded from the public repository. The .NET producer fixtures require the recorded SDK/ILCompiler cache described in their scope report.

Use `setup --dry-run` to inspect client entries. `setup --yes` applies additive entries with backups and an ownership manifest. Uninstall preserves later user changes. `--integrityPolicy fail` rejects changed source bytes; `record-and-continue` retains the opened byte view and records contradictions. Provider bindings still check their own source integrity.

Required dependency/interface notices remain in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party/`. The npm package remains `private: true` and `UNLICENSED`; no new distribution license has been selected. The original REA code, docs, fixtures and Git history are excluded. The earlier parent conversation had source exposure, so the engineering ownership audit does not certify a legal clean-room process or distribution clearance.

Passing controlled fixtures and successful schema validation do not establish full REA behavioral equivalence. Raw local logs and private historical Git history are retained separately. The public repository contains independently authored source, fixtures, portable documentation and required notices.
