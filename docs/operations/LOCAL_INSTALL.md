# Local Reclaimer installation

Build with Node.js >=24.11.0 and the exact dependencies installed by `npm ci --ignore-scripts`: `node scripts/package-local.mjs --output <owned-output-directory>`. The builder copies only runtime libraries, independent bridges, the independent skill, example configuration, install instructions and notices. It supplies a portable package README and bundles the existing production dependency tree without downloading packages. It excludes tests, raw reports, local provider configuration, toolchains and Git history.

Each result directory contains a `.tgz`, `PACKAGE_RECEIPT.json` with archive/source/contract hashes and platform/architecture, and raw npm output. Native optional dependencies are specific to the build host. Build a separate bundle for a different OS or architecture. Node itself and vendor tools are not bundled.

Install into a new local prefix, without a global install or client changes:

```text
npm install --prefix <isolated-prefix> --offline --ignore-scripts --no-audit --no-fund <archive.tgz>
node <isolated-prefix>/node_modules/reclaimer/scripts/reclaimer.mjs --help
node <isolated-prefix>/node_modules/reclaimer/scripts/reclaimer.mjs mcp
```

For a strictly isolated check, supply a new `--cache` and empty `--userconfig`/`--globalconfig` files. The runtime bundle is intended to install offline. Keep its receipt beside the archive. Verify its SHA-256 before using a copy. The package exposes both existing `reclaimer` and `real` binary entries; their CLI/MCP contracts are unchanged.

`setup --dry-run` previews existing client installer entries. Actual `setup --yes`, skill/client changes and live worker registration remain pending operator activation. No install lifecycle hook invokes setup. Existing setup/uninstall ownership behavior remains separate from this package smoke test. Mac and licensed IDA provider checks are unavailable and remain pending.

The package remains private and UNLICENSED, with required notices retained. This local package/test scope does not establish distribution clearance, a public release channel, a fresh arbitrary dependency-install audit or full behavioral parity.

## Isolated Docker example

Docker is optional. From the source checkout, prepare a new sanitized context with `node packaging/worker-local.mjs --context <new-context-directory>`, then build `packaging/Dockerfile` from that context with an operator-selected local image tag. The Dockerfile pins official Node 24.14.1 by image digest, installs the unchanged production lock selections with lifecycle scripts disabled, and copies only the sanitized runtime context. Building may download the image and exact selected Linux dependencies; the Windows bundle is not reused for Linux native modules.

Place an independently owned ELF at `<fixture-project>/owned.elf` and create a separate empty artifact directory. Run `node packaging/worker-local.mjs <local-image-tag> <fixture-project> <artifact-directory>`. The example performs static `binary_overview`, writes its result and source-preservation receipt under the artifact mount, and removes the container. It runs with network disabled, a read-only root, a non-root user, dropped capabilities, resource limits and temporary space. Its only host mounts are the explicit read-only fixture project and writable artifacts. Do not use a control plane, home, credentials, Docker socket, unrelated repository or whole-disk mount.

This is a local tested worker example, not live Mega registration or activation. It covers an owned static artifact and does not prove general worker behavior, vendor installation, macOS, licensed IDA or selected-target execution.

The builders reject an output that canonically falls inside a copied runtime tree before creating it, including existing directory aliases. The package builder also protects the bundled dependency input tree. It captures its own builder bytes before packing and rejects a changed input before issuing a source-unchanged receipt. Subprocess receipts explicitly mark capture overflow and reject partial output. The Docker launcher assigns a fresh run label/name, inspects that exact identity in `finally`, verifies ownership and removes only its exact container ID after success, failure or timeout. A failed cleanup remains a failed receipt; a timed-out Docker client is not treated as proof that the container stopped.
