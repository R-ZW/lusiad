# Implementação do rastreamento

## Nesta página

- [Movimentar um método](#movimentar-um-método)
- [Registrar uma versão](#registrar-uma-versão)
- [Abrir o antes e depois](#abrir-o-antes-e-depois)
- [Alcance](#alcance)

## Movimentar um método

Considere uma classe em que `encerrar()` aparece depois de `iniciar()`. O usuário seleciona `encerrar()` no modelo e o move para antes de `iniciar()`. A API do plugin recebe a operação, localiza os elementos Java por PSI e aplica a mudança ao arquivo. O código escrito no disco passa a refletir a nova ordem.

O evento persistido possui um `change_type` como `move`, o escopo, a referência ao projeto e à branch e um corpo `req_body`. Em uma revisão recente, `req_body.changeMetadata` contém a ação, o tipo de elemento e os locais `before` e `after`, cada qual podendo carregar caminho, intervalo, espécie, nome e contexto estrutural. Essa estrutura serve à descrição exibida na interface. O corpo da operação e suas imagens do recurso servem à recuperação. A classe [`ChangeMetadata.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeMetadata.java) declara explicitamente que reúne fatos de apresentação e não participa do replay. [`ChangeLogService.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/change/ChangeLogService.java) monta a entrada, e [`ChangeRepository.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/change/ChangeRepository.java) a grava no MySQL.

Os campos exatos da mudança dependem da versão do registro. Para inspecionar o exemplo aplicado na avaliação, consulte o [cenário](../../evaluation/scenario/README.md). O cenário contém uma movimentação no histórico preparado.

## Registrar uma versão

O usuário registra um commit na interface. O frontend coordena o repositório Git do projeto e os eventos pendentes em MySQL. [`git-recording.service.ts`](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) fixa a intenção, verifica os eventos e relaciona o commit criado aos registros. Um commit consolida um estado do projeto, enquanto os eventos permitem consultar operações individuais dentro dessa versão.

## Abrir o antes e depois

Ao escolher uma mudança no histórico, a reconstrução parte de um commit de referência e reaplica os eventos até a operação selecionada. [`HistoricalReplay.java`](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/HistoricalReplay.java) trata o replay. A interface pode então mostrar a árvore PSI, o código, o diff Git ou a UML quando disponíveis. O estado anterior e o posterior se referem à operação selecionada, dentro de uma versão e de uma branch definidas.

## Alcance

O modelo de dados permite distinguir uma mudança em um elemento Java de uma diferença entre linhas de texto. O arraste é uma forma de interação com esse modelo. Outros controles de edição poderiam utilizar os mesmos registros. A edição seletiva de um evento já consolidado é uma possibilidade de pesquisa futura e não faz parte do comportamento demonstrado.

---

[← Arquitetura](arquitetura.md) · [Índice](index.md) · [Prototipação →](prototipacao.md) · [English](../en/implementation.md)
