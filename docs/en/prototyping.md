# `Lusiad` – Prototyping

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/prototipacao.md)

### On this page

> [1. From concept to interface](#-1-from-concept-to-interface)<br>
> [2. Interface decisions](#-2-interface-decisions)<br>
> [Documentation index](#documentation-index)

---

<a name="from-concept-to-interface"></a>

## ✏️ 1. From concept to interface

The work began with an experiment in representing Java code through PSI and progressed to two-way editing between source and model. High-fidelity prototypes arranged the modeling workspace, explorer, library, properties, and history navigation. The current plugin concentrates IDE controls and configuration, while editing and history appear in the web interface.

The original diagrams remain in the thesis writing project. The thesis's Analysis and Design section presents their development. Screenshots of the executable interface will be added to the [manual](manual.md) after the demonstration session.

<a name="interface-decisions"></a>

## 🖥️ 2. Interface decisions

The library inserts Java components into the model. The properties panel edits a selected element. The history presents commits and individual events through code, model, and diff views. These controls provide a user interface for the structural records kept by the system. The [technical example](implementation.md) follows an operation into persisted data.

---

<table width="100%">
<tr>
<td align="left"><a href="requirements.md">⬅️ Previous page · Requirements</a></td>
<td align="center"><a href="index.md">8️⃣ Prototyping</a></td>
<td align="right"><a href="implementation-index.md">Next page ➡️ Implementation</a></td>
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

- [📋 Requirements](requirements.md)
- [✏️ Prototyping](prototyping.md) 👈

**[💻 Implementation](implementation-index.md)**

- [🏗️ Architecture](architecture.md)
- [🔍 Notable implementation elements](implementation.md)
