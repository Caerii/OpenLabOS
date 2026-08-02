# Documentation

Start with the root `README.md` for setup and
[literate-architecture.md](architecture/literate-architecture.md) for the
architectural rationale and data model. Use `ARCHITECTURE.md` at the repo root
when you need service boundaries and ownership rules.

This directory holds:

- **`decisions/`** — numbered records for cross-service and public-contract
  choices.
- **`architecture/`** — system layout, local development, roadmap, writing
  notes that belong next to the design.
- **`runbooks/`** — commands for running, evaluating, and debugging the stack.
- **`protocols/`** — protocol authoring and publication.
- **`verification/`** — notes for completed verification work.
- **`WRITING.md`** — voice and lexicon for docs and operator UI.

Common entry points:

- [First successful run](runbooks/first-successful-run.md)
- [Docker Compose local stack](runbooks/docker-compose.md)
- [Writing a protocol](protocols/authoring.md)
- [Source development](architecture/local-dev.md)
- [From run to eval](runbooks/run-to-eval.md)
- [Testing](TESTING.md)
- [Roadmap](architecture/roadmap.md)
- [Writing guide](WRITING.md)

## License

Files in this directory are released under [CC0 1.0](LICENSE) unless a
specific file states otherwise. Repository code is licensed separately under
Apache-2.0; see the root `LICENSE`.
