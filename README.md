# `Lusiad` – Model-Based Programming with Change Tracking

**🇺🇸 English** · [🇧🇷 Português (Brasil)](README.pt-BR.md)

Lusiad lets you edit Java source code as a model of nested blocks and trace how it changes. An IntelliJ IDEA plugin uses the Program Structure Interface (PSI) to connect each block to the Java element it represents. In the web interface, you can follow a class or method from an edit on the canvas to its entry in the project history.

### On this page

> [1. Using Lusiad](#-1-using-lusiad)<br>
> [2. Repository layout](#-2-repository-layout)<br>
> [Documentation index](#documentation-index)

---

## 🧩 1. Using Lusiad

The canvas shows the structure of the open Java file. The history lets you inspect the individual edits grouped within each commit.

- [**🖥️ User guide**](docs/en/manual.md) — Find the controls for projects, editing, and history.
- [**🎬 Demo**](docs/en/demo.md) — Follow a method move through the model, Java source, and commit comparison.

## 📂 2. Repository layout

| Directory | Contents |
| --- | --- |
| [`lusiad-backend/`](lusiad-backend/) | IntelliJ IDEA plugin, local HTTP API, Java PSI services, and MySQL schema and migrations. |
| [`lusiad-frontend/`](lusiad-frontend/) | Next.js web interface and server-side services for Git operations and database access. |
| [`docs/en/`](docs/en/index.md) · [`docs/pt-BR/`](docs/pt-BR/index.md) | User guides and technical documentation in English and Brazilian Portuguese. |

The source code and documentation are available under the [MIT license](LICENSE).

---

<table width="100%">
<tr>
<td align="left">⬅️ Previous page</td>
<td align="center">0️⃣ Overview</td>
<td align="right">User guide | <a href="docs/en/manual.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](README.md)** 👈

- [🖥️ User guide](docs/en/manual.md)
- [🎬 Demo](docs/en/demo.md)

**[⚙️ Installation](docs/en/setup.md)**

- [🔧 Installation guide](docs/en/installation.md)
- [🚀 First steps](docs/en/first-steps.md)

**[📐 Project](docs/en/project.md)**

- [📋 Requirements](docs/en/requirements.md)
- [✏️ Prototyping](docs/en/prototyping.md)

**[💻 Implementation](docs/en/implementation.md)**

- [🏗️ Architecture](docs/en/architecture.md)
- [🔍 Notable implementation elements](docs/en/notable-implementation-elements.md)
