# `Lusiad` – Implementation

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/implementacao.md)

This section explains how Lusiad turns Java source into an editable model, records changes, and reconstructs earlier states for comparison. Use the index below to find source files, data structures, API contracts, and interaction flows.

### On this page

> [In this section](#-in-this-section)<br>
> [Documentation index](#documentation-index)

---

## 📑 In this section

- [**🏗️ Architecture**](architecture.md) — Responsibilities of the Next.js application and IntelliJ plugin, from reading PSI to recording an edit with Git and MySQL.
- [**📂 Directory structure**](directory-structure.md) — Repository tree and locations of the frontend, plugin, tests, and documentation.
- [**🧰 Technology stack**](technology-stack.md) — Runtime and build versions, dependencies, Java tooling, and verification commands.
- [**🗃️ Data model**](data-model.md) — Identifiers and storage for projects, branches, commits, changes, tags, and operation journals.
- [**🔌 API reference**](api-reference.md) — Next.js routes and server actions, local plugin endpoints, request conventions, and error responses.
- [**🔀 Interaction diagrams**](interaction-diagrams.md) — Sequence diagrams for loading the model, editing source, recording commits, comparing versions, restoring states, and running Java.
- [**🧭 Design decisions**](design-decisions.md) — Rationale for using an IntelliJ plugin, a client–server architecture, Java and TypeScript, MySQL, and the selected libraries.
- [**🔍 Notable implementation elements**](notable-implementation-elements.md) — How PSI nodes become editable blocks, how a method move is recorded, and how replay reconstructs its before and after states.

---

<table width="100%">
<tr>
<td align="left"><a href="prototyping.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">8️⃣ Implementation</a></td>
<td align="right"><a href="architecture.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md)
- [✏️ Prototyping](prototyping.md)

**[💻 Implementation](implementation.md)** 👈

- [🏗️ Architecture](architecture.md)
- [📂 Directory structure](directory-structure.md)
- [🧰 Technology stack](technology-stack.md)
- [🗃️ Data model](data-model.md)
- [🔌 API reference](api-reference.md)
- [🔀 Interaction diagrams](interaction-diagrams.md)
- [🧭 Design decisions](design-decisions.md)
- [🔍 Notable implementation elements](notable-implementation-elements.md)

**[📊 Evaluation](evaluation.md)**

- [📋 Planning](evaluation-planning.md)
- [🧪 Execution](evaluation-execution.md)
- [📈 Results](evaluation-results.md)
- [💬 Discussion](evaluation-discussion.md)
- [📂 Materials and data](evaluation-data.md)
- [🗂️ Evaluation files](../zenodo/)
