# Sincronização de mudanças externas — instalação e teste manual

## Banco

Faça um backup do banco existente. Aplique **manualmente**, uma única vez, o arquivo
`../../lusiad-backend/db/migrations/lusiad-sync-migration.sql` no banco `lusiad`.
Ele amplia o enum de `changes` e cria três tabelas sem apagar projetos, commits ou mudanças.
O arquivo `../../lusiad-backend/db/lusiad.sql` do backend é um dump completo que contém comandos de recriação:
**não o execute sobre o banco de trabalho**.

## Inicialização

Inicie o plugin/backend IntelliJ e o frontend com `yarn dev`. Use primeiro um projeto
descartável, com arquivos de exemplo e pelo menos um commit Git. Abra esse projeto, que já tenha
um commit Git. A primeira visita após aplicar a migração grava como referência o estado
atual dos arquivos não ocultos do projeto. Por isso, faça a primeira visita antes de editar
externamente. Projetos sem primeiro commit mostram uma mensagem e ainda não iniciam a
sincronização.

## Roteiro

1. Abra um projeto no Lusiad, espere a primeira verificação e abra a gaveta
   **Sincronizar mudanças**. Ela deve dizer que não há mudanças externas.
2. Com um `.java` aberto no Lusiad, altere e **salve** esse arquivo no editor nativo do
   IntelliJ. Em até quatro segundos, o Lusiad deve bloquear a edição e listar o arquivo.
   O botão da gaveta deve mostrar a contagem em um chip. O botão de atualização força uma
   nova verificação. Clique no nome do arquivo: o canvas mostra a prévia textual com linhas
   anteriores e posteriores. A caixa de seleção continua independente desse clique.
3. Selecione o arquivo e clique **Aplicar seleção**. O conteúdo do disco permanece e a
   gaveta passa a exigir um commit. Ainda não é possível editar pelo Lusiad.
4. Abra o histórico e selecione **Mudanças externas**. A visualização deve listar os
   arquivos afetados e, no `.java`, apenas as linhas adicionadas e excluídas.
5. Faça um commit. O bloqueio deve desaparecer. Confira o mesmo bundle no histórico do
   commit. Se o Git não detectar diferença líquida, o commit ainda registra o marco.
6. Altere dois arquivos via outro editor ou Explorador (inclua um não Java), salve-os e
   atualize. Desmarque um e clique **Aplicar seleção**: o marcado mantém o novo conteúdo;
   o desmarcado volta ao último estado conhecido pelo Lusiad. Somente o marcado integra
   o bundle. Arquivos não Java aparecem na lista histórica, sem diff de linhas.
7. Altere e salve um arquivo; clique **Rejeitar tudo**. O conteúdo anterior deve voltar,
   o bloqueio deve cessar, o chip deve mostrar **0** em verde e nenhum commit deve ser exigido.
8. Aceite uma mudança, altere o mesmo arquivo mais uma vez fora do Lusiad, espere a nova
   detecção e revise novamente. O bundle continua único. Antes de confirmar, uma revisão
   que contenha versão antiga deve ser recusada e pedir atualização.
9. Aceite uma mudança e, sem novas mudanças pendentes, clique **Cancelar mudanças aceitas**.
   O arquivo retorna ao conteúdo original e o bundle pendente desaparece.

Uma falha da migração/banco impede a primeira verificação e mantém o editor do Lusiad
bloqueado; a mensagem aparece na gaveta. Nenhum dado do banco de trabalho é alterado por
testes automatizados deste recurso.
