# `Lusiad` - Evaluation — Discussion

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/avaliacao-discussao.md)

[📊 Evaluation](evaluation.md)

The evidence supports model-based Java editing and individual change inspection in the evaluated scenario. The accounts below illustrate how participants used the tool and where interaction design or the boundary of a recorded operation affected the outcome.

### On this page

> [1. Model-based editing](#1-model-based-editing)<br>
> [2. Change tracking](#2-change-tracking)<br>
> [3. Usability](#3-usability)<br>
> [4. Usefulness and intention to use](#4-usefulness-and-intention-to-use)<br>
> [5. Threats to validity](#5-threats-to-validity)<br>
> [Documentation index](#documentation-index)

---

## 1. Model-based editing

**EQ1.** The expected Java edits were produced in all 15 sessions. Participants used the blocks to operate on fields, methods, calls, and a comment, and observed the corresponding source changes. P01 described this as a practical way to program in the SUS01 comment. The comparison between visual structure and generated source was visible in T1 and T2. [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Task results](evaluation-results.md#2-task-performance)

P14 expected the drag gesture used in the component library to carry over to moving elements already in the canvas. P10 waited for visual feedback after making an edit. These accounts suggest that the model's legibility and the predictability of its controls both matter. The thesis highlights consistent gestures and clearer feedback for what is selected, where it will go, and when an operation has taken effect. [P14, 21:04–21:17](../zenodo/evaluation-results-transcription-14.txt) · [P10, 48:32–48:42](../zenodo/evaluation-results-transcription-10.txt)

## 2. Change tracking

**EQ2.** Factual answers and session evidence indicate that the graph, history, and before/after views helped participants locate versions and interpret changes. P07 highlighted how simple it was to apply versioning (SUS05). P10 said colors clarified what changed (PU1). P09 valued seeing the related information together (SUS04). The task set put these features to different uses. T3 located a commit, T4 recovered and compared a point in history, and T5 inspected adjacent states and the UML of an individual event. [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Task protocol](../zenodo/evaluation-material-2-form-tasks.txt)

P02 edited the entire class where the script expected a field edit. The history consequently contained a broader event, and the intermediate state expected in T4 was harder to locate. The example illustrates an operational constraint. An intermediate state is available through the history when an event boundary captures it. Users need to see the operation and element represented by each record to recognize which state can be recovered. [P02 session](../zenodo/evaluation-results-transcription-02.txt) · [How replay reconstructs an event](notable-implementation-elements.md#reconstructing-and-viewing-changes)

## 3. Usability

**EQ3.** The mean SUS score of 81.83 and the 14 favorable responses on ease of use indicate favorable perceived usability for this encounter. P05 praised how quickly they could start using the tool. P11 agreed that it was easy to use and described a period of adjustment from familiar interfaces in the SUS03 comment. [P05, 42:29–42:41](../zenodo/evaluation-results-transcription-05.txt) · [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv)

The support item (SUS04) produced more varied responses. Nine participants disagreed that they would need technical help, five were neutral, and one agreed. P12 reported difficulty finding the way back to the menu. That episode explains why favorable overall ratings coexist with room to improve individual navigation actions. [P12, 11:23–11:27](../zenodo/evaluation-results-transcription-12.txt) · [SUS breakdown](evaluation-results.md#3-usability)

## 4. Usefulness and intention to use

**EQ4.** All participants found the blocks useful for the editing tasks, and the two history-related usefulness items received more strong agreements. P12 said the before/after view helped them understand what had been done, and P06 highlighted the integration of the tool's features. P13 suggested using the approach in Java courses, which identifies a context for further evaluation. [P12, 40:02–40:08](../zenodo/evaluation-results-transcription-12.txt) · [P06, 41:40–41:49](../zenodo/evaluation-results-transcription-06.txt) · [P13, 47:30–47:38](../zenodo/evaluation-results-transcription-13.txt)

The paired intention responses show that five participants rated change analysis more favorably than editing. P03 found the blocks useful for the exercise and anticipated that dragging components would take more effort in longer programs. They disagreed with using Lusiad for editing and agreed with using it for change analysis. P07's interest depended on working with Java, and P15 suggested supporting other languages. These accounts explain why immediate usefulness and prospective use may diverge with project size, language, and workflow. [P03 and P07, SUS01; P15, IU2](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Davis, Bagozzi, and Warshaw (1989)](https://doi.org/10.1287/mnsc.35.8.982)

## 5. Threats to validity

The thesis uses Wohlin et al.'s four categories and follows Verdecchia et al. in connecting each threat to the study conditions and the interpretation it affects. [Wohlin et al. (2012)](https://doi.org/10.1007/978-3-642-29044-2) · [Verdecchia et al. (2023)](https://doi.org/10.1016/j.infsof.2023.107329)

| Threat | Implication for these findings |
| --- | --- |
| **Construct validity** | A factual error can arise in navigation, interpretation, or transcription. The session record helps place it in context. The SUS aggregates perceived usability and can conceal a specific difficulty. The five custom TAM-inspired items were all positively worded and were analyzed individually. They concern the features exercised and immediate stated intention. Long-term adoption would require follow-up observations. |
| **Internal validity** | The author moderated the sessions. Hints could ease feature discovery, and the author's presence could influence criticism. A common script, fixed tasks and version, and an invitation to report difficulties supported consistency. The contribution of guidance remains undetermined. Estimating a productivity gain would require a comparative condition and a measure such as time on task. |
| **Conclusion validity** | Eleven perfect factual scores leave little room to distinguish performance at the top of the scale. Observations add context for difficulties that the score does not capture. Optional comments and selected excerpts illustrate experiences. Their frequency cannot establish how common those experiences were. |
| **External validity** | The convenience sample was mainly undergraduates and included only self-reported intermediate or advanced programmers. Each person had one session with one prepared Java project. Extending the findings to novices, repeated use, or teams with larger projects would require studying those settings. |

---

<table width="100%">
<tr>
<td align="left"><a href="evaluation-results.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">2️⃣2️⃣ Evaluation — Discussion</a></td>
<td align="right"><a href="evaluation-data.md">Next page ➡️</a></td>
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
- [💬 Discussion](evaluation-discussion.md) 👈
- [📂 Materials and data](evaluation-data.md)
