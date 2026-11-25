# `Lusiad` - Avaliação — Planejamento

[🇺🇸 English](../en/evaluation-planning.md) · **🇧🇷 Português (Brasil)**

[📊 Avaliação](avaliacao.md)

O protocolo relaciona cada questão de avaliação às atividades e às fontes de evidência. Os participantes receberam os mesmos enunciados e usaram um projeto Java preparado, com arquivos para editar e um histórico para consultar.

### Nesta página

> [1. Questões de avaliação](#1-questões-de-avaliação)<br>
> [2. Recrutamento e desenho da sessão](#2-recrutamento-e-desenho-da-sessão)<br>
> [3. Tarefas práticas](#3-tarefas-práticas)<br>
> [4. Questionário e observação](#4-questionário-e-observação)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 1. Questões de avaliação

| Código | Questão | Evidência |
| --- | --- | --- |
| QA1 | O ambiente de modelagem permite realizar alterações especificadas em um modelo Java, produzindo o código esperado? | Operações observadas e código Java produzido em T1–T2. |
| QA2 | Os recursos de rastreamento permitem localizar, identificar e interpretar alterações em um modelo Java? | Interações observadas e dez respostas factuais em T3–T5. |
| QA3 | Qual é a usabilidade percebida da ferramenta e quais dificuldades surgem durante o uso? | Dez itens da SUS, dificuldades observadas e comentários opcionais. |
| QA4 | Qual é a utilidade percebida da ferramenta e a intenção declarada de utilizá-la para editar código e analisar mudanças em projetos Java? | Concordância com UP1–UP3 e IU1–IU2, examinada com os comentários e relatos das sessões. |

## 2. Recrutamento e desenho da sessão

O recrutamento foi por conveniência, principalmente entre estudantes e docentes da Universidade Federal do Pampa (UNIPAMPA), campus Alegrete, e do Instituto Federal de Educação, Ciência e Tecnologia Farroupilha (IFFar), campus Uruguaiana. Participaram pessoas adultas que declararam saber ler e modificar Java, nunca tinham usado o Lusiad e consentiram com a participação e a gravação. O formulário de perfil registrou escolaridade, atuação, experiência em programação e controle de versão, familiaridade com programação visual e contextos de uso de Java. [Termo de consentimento e formulário de perfil](../zenodo/evaluation-material-1-form-profile.txt)

Cada sessão foi individual. Começava com o consentimento e o formulário de perfil, seguia com cinco tarefas práticas e terminava com o questionário de avaliação. Os enunciados forneciam nomes, valores e trechos de código de referência, para que o trabalho se concentrasse na interação com o Lusiad. O pesquisador usou o código resultante, os registros de tela e as respostas como evidência. [Roteiro da sessão](../zenodo/evaluation-material-session-guide.md)

## 3. Tarefas práticas

| Tarefa | Ações solicitadas | Evidência registrada |
| --- | --- | --- |
| T1. Construir componentes | Abrir `Construcao.java` e inserir pela biblioteca o atributo `limite`, o método `exibirMensagem()` e uma chamada a `System.out.println()` dentro dele. Consultar as propriedades do atributo e do método. | Código produzido e demonstração do painel de propriedades. |
| T2. Editar e reorganizar o modelo | Em `Organizacao.java`, mudar `limite` de `10` para `20` e substituir a mensagem em `iniciar()`. Mover `encerrar()` para antes de `iniciar()`, excluir o comentário temporário e desfazer e refazer a exclusão. | Código produzido, posição do método e retorno e remoção do comentário. |
| T3. Salvar e localizar uma versão | Registrar as alterações de T1–T2 como `D - Alterações da sessão`, localizar o commit no grafo de commits e branches e consultar os detalhes. | Duas respostas factuais sobre a branch e o título do commit. |
| T4. Criar uma branch e recuperar um estado | Criar e selecionar `experimento-avaliacao`. Restaurar o ponto logo após `limite` passar a `20` e comparar o commit de restauração com `D - Alterações da sessão`. | Três respostas factuais sobre a branch em uso e as mensagens nas duas versões. |
| T5. Explorar o histórico | Consultar os três eventos de `B - Alterações registradas` em `HistoricoExemplo.java`. Abrir os estados anterior e posterior e localizar na UML o atributo adicionado. | Cinco respostas factuais sobre dois valores de `limite`, nome e tipo do atributo adicionado e método movido. |

T1–T2 prepararam as mudanças necessárias para T3–T4. T5 usou o histórico já existente no projeto e orientou a consulta sem alterar ou restaurar o projeto. T1–T2 foram avaliadas por observação. A pontuação de 0 a 10 considera as respostas factuais de T3–T5. [Enunciados completos](../zenodo/evaluation-material-2-form-tasks.txt)

## 4. Questionário e observação

A usabilidade percebida foi medida com os dez itens da System Usability Scale (SUS), de Brooke, na adaptação para o português brasileiro de Lourenço, Carmona e Lopes. O questionário acrescentou três itens de utilidade percebida e dois de intenção de uso inspirados no Technology Acceptance Model (TAM). Esses itens tratam dos recursos que os participantes acabavam de usar e de dois possíveis usos em seus projetos Java. O estudo analisou cada item adicional individualmente. [Adaptação brasileira da SUS](https://doi.org/10.5294/aqui.2022.22.2.8) · [Utilidade percebida](https://doi.org/10.2307/249008) · [Intenção de uso](https://doi.org/10.1287/mnsc.35.8.982)

| Item | Afirmação |
| --- | --- |
| SUS01 | Eu acho que gostaria de usar esse sistema frequentemente. |
| SUS02 | Eu achei esse sistema desnecessariamente complexo. |
| SUS03 | Eu achei esse sistema fácil de usar. |
| SUS04 | Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema. |
| SUS05 | Eu achei que as várias funções desse sistema foram bem integradas. |
| SUS06 | Eu acho que o sistema apresenta muita inconsistência. |
| SUS07 | Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente. |
| SUS08 | Eu achei esse sistema muito pesado para usar. |
| SUS09 | Eu me senti muito seguro usando o sistema. |
| SUS10 | Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema. |
| UP1 | A representação em blocos do Lusiad foi útil para realizar as alterações no código. |
| UP2 | A visualização dos estados anterior e posterior me ajudou a identificar o que mudou no programa. |
| UP3 | O histórico do Lusiad foi útil para acompanhar a sequência de alterações realizadas no programa. |
| IU1 | Se estivesse disponível para meus projetos Java, eu utilizaria o Lusiad para modificar código. |
| IU2 | Se estivesse disponível para meus projetos Java, eu utilizaria o Lusiad para analisar mudanças no código. |

Cada afirmação ofereceu respostas de 1, discordo totalmente, a 5, concordo totalmente, e um espaço opcional para comentário. Os cinco itens inspirados no TAM também ofereciam “Não consigo avaliar”. Os itens ímpares da SUS tinham formulação positiva e os pares, negativa. O cálculo da pontuação global está na página de resultados. Os códigos `UP1`–`UP3` são os mesmos itens de `PU1`–`PU3` no texto em inglês do TCC. [Questionário aplicado](../zenodo/evaluation-material-3-form-sus-and-tam.txt) · [Cálculo e resultados](avaliacao-resultados.md#3-usabilidade)

Os registros de observação e as gravações autorizadas da tela compartilhada complementaram os questionários. O moderador estimulou a verbalização e podia esclarecer o enunciado ou dar dicas pontuais. Esse material permite examinar como os participantes escolheram operações, localizaram recursos e interpretaram os resultados. [Orientações do moderador](../zenodo/evaluation-material-session-guide.md)

---

<table width="100%">
<tr>
<td align="left"><a href="avaliacao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">1️⃣9️⃣ Avaliação — Planejamento</a></td>
<td align="right"><a href="avaliacao-execucao.md">Próxima página ➡️</a></td>
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

- [📋 Planejamento](avaliacao-planejamento.md) 👈
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
