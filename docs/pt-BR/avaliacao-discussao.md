# `Lusiad` – Avaliação — Discussão

[🇺🇸 English](../en/evaluation-discussion.md) · **🇧🇷 Português (Brasil)**

[📊 Avaliação](avaliacao.md)

As evidências sustentam a edição de Java pelo modelo e a consulta de mudanças individuais no cenário avaliado. Os episódios mostram como os participantes usaram o Lusiad e onde o desenho da interação ou a delimitação de uma operação registrada afetou o resultado.

### Nesta página

> [1. Edição pelo modelo](#1-edição-pelo-modelo)<br>
> [2. Rastreamento de mudanças](#2-rastreamento-de-mudanças)<br>
> [3. Usabilidade](#3-usabilidade)<br>
> [4. Utilidade e intenção de uso](#4-utilidade-e-intenção-de-uso)<br>
> [5. Ameaças à validade](#5-ameaças-à-validade)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 1. Edição pelo modelo

**QA1.** As alterações Java esperadas foram produzidas nas 15 sessões. Os participantes usaram os blocos para atuar sobre atributos, métodos, chamadas e um comentário e observaram as alterações correspondentes no código. P01 descreveu a edição como uma forma prática de programar no comentário de SUS01. T1 e T2 permitiram observar essa relação entre a estrutura visual e o código produzido. [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Resultados das tarefas](avaliacao-resultados.md#2-desempenho-nas-tarefas)

P14 esperava que o gesto de arrastar da biblioteca valesse também para mover elementos no canvas. P10 aguardou um retorno visual após fazer uma edição. Os dois relatos mostram a importância da legibilidade do modelo e da previsibilidade dos controles. O TCC destaca a consistência dos gestos e a indicação clara do que foi selecionado, do destino e de quando a operação foi aplicada. [P14, 21:04–21:17](../zenodo/evaluation-results-transcription-14.txt) · [P10, 48:32–48:42](../zenodo/evaluation-results-transcription-10.txt)

## 2. Rastreamento de mudanças

**QA2.** As respostas factuais e os registros das sessões indicam que o grafo, o histórico e os estados anterior e posterior ajudaram a localizar versões e interpretar mudanças. P07 destacou a simplicidade de aplicar o versionamento (SUS05), P10 explicou que as cores ajudaram a reconhecer o que mudou (UP1) e P09 valorizou a consulta integrada das informações (SUS04). T3 usou esses recursos para localizar um commit, T4 para recuperar e comparar um ponto do histórico e T5 para examinar estados adjacentes e a UML de um evento. [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Formulário de tarefas](../zenodo/evaluation-material-2-form-tasks.txt)

P02 editou a classe inteira onde o roteiro esperava uma edição de atributo. O histórico passou a conter um evento mais abrangente, e ficou mais difícil localizar o estado intermediário pedido em T4. O episódio mostra que a recuperação depende do ponto capturado pelo registro de uma operação. A indicação do elemento afetado e da operação ajuda o usuário a entender qual estado aquele evento permite recuperar. [Sessão de P02](../zenodo/evaluation-results-transcription-02.txt) · [Como um evento é reconstruído](elementos-notaveis-da-implementacao.md#reconstrucao-e-visualizacao-das-alteracoes)

## 3. Usabilidade

**QA3.** A média de 81,83 na SUS e as 14 respostas favoráveis à facilidade de uso indicam uma percepção positiva nesse primeiro contato. P05 destacou que conseguiu começar rapidamente. P11 concordou com a facilidade de uso e relatou, no comentário de SUS03, que precisou se adaptar a uma interface diferente das que conhecia. [P05, 42:29–42:41](../zenodo/evaluation-results-transcription-05.txt) · [Respostas ao questionário](../zenodo/evaluation-results-3-sus-and-tam.csv)

O item sobre ajuda técnica (SUS04) teve respostas mais variadas. Nove discordaram de que precisariam de ajuda, cinco marcaram a opção neutra e um concordou. P12 relatou dificuldade para encontrar o caminho de volta ao menu. O episódio ajuda a explicar como uma avaliação global favorável pode coexistir com dificuldades em ações específicas de navegação. [P12, 11:23–11:27](../zenodo/evaluation-results-transcription-12.txt) · [Distribuição da SUS](avaliacao-resultados.md#3-usabilidade)

## 4. Utilidade e intenção de uso

**QA4.** Todos consideraram os blocos úteis para a edição nas tarefas. Os dois itens de utilidade relacionados ao histórico receberam mais respostas de concordância total. P12 disse que a visão do antes e do depois ajudou a entender o que havia sido feito. P06 destacou a integração dos recursos, e P13 sugeriu o uso em disciplinas de Java, indicando um contexto para avaliação futura. [P12, 40:02–40:08](../zenodo/evaluation-results-transcription-12.txt) · [P06, 41:40–41:49](../zenodo/evaluation-results-transcription-06.txt) · [P13, 47:30–47:38](../zenodo/evaluation-results-transcription-13.txt)

Na comparação pareada da intenção, cinco participantes avaliaram a análise de mudanças acima da edição. P03 considerou os blocos úteis no exercício e antecipou que o arraste exigiria mais esforço em programas maiores. Discordou de que usaria o Lusiad para editar seus projetos e concordou com o uso para análise. O interesse de P07 dependia de trabalhar com Java, e P15 sugeriu o suporte a outras linguagens. Os relatos ajudam a explicar como o tamanho, a linguagem e o fluxo de trabalho dos projetos influenciam a intenção de usar uma ferramenta considerada útil nas tarefas. [P03 e P07, SUS01, e P15, IU2](../zenodo/evaluation-results-3-sus-and-tam.csv) · [Davis, Bagozzi e Warshaw (1989)](https://doi.org/10.1287/mnsc.35.8.982)

## 5. Ameaças à validade

O TCC usa as quatro categorias de Wohlin et al. e segue Verdecchia et al. ao relacionar cada ameaça às condições do estudo e à interpretação que ela pode afetar. [Wohlin et al. (2012)](https://doi.org/10.1007/978-3-642-29044-2) · [Verdecchia et al. (2023)](https://doi.org/10.1016/j.infsof.2023.107329)

| Ameaça | Implicação para os resultados |
| --- | --- |
| **Validade de construto** | Um erro factual pode surgir na navegação, na interpretação ou na transcrição. O registro da sessão ajuda a contextualizá-lo. A SUS agrega a percepção de usabilidade e pode encobrir dificuldades específicas. Os cinco itens próprios inspirados no TAM tiveram formulação positiva e foram analisados individualmente. Eles se referem aos recursos exercitados e à intenção declarada após a sessão. A adoção exigiria acompanhamento posterior. |
| **Validade interna** | O autor moderou as sessões. Dicas podem ter facilitado a localização de funcionalidades, e a presença do autor pode ter influenciado as críticas. O roteiro, a versão estável, os enunciados comuns e o convite a relatar dificuldades favoreceram a consistência. A contribuição da orientação para o desempenho permanece indeterminada. Avaliar ganhos de produtividade exigiria comparação com outro ambiente e uma medida como o tempo de execução. |
| **Validade de conclusão** | Onze pontuações factuais máximas deixam pouca margem para distinguir o desempenho no topo da escala. A observação contextualiza dificuldades que a nota não capta. Comentários opcionais e excertos ilustram experiências. A frequência de um tema nesses relatos é insuficiente para estimar sua prevalência. |
| **Validade externa** | A amostra de conveniência teve principalmente graduandos com experiência intermediária ou avançada autodeclarada. Cada participante fez uma única sessão com um projeto Java preparado. Estender os resultados a iniciantes, ao uso recorrente ou a equipes com projetos maiores exigiria avaliações nesses contextos. |

---

<table width="100%">
<tr>
<td align="left"><a href="avaliacao-resultados.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">2️⃣1️⃣ Avaliação — Discussão</a></td>
<td align="right"><a href="avaliacao-dados.md">Próxima página ➡️</a></td>
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
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md) 👈
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
