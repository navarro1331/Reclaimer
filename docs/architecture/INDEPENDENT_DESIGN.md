# Independent implementation design

The operator requested a replacement for REA-derived implementation files, documentation and fixtures while preserving existing CLI/MCP contracts. The target is a local artifact investigation application, distinct from Mega-Crossover's control plane.

Public functional interface observations define names, positional arguments, options, schema types and required wire constants. Source algorithms, old fixtures, old documentation and build output are excluded. The implementation is organized into four parts: bounded artifact/native parsers and provider bridges; JavaScript syntax and relationship analysis; selected runtime observation; and protocol, session and evidence composition.

The CLI resolves JSON file arguments before preparing a typed operation. MCP serializes session requests and exposes progress and cancellation. Both call the same context, which validates input, applies branch-specific defaults, invokes the handler, validates successful output, and records retained evidence. Output validation does not insert default observations.

New evidence identifiers hash canonical record content. Bundle import validates shape and content before insertion; unknown revisions reject stale writes and keep a previous-revision digest. Historical wire identifiers remain opaque and receive an independent content binding on import. These checks establish internal consistency, not identity, authorization or truth. Explicit analyst claims remain distinct from controlled observations.

Native analysis imports a copied artifact into an owned temporary provider project. Provider output is bounded and checked against source identity. Annotation state belongs to the selected session. Runtime capture receives explicit endpoints, origin scopes, process/window identity and capture limits. Browser and process observations retain their coverage limits.

Comparisons distinguish measured changes from static candidates and unresolved branches. A reconstruction claim refers to retained comparison evidence and both source records. Behavioral claims require controlled replay evidence. Structural equality is limited to the observed dimensions.

The architecture favors ordinary JSON schemas and isolated modules over copying the former source layout. Native vendor adapters preserve provider names while using newly authored scripts. Third-party libraries are separately installed, pinned and inventoried with license notices.

This process has a material legal limit: the parent conversation previously viewed source implementation files. Separate implementation-agent contexts reduce additional source exposure but do not constitute an independently verified clean-room boundary. Byte-identity checks and author attestations are engineering evidence, not legal certification.
