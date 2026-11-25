# `Lusiad` - Evaluation — Planning

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/avaliacao-planejamento.md)

[📊 Evaluation](evaluation.md)

The protocol connects each evaluation question to activities and sources of evidence. Participants worked from the same task statements and prepared Java project. The project included files to edit and a history of changes to inspect.

### On this page

> [1. Evaluation questions](#1-evaluation-questions)<br>
> [2. Recruitment and session design](#2-recruitment-and-session-design)<br>
> [3. Practical tasks](#3-practical-tasks)<br>
> [4. Questionnaire and observation](#4-questionnaire-and-observation)<br>
> [Documentation index](#documentation-index)

---

## 1. Evaluation questions

| Code | Question | Evidence |
| --- | --- | --- |
| EQ1 | Does the modeling environment allow specified changes to a Java model and yield the expected code? | Observed modeling operations and their resulting Java source in T1–T2. |
| EQ2 | Do the tracking features allow changes in a Java model to be located, identified, and interpreted? | Observed interactions and ten factual answers in T3–T5. |
| EQ3 | What is the tool's perceived usability, and what difficulties arise during use? | The ten SUS items, observed difficulties, and optional comments. |
| EQ4 | What is the tool's perceived usefulness, and what is the stated intention to use it for editing and analyzing changes in Java projects? | Agreement with PU1–PU3 and IU1–IU2, interpreted alongside comments and session accounts. |

## 2. Recruitment and session design

The study used convenience recruitment, mainly among students and faculty at the Federal University of Pampa (UNIPAMPA), Alegrete campus, and the Farroupilha Federal Institute of Education, Science and Technology (IFFar), Uruguaiana campus. Participants were adults who said they could read and modify Java, had never used Lusiad, and consented to participate and be recorded. The profile form recorded education, occupation, programming and version-control experience, familiarity with visual programming, and contexts in which they used Java. [Consent and profile form](../zenodo/evaluation-material-1-form-profile.txt)

Each session was individual. It began with consent and the profile form, continued with five practical tasks, and ended with the evaluation questionnaire. In the practical tasks, the statements supplied names, values, and reference code fragments so participants could focus on interacting with Lusiad. The researcher used the resulting code, the screen-sharing record, and the participants' responses as evidence. [Session guide](../zenodo/evaluation-material-session-guide.md)

## 3. Practical tasks

| Task | Requested actions | Evidence recorded |
| --- | --- | --- |
| T1. Build components | Open `Construcao.java` and use the component library to insert the field `limite`, the method `exibirMensagem()`, and a `System.out.println()` call within it. Inspect the properties of the field and method. | Resulting source and a demonstration of the properties panel. |
| T2. Edit and reorganize the model | In `Organizacao.java`, change `limite` from `10` to `20` and replace the message in `iniciar()`. Move `encerrar()` above `iniciar()`, delete the temporary comment, then undo and redo that deletion. | Resulting source, method position, and visible return and removal of the comment. |
| T3. Save and locate a version | Commit the T1–T2 changes as `D - Alterações da sessão`, locate it in the commit and branch graph, and inspect its details. | Two factual answers about the branch and commit title. |
| T4. Create a branch and recover a state | Create and switch to `experimento-avaliacao`. Restore the point just after `limite` changed to `20` and compare the restoration commit with `D - Alterações da sessão`. | Three factual answers about the active branch and the messages in the two versions. |
| T5. Explore the history | Inspect the three events of `B - Alterações registradas` for `HistoricoExemplo.java`. Open the before and after states, and locate the added field in UML. | Five factual answers about two values of `limite`, the added field's name and type, and the moved method. |

T1–T2 prepared the changes needed for T3–T4. T5 used the history already included in the prepared project, and the form instructed participants to inspect it without changing or restoring the project. T1–T2 were assessed by observation. Only the factual answers from T3–T5 entered the 0–10 score. [Full task statements](../zenodo/evaluation-material-2-form-tasks.txt)

## 4. Questionnaire and observation

Perceived usability was measured by Brooke's ten-item System Usability Scale (SUS), administered in the Brazilian Portuguese adaptation by Lourenço, Carmona, and Lopes. The questionnaire added three perceived-usefulness items and two intention-to-use items inspired by the Technology Acceptance Model (TAM). These additional items concern the features participants had just tried and two hypothetical uses for their Java projects. The study analyzed them separately at the item level. [Brazilian Portuguese SUS adaptation](https://doi.org/10.5294/aqui.2022.22.2.8) · [Perceived usefulness](https://doi.org/10.2307/249008) · [Intention to use](https://doi.org/10.1287/mnsc.35.8.982)

| Item | Statement |
| --- | --- |
| SUS01 | I think that I would like to use this system frequently. |
| SUS02 | I found the system unnecessarily complex. |
| SUS03 | I thought the system was easy to use. |
| SUS04 | I think that I would need the support of a technical person to be able to use this system. |
| SUS05 | I found the various functions in this system were well integrated. |
| SUS06 | I thought there was too much inconsistency in this system. |
| SUS07 | I would imagine that most people would learn to use this system very quickly. |
| SUS08 | I found the system very cumbersome to use. |
| SUS09 | I felt very confident using the system. |
| SUS10 | I needed to learn a lot of things before I could get going with this system. |
| PU1 | Lusiad's block representation was useful for making changes to the code. |
| PU2 | Viewing the before and after states helped me identify what changed in the program. |
| PU3 | Lusiad's history was useful for following the sequence of changes made to the program. |
| IU1 | If it were available for my Java projects, I would use Lusiad to modify code. |
| IU2 | If it were available for my Java projects, I would use Lusiad to analyze code changes. |

Each item offered responses from 1, strongly disagree, to 5, strongly agree, and an optional comment. Only the five TAM-inspired items also offered “I cannot assess.” Odd SUS items were positively worded and even items were negatively worded. The overall SUS score used the standard conversion described on the results page. `PU1`–`PU3` in the thesis correspond to `UP1`–`UP3` in the Portuguese CSV header. [Administered questionnaire](../zenodo/evaluation-material-3-form-sus-and-tam.txt) · [Scoring and results](evaluation-results.md#3-usability)

Observation records and authorized screen-sharing recordings complemented the questionnaires. The moderator encouraged participants to think aloud and could clarify instructions or give occasional hints. The qualitative material helps explain how participants selected operations, discovered features, and interpreted results. [Moderator prompts](../zenodo/evaluation-material-session-guide.md)

---

<table width="100%">
<tr>
<td align="left"><a href="evaluation.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">1️⃣9️⃣ Evaluation — Planning</a></td>
<td align="right"><a href="evaluation-execution.md">Next page ➡️</a></td>
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

- [📋 Planning](evaluation-planning.md) 👈
- [🧪 Execution](evaluation-execution.md)
- [📈 Results](evaluation-results.md)
- [💬 Discussion](evaluation-discussion.md)
- [📂 Materials and data](evaluation-data.md)
