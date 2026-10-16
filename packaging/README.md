# Reclaimer local runtime

Private local package, version 0.2.0. Node.js >=24.11.0 is required. The dependency bundle is built for the OS and architecture named in PACKAGE_RECEIPT.json; Windows native dependencies do not establish Linux or macOS installation support.

Use an explicit isolated directory: `npm install --prefix <directory> --offline --ignore-scripts --no-audit --no-fund <archive.tgz>`. Run `node <directory>/node_modules/reclaimer/scripts/reclaimer.mjs --help` or append `mcp` for a stdio server. See the local installation guide at `docs/operations/LOCAL_INSTALL.md`. Client activation remains pending; this package never runs setup automatically.

The package remains private and UNLICENSED. Required dependency and interface notices are included in third-party/ and THIRD_PARTY_NOTICES.md. This local build is not registry publication, a distribution license or a legal clearance opinion.
