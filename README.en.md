# Lusiad

[Português](README.md) · [Documentation](docs/en/index.md) · [Installation](docs/en/installation.md) · [Evaluation](docs/en/evaluation.md)

Lusiad is an environment for model-based Java programming and change tracking. An IntelliJ IDEA plugin provides structural code analysis and a local API. The web interface lets users edit the model, inspect the resulting Java code, and browse the change history. Its change records combine program elements, file states, Git commits, and MySQL data.

This repository brings together the [plugin and local service](lusiad-backend/), [web interface](lusiad-frontend/), [documentation](docs/en/index.md), and [public evaluation artifacts](evaluation/README.md). Source revisions are recorded in [VERSIONS.md](VERSIONS.md).

## Lusiad in action

In a Java project created solely for this demonstration, `Exemplo.java` had `iniciar()` above `encerrar()`. In the live interface, the user selected `encerrar()` in the model and dragged it above `iniciar()`. The Java source reflected the new order. The user then saved the **Mover encerrar antes de iniciar** commit, opened the individual change in history, and compared it with **Preparar dois métodos**. The demonstrated revisions are recorded in [VERSIONS.md](VERSIONS.md); the evaluated revisions are still being confirmed.

![Java model and library before moving the method: iniciar above encerrar](docs/assets/01-modelagem.png)
*1. Before: component library, model, and `Exemplo.java` source.*

![Java model after moving the method: encerrar above iniciar](docs/assets/02-movimento.png)
*2. Both the model and Java source show the new method order.*

![Side-by-side comparison between the before and after commits](docs/assets/05-comparacao.png)
*3. The comparison displays both recorded states.*

The [illustrated guide](docs/en/manual.md) also shows history, the individual event, Git diff, and the PSI tree.

## Install and run

Read the [requirements and installation guide](docs/en/installation.md) to install the plugin from a release ZIP or build it from source, prepare MySQL, and start the web interface. The [first steps guide](docs/en/first-steps.md) covers project creation, editing, and history inspection.

## Repository layout

| Directory | Purpose |
| --- | --- |
| `lusiad-backend/` | IntelliJ plugin, local API, PSI services, persistence, and SQL migrations. |
| `lusiad-frontend/` | Next.js interface, Git operations, and database queries. |
| `docs/pt-BR/`, `docs/en/` | User guides, architecture, implementation, prototyping, and evaluation. |
| `evaluation/` | Applied instruments, scenario, and releasable aggregate results. |

Read the [architecture](docs/en/architecture.md), [change representation](docs/en/implementation.md), [prototype history](docs/en/prototyping.md), and [evaluation protocol](docs/en/evaluation.md). [Version, citation, and package details](VERSIONS.md).

## Citation, license, and data

For a version-specific citation, use the release identifier and the published Zenodo DOI. These will be added after publication. Participant data in this repository is aggregate only. The authorial license is pending a decision before publication.
