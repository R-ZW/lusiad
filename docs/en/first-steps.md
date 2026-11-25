# `Lusiad` – First steps

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/primeiros-passos.md)

Change the bonus in a small Java program from `10` to `20` using a block on the canvas. Then find that edit in the history and compare the two saved versions of the file.

### On this page

> [1. Prepare and open the example](#create-a-project)<br>
> [2. Save the starting version](#initial-version)<br>
> [3. Edit a block and check the change](#edit-the-model)<br>
> [4. Commit and inspect the edit](#record-and-inspect)<br>
> [5. Compare the two versions](#compare-versions)<br>
> [Documentation index](#documentation-index)

---

<a name="create-a-project"></a>
<a name="-1-create-a-project"></a>

## 📂 1. Prepare and open the example

Keep IntelliJ open with the Lusiad API running. Open the web interface, normally at `http://localhost:3000`. If you still need to start the services, follow the [installation guide](installation.md#configuration).

Create a new folder named `lusiad-first-steps` outside any existing Git repository. Save this program as `Score.java` at the root of that folder. The program adds the `bonus` field to a base score of `100`.

```java
public class Score {
  private static int bonus = 10;

  public static void main(String[] args) {
    System.out.println(100 + bonus);
  }
}
```

1. On **Projects**, click **New project** and enter `First steps` as the name. In **Path**, enter the full path to `lusiad-first-steps`, or use the folder picker to select it.
2. Click **Create project**. Lusiad opens the workspace. To reopen the workspace later, select the registration on **Projects** and click **Open project**.
3. Open **File explorer** on the left rail and double-click `Score.java`. The canvas displays the Java source with boxes for the class, field, and method. [Workspace controls](manual.md#workspace)

<a name="initial-version"></a>

## 💾 2. Save the starting version

Open **Commit menu** on the right rail and click **Initialize repository**. Wait for **No changes to commit**. The starting version now contains `Score.java` with `bonus = 10`. It will serve as the base for the comparison. Close the menu to return to the canvas. If initialization fails, check the [Git requirements](installation.md#requirements).

<a name="edit-the-model"></a>
<a name="-2-edit-the-model"></a>

## 🧩 3. Edit a block and check the change

1. On the canvas, select the block around `private static int bonus = 10;`. If the class or a smaller element is selected, click near the border of the field's block.
2. Click **Expand properties** beside the canvas. In **Attributes**, find **Initial value (optional)** and replace `10` with `20`. You can open **Java code** in the same panel to read the proposed declaration before saving.
3. Click **Save**. The canvas should now show `private static int bonus = 20;`. Open **Change history** on the right and expand **Uncommitted changes**. The edit to `Score.java` should be listed there. At this point, the file already contains the new value on disk and the edit is awaiting a commit. [Properties and edit confirmation](manual.md#properties)

If Java execution is configured, click **Run Java code** above the canvas. The example prints `120` after the edit. [Java configuration and execution](manual.md#java)

<a name="record-and-inspect"></a>
<a name="-3-record-and-inspect"></a>

## 🕘 4. Commit and inspect the edit

1. Open **Commit menu** and check that `Score.java` appears in the file list. Enter `Increase the score bonus` in **Commit title** and click **Commit**.
2. Open **Change history**. Under **Saved versions**, expand **Increase the score bonus** and click the individual edit to `Score.java`. If the commit does not appear yet, click **Reload**.
3. Read the two sides of the preview. **Before** should show `bonus = 10` and **After** should show `bonus = 20`. Click **Expand** at the bottom of the history panel for a larger view. [History and change details](manual.md#history)

<a name="compare-versions"></a>

## 🔍 5. Compare the two versions

1. Open **Compare versions** on the right rail. In **Base**, select the first commit created when you initialized the repository. In **Target**, select **Increase the score bonus**.
2. Click **Compare** and select `Score.java` from the file list. Open **Git diff** to see the line removed from the base (`-`) and the line added in the target (`+`). Switch to **Canvas** to locate the same change in the model.

```diff
-  private static int bonus = 10;
+  private static int bonus = 20;
```

You can now read the edit at two levels. **Change history** opens the state immediately before and after a single operation. **Compare versions** shows every difference between the two references you select. [Version comparison](manual.md#comparison)

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
