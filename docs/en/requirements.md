# `Lusiad` – Requirements

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/requisitos.md)

**Implementation status.** All 20 user stories (US01–US20) and all six non-functional requirements (RNF01–RNF06) are implemented.

### On this page

> [1. Functional requirements](#-1-functional-requirements)<br>
> [2. Quality requirements](#-2-quality-requirements)<br>
> [Documentation index](#documentation-index)

---

## 📋 1. Functional requirements

The stories describe how a developer works with a Java project in Lusiad. The original MoSCoW priorities distinguish essential features (**MUST**), important features (**SHOULD**), and desirable additions (**COULD**).

[1.1 Project management](#11-project-management) · [1.2 Modeling canvas](#12-modeling-canvas) · [1.3 File explorer](#13-file-explorer) · [1.4 Version control](#14-version-control) · [1.5 Change history](#15-change-history) · [1.6 Additional features](#16-additional-features)

### 1.1 Project management

A project connects a Java source directory to its modeling environment and change history. When returning to a codebase, the developer can select its project and pick up where they left off.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US01 | List, add, edit, and remove projects. | Choose which Java codebases to open for modeling and change tracking. | MUST |

### 1.2 Modeling canvas

On the canvas, a method appears inside the class that declares it, with its statements nested inside the method. This hierarchy gives an edit its context. Moving a statement changes its position in the code, while editing one of its properties changes the selected statement itself.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US02 | View Java source code as nested, interactive blocks. | See which elements belong to a class, method, or other enclosing element. | MUST |
| US03 | Insert code components on the canvas. | Build or extend the program logic visually. | MUST |
| US04 | Move and delete blocks directly on the canvas. | Reorganize the program structure and its flow of execution. | MUST |
| US05 | Edit the content and properties of a selected block. | Change the values or logic of that specific component. | MUST |
| US06 | View the selected component’s path in the model hierarchy. | Locate the component in the PSI tree and identify its enclosing elements. | COULD |

### 1.3 File explorer

The explorer and the canvas show two levels of the same project. Opening `Exemplo.java` in the file tree takes the developer from the file’s location in the project to the classes and methods declared inside it.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US07 | Browse the project’s file tree. | Locate a Java file and open its model. | MUST |
| US08 | Create, rename, move, and delete files. | Manage source files within Lusiad. | SHOULD |
| US09 | Create, rename, move, and delete directories. | Organize the project’s folder structure. | SHOULD |

### 1.4 Version control

A developer can try a different implementation on a branch and review the edits together before committing them. If that version becomes a milestone, a tag gives the commit a name that is easy to find again in the history.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US10 | View commits and branches in a graph. | Follow the history and current state of each line of development. | MUST |
| US11 | Create a branch from a chosen base and merge branches. | Develop a change in isolation and integrate it into the main line. | MUST |
| US12 | Review the components added, modified, or deleted and create a commit with a title and description. | Record the model state and document what changed in that version. | MUST |
| US13 | Restore the project to a selected version in its history. | Recover an earlier model state or undo unwanted changes. | SHOULD |
| US14 | Add, list, and delete tags attached to commits. | Mark milestones and quickly find important or stable versions. | COULD |

### 1.5 Change history

A single commit can contain several edits to the same class. If a developer moves a method and then changes its body, the history lets them open the move on its own and see where the method was immediately before and after that operation.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US15 | View individual operations in the history, including additions, edits, and deletions affecting blocks, files, and directories. | Trace a change to the operation and the element it affected. | MUST |
| US16 | Expand an individual change and compare the states immediately before and after it. | Inspect the effect of that operation on the model structure. | MUST |
| US17 | Step through the changes in a commit in their recorded order. | Understand the sequence of actions that produced that version. | SHOULD |
| US18 | View changes through UML diagrams, including class and package diagrams. | Examine how the project structure evolved at different levels of abstraction. | COULD |

### 1.6 Additional features

To review changes across several commits, a developer can select two versions directly, for example the version that introduced a class and the one that reorganized its methods. Synchronization covers another common situation. After editing a Java file in the IDE, the developer returns to Lusiad to continue working on its model.

| ID | Developer action | Purpose | Priority |
| --- | --- | --- | --- |
| US19 | Select any two project versions and compare them directly. | Inspect the differences between those states independently of the intervening sequence of edits. | COULD |
| US20 | Synchronize the modeling environment after source files are changed outside Lusiad. | Bring the model up to date with the source code on disk. | COULD |

## 🎯 2. Quality requirements

Moving a block illustrates how these requirements work together. The developer needs to see where the block landed as soon as the edit completes. Later, when they inspect the move in the history, the recorded operation and the saved Java source must agree on what changed.

| ID | Quality attribute | Requirement |
| --- | --- | --- |
| RNF01 | Usability | Developers must be able to understand and use the main features without prior training. |
| RNF02 | Usability | The interface must provide immediate visual feedback for model operations such as inserting, moving, or deleting a block. |
| RNF03 | Usability | The interface must use colors, icons, and on-screen text consistently to support accessibility. |
| RNF04 | Performance | Each feature must load within five seconds. |
| RNF05 | Reliability | The change history must record each operation correctly and preserve it without loss. |
| RNF06 | Reliability | After each operation, the model displayed in Lusiad must match the Java source code stored on disk. |

---

<table width="100%">
<tr>
<td align="left"><a href="project.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">7️⃣ Requirements</a></td>
<td align="right"><a href="prototyping.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)
- [🎬 Demo](demo.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md) 👈
- [✏️ Prototyping](prototyping.md)

**[💻 Implementation](implementation.md)**

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
