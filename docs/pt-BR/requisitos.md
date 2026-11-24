# `Lusiad` – Requisitos

[🇺🇸 English](../en/requirements.md) · **🇧🇷 Português (Brasil)**

**Estado de implementação.** As 20 histórias de usuário (US01–US20) e os seis requisitos não funcionais (RNF01–RNF06) estão implementados.

### Nesta página

> [1. Requisitos funcionais](#-1-requisitos-funcionais)<br>
> [2. Requisitos de qualidade](#-2-requisitos-de-qualidade)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 📋 1. Requisitos funcionais

As histórias descrevem como o desenvolvedor trabalha com um projeto Java no Lusiad. As prioridades MoSCoW distinguem as funcionalidades consideradas essenciais (**MUST**), importantes (**SHOULD**) e desejáveis (**COULD**) no planejamento original.

[1.1 Gerenciamento de projetos](#11-gerenciamento-de-projetos) · [1.2 Tela de modelagem](#12-tela-de-modelagem) · [1.3 Explorador de arquivos](#13-explorador-de-arquivos) · [1.4 Controle de versão](#14-controle-de-versão) · [1.5 Histórico de mudanças](#15-histórico-de-mudanças) · [1.6 Funcionalidades complementares](#16-funcionalidades-complementares)

### 1.1 Gerenciamento de projetos

Um projeto associa um diretório de código Java ao ambiente de modelagem e ao histórico de mudanças. Para retomar o trabalho em uma base de código, o desenvolvedor seleciona o projeto correspondente.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US01 | Listar, adicionar, editar e excluir projetos. | Escolher as bases de código Java para as quais iniciar a modelagem e o rastreamento de mudanças. | MUST |

### 1.2 Tela de modelagem

Na tela de modelagem, um método aparece dentro da classe que o declara, e as instruções ficam aninhadas no corpo do método. Essa hierarquia dá contexto à edição. Mover uma instrução altera sua posição no código, enquanto editar uma de suas propriedades modifica a própria instrução selecionada.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US02 | Visualizar o código Java como blocos interativos e aninhados. | Reconhecer quais elementos pertencem a uma classe, a um método ou a outra estrutura do programa. | MUST |
| US03 | Inserir componentes de código na tela de modelagem. | Construir ou ampliar a lógica do programa visualmente. | MUST |
| US04 | Mover e excluir blocos diretamente na tela de modelagem. | Reorganizar a estrutura do programa e seu fluxo de execução. | MUST |
| US05 | Editar o conteúdo e as propriedades do bloco selecionado. | Alterar os valores ou a lógica daquele componente. | MUST |
| US06 | Visualizar o caminho do componente selecionado na hierarquia do modelo. | Localizar o componente na árvore PSI e identificar os elementos que o contêm. | COULD |

### 1.3 Explorador de arquivos

O explorador e a tela de modelagem apresentam dois níveis do mesmo projeto. Ao abrir `Exemplo.java` na árvore de arquivos, o desenvolvedor passa da localização do arquivo no projeto para as classes e os métodos declarados nele.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US07 | Navegar pela árvore de arquivos do projeto. | Localizar um arquivo Java e abrir seu modelo. | MUST |
| US08 | Criar, renomear, mover e excluir arquivos. | Gerenciar os arquivos de código-fonte pelo próprio Lusiad. | SHOULD |
| US09 | Criar, renomear, mover e excluir diretórios. | Organizar a estrutura de pastas do projeto. | SHOULD |

### 1.4 Controle de versão

O desenvolvedor pode experimentar outra implementação em uma branch e revisar as edições em conjunto antes de criar o commit. Se essa versão se tornar um marco do projeto, uma tag permite dar ao commit um nome fácil de localizar no histórico.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US10 | Visualizar commits e branches em um grafo. | Acompanhar o histórico e o estado atual de cada linha de desenvolvimento. | MUST |
| US11 | Criar uma branch a partir de uma base escolhida e integrar branches. | Desenvolver uma mudança de forma isolada e incorporá-la à linha principal. | MUST |
| US12 | Revisar os componentes criados, modificados ou excluídos e criar um commit com título e descrição. | Registrar o estado do modelo e documentar o que mudou naquela versão. | MUST |
| US13 | Restaurar o projeto para uma versão escolhida no histórico. | Recuperar um estado anterior do modelo ou desfazer mudanças indesejadas. | SHOULD |
| US14 | Adicionar, listar e excluir tags associadas a commits. | Marcar etapas do projeto e localizar rapidamente versões importantes ou estáveis. | COULD |

### 1.5 Histórico de mudanças

Um único commit pode reunir várias edições na mesma classe. Se o desenvolvedor mover um método e depois editar seu corpo, poderá abrir apenas a movimentação no histórico e verificar onde o método estava imediatamente antes e depois daquela operação.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US15 | Consultar no histórico as operações individuais, incluindo adições, edições e exclusões de blocos, arquivos e diretórios. | Identificar a operação que produziu cada mudança e o elemento afetado. | MUST |
| US16 | Expandir uma mudança individual e comparar os estados imediatamente anterior e posterior. | Examinar o efeito daquela operação sobre a estrutura do modelo. | MUST |
| US17 | Percorrer, em ordem de registro, as mudanças de um commit. | Entender a sequência de ações que produziu aquela versão. | SHOULD |
| US18 | Visualizar mudanças em diagramas UML, incluindo os de classes e de pacotes. | Examinar a evolução da estrutura do projeto em diferentes níveis de abstração. | COULD |

### 1.6 Funcionalidades complementares

Para examinar mudanças distribuídas por vários commits, o desenvolvedor pode selecionar diretamente duas versões, como aquela em que uma classe foi criada e outra em que seus métodos foram reorganizados. A sincronização atende a outra situação comum, quando um arquivo Java é editado na IDE e o desenvolvedor volta ao Lusiad para continuar trabalhando no modelo.

| ID | Ação do desenvolvedor | Finalidade | Prioridade |
| --- | --- | --- | --- |
| US19 | Selecionar quaisquer duas versões do projeto e compará-las diretamente. | Examinar as diferenças entre os estados escolhidos sem percorrer as edições intermediárias. | COULD |
| US20 | Sincronizar o ambiente de modelagem após alterações no código-fonte realizadas fora do Lusiad. | Atualizar o modelo para que corresponda ao código-fonte em disco. | COULD |

## 🎯 2. Requisitos de qualidade

A movimentação de um bloco ilustra como esses requisitos se relacionam. Assim que a edição termina, o desenvolvedor precisa enxergar onde o bloco ficou. Mais tarde, ao consultar a movimentação no histórico, deve encontrar um registro coerente com a alteração feita no arquivo Java.

| ID | Atributo de qualidade | Requisito |
| --- | --- | --- |
| RNF01 | Usabilidade | O desenvolvedor deve conseguir compreender e usar as principais funcionalidades sem treinamento prévio. |
| RNF02 | Usabilidade | A interface deve fornecer retorno visual imediato em operações no modelo, como inserção, movimentação e exclusão de blocos. |
| RNF03 | Usabilidade | A interface deve usar cores, ícones e textos de forma consistente para favorecer a acessibilidade. |
| RNF04 | Desempenho | Cada funcionalidade deve carregar em até cinco segundos. |
| RNF05 | Confiabilidade | O histórico deve preservar integralmente cada operação realizada e registrá-la corretamente. |
| RNF06 | Confiabilidade | Após cada operação, o modelo exibido no Lusiad deve corresponder ao código-fonte Java armazenado em disco. |

---

<table width="100%">
<tr>
<td align="left"><a href="projeto.md">⬅️ Página anterior</a> | Projeto</td>
<td align="center"><a href="index.md">7️⃣ Requisitos</a></td>
<td align="right">Prototipação | <a href="prototipacao.md">Próxima página ➡️</a></td>
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

- [📋 Requisitos](requisitos.md) 👈
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)
