# `Lusiad` - Evaluation — Materials and data

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/avaliacao-dados.md)

[📊 Evaluation](evaluation.md)

The evaluation materials and anonymized data can be found in the [Zenodo record](https://doi.org/10.5281/zenodo.24266445) and in the [`docs/zenodo` directory of this repository](../zenodo/).

### On this page

> [1. What is included](#1-what-is-included)<br>
> [2. What can be reproduced](#what-can-be-reproduced)<br>
> [Documentation index](#documentation-index)

---

## 1. What is included

| Material | Contents |
| --- | --- |
| [Session guide](../zenodo/evaluation-material-session-guide.md) | Moderator script from consent through the final questionnaire, including think-aloud and assistance prompts. |
| [Consent and profile form](../zenodo/evaluation-material-1-form-profile.txt) | Consent text and participant background questions. |
| [Practical task form](../zenodo/evaluation-material-2-form-tasks.txt) | The five tasks and prompts for the ten factual answers. |
| [Evaluation questionnaire](../zenodo/evaluation-material-3-form-sus-and-tam.txt) | Ten Brazilian Portuguese SUS items and five TAM-inspired statements. |
| [Profile responses](../zenodo/evaluation-results-1-profile.csv) | One row per participant with coded consent, education, and experience fields. |
| [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv) | One row per participant with SUS and TAM-inspired responses and optional comments. |
| [Session transcripts](../zenodo/) | 15 anonymized, numbered text transcripts, one per main session. |

The files retain the language used in the sessions. `participante_id` connects the two CSVs. To locate a transcript, use the numeric part of the code. For example, P02 corresponds to [transcript 02](../zenodo/evaluation-results-transcription-02.txt).

<a name="what-can-be-reproduced"></a>

## 2. What can be reproduced

1. **Profile.** Count each category in the profile CSV. Treat the four Java-use fields as independent selections. Their counts can exceed the number of participants when added together.
2. **SUS.** Calculate each row's score using `2.5 × (sum of x − 1 for odd items + sum of 5 − x for even items)`. Then calculate the mean, median, sample standard deviation, and distribution across the 15 rows.
3. **Usefulness and intention.** Tabulate each response column independently. `UP1`–`UP3` in the CSV are `PU1`–`PU3` in the thesis. To reproduce the paired comparison, subtract `IU1` from `IU2` within each row.
4. **Qualitative accounts.** Read the corresponding `_comentario` field for a questionnaire excerpt or use the time range in a session transcript. The English discussion describes observations from the Portuguese materials.
5. **Task scores.** The thesis reports the participant totals and explains the scoring rule. The repository documents these totals and adds the counts by task and question. The copy in `docs/zenodo` contains the task statements. Recalculating the score row by row also requires the individual task-answer export, which is outside that directory. [Results and scores](evaluation-results.md#2-task-performance)

---

<table width="100%">
<tr>
<td align="left"><a href="evaluation-discussion.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">2️⃣3️⃣ Evaluation — Materials and data</a></td>
<td align="right">Next page ➡️</td>
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
- [📂 Materials and data](evaluation-data.md) 👈
