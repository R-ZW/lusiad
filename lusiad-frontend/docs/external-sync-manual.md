# Sincronização de mudanças externas — verificação manual

## Banco

Prepare um banco vazio para a verificação com o [esquema completo](../../lusiad-backend/db/lusiad.sql), que já inclui as tabelas de sincronização e seu registro de operações. Em uma instalação existente, faça backup e confira quais [migrações de banco](../../lusiad-backend/db/migrations/) são aplicáveis ao esquema instalado. A migração de sincronização e a de registro das operações são arquivos distintos. [Guia de instalação](../../docs/pt-BR/instalacao.md)

## Inicialização

Inicie o plugin do IntelliJ e o frontend com `yarn dev`. Cadastre uma pasta descartável com arquivos Java e inicialize o repositório pelo painel **Commit**. A primeira verificação de um projeto sem base de sincronização usa o último commit registrado no Lusiad para a branch selecionada e incorpora as operações pendentes registradas. Em seguida, compara essa base com os arquivos do disco. Um projeto sem primeiro commit ainda precisa da inicialização do Git. [Serviço de sincronização](../src/lib/services/external-sync/external-sync.service.ts)

## Roteiro

1. Abra **Sincronização externa** e atualize. Se a pasta continua no estado da versão inicial, o painel deve indicar que não há mudanças externas.
2. Com um `.java` aberto no Lusiad, altere e **salve** esse arquivo no editor nativo do
   IntelliJ. Aguarde a verificação periódica ou use **Atualizar**. O Lusiad deve bloquear a edição e listar o arquivo.
   O ícone do painel deve exibir a contagem. Clique no nome do arquivo para abrir no canvas
   a prévia textual com os estados anterior e posterior. A caixa de seleção continua
   independente desse clique.
3. Selecione o arquivo e clique **Aplicar seleção**. O conteúdo do disco permanece e a
   gaveta passa a exigir um commit. Ainda não é possível editar pelo Lusiad.
4. Faça um commit. O bloqueio deve desaparecer. Abra o lote **Mudanças externas** no histórico do commit e confira os arquivos e a prévia das linhas alteradas no `.java`. Se o Git não detectar diferença líquida, o commit ainda registra o marco.
5. Altere dois arquivos via outro editor ou Explorador (inclua um não Java), salve-os e
   atualize. Desmarque um e clique **Aplicar seleção**: o marcado mantém o novo conteúdo;
   o desmarcado volta ao último estado conhecido pelo Lusiad. Somente o marcado integra
   o bundle. Arquivos não Java aparecem na lista histórica, sem diff de linhas.
6. Altere e salve um arquivo e clique em **Rejeitar tudo**. O conteúdo anterior deve voltar,
   o bloqueio deve cessar, o chip deve mostrar **0** em verde e nenhum commit deve ser exigido.
7. Aceite uma mudança, altere o mesmo arquivo mais uma vez fora do Lusiad, espere a nova
   detecção e revise novamente. O bundle continua único. Antes de confirmar, uma revisão
   que contenha versão antiga deve ser recusada e pedir atualização.
8. Aceite uma mudança e, sem novas mudanças pendentes, clique em **Cancelar mudanças aceitas**.
   O arquivo retorna ao conteúdo original e o bundle pendente desaparece.

Se o painel indicar que a base está indisponível, confira se há um commit registrado no Lusiad e se as tabelas de sincronização estão presentes. Para instruções de uso, consulte o [manual](../../docs/pt-BR/manual.md#sincronizacao). A verificação automatizada do serviço integra `yarn test:git:db`, que usa um MySQL descartável e substitui a chamada de recuperação ao plugin por um stub. [Teste de sincronização](../scripts/check-external-sync.mjs) · [Teste de registro Git](../scripts/test-git-recording.mjs)
