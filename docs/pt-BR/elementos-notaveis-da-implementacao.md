# `Lusiad` – Elementos notáveis da implementação

[🇺🇸 English](../en/notable-implementation-elements.md) · **🇧🇷 Português (Brasil)**

### Nesta página

> [1. Movimentar um método](#-1-movimentar-um-método)<br>
> [2. Registrar uma versão](#-2-registrar-uma-versão)<br>
> [3. Abrir o antes e depois](#-3-abrir-o-antes-e-depois)<br>
> [4. Alcance](#-4-alcance)<br>
> [Índice da documentação](#índice-da-documentação)

---

<a name="movimentar-um-método"></a>

## ↕️ 1. Movimentar um método

Considere uma classe em que `encerrar()` aparece depois de `iniciar()`. O usuário seleciona `encerrar()` no modelo e o move para antes de `iniciar()`. A API do plugin recebe a operação, localiza os elementos Java por PSI e aplica a mudança ao arquivo. O código escrito no disco passa a refletir a nova ordem.

O evento persistido possui um `change_type` como `move`, o escopo, a referência ao projeto e à branch e um corpo `req_body`. Em uma revisão recente, `req_body.changeMetadata` contém a ação, o tipo de elemento e os locais `before` e `after`, cada qual podendo carregar caminho, intervalo, espécie, nome e contexto estrutural. Essa estrutura serve à descrição exibida na interface. O corpo da operação e suas imagens do recurso servem à recuperação. A classe [`ChangeMetadata.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeMetadata.java) declara explicitamente que reúne fatos de apresentação e não participa do replay. [`ChangeLogService.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeLogService.java) monta a entrada, e [`ChangeRepository.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/change/ChangeRepository.java) a grava no MySQL.

Os campos exatos da mudança dependem da versão do registro.

<a name="registrar-uma-versão"></a>

## 💾 2. Registrar uma versão

O usuário registra um commit na interface. O frontend coordena o repositório Git do projeto e os eventos pendentes em MySQL. [`git-recording.service.ts`](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) fixa a intenção, verifica os eventos e relaciona o commit criado aos registros. Um commit consolida um estado do projeto, enquanto os eventos permitem consultar operações individuais dentro dessa versão.

<a name="abrir-o-antes-e-depois"></a>

## 🔍 3. Abrir o antes e depois

Ao escolher uma mudança no histórico, a reconstrução parte de um commit de referência e reaplica os eventos até a operação selecionada. [`HistoricalReplay.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/HistoricalReplay.java) trata o replay. A interface pode então mostrar a árvore PSI, o código, o diff Git ou a UML quando disponíveis. O estado anterior e o posterior se referem à operação selecionada, dentro de uma versão e de uma branch definidas.

<a name="alcance"></a>

## 🎯 4. Alcance

O modelo de dados permite distinguir uma mudança em um elemento Java de uma diferença entre linhas de texto. O arraste é uma forma de interação com esse modelo. Outros controles de edição poderiam utilizar os mesmos registros. A edição seletiva de um evento já consolidado é uma possibilidade de pesquisa futura e não faz parte do comportamento demonstrado.

---

<table width="100%">
<tr>
<td align="left"><a href="arquitetura.md">⬅️ Página anterior</a> | Arquitetura</td>
<td align="center"><a href="index.md">1️⃣1️⃣ Elementos notáveis da implementação</a></td>
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
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md) 👈
