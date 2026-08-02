# Documentation

OpenLabOS documentation should let you **run the stack, understand a recorded
run, extend a boundary, or evaluate a claim** without guessing. Start from the
question you have:

| If you want to… | Read |
| --- | --- |
| Understand why the project exists | [architecture/why-openlabos.md](architecture/why-openlabos.md) |
| Get a working demonstration | [runbooks/first-successful-run.md](runbooks/first-successful-run.md) |
| Operate Compose day to day | [runbooks/docker-compose.md](runbooks/docker-compose.md) |
| Author a protocol | [protocols/authoring.md](protocols/authoring.md) |
| Follow one run through the code | [architecture/literate-architecture.md](architecture/literate-architecture.md) |
| Locate service ownership | [../ARCHITECTURE.md](../ARCHITECTURE.md) |
| Develop from source | [architecture/local-dev.md](architecture/local-dev.md) |
| Score judgments offline | [runbooks/run-to-eval.md](runbooks/run-to-eval.md) |
| Match the project’s prose | [WRITING.md](WRITING.md) |
| See what is working vs next | [architecture/roadmap.md](architecture/roadmap.md) |

The root [README.md](../README.md) remains the install and scope entry point.

## Layout

| Directory | Contents |
| --- | --- |
| `architecture/` | Why the system exists, literate architecture, local-dev, roadmap |
| `protocols/` | Authoring guide and protocol narratives |
| `runbooks/` | Commands for running, capturing, training, and evaluating |
| `decisions/` | Numbered ADRs for cross-service and public-contract choices |
| `security/` | Threat model notes for network exposure |
| `eval/` | Dataset and evaluation specifications |
| `verification/` | Notes for completed verification work |
| `WRITING.md` | Voice, lexicon, and review checklist for docs and operator UI |

## How to read maturity claims

Capabilities are labeled **working**, **experimental**, **hardware-dependent**,
**legacy**, or **planned**. A directory on disk is not proof that a path is
supported. Prefer the roadmap and service READMEs over marketing language.

When a document discusses measurements or model confidence, it must follow the
evidence rules in [WRITING.md](WRITING.md): a vision judgment is an observation;
an instrument reading needs provenance.

## License

Files in this directory are released under [CC0 1.0](LICENSE) unless a
specific file states otherwise. Repository code is licensed separately under
Apache-2.0; see the root `LICENSE`.
