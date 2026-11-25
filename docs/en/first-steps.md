# `Lusiad` – First steps

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/primeiros-passos.md)

### On this page

> [1. Create a project](#-1-create-a-project)<br>
> [2. Edit the model](#-2-edit-the-model)<br>
> [3. Record and inspect](#-3-record-and-inspect)<br>
> [Documentation index](#documentation-index)

---

<a name="create-a-project"></a>

## 📂 1. Create a project

Start the plugin and frontend as described in the [installation guide](installation.md). In a disposable folder, save the following example as `Exemplo.java`.

```java
public class Exemplo {
  private int limite = 10;
}
```

On the Projects page, choose **New project**, give it a name, and enter the folder path. Select the registration and choose **Open project**. Open **Commit** on the right and choose **Initialize repository**. This saves the initial Git baseline before you make the first edit. [Project registration](manual.md#projects) · [Commit controls](manual.md#commit)

<a name="edit-the-model"></a>

## 🧩 2. Edit the model

In the file explorer, double-click `Exemplo.java`. Select the field `limite` on the canvas and open **Properties**. Under **Attributes**, change its initializer from `10` to `20`, then select **Save**. Check that the new value appears in the Java source and that **Change history → Uncommitted changes** shows the edit. [Properties and edit confirmation](manual.md#properties)

<a name="record-and-inspect"></a>

## 🕘 3. Record and inspect

In **Commit**, enter a title such as **Change the field initializer** and select **Commit**. In **Change history**, expand that commit and open the individual edit. Check that `limite` is `10` in **Before** and `20` in **After**. Use **Compare versions** to compare the initial baseline with the new commit for the entire file. [History](manual.md#history) · [Version comparison](manual.md#comparison)

---

<table width="100%">
<tr>
<td align="left"><a href="installation.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">4️⃣ First steps</a></td>
<td align="right"><a href="project.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md)
- [🚀 First steps](first-steps.md) 👈

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
