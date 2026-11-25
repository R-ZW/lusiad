# `Lusiad` - Avaliação — Materiais e dados

[🇺🇸 English](../en/evaluation-data.md) · **🇧🇷 Português (Brasil)**

[📊 Avaliação](avaliacao.md)

Os materiais e dados anonimizados da avaliação podem ser encontrados no [registro do Zenodo](https://doi.org/10.5281/zenodo.24266445) e no [diretório `docs/zenodo` deste repositório](../zenodo/).

### Nesta página

> [1. Conteúdo do pacote](#1-conteúdo-do-pacote)<br>
> [2. O que pode ser reproduzido](#o-que-pode-ser-reproduzido)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 1. Conteúdo do pacote

| Material | Conteúdo |
| --- | --- |
| [Roteiro da sessão](../zenodo/evaluation-material-session-guide.md) | Roteiro do moderador do consentimento ao questionário final, com orientações para verbalização e assistência. |
| [Termo e formulário de perfil](../zenodo/evaluation-material-1-form-profile.txt) | Texto de consentimento e perguntas sobre a experiência dos participantes. |
| [Formulário de tarefas](../zenodo/evaluation-material-2-form-tasks.txt) | Cinco tarefas e os enunciados das dez respostas factuais. |
| [Questionário de avaliação](../zenodo/evaluation-material-3-form-sus-and-tam.txt) | Dez itens da SUS em português brasileiro e cinco afirmações inspiradas no TAM. |
| [Respostas de perfil](../zenodo/evaluation-results-1-profile.csv) | Uma linha por participante com respostas codificadas de consentimento, escolaridade e experiência. |
| [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv) | Uma linha por participante com os itens da SUS e os inspirados no TAM, além dos comentários opcionais. |
| [Transcrições das sessões](../zenodo/) | 15 transcrições anonimizadas em texto, uma para cada sessão principal. |

Os arquivos mantêm o idioma usado nas sessões. `participante_id` relaciona os dois CSVs. Para localizar uma transcrição, use a parte numérica do código. P02, por exemplo, corresponde à [transcrição 02](../zenodo/evaluation-results-transcription-02.txt).

<a name="o-que-pode-ser-reproduzido"></a>

## 2. O que pode ser reproduzido

1. **Perfil.** Conte cada categoria no CSV de perfil. Os quatro campos sobre uso de Java são seleções independentes, de modo que a soma de suas contagens pode ultrapassar o total de participantes.
2. **SUS.** Calcule a pontuação de cada linha com `2,5 × (soma de x − 1 nos itens ímpares + soma de 5 − x nos itens pares)`. Depois, calcule a média, a mediana, o desvio-padrão amostral e a distribuição nas 15 linhas.
3. **Utilidade e intenção.** Tabule cada coluna de resposta individualmente. `UP1`–`UP3` no CSV correspondem a `PU1`–`PU3` no texto em inglês do TCC. Para reproduzir a comparação pareada, subtraia `IU1` de `IU2` dentro de cada linha.
4. **Relatos qualitativos.** Consulte o campo `_comentario` correspondente para um relato do questionário ou localize o intervalo de tempo na transcrição da sessão.
5. **Pontuações das tarefas.** O TCC informa os totais por participante e explica a regra de pontuação. A documentação registra esses totais e inclui as contagens por tarefa e por questão. A cópia em `docs/zenodo` contém os enunciados. Recalcular a pontuação linha a linha exige também a exportação das respostas individuais, que está fora desse diretório. [Resultados e pontuações](avaliacao-resultados.md#2-desempenho-nas-tarefas)

---

<table width="100%">
<tr>
<td align="left"><a href="avaliacao-discussao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">2️⃣3️⃣ Avaliação — Materiais e dados</a></td>
<td align="right">Próxima página ➡️</td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)
- [🎬 Demonstração](demonstracao.md)

**[⚙️ Instalação](preparacao.md)**

- [🔧 Guia de instalação](instalacao.md)
- [🚀 Primeiros passos](primeiros-passos.md)

**[📐 Projeto](projeto.md)**

- [📋 Requisitos](requisitos.md)
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md)
- [📂 Estrutura de diretórios](estrutura-de-diretorios.md)
- [🧰 Tecnologias utilizadas](tecnologias-utilizadas.md)
- [🗃️ Modelo de dados](modelo-de-dados.md)
- [🔌 Referência da API](referencia-da-api.md)
- [🔀 Diagramas de interação](diagramas-de-interacao.md)
- [🧭 Decisões de projeto](decisoes-de-projeto.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)

**[📊 Avaliação](avaliacao.md)**

- [📋 Planejamento](avaliacao-planejamento.md)
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md) 👈
