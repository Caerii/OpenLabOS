# Documentation

OpenLabOS treats documentation as a working artefact, not an afterthought.
Four kinds live here:

- **`decisions/`** — Numbered design notes. Every structural choice that
  affects more than one service or a public contract gets a numbered file.
- **`architecture/`** — System diagrams, narrative explanations, the *literate
  architecture* (`literate-architecture.md`) you can read top-to-bottom to
  understand the system.
- **`runbooks/`** — Operational guides: deploy, train, evaluate, debug.
- **`protocols/`** — How to author and publish a protocol document.
- **`verification/`** — Per-task verification notes for non-trivial work.

Top-level docs are referenced from the root `README.md`, `ARCHITECTURE.md`,
`CONTRIBUTING.md`, `TESTING.md`, and `test-catalog.md`.

## License

Files in this directory are released under [CC0 1.0](LICENSE) unless a
specific file states otherwise. Repository code is licensed separately under
Apache-2.0; see the root `LICENSE`.
