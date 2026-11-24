# `Lusiad` – User guide

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/manual.md)

### On this page

> [1. Plugin panel](#-1-plugin-panel)<br>
> [2. Projects and editor](#-2-projects-and-editor)<br>
> [3. History and comparison](#-3-history-and-comparison)<br>
> [4. Screens](#-4-screens)<br>
> [Documentation index](#documentation-index)

---

<a name="plugin-panel"></a>

## 🔌 1. Plugin panel

Open **Lusiad** in IntelliJ's tool window. The panel starts and stops the local service, checks MySQL connectivity, configures the frontend URL, adjusts preferences, and provides tutorials. Keep the IDE open while using the web interface.

<a name="projects-and-editor"></a>

## 🗂️ 2. Projects and editor

The project page registers a directory, selects a project, and opens the workspace. In the explorer, open a Java file. The central area shows the editable structure and corresponding code. The library supplies components for insertion. Select an element to edit its properties. Undo and redo controls sit beside file tabs. Help icons open guided instructions for the main areas.

<a name="history-and-comparison"></a>

## 🕘 3. History and comparison

Initialize Git through the interface and create a commit. In the history, select a branch and commit. Open an individual event to inspect its record. Version comparison lets you choose base and target. Before restoring a state, check the selected branch and version in the UI. The [first steps guide](first-steps.md) gives a short walkthrough.

<a name="screens"></a>

## 🖼️ 4. Screens

These screenshots came from the live interface and a disposable project. The demonstrated backend is `851120d` and frontend `d2f9326`.

![Library and model with iniciar above encerrar](../assets/01-modeling-canvas.png)
*Model and library before the move.*

![Model with encerrar above iniciar](../assets/02-method-move.png)
*Model and Java after the move.*

![Component library, Java class, and selected method properties](../assets/08-properties.png)
*Library, model, and properties in one screen.*

![History showing the commit and move event](../assets/03-change-history.png)
*Commit and individual event in history.*

![Individual view of the encerrar method move](../assets/04-individual-change.png)
*Selected event view.*

![Before and after states in separate panes](../assets/05-version-comparison.png)
*Canvas comparison of the two commits.*

![Git text diff between the two versions](../assets/06-git-diff.png)
*Git diff of the same operation.*

![PSI trees before and after the move](../assets/07-psi.png)
*Structural representation before and after.*

The IntelliJ plugin panel was not open during capture. To complete it, install the release ZIP in a disposable IDE, open the demo project, display **View → Tool Windows → Lusiad**, hide paths and credentials, and save a screenshot as `docs/assets/08-painel-plugin.png`. Insert it here after visual review.

---

<table width="100%">
<tr>
<td align="left"><a href="../../README.md">⬅️ Previous page</a> | Overview</td>
<td align="center"><a href="index.md">1️⃣ User guide</a></td>
<td align="right">Demo | <a href="demo.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md) 👈
- [🎬 Demo](demo.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md)
- [✏️ Prototyping](prototyping.md)

**[💻 Implementation](implementation.md)**

- [🏗️ Architecture](architecture.md)
- [🔍 Notable implementation elements](notable-implementation-elements.md)
