type Text = { 'pt-BR': string; en: string }
export interface TutorialStep { id: string; targets: string[]; title: Text; body: Text }
interface Tutorial { title: Text; root: string; steps: TutorialStep[] }
const el = (id: string) => `[data-testid="${id}"]`
const text = (pt: string, en: string): Text => ({ 'pt-BR': pt, en })
function step(id: string, targets: string[], ptTitle: string, enTitle: string, pt: string, en: string): TutorialStep {
  return { id, targets, title: text(ptTitle, enTitle), body: text(pt, en) }
}

export const tutorials = {
  projects: {
    title: text('Projetos', 'Projects'), root: el('projects-page'), steps: [
      step('create', [el('project-create-open')], 'Cadastre uma pasta', 'Register a folder',
        'Cadastre a pasta do seu código com nome e descrição. Você pode digitar o caminho ou escolher a pasta pela janela do sistema.',
        'Register your code folder with a name and description. Enter its path or choose it using the system folder picker.'),
      step('search', [el('projects-search')], 'Encontre seu projeto', 'Find your project',
        'Busque por nome, descrição ou caminho. A lista mostra os cadastros do Lusiad, que são independentes do projeto aberto no IntelliJ.',
        'Search by name, description or path. Lusiad registrations are independent of the project open in IntelliJ.'),
      step('select', [el('project-card'), el('projects-list-scroll')], 'Selecione antes de abrir', 'Select before opening',
        'Clique em um projeto para fixar suas informações à direita. Selecionar não abre o ambiente de modelagem.',
        'Click a project to pin its information on the right. Selecting it does not open the modeling workspace.'),
      step('summary', [el('project-summary-stats'), el('project-summary-region')], 'Resumo e ações', 'Summary and actions',
        'Com um projeto selecionado, consulte commits, mudanças, pendências e tags. Os ícones permitem editar o cadastro, mover ou reencontrar a pasta e remover o projeto. Remover cadastro e apagar código são ações diferentes, com confirmação.',
        'Select a project to see commits, changes, pending work and tags. The action icons let you edit its registration, move or locate its folder, or remove it. Removing a registration and deleting code are separate actions with confirmation.'),
      step('uml', [el('project-summary-uml'), el('project-summary-region')], 'Explore a estrutura', 'Explore the structure',
        'A UML mostra o código salvo do projeto selecionado, somente para leitura. Use zoom e navegação no diagrama. Atualizar recarrega o resumo e a estrutura.',
        'The read-only UML shows the selected project’s saved code. Zoom and navigate the diagram. Refresh reloads the summary and structure.'),
      step('open', [el('project-open')], 'Abra o ambiente', 'Open the workspace',
        'Selecione um projeto e use Abrir projeto para trabalhar com arquivos, componentes e histórico. Você pode repetir este tutorial pelo botão de ajuda.',
        'Select a project and use Open project to work with files, components and history. You can repeat this tutorial using the help button.'),
    ],
  },
  workspace: {
    title: text('Ambiente de modelagem', 'Modeling workspace'), root: el('project-workspace'), steps: [
      step('explorer', ['[data-drawer-id="file-explorer"][data-testid="drawer-toggle"]'], 'Arquivos do projeto', 'Project files',
        'Abra ou recolha o explorador pelo botão lateral. Crie arquivos Java e pastas, abra arquivos e organize seus caminhos. Cada menu possui seu próprio tutorial.',
        'Use this sidebar button to open or collapse the explorer. Create Java files and folders, open files and organize paths. Each panel has its own tutorial.'),
      step('sync', ['[data-drawer-id="external-sync"][data-testid="drawer-toggle"]'], 'Alterações externas', 'External changes',
        'Mudanças feitas fora do Lusiad passam pela sincronização. Revise o que deseja aceitar ou rejeitar. Após aceitar, faça o commit obrigatório antes de continuar editando.',
        'Changes made outside Lusiad go through synchronization. Review what to accept or reject. After accepting, complete the required commit before editing further.'),
      step('tabs', ['[role="tablist"]'], 'Arquivos e prévias', 'Files and previews',
        'As abas alternam entre arquivos abertos e prévias de mudanças. Prévias históricas são isoladas e não substituem o código atual.',
        'Tabs switch between open files and change previews. Historical previews are isolated and do not replace the current code.'),
      step('canvas', [el('model-canvas'), el('model-editor')], 'Modele o código', 'Model your code',
        'Abra um arquivo Java pelo explorador para ver seus componentes. Selecione um bloco para inspecionar e editar. As linhas e áreas de inserção orientam a posição ao arrastar componentes.',
        'Open a Java file from the explorer to see its components. Select a block to inspect and edit it. Lines and insertion areas guide placement when dragging components.'),
      step('library', [el('library-toggle')], 'Biblioteca de componentes', 'Component library',
        'Abra a biblioteca para buscar componentes Java e fixar favoritos. Arraste um componente para uma posição compatível no modelo e configure sua criação no formulário.',
        'Open the library to search Java components and pin favorites. Drag a component to a compatible position in the model, then configure it in the creation form.'),
      step('properties', [el('properties-toggle')], 'Atributos e código', 'Attributes and code',
        'Após selecionar um componente, abra suas propriedades. Edite por atributos ou diretamente no código, confira o rascunho e salve ou descarte. A confirmação informa problemas detectados.',
        'Select a component and open its properties. Edit attributes or code, review the draft, then save or discard it. Confirmation reports detected problems.'),
      step('history', ['[data-drawer-id="change-history"][data-testid="drawer-toggle"]'], 'Histórico de mudanças', 'Change history',
        'Consulte pendências e commits, abra Before/After e expanda uma mudança para explorar código, foco e UML. Tags ajudam a encontrar versões.',
        'Browse pending changes and commits, open Before/After, and expand a change to explore code, focus and UML. Tags help you find versions.'),
      step('branches', ['[data-drawer-id="track-control"][data-testid="drawer-toggle"]'], 'Branches e integrações', 'Branches and merges',
        'O grafo mostra commits e seus vínculos. Crie branches para desenvolver em outra linha e integre pela ação de merge.',
        'The graph shows commits and their relationships. Create branches for separate development and integrate them using merge.'),
      step('commit', ['[data-drawer-id="commit-menu"][data-testid="drawer-toggle"]'], 'Salve uma versão', 'Save a version',
        'O código editado já fica salvo no disco. O commit reúne as mudanças em uma versão Git com título e descrição. Use este menu também para inicializar o repositório.',
        'Edited code is already saved on disk. A commit groups changes into a Git version with a title and description. This panel also initializes the repository.'),
      step('comparison', ['[data-drawer-id="diff-menu"][data-testid="drawer-toggle"]'], 'Compare referências', 'Compare references',
        'Escolha duas referências para comparar versões por arquivo em Canvas, PSI e Git. Esta comparação não altera o projeto.',
        'Choose two references to compare versions per file in Canvas, PSI and Git. Comparing does not modify the project.'),
      step('uml', [el('current-uml-toggle')], 'Estrutura atual', 'Current structure',
        'UML mostra a estrutura salva do arquivo ou projeto, somente para leitura, com zoom e navegação. Não é necessário restaurar uma versão para consultar o código atual.',
        'UML shows the saved file or project structure as a read-only diagram with zoom and navigation. You do not need to restore a version to inspect current code.'),
      step('run', [el('java-run-toggle')], 'Execute o código', 'Run your code',
        'Executar compila e roda uma cópia do código salvo, inclusive mudanças não commitadas. Escolha a classe main quando necessário, acompanhe a saída e use Interromper para encerrar.',
        'Run compiles and runs a copy of saved code, including uncommitted changes. Choose a main class when needed, follow its output and use Stop to end execution.'),
      step('problems', [el('problems-toggle')], 'Diagnósticos', 'Diagnostics',
        'Problemas reúne erros sintáticos do arquivo ou projeto. A verificação Java adicional é sob demanda. Análise parcial ou indisponível não significa aprovação.',
        'Problems lists syntax errors for the file or project. Additional Java checking is on demand. Partial or unavailable analysis does not mean approval.'),
      step('undo', [el('undo-controls')], 'Desfazer e refazer', 'Undo and redo',
        'Use os controles para desfazer ou refazer ações confirmadas durante o Run do plugin. Commit, branch, merge e aceitação externa encerram a pilha. Atalhos dentro dos campos editam apenas o rascunho.',
        'Undo or redo confirmed actions during the plugin Run. Commit, branch operations, merge and accepting external changes end the stack. Shortcuts inside fields affect only the draft.'),
      step('settings', [el('settings-open')], 'Preferências e ambiente', 'Preferences and environment',
        'Configure idiomas, tema, cores e o contexto Java. As opções compartilhadas usam a configuração central da instalação. O logo Lusiad retorna à seleção de projetos.',
        'Configure languages, theme, colors and Java context. Shared options use the installation’s central configuration. The Lusiad logo returns to project selection.'),
    ],
  },
  files: {
    title: text('Explorador de arquivos', 'File explorer'), root: el('file-explorer'), steps: [
      step('root', [el('files-name-bar')], 'Pasta do projeto', 'Project folder', 'Passe o mouse sobre o nome para ver o caminho completo ou clique para copiá-lo. O botão de pasta abre o explorador do sistema.', 'Hover the name to see the full path, or click to copy it. The folder button opens the system file explorer.'),
      step('operations', [el('files-operations')], 'Organize os arquivos', 'Organize files', 'Crie pastas e arquivos Java. A extensão .java é automática. Selecione um item para renomear ou excluir; exclusão pede confirmação.', 'Create folders and Java files. The .java extension is automatic. Select an item to rename or delete it. Deletion requires confirmation.'),
      step('tree', [el('files-tree')], 'Abra e mova', 'Open and move', 'Duplo clique ou Enter abre um arquivo. Botão direito ou três pontinhos mostram suas ações. Arraste para mover. Arquivos que não são Java abrem como texto somente leitura.', 'Double-click or press Enter to open a file. Right-click or use its three-dot menu for actions. Drag to move it. Non-Java files open as read-only text.'),
      step('search', [el('files-search-tools')], 'Busque e navegue', 'Search and navigate', 'Filtre arquivos e pastas pela busca. Os botões ao lado expandem ou recolhem todas as pastas. Clicar no espaço vazio limpa a seleção.', 'Filter files and folders using search. The adjacent buttons expand or collapse all folders. Clicking empty space clears selection.'),
    ],
  },
  sync: {
    title: text('Sincronização', 'Synchronization'), root: el('external-sync'), steps: [
      step('refresh', [el('sync-header')], 'Detecte mudanças externas', 'Detect external changes', 'Este menu mostra alterações de disco feitas pela IDE, outro editor ou explorador. Atualizar consulta o estado atual.', 'This panel shows disk changes made by the IDE, another editor or the file explorer. Refresh checks the current state.'),
      step('review', [el('external-change')], 'Revise cada caminho', 'Review each path', 'Quando houver alterações, clique em um caminho para abrir a prévia. Marque o que deseja manter. Uma nova alteração durante a revisão pode exigir nova conferência.', 'When changes exist, click a path to preview it. Select what to keep. A new change during review may require reviewing again.'),
      step('actions', [el('sync-actions')], 'Aceite ou rejeite', 'Accept or reject', 'Aplicar seleção aceita os itens marcados e restaura os demais. Rejeitar todas restaura o estado registrado. As ações ficam desabilitadas quando não há mudanças para revisar.', 'Apply selection accepts checked items and restores the rest. Reject all restores the tracked state. Actions are disabled when there are no changes to review.'),
      step('bundle', [el('sync-discard-bundle'), el('sync-actions')], 'Conclua o bundle', 'Complete the bundle', 'A aceitação gera um bundle e exige commit antes de editar novamente. Enquanto ele não for commitado, Cancelar mudanças aceitas permite descartar esse bundle.', 'Accepting creates a bundle and requires a commit before further editing. Before that commit, Cancel adopted changes lets you discard the bundle.'),
    ],
  },
  history: {
    title: text('Histórico', 'History'), root: el('change-history'), steps: [
      step('search', [el('history-search-area')], 'Encontre uma versão', 'Find a version', 'Busque por resumo e use os filtros para merges, criação de branches e tags. A quantidade por página controla os commits exibidos.', 'Search summaries and filter merges, branch creation and tags. Page size controls how many commits are displayed.'),
      step('pending', [el('history-pending')], 'Mudanças pendentes', 'Pending changes', 'Expanda esta seção para ver mudanças ainda não commitadas. Cada item representa uma operação registrada. Sua prévia corresponde ao estado daquela mudança.', 'Expand this section to see changes not yet committed. Each item represents a recorded operation. Its preview shows that change’s state.'),
      step('commits', [el('commit-card'), el('history-committed')], 'Commits e mudanças', 'Commits and changes', 'Um commit é uma versão salva. Abra seu card para ver as mudanças que o compõem. Os ícones distinguem commits comuns, merges e criação de branches.', 'A commit is a saved version. Expand its card to see the changes it contains. Icons distinguish regular commits, merges and branch creation.'),
      step('change', [el('history-change')], 'Explore uma mudança', 'Explore a change', 'Clique no resumo para abrir Before/After. As cores indicam adição, remoção, alteração ou movimento. Três pontinhos e botão direito oferecem ações e gerenciamento de tags.', 'Click a summary to open Before/After. Colors indicate additions, removals, edits or moves. The three-dot menu and right-click offer actions and tag management.'),
      step('expand', [el('history-expand')], 'Veja os detalhes', 'See the details', 'Após selecionar uma mudança, Expandir abre uma visão maior com foco no código e UML quando pertinente. Prévias não alteram os arquivos reais.', 'After selecting a change, Expand opens a larger view with code focus and UML where relevant. Previews do not change real files.'),
      step('restore', [el('history-pending')], 'Retorno e restauração', 'Rewind and restore', 'Nas pendências, voltar a uma mudança mantém essa e descarta as posteriores, com confirmação. Em versões commitadas, restaurar publica um novo commit e preserva o histórico. Resolva as pendências antes.', 'For pending work, rewinding keeps the selected change and discards later ones after confirmation. Restoring committed versions publishes a new commit and preserves history. Resolve pending work first.'),
      step('pages', [el('history-header')], 'Atualize e percorra', 'Refresh and browse', 'Atualize a lista ou mude de página. Você também pode digitar o número da página para navegar pelo histórico.', 'Refresh the list or change pages. You can also type a page number to navigate history.'),
    ],
  },
  branches: {
    title: text('Branches', 'Branches'), root: el('track-control'), steps: [
      step('create', [el('branches-header')], 'Crie outra linha', 'Create another branch', 'Digite um nome para criar uma branch a partir da atual. A nova branch passa a ser a linha de trabalho. O botão de merge integra a branch na sua base quando disponível.', 'Enter a name to create a branch from the current one. The new branch becomes the working branch. Merge integrates it into its base when available.'),
      step('graph', [el('branches-graph-area')], 'Leia o grafo', 'Read the graph', 'Os nós são commits e as linhas mostram vínculos reais. Clique em um nó para inspecionar a versão ou no nome da branch para ver seus detalhes.', 'Nodes represent commits and lines show real relationships. Click a node to inspect its version, or a branch name to see its details.'),
      step('markers', [el('graph-commit-tags'), el('graph-change-tags'), el('graph-restore-link'), el('branches-graph-area')], 'Tags e restaurações', 'Tags and restorations', 'Tags aparecem junto ao commit ou à mudança de origem. Símbolos e trajetos de restauração apontam à versão de origem; esse vínculo não representa um merge Git.', 'Tags appear beside their commit or source change. Restoration symbols and paths point to the source version. This relationship does not represent a Git merge.'),
      step('details', [el('branches-footer')], 'Detalhes e histórico', 'Details and history', 'A seleção aparece nesta área. Use Ver no histórico nos detalhes de um commit ou mudança para abrir o item correspondente no histórico.', 'The selected item appears here. Use View in history in commit or change details to open the corresponding history item.'),
    ],
  },
  commit: {
    title: text('Commit', 'Commit'), root: el('commit-menu'), steps: [
      step('refresh', [el('commit-header')], 'Confira o estado Git', 'Check Git status', 'Atualizar consulta os arquivos modificados. Se o projeto ainda não tem repositório, inicialize por este menu para estabelecer a base inicial.', 'Refresh checks changed files. If the project has no repository, initialize it here to establish the initial baseline.'),
      step('files', [el('commit-list')], 'Revise os arquivos', 'Review files', 'Confira os arquivos agrupados por tipo de alteração e use a busca quando necessário. As contagens mostram o impacto da versão que será salva.', 'Review files grouped by change type and use search when needed. Counts show the impact of the version to be saved.'),
      step('message', [el('commit-title'), el('commit-footer')], 'Nomeie a versão', 'Name the version', 'Informe um título claro e uma descrição opcional. Esses textos são seus e permanecem como foram escritos.', 'Enter a clear title and an optional description. These are your own texts and remain as written.'),
      step('save', [el('commit-submit')], 'Publique o commit', 'Publish the commit', 'O commit registra o estado salvo e associa suas mudanças na branch atual. Aguarde a confirmação. Fazer commit encerra a pilha de desfazer/refazer.', 'A commit records the saved state and associates its changes in the current branch. Wait for confirmation. Committing ends the undo/redo stack.'),
      step('discard', [el('commit-discard')], 'Descarte com cuidado', 'Discard carefully', 'Quando houver pendências, o botão de lixeira oferece descartar todas após confirmação. Essa ação remove o trabalho pendente; ela não equivale a salvar uma versão.', 'When pending work exists, the trash button offers to discard all of it after confirmation. This removes pending work and does not save a version.'),
    ],
  },
  comparison: {
    title: text('Comparação', 'Comparison'), root: el('comparison-menu'), steps: [
      step('references', [el('comparison-header')], 'Escolha base e destino', 'Choose base and target', 'Selecione duas referências, como commits ou tags de commits/mudanças. A comparação pode atravessar a ordem cronológica. A seta inverte os lados.', 'Select two references, such as commits or tags on commits or changes. Comparisons can cross chronological order. The arrow swaps sides.'),
      step('compare', [el('comparison-run')], 'Calcule a diferença', 'Calculate the difference', 'Comparar reconstrói as referências de forma isolada. O projeto atual permanece intacto.', 'Compare reconstructs references in isolation. The current project remains unchanged.'),
      step('files', [el('comparison-summary'), el('comparison-list')], 'Escolha um arquivo', 'Choose a file', 'Após comparar, consulte arquivos afetados e linhas adicionadas/removidas. Filtre a lista e clique em um arquivo para abrir sua diferença.', 'After comparing, review affected files and added/removed lines. Filter the list and click a file to open its difference.'),
      step('views', [el('comparison-list')], 'Explore as visualizações', 'Explore the views', 'A prévia central oferece Canvas, PSI e Git para examinar a mesma diferença. UML é oferecida no histórico e na visão atual do projeto.', 'The central preview offers Canvas, PSI and Git views of the same difference. UML is available in history and the current project view.'),
    ],
  },
  library: {
    title: text('Biblioteca', 'Library'), root: el('library'), steps: [
      step('catalogue', [el('library-catalogue-tab')], 'Explore por categoria', 'Browse by category', 'O catálogo agrupa tipos, membros, instruções, controle de fluxo e outros componentes Java. Abra um grupo para ver os modelos disponíveis.', 'The catalogue groups Java types, members, statements, control flow and other components. Open a category to see available templates.'),
      step('search', [el('library-search')], 'Busque um componente', 'Find a component', 'A busca filtra a aba atual por nome e termos do componente. Limpe a busca para voltar a navegar pelos grupos.', 'Search filters the current tab by component name and terms. Clear search to browse categories again.'),
      step('template', [el('library-component'), el('library-list')], 'Veja e arraste o código', 'Preview and drag code', 'Cada card mostra o código base. Arraste para um ponto compatível do canvas, veja a prévia e configure os atributos no modal. Cancelar não cria uma mudança.', 'Each card shows its base code. Drag it to a compatible canvas position, preview the placement and configure attributes in the dialog. Canceling creates no change.'),
      step('pin', [el('library-favorite'), el('library-favorites-tab')], 'Fixe os mais usados', 'Pin frequently used items', 'O pin adiciona ou remove o componente dos favoritos deste navegador. A aba de fixados reúne esses atalhos sem duplicar componentes no projeto.', 'The pin adds or removes a component from this browser’s favorites. The pinned tab collects shortcuts without duplicating components in the project.'),
    ],
  },
  properties: {
    title: text('Propriedades', 'Properties'), root: el('properties'), steps: [
      step('selection', [el('properties-metadata')], 'Selecione um componente', 'Select a component', 'Clique em um bloco do canvas para ver seus dados aqui. O rodapé identifica tipo, linhas e intervalo do componente selecionado.', 'Click a canvas block to see its data here. The footer identifies the selected component’s type, lines and range.'),
      step('attributes', [el('properties-attributes-tab')], 'Edite por atributos', 'Edit attributes', 'Os campos dependem do componente. Altere nome, tipo, expressão ou outros atributos disponíveis. Alterar um nome não refatora automaticamente suas referências.', 'Fields depend on the component. Edit its name, type, expression or other available attributes. Changing a name does not automatically refactor references.'),
      step('code', [el('properties-code-tab')], 'Edite o código direto', 'Edit code directly', 'A outra aba edita o mesmo rascunho como código. Após uma alteração manual, a edição por campos depende de reler os atributos com segurança. Código não mapeável continua preservado.', 'The other tab edits the same draft as code. After manual changes, field editing requires safely reading attributes again. Unmappable code remains preserved.'),
      step('save', [el('properties-apply')], 'Confira antes de salvar', 'Review before saving', 'Salvar analisa a proposta no arquivo completo. Se houver problemas, você pode corrigir, cancelar ou continuar explicitamente. A mudança só é registrada quando aplicada.', 'Save analyzes the proposal in the complete file. If problems are found, you can correct, cancel or explicitly continue. The change is recorded only when applied.'),
      step('discard', [el('properties-discard')], 'Descarte o rascunho', 'Discard the draft', 'Descartar abandona as edições locais do formulário e mantém o estado salvo. Durante o tutorial, nenhum campo ou arquivo é modificado.', 'Discard abandons local form edits and keeps the saved state. This tutorial does not modify any fields or files.'),
    ],
  },
} satisfies Record<string, Tutorial>

export type TutorialId = keyof typeof tutorials
