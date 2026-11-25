# `Lusiad` – Avaliação — Resultados

[🇺🇸 English](../en/evaluation-results.md) · **🇧🇷 Português (Brasil)**

[📊 Avaliação](avaliacao.md)

Os resultados abrangem **15 sessões principais**. A conclusão das tarefas de modelagem foi verificada por observação. A pontuação de rastreamento resume as respostas factuais. O questionário registra as percepções após as tarefas.

### Nesta página

> [1. Perfil dos participantes](#1-perfil-dos-participantes)<br>
> [2. Desempenho nas tarefas](#2-desempenho-nas-tarefas)<br>
> [3. Usabilidade](#3-usabilidade)<br>
> [4. Utilidade e intenção de uso](#4-utilidade-e-intenção-de-uso)<br>
> [5. Comentários abertos](#5-comentários-abertos)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 1. Perfil dos participantes

| Característica | Distribuição |
| --- | --- |
| Escolaridade | 12 com graduação em andamento e 3 com ensino superior concluído |
| Atuação atual | 11 estudantes sem atuação profissional em tecnologia, 2 estudantes que atuavam em tecnologia, 1 docente em tecnologia e 1 profissional de outra área |
| Tempo de programação | 5 com 1–3 anos, 4 com 3–5 anos e 6 com mais de 5 anos |
| Nível autodeclarado em programação | 7 intermediários e 8 avançados |
| Uso de Java (múltiplas seleções) | 14 em disciplinas, 13 em projetos acadêmicos, 8 em projetos pessoais e 4 em atividades profissionais |
| Experiência com programação visual | 3 nunca, 6 uma ou poucas vezes e 6 algumas vezes |
| Experiência com controle de versão | 7 em disciplinas ou projetos pessoais e 8 em projetos profissionais |
| Frequência de consulta ao histórico | 8 frequentemente, 5 às vezes e 2 raramente |
| Conhecimento prévio do Lusiad | 8 já tinham ouvido falar, sem ter usado, e 7 não conheciam |

O CSV de perfil do repositório registra **12 participantes com graduação em andamento e 3 com ensino superior concluído**. O texto da avaliação do TCC fornecido para esta documentação informa 13 e 2 para essa divisão. A tabela usa as contagens do CSV para permitir a conferência. [Respostas de perfil](../zenodo/evaluation-results-1-profile.csv)

## 2. Desempenho nas tarefas

Os 15 participantes concluíram T1 e T2 e produziram as alterações Java esperadas nas sessões moderadas. A pontuação factual considera T3–T5. Cada acerto ou variação de escrita com o mesmo significado valeu um ponto. Respostas ausentes ou divergentes receberam zero. A média foi de **9,13 em 10**, a mediana foi **10**, e a faixa foi de **4 a 10**. Onze participantes tiraram 10 (73,3%), três obtiveram 7 ou 8 e um obteve 4. [Enunciados das tarefas](../zenodo/evaluation-material-2-form-tasks.txt)

| Participante | Acertos |
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

| Tarefa | Acertos | Respostas possíveis |
| --- | ---: | ---: |
| T3. Localizar o commit e identificar sua branch e seu título | 29 | 30 |
| T4. Identificar a branch da restauração e as mensagens nas duas versões | 38 | 45 |
| T5. Consultar os três eventos do histórico | 70 | 75 |
| **Total** | **137** | **150** |

Os totais por tarefa ampliam a síntese do TCC. Eles foram conferidos nas respostas do formulário original aplicando a regra de pontuação do artigo. As três questões de T4, em conjunto, tiveram a menor proporção de acertos. Na comparação, 13 participantes identificaram a mensagem da base restaurada e 12 identificaram a mensagem do alvo. Os 15 identificaram os dois valores de `limite` no histórico preparado em T5. [Origem dos dados](avaliacao-dados.md#o-que-pode-ser-reproduzido)

<details>
<summary>Gabarito e acertos das dez questões factuais</summary>

| Item | Informação esperada | Acertos |
| --- | --- | ---: |
| 3.1 | Branch `master` | 15 |
| 3.2 | Título `D - Alterações da sessão` | 14 |
| 4.1 | Branch após a restauração `experimento-avaliacao` | 13 |
| 4.2 | Mensagem na base restaurada, `Início` | 13 |
| 4.3 | Mensagem no alvo, `Processo iniciado` | 12 |
| 5.1 | Valor anterior de `limite`, `10` | 15 |
| 5.2 | Valor posterior de `limite`, `20` | 15 |
| 5.3 | Atributo adicionado `rotulo` | 13 |
| 5.4 | Tipo do atributo `String` | 13 |
| 5.5 | Método movido `encerrar()` | 14 |

</details>

## 3. Usabilidade

Para cada resposta `x`, os itens ímpares da SUS contribuem com `x − 1` e os pares contribuem com `5 − x`. A soma dos dez itens é multiplicada por `2,5`, produzindo uma pontuação de 0 a 100. A média foi **81,83**, a mediana **82,5**, o desvio-padrão amostral **10,58**, e a faixa **62,5–97,5**. Dois participantes ficaram abaixo de 70 pontos. A média fica entre as médias empíricas associadas aos qualificadores *Good* (71,4) e *Excellent* (85,5) no estudo de Bangor, Kortum e Miller. A comparação dá contexto à escala. [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Bangor, Kortum e Miller (2009), Tabela 3](https://uxpajournal.org/wp-content/uploads/sites/7/pdf/JUS_Bangor_May2009.pdf)

| Pontuação SUS | Participantes |
| ---: | ---: |
| 62,5 | 1 |
| 67,5 | 1 |
| 70 | 1 |
| 72,5 | 2 |
| 80 | 1 |
| 82,5 | 2 |
| 87,5 | 2 |
| 90 | 2 |
| 92,5 | 2 |
| 97,5 | 1 |

A tabela mantém a direção original das respostas. A discordância é favorável nos itens de formulação negativa (−). Cada linha tem 15 respostas. Todos concordaram que as funções estavam bem integradas (SUS05), e 14 concordaram com a facilidade de uso (SUS03) e com a rapidez de aprendizagem (SUS07).

| Item | Tema | DT | D | N | C | CT |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| SUS01 (+) | Uso frequente | 0 | 0 | 2 | 10 | 3 |
| SUS02 (−) | Complexidade desnecessária | 5 | 8 | 2 | 0 | 0 |
| SUS03 (+) | Facilidade de uso | 0 | 0 | 1 | 10 | 4 |
| SUS04 (−) | Necessidade de ajuda técnica | 6 | 3 | 5 | 1 | 0 |
| SUS05 (+) | Integração das funções | 0 | 0 | 0 | 8 | 7 |
| SUS06 (−) | Inconsistência | 10 | 3 | 1 | 1 | 0 |
| SUS07 (+) | Rapidez de aprendizagem | 0 | 0 | 1 | 10 | 4 |
| SUS08 (−) | Uso trabalhoso | 11 | 4 | 0 | 0 | 0 |
| SUS09 (+) | Segurança no uso | 0 | 0 | 3 | 7 | 5 |
| SUS10 (−) | Necessidade de aprender antes de usar | 9 | 3 | 2 | 1 | 0 |

DT = discordo totalmente, D = discordo, N = neutro, C = concordo, CT = concordo totalmente.

## 4. Utilidade e intenção de uso

| Item | Tema | DT | D | N | C | CT | NA |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| UP1 | Blocos para edição | 0 | 0 | 0 | 10 | 5 | 0 |
| UP2 | Visão do antes e depois | 0 | 0 | 1 | 4 | 10 | 0 |
| UP3 | Histórico de alterações | 0 | 0 | 1 | 4 | 10 | 0 |
| IU1 | Uso para edição | 0 | 1 | 1 | 11 | 2 | 0 |
| IU2 | Uso para análise de mudanças | 0 | 0 | 1 | 8 | 6 | 0 |

DT = discordo totalmente, D = discordo, N = neutro, C = concordo, CT = concordo totalmente, NA = não consigo avaliar.

Os 15 participantes concordaram que os blocos foram úteis nas tarefas de edição. Dez escolheram a categoria máxima para cada recurso de rastreamento, e cinco fizeram isso para a edição em blocos. Concordância ou concordância total chegou a **13 de 15** na intenção de editar código e a **14 de 15** na intenção de analisar mudanças. Na comparação de IU2 com IU1 de cada pessoa, dez deram a mesma resposta, quatro avaliaram a análise uma categoria acima e uma pessoa avaliou a análise duas categorias acima. Ninguém avaliou a edição acima da análise ou escolheu “Não consigo avaliar”. [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv)

## 5. Comentários abertos

Onze participantes registraram **56 comentários opcionais**. Os comentários e as transcrições mostram episódios de interação e dificuldades que ajudam a interpretar os números. Os relatos são identificados por código de participante e, na discussão, pelo item ou trecho da sessão. [Discussão](avaliacao-discussao.md) · [Pasta de dados](../zenodo/)

---

<table width="100%">
<tr>
<td align="left"><a href="avaliacao-execucao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">2️⃣0️⃣ Avaliação — Resultados</a></td>
<td align="right"><a href="avaliacao-discussao.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)

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
- [📈 Resultados](avaliacao-resultados.md) 👈
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
