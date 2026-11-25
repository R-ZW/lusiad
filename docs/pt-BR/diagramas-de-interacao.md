# `Lusiad` – Diagramas de interação

[🇺🇸 English](../en/interaction-diagrams.md) · **🇧🇷 Português (Brasil)**

Estes diagramas de sequência acompanham cada operação desde o navegador até o componente responsável por cada etapa. `Next.js` representa as server actions, as rotas HTTP e seus serviços. `Plugin` representa a API local e os serviços do IntelliJ. A [referência da API](referencia-da-api.md) detalha os campos e códigos de resposta, e o [modelo de dados](modelo-de-dados.md) descreve os identificadores e registros persistidos nos fluxos.

### Nesta página

> [1. Abrir um projeto e carregar seu modelo](#abrir-um-projeto-e-carregar-seu-modelo)<br>
> [2. Revisar e aplicar uma edição de código](#revisar-e-aplicar-uma-edição-de-código)<br>
> [3. Registrar uma versão Git](#registrar-uma-versão-git)<br>
> [4. Abrir uma alteração no histórico](#abrir-uma-alteração-no-histórico)<br>
> [5. Comparar duas referências](#comparar-duas-referências)<br>
> [6. Revisar alterações externas](#revisar-alterações-externas)<br>
> [7. Desfazer ou refazer uma edição](#desfazer-ou-refazer-uma-edição)<br>
> [8. Restaurar um estado do projeto](#restaurar-um-estado-do-projeto)<br>
> [9. Compilar e executar Java](#compilar-e-executar-java)<br>
> [Índice da documentação](#índice-da-documentação)

---

## Abrir um projeto e carregar seu modelo

A página do projeto carrega o cadastro e a árvore de arquivos. Ao selecionar um arquivo Java em edição, o navegador solicita sua árvore PSI por meio do plugin. O servidor pede ao plugin que reconcilie as edições preparadas antes de ler o arquivo atual. A `revision` devolvida identifica o texto ao qual os offsets do modelo se referem. [Página do projeto](../../lusiad-frontend/src/app/project/%5BprojectId%5D/page.tsx) · [Controlador do modelo](../../lusiad-frontend/src/controllers/model-editor/model-editor.controller.ts) · [Serviço de leitura PSI](../../lusiad-frontend/src/lib/services/model-editor/psi-api.service.ts)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant DB as MySQL
    participant Files as Arquivos do projeto
    participant IDE as Plugin
    Web->>Next: Abrir projeto cadastrado
    Next->>DB: Resolver ID, caminhos e nome do projeto
    DB-->>Next: Cadastro do projeto
    Next->>Files: Enumerar diretório de trabalho
    Files-->>Next: Árvore do explorador
    Next-->>Web: Renderizar ambiente com a árvore de arquivos
    Web->>Next: Selecionar arquivo Java em edição
    Next->>IDE: POST /psi/recover
    IDE-->>Next: Resultado da recuperação
    Next->>IDE: POST /psi/read
    IDE->>Files: Atualizar código-fonte no IntelliJ
    IDE-->>Next: Árvore PSI e revisão do código
    Next-->>Web: Renderizar blocos do arquivo selecionado
```

## Revisar e aplicar uma edição de código

Mover um bloco produz um intervalo de origem e um destino. O editor verifica a proposta em memória por meio da análise sintática PSI ou do compilador, conforme as opções do projeto. Quando a proposta segue para aplicação, o controlador verifica a sincronização externa e confere novamente o contexto do compilador, se fornecido. O plugin valida a revisão do código antes de preparar a gravação. [Interações do editor](../../lusiad-frontend/src/components/panels/model-editor/model-editor.interactions.ts) · [Controlador de edição](../../lusiad-frontend/src/controllers/model-editor/model-editor.controller.ts) · [Coordenador de edição](../../lusiad-backend/src/main/java/com/lusiad/backend/service/psi/EditCoordinator.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant IDE as Plugin
    participant Files as Arquivo Java
    participant DB as MySQL
    Web->>Next: Verificar movimentação proposta
    alt Verificação pelo compilador habilitada
        Next->>IDE: POST /java/analyze-edit
    else Revisão sintática PSI
        Next->>IDE: POST /psi/diagnose-edit
    end
    IDE-->>Next: Código proposto e diagnósticos
    Next-->>Web: Resultado da revisão
    opt Proposta segue para aplicação
        Web->>Next: Mover intervalo com expectedHash
        Next->>Next: Conferir sincronização e contexto do compilador, se informado
        Next->>IDE: POST /psi/move
        IDE->>Files: Ler código-fonte atual
        alt Revisão desatualizada
            IDE-->>Next: revision_conflict
            Next-->>Web: Informar conflito
        else Edição altera o texto na revisão atual
            IDE->>DB: Persistir intenção preparada
            IDE->>Files: Gravar e verificar o código planejado
            IDE->>DB: Inserir alteração pendente e confirmar intenção
            IDE-->>Next: Resultado da gravação e ID da alteração
            Next-->>Web: Confirmar edição e recarregar modelo
        end
    end
```

O plugin registra a intenção antes de gravar o arquivo. Depois de verificar a gravação, insere a alteração pendente e marca a intenção como aplicada na mesma transação SQL. Uma edição que preserva o texto pode retornar `noOp` sem criar um evento. Se o processo for interrompido antes da confirmação, a recuperação compara o arquivo com os estados registrados para confirmar, cancelar ou sinalizar a intenção para inspeção. [Coordenação e recuperação de edições](../../lusiad-backend/src/main/java/com/lusiad/backend/service/psi/EditCoordinator.java) · [Confirmação SQL](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/change/EditOperationStore.java)

## Registrar uma versão Git

A ação de commit verifica a branch selecionada e o estado da sincronização externa. O serviço captura os eventos pendentes e prepara uma árvore e um objeto commit Git. Ele registra o plano antes de publicar a referência da branch. A transação SQL que segue vincula o commit aos eventos capturados, atualiza o `commit_id` de cada evento e marca a operação como aplicada. [Controlador de commits](../../lusiad-frontend/src/controllers/commit-menu/commit-menu.controller.ts) · [Serviço de registro Git](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) · [Publicação da referência](../../lusiad-frontend/src/lib/services/commit-menu/git-operation.ts)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant DB as MySQL
    participant Git as Repositório Git
    Web->>Next: Registrar versão com título e descrição
    Next->>DB: Resolver branch e selecionar eventos pendentes
    DB-->>Next: IDs e dados dos eventos
    Next->>Git: Preparar árvore e objeto commit candidatos
    Git-->>Next: Árvore, commit e referência planejados
    Next->>Next: Verificar conteúdo dos eventos e ancestralidade Git
    Next->>DB: Inserir operação Git preparada
    Next->>Git: Publicar a referência da branch
    Git-->>Next: Commit publicado
    Next->>DB: Registrar commit, vincular eventos e confirmar operação
    DB-->>Next: Registro do commit e transação confirmada
    Next-->>Web: Atualizar os históricos de versões e alterações
```

Se a publicação Git tiver ocorrido e a confirmação SQL for interrompida, o plano preparado continua disponível. A operação seguinte sob o bloqueio do projeto primeiro reconcilia os planos em aberto. A publicação confere a referência da branch com o plano, inclusive quando ela já aponta para o commit preparado. [Bloqueio e recuperação de operações Git](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts#L224-L257) · [Verificações na publicação](../../lusiad-frontend/src/lib/services/commit-menu/git-operation.ts#L199-L219)

## Abrir uma alteração no histórico

A ação do histórico resolve a alteração e cria um diretório exclusivo para a prévia. Uma alteração versionada normalmente usa o primeiro pai Git de sua versão como estado de referência. Uma alteração pendente usa o HEAD verificado da branch. Para o commit raiz, o serviço deriva o estado de referência da árvore Git gravada e dos eventos registrados. O plugin reaplica os eventos em ordem até a alteração selecionada. O Next.js confere novamente a identidade, lê as duas árvores e marca a prévia como pronta. [Serviço de prévia](../../lusiad-frontend/src/lib/services/restore/restore.service.ts) · [Preparação do estado de referência](../../lusiad-frontend/src/lib/services/restore/change-archive.service.ts) · [Dados de entrada da reconstrução](../../lusiad-backend/src/main/java/com/lusiad/backend/repository/restore/RestoreRepository.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant DB as MySQL
    participant Git as Repositório Git
    participant IDE as Plugin
    Web->>Next: Inspecionar alteração pelo ID
    Next->>DB: Resolver contexto versionado ou pendente
    DB-->>Next: Identidade do projeto, da versão e do evento
    Next->>Git: Ler estado de referência do contexto
    Git-->>Next: Árvore ou código-fonte arquivado
    alt Alteração versionada
        Next->>IDE: POST /restore/apply com ID do snapshot
    else Alteração pendente
        Next->>IDE: POST /restore/pending com branch e revisão
    end
    IDE->>DB: Ler eventos em ordem até o alvo
    IDE->>IDE: Gravar as árvores do antes e do depois
    IDE-->>Next: Confirmar reexecução para o ID do snapshot
    Next->>DB: Confirmar que a identidade continua atual
    Next->>Next: Ler as duas árvores e marcar prévia como pronta
    Next-->>Web: Publicar prévia de leitura com ID do snapshot
    opt Abrir um arquivo Java na prévia
        Web->>Next: Selecionar um arquivo do antes ou do depois
        Next->>IDE: POST /psi/parse com o texto do snapshot
        IDE-->>Next: Árvore PSI serializada
        Next-->>Web: Renderizar modelo histórico
    end
```

A árvore anterior é gravada imediatamente antes de o evento alvo ser aplicado. Nesse ponto, o laço de reexecução copia a árvore de trabalho da prévia para `working-copy-prev`. [Implementação da reexecução](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/HistoricalReplay.java#L35-L42) · [Leitura do modelo histórico](../../lusiad-frontend/src/lib/services/restore/snapshot-reader.ts)

```java
if (row.id == target)
  SnapshotFiles.reset(
      temp, working, ContainedPaths.resolve(temp, "working-copy-prev", false));
```

## Comparar duas referências

Cada lado da comparação é resolvido de forma independente para um conjunto de arquivos Java. Commit, branch, tag Git e SHA podem ser resolvidos para um commit Git. Uma tag do histórico do Lusiad aponta para um commit ou uma alteração registrados. Quando a referência seleciona uma alteração versionada, o servidor reconstrói seu estado posterior em um diretório temporário. A comparação percorre a união dos caminhos Java dos dois lados. Quando o arquivo existe dos dois lados e o texto difere, o serviço compara os tokens PSI antes de incluir o diff Git. [Resolução das referências](../../lusiad-frontend/src/lib/services/model-comparison/comparison-reference.model.ts) · [Serviço de comparação](../../lusiad-frontend/src/lib/services/model-comparison/model-comparison.service.ts) · [Snapshots e diffs Git](../../lusiad-frontend/src/lib/services/model-comparison/git-snapshot.ts)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant DB as MySQL
    participant Git as Git CLI
    participant IDE as Plugin
    Web->>Next: Comparar as referências base e alvo
    Next->>DB: Resolver IDs registrados e tags do histórico quando necessário
    loop Cada lado na ordem da comparação
        alt Referência Git
            Next->>Git: Resolver commit e ler o código Java
            Git-->>Next: Arquivos Java daquele commit
        else Alteração versionada
            Next->>Git: Preparar estado de referência da reconstrução
            Next->>IDE: POST /restore/apply
            IDE-->>Next: Estado posterior reconstruído
        end
    end
    opt Texto diferente nos dois lados de um caminho
        Next->>IDE: POST /psi/parse para os dois textos
        IDE-->>Next: Árvores PSI para comparar os tokens
    end
    Next->>Git: Comparar os textos selecionados com git diff --no-index
    Next-->>Web: Arquivos Java alterados com textos e diffs
```

Uma referência vazia fornece um snapshot vazio. Arquivos adicionados ou removidos podem seguir diretamente para a comparação textual. As árvores PSI são comparadas quando ambos os lados têm texto diferente no mesmo caminho. [Serviço de comparação](../../lusiad-frontend/src/lib/services/model-comparison/model-comparison.service.ts)

## Revisar alterações externas

A verificação compara o projeto em disco com o estado de referência da sincronização. O usuário escolhe quais diferenças manter. A server action compara as revisões enviadas com um snapshot atualizado e prepara um plano. As alterações aceitas em relação ao estado de referência podem ser agrupadas em um `external_bundle` pendente, e as diferenças rejeitadas são reconciliadas em disco. [Serviço de sincronização](../../lusiad-frontend/src/lib/services/external-sync/external-sync.service.ts) · [Verificações de seleção e revisão](../../lusiad-frontend/src/lib/services/external-sync/sync-plan.ts)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant Files as Arquivos do projeto
    participant DB as MySQL
    Web->>Next: Verificar alterações externas
    Next->>DB: Carregar estado de referência da sincronização
    Next->>Files: Capturar caminhos e conteúdo atuais
    Next-->>Web: Diferenças com suas revisões
    Web->>Next: Enviar decisões de manter ou rejeitar
    Next->>Files: Capturar novamente o estado em disco
    alt Caminho ou revisão mudou
        Next-->>Web: sync_revision_conflict
    else Seleção corresponde às diferenças atuais
        Next->>DB: Persistir operação de sincronização preparada
        Next->>Files: Reconciliar o disco com a seleção revisada
        Next->>DB: Atualizar estado de referência, agrupamento e recibo
        Next-->>Web: Retornar o estado atual da sincronização
    end
```

A verificação pode recuperar operações em aberto antes de devolver o resultado. A confirmação SQL grava o estado de referência revisado e seu agrupamento juntos. O agrupamento mantido pode então ser incluído em uma versão registrada. [Registro de sincronização](../../lusiad-frontend/src/lib/services/external-sync/external-sync.service.ts) · [Vínculo do agrupamento no commit](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts)

## Desfazer ou refazer uma edição

O navegador consulta o estado de desfazer e monta um cursor com `direction`, `epoch`, `revision` e `requestId`. O plugin gera uma prévia dos recursos afetados. O navegador pode solicitar verificação sintática ou do compilador antes de aplicar a proposta. A alteração aplicada é registrada pelo coordenador de edição e atualiza o estado de desfazer e refazer. [Controles de desfazer](../../lusiad-frontend/src/components/panels/model-editor/undo-controls.tsx) · [Serviço Next.js](../../lusiad-frontend/src/lib/services/undo/undo.service.ts) · [Serviço do plugin](../../lusiad-backend/src/main/java/com/lusiad/backend/service/undo/UndoService.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant IDE as Plugin
    participant Files as Arquivos do projeto
    participant DB as MySQL
    Web->>Next: Solicitar estado e prévia de desfazer
    Next->>IDE: Encaminhar ações de estado e prévia
    IDE-->>Next: Estado do cursor e recursos propostos
    Next-->>Web: Apresentar a proposta de desfazer ou refazer
    opt Proposta precisa de análise
        Web->>Next: Analisar proposta
        Next->>IDE: POST /undo/analyze
        IDE-->>Next: Diagnósticos
        Next-->>Web: Resultado da análise
    end
    Web->>Next: Aplicar cursor confirmado
    Next->>IDE: POST /undo/apply
    IDE->>IDE: Conferir cursor e recursos atuais
    IDE->>DB: Preparar edição compensatória
    IDE->>Files: Aplicar imagem de recursos verificada
    IDE->>DB: Confirmar alteração e recibo
    alt Aplicação confirmada na resposta
        IDE-->>Next: Resultado e estado da operação
        Next-->>Web: Atualizar editor e histórico
    else Cliente não consegue confirmar a aplicação
        Web->>Next: Consultar recibo com o mesmo ID
        Next->>IDE: POST /undo/receipt
        IDE->>DB: Resolver recibo confirmado
        IDE-->>Next: Recibo ou falha na consulta
        Next-->>Web: Retornar o resultado da consulta
    end
```

A recuperação do cliente consulta o recibo com o mesmo ID de requisição. Se a consulta falhar, o cliente apresenta o erro original. [`undo-client.ts`](../../lusiad-frontend/src/lib/services/undo/undo-client.ts#L13-L20)

```typescript
export async function undoApply(projectId: number, cursor: UndoCursor, contextRevision?: string) {
  try { return requireUndoResult(await call(projectId, 'apply', cursor, false, contextRevision), 'Undo/redo', cursor) }
  catch (original) {
    // A lost HTTP/SQL acknowledgement does not permit a second mutation. Query only its same-id receipt.
    try { return requireUndoReceipt(await call(projectId, 'receipt', cursor), 'Undo/redo recovery', cursor.requestId) }
    catch { throw original }
  }
}
```

## Restaurar um estado do projeto

| Operação | Efeito no projeto e no histórico |
| --- | --- |
| Inspecionar um estado histórico | Cria árvores isoladas do antes e do depois para a prévia. |
| Reverter alterações pendentes | Atualiza os arquivos em edição e remove as alterações pendentes posteriores ao ponto selecionado. A branch versionada permanece no mesmo HEAD. |
| Restaurar um estado versionado | Grava a árvore restaurada como um novo filho do HEAD Git atual e registra sua origem no histórico. |

### Reverter alterações pendentes

O Next.js prepara um snapshot para o evento pendente selecionado. O plugin retorna as alterações, caminhos e tags afetados pela reversão, além de uma `selectionRevision`. Ao receber a confirmação, o plugin compara a revisão com o plano atual, registra os recursos afetados, aplica o estado alvo e confirma a atualização do histórico. Descartar todas as pendências usa o HEAD versionado e verificado como alvo virtual. [Serviço de reversão de pendências](../../lusiad-frontend/src/lib/services/restore/pending-rewind.service.ts) · [Coordenador de reversão no plugin](../../lusiad-backend/src/main/java/com/lusiad/backend/service/restore/PendingRewindService.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant IDE as Plugin
    participant Files as Arquivos do projeto
    participant DB as MySQL
    Web->>Next: Solicitar prévia de reversão até um estado pendente
    Next->>Next: Preparar snapshot do estado selecionado
    Next->>IDE: POST /restore/rewind/preview com identidade do snapshot
    IDE-->>Next: Alterações, caminhos, tags e revisão da seleção
    Next-->>Web: Mostrar impacto antes da confirmação
    Web->>Next: Confirmar reversão
    Next->>IDE: POST /restore/rewind/apply com ID e revisão
    IDE->>DB: Reverificar seleção pendente e persistir intenção preparada
    IDE->>Files: Aplicar imagem de recursos do estado alvo
    IDE->>DB: Remover pendências posteriores e confirmar intenção
    IDE-->>Next: Reversão confirmada
    Next-->>Web: Recarregar árvore de trabalho e histórico pendente
```

### Restaurar um estado versionado como nova versão

Restaurar um commit usa sua árvore Git. Restaurar o estado posterior a uma alteração versionada usa o snapshot reconstruído. A prévia captura a árvore alvo, a branch e o HEAD atual. Na confirmação, o Next.js verifica esses valores novamente, pede ao plugin que confira os documentos não salvos no IntelliJ e publica o commit de restauração. O plugin atualiza a visão de arquivos da IDE, e a transação SQL registra a versão e sua origem. [Prévia e confirmação de restauração](../../lusiad-frontend/src/lib/services/restore/commit-restoration.service.ts) · [Registro Git da restauração](../../lusiad-frontend/src/lib/services/commit-menu/git-recording.service.ts) · [Verificação e atualização na IDE](../../lusiad-backend/src/main/java/com/lusiad/backend/handler/restore/RestoreHandlers.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant Git as Repositório Git
    participant IDE as Plugin
    participant DB as MySQL
    Web->>Next: Solicitar prévia a partir de commit ou alteração versionada
    Next->>Git: Resolver HEAD atual e árvore alvo
    Next-->>Web: Mostrar arquivos afetados e revisão da prévia
    Web->>Next: Confirmar restauração com ID de requisição
    Next->>Next: Verificar revisão, branch, HEAD e alvo
    Next->>DB: Persistir plano de restauração preparado
    Next->>IDE: POST /restore/commit/check
    IDE-->>Next: Documentos em edição verificados
    Next->>Git: Instalar árvore restaurada e publicar novo commit
    Next->>IDE: POST /restore/commit/refresh
    IDE-->>Next: Atualização solicitada
    Next->>DB: Registrar commit e origem da restauração
    Next-->>Web: Atualizar histórico com a versão restaurada
```

## Compilar e executar Java

O navegador lista as classes principais pela rota de execução. A lista retorna uma revisão do contexto para o código salvo e a configuração Java. Ao iniciar a execução, a interface envia a revisão de volta com a classe selecionada. O plugin compila e executa o programa em segundo plano. O navegador consulta o estado da última execução do projeto e pode interrompê-la pelo ID devolvido. [Controles de execução](../../lusiad-frontend/src/components/panels/model-editor/java-run-controls.tsx) · [Rota Next.js](../../lusiad-frontend/src/app/api/lusiad/run/route.ts) · [Serviço de execução Java](../../lusiad-backend/src/main/java/com/lusiad/backend/service/run/JavaRunService.java)

```mermaid
sequenceDiagram
    participant Web as Navegador
    participant Next as Next.js
    participant IDE as Plugin
    participant JDK as JDK do projeto
    Web->>Next: Listar classes principais
    Next->>IDE: POST /run/list
    IDE-->>Next: Classes principais e revisão do contexto
    Next-->>Web: Mostrar opções de execução
    Web->>Next: Iniciar a classe selecionada
    Next->>IDE: POST /run/start com revisão do contexto
    IDE-->>Next: ID da execução e estado inicial
    Next-->>Web: Abrir saída de execução
    par Execução em segundo plano
        IDE->>JDK: Compilar o código capturado com javac
        opt Compilação bem-sucedida
            IDE->>JDK: Executar a classe selecionada com java
        end
    and Consultas do navegador
        loop Enquanto prepara, compila ou executa
            Web->>Next: Consultar estado da execução
            Next->>IDE: POST /run/status
            IDE-->>Next: Estado, saída e eventual código de término
            Next-->>Web: Atualizar console
        end
    end
```

---

<table width="100%">
<tr>
<td align="left"><a href="referencia-da-api.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">1️⃣4️⃣ Diagramas de interação</a></td>
<td align="right"><a href="decisoes-de-projeto.md">Próxima página ➡️</a></td>
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
- [🔀 Diagramas de interação](diagramas-de-interacao.md) 👈
- [🧭 Decisões de projeto](decisoes-de-projeto.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)

**[📊 Avaliação](avaliacao.md)**

- [📋 Planejamento](avaliacao-planejamento.md)
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
