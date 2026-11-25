# `Lusiad` – Evaluation — Results

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/avaliacao-resultados.md)

[📊 Evaluation](evaluation.md)

The results cover **15 main sessions**. Completion of the modeling tasks comes from session observation. The tracking task score summarizes answers to the task form. Questionnaire results describe perceptions reported after the tasks.

### On this page

> [1. Participant profile](#1-participant-profile)<br>
> [2. Task performance](#2-task-performance)<br>
> [3. Usability](#3-usability)<br>
> [4. Usefulness and intention to use](#4-usefulness-and-intention-to-use)<br>
> [5. Open comments](#5-open-comments)<br>
> [Documentation index](#documentation-index)

---

## 1. Participant profile

| Characteristic | Distribution |
| --- | --- |
| Education | 12 undergraduate students and 3 participants with completed higher education |
| Current occupation | 11 students without professional IT work, 2 students working in IT, 1 IT instructor, and 1 professional from another field |
| Programming experience | 5 with 1–3 years, 4 with 3–5 years, and 6 with more than 5 years |
| Self-rated programming level | 7 intermediate and 8 advanced |
| Java use (multiple selections) | 14 in courses, 13 in academic projects, 8 in personal projects, and 4 in professional work |
| Prior visual programming | 3 never, 6 once or a few times, and 6 several times |
| Version-control experience | 7 in courses or personal projects and 8 in professional projects |
| Frequency of using change history | 8 often, 5 sometimes, and 2 rarely |
| Prior awareness of Lusiad | 8 had heard about it without using it, and 7 were unfamiliar with it |

The repository's profile CSV records **12 participants with undergraduate study in progress and 3 with completed higher education**. The supplied thesis evaluation text reports 13 and 2 for this split. The table uses the CSV counts so that readers can reproduce them. [Profile responses](../zenodo/evaluation-results-1-profile.csv)

## 2. Task performance

All 15 participants completed T1 and T2 and produced the expected Java source changes in the moderated sessions. The factual-answer score uses only T3–T5. A correct answer or a wording variant with the same meaning earned one point. Missing or divergent answers earned zero. The mean was **9.13 out of 10**, the median was **10**, and scores ranged from **4 to 10**. Eleven participants scored 10 (73.3%), three scored 7 or 8, and one scored 4. [Task statements](../zenodo/evaluation-material-2-form-tasks.txt)

| Participant | Correct answers |
| --- | ---: |
| P01 | 10 |
| P02 | 7 |
| P03 | 10 |
| P04 | 10 |
| P05 | 10 |
| P06 | 8 |
| P07 | 10 |
| P08 | 4 |
| P09 | 10 |
| P10 | 10 |
| P11 | 10 |
| P12 | 8 |
| P13 | 10 |
| P14 | 10 |
| P15 | 10 |

| Task | Correct answers | Opportunities |
| --- | ---: | ---: |
| T3. Locate the commit and identify its branch and title | 29 | 30 |
| T4. Identify the restoration branch and the messages in the two versions | 38 | 45 |
| T5. Inspect the three historical events | 70 | 75 |
| **Total** | **137** | **150** |

The task totals extend the thesis summary. They were checked against the original task-form responses using the thesis scoring rule. The three T4 questions together had the lowest share of correct responses. In particular, 13 participants identified the message in the restored base and 12 identified it in the target. All 15 identified both values of `limite` in the prepared history in T5. [Data provenance](evaluation-data.md#what-can-be-reproduced)

<details>
<summary>Answer key and counts for the ten factual questions</summary>

| Item | Expected information | Correct responses |
| --- | --- | ---: |
| 3.1 | Commit branch `master` | 15 |
| 3.2 | Commit title `D - Alterações da sessão` | 14 |
| 4.1 | Branch after restoration `experimento-avaliacao` | 13 |
| 4.2 | Message in the restored base, `Início` | 13 |
| 4.3 | Message in the target, `Processo iniciado` | 12 |
| 5.1 | Prior value of `limite`, `10` | 15 |
| 5.2 | Next value of `limite`, `20` | 15 |
| 5.3 | Added field `rotulo` | 13 |
| 5.4 | Field type `String` | 13 |
| 5.5 | Moved method `encerrar()` | 14 |

</details>

## 3. Usability

For each SUS response `x`, odd items contribute `x − 1` and even items contribute `5 − x`. The sum across ten items is multiplied by `2.5`. This gives a score on a 0–100 scale. The mean was **81.83**, the median **82.5**, the sample standard deviation **10.58**, and the range **62.5–97.5**. Two participants fell below 70 points. The mean lies between the empirical means associated with *Good* (71.4) and *Excellent* (85.5) in Bangor, Kortum, and Miller's adjective-rating data. The comparison contextualizes the scale. [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Bangor, Kortum, and Miller (2009), Table 3](https://uxpajournal.org/wp-content/uploads/sites/7/pdf/JUS_Bangor_May2009.pdf)

| SUS score | Participants |
| ---: | ---: |
| 62.5 | 1 |
| 67.5 | 1 |
| 70 | 1 |
| 72.5 | 2 |
| 80 | 1 |
| 82.5 | 2 |
| 87.5 | 2 |
| 90 | 2 |
| 92.5 | 2 |
| 97.5 | 1 |

The table shows the original response direction. Disagreement is favorable for negatively worded items (−). Each row has 15 responses. All participants agreed that functions were well integrated (SUS05), and 14 agreed with ease of use (SUS03) and quick learning (SUS07).

| Item | Topic | SD | D | N | A | SA |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| SUS01 (+) | Frequent use | 0 | 0 | 2 | 10 | 3 |
| SUS02 (−) | Unnecessary complexity | 5 | 8 | 2 | 0 | 0 |
| SUS03 (+) | Ease of use | 0 | 0 | 1 | 10 | 4 |
| SUS04 (−) | Need for technical support | 6 | 3 | 5 | 1 | 0 |
| SUS05 (+) | Function integration | 0 | 0 | 0 | 8 | 7 |
| SUS06 (−) | Inconsistency | 10 | 3 | 1 | 1 | 0 |
| SUS07 (+) | Quick learning | 0 | 0 | 1 | 10 | 4 |
| SUS08 (−) | Cumbersome use | 11 | 4 | 0 | 0 | 0 |
| SUS09 (+) | Confidence | 0 | 0 | 3 | 7 | 5 |
| SUS10 (−) | Need to learn before using | 9 | 3 | 2 | 1 | 0 |

SD = strongly disagree, D = disagree, N = neutral, A = agree, SA = strongly agree.

## 4. Usefulness and intention to use

| Item | Topic | SD | D | N | A | SA | NA |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PU1 | Blocks for editing | 0 | 0 | 0 | 10 | 5 | 0 |
| PU2 | Before/after views | 0 | 0 | 1 | 4 | 10 | 0 |
| PU3 | History of changes | 0 | 0 | 1 | 4 | 10 | 0 |
| IU1 | Use for editing | 0 | 1 | 1 | 11 | 2 | 0 |
| IU2 | Use for change analysis | 0 | 0 | 1 | 8 | 6 | 0 |

SD = strongly disagree, D = disagree, N = neutral, A = agree, SA = strongly agree, NA = I cannot assess.

All 15 agreed that the blocks were useful for editing in the tasks. The highest category was chosen by 10 participants for each change-tracking feature and by 5 for block-based editing. Agreement or strong agreement reached **13 of 15** on intention to edit code and **14 of 15** on intention to analyze changes. Comparing each person's IU2 with IU1, ten gave equal ratings, four rated analysis one category higher, and one rated it two categories higher. Nobody rated editing higher. No response chose “I cannot assess.” [Questionnaire responses](../zenodo/evaluation-results-3-sus-and-tam.csv)

## 5. Open comments

Eleven participants wrote **56 optional comments**. The comments and transcripts give examples of interaction mechanisms and difficulties to examine alongside the numerical results. Participant codes identify excerpts, and the discussion specifies the item or session source. [Discussion](evaluation-discussion.md) · [Data directory](../zenodo/)

---

<table width="100%">
<tr>
<td align="left"><a href="evaluation-execution.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">2️⃣0️⃣ Evaluation — Results</a></td>
<td align="right"><a href="evaluation-discussion.md">Next page ➡️</a></td>
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
- [📈 Results](evaluation-results.md) 👈
- [💬 Discussion](evaluation-discussion.md)
- [📂 Materials and data](evaluation-data.md)
- [🗂️ Evaluation files](../zenodo/)
