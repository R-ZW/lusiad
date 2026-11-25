# `Lusiad` – Demo

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/demonstracao.md)

### On this page

> [1. Before the move](#-1-before-the-move)<br>
> [2. Move the method](#-2-move-the-method)<br>
> [3. Compare the commits](#-3-compare-the-commits)<br>
> [Documentation index](#documentation-index)

---

## 🧩 1. Before the move

The screenshots use a Java project prepared for the demonstration. In `Exemplo.java`, the canvas shows `iniciar()` above `encerrar()` inside the same class.

![Java model of Exemplo.java with iniciar above encerrar](../assets/01-modeling-canvas.png)
*1. The library, model, and source of `Exemplo.java` before the move.*

## ↕️ 2. Move the method

Select `encerrar()` and drag it by its move handle to the gap above `iniciar()`. The Java source reflects the new order, and Lusiad records the move as an individual change.

![Java model and source after moving encerrar above iniciar](../assets/02-method-move.png)
*2. The new method order in the model and Java source.*

## 🔍 3. Compare the commits

The recorded commit is titled **Mover encerrar antes de iniciar**. In **Change history**, open its move event to inspect the states immediately before and after that operation. To compare whole versions, select **Preparar dois métodos** as the base and **Mover encerrar antes de iniciar** as the target in **Compare versions**, then select `Exemplo.java`.

![Side-by-side comparison of the two commits showing the change in method order](../assets/05-version-comparison.png)
*3. The version comparison shows the two states side by side.*

---

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md)
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
- [🗂️ Evaluation files](../zenodo/)
