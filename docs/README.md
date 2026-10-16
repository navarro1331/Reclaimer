# Detailed Reclaimer documentation

Start with the repository [README](../README.md), [architecture](../ARCHITECTURE.md),
[roadmap](../ROADMAP.md), [status](../PROJECT_STATUS.md),
[completion contract](../COMPLETION_CONTRACT.md) and [changelog](../CHANGELOG.md).
The root entry points and decisions directory follow the operator's requested
layout; existing detailed subsystem and verification documents remain here.

## Architecture

- [Independent design and provenance](architecture/INDEPENDENT_DESIGN.md)
- [Artifacts and native analysis](architecture/ARTIFACTS.md)
- [JavaScript analysis](architecture/JAVASCRIPT.md)
- [Runtime observations and ownership](architecture/RUNTIME.md)

## Current verification scope

- [Local capability completion and pending inputs](verification/CAPABILITY_COMPLETION.md)
- [NativeAOT generic identities and member bindings](verification/NATIVEAOT_COMPLETION.md)
- [Swift serialized versions and complex declarations](verification/SWIFT_COMPLETION.md)
- [MCP cancellation response ownership](verification/MCP_CANCELLATION.md)
- [Owned reconstruction scenarios](verification/OWNED_RECONSTRUCTION.md)
- [Manual native annotation transaction](verification/ANNOTATION_TRANSACTION.md)
- [Native address-name batch validation](verification/NAME_BATCH_VALIDATION.md)
- [Bounded startup and readiness recovery](verification/STARTUP_RECOVERY.md)
- [Transactional unknown-ledger mutations](verification/UNKNOWN_MUTATION_TRANSACTION.md)
- [Transactional evidence-bundle import](verification/EVIDENCE_IMPORT_TRANSACTION.md)
- [Transactional native snapshot restore](verification/NATIVE_SNAPSHOT_TRANSACTION.md)
- [Cached provider datatype response isolation](verification/PROVIDER_DATATYPE_ISOLATION.md)
- [Previous identity and declaration delivery](verification/IDENTITY_DECLARATION_DELIVERY.md)
- [NativeAOT identity associations](verification/NATIVEAOT_IDENTITY.md)
- [Swift declarations](verification/SWIFT_DECLARATIONS.md)
- [Previous recovery delivery](verification/RECOVERY_DELIVERY.md)
- [NativeAOT storage recovery](verification/NATIVEAOT_RECOVERY.md)
- [Swift metadata recovery](verification/SWIFT_RECOVERY.md)
- [Swift literal input](verification/SWIFT_STDIN.md) and [batch budgets](verification/SWIFT_BUDGET.md)

Raw machine-specific diagnostics and receipts remain local. A scope report
describes its named fixtures and platform; it does not certify complete parity.

## Local installation

- [Host-specific runtime bundle and contained Docker worker](operations/LOCAL_INSTALL.md)

## Decisions

- [ADR-001: architecture](../decisions/ADR-001-architecture.md)
- [ADR-002: database/storage](../decisions/ADR-002-database.md)
- [ADR-003: authentication](../decisions/ADR-003-authentication.md)
