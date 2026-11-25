# Linha de base de qualidade

Registro histórico de 27/09/2026 para a atividade P01. As contagens e o estado descrito referem-se àquela execução. As versões e verificações do checkout atual estão na página [Tecnologias utilizadas](../../docs/pt-BR/tecnologias-utilizadas.md#build-empacotamento-e-verificação).

## Estado inicial

- Frontend: branch `main`, commit `4384765` (`chore: mudancas basicas de interface`), árvore de trabalho limpa.
- Backend/plugin: branch `main`, commit `b7884f9` (`chore: minor changes`). O arquivo `.intellijPlatform/self-update.lock` já estava modificado e não faz parte desta atividade.
- A checagem TypeScript encontrava 25 diagnósticos. Eles incluíam nulabilidade no explorador e no histórico, configuração incorreta do CodeMirror e tipos de retorno do MySQL incompatíveis com os repositórios.
- O build aceitava erros de TypeScript, o lint não possuía configuração executável e não havia testes próprios do projeto.
- Não existiam fixtures Java nem banco explicitamente isolado para testes.

## Estado após P01/P02

Naquela execução, a verificação do frontend foi invocada pelo Corepack.

```powershell
corepack yarn verify
```

Ele executa, nesta ordem, a checagem TypeScript, o ESLint, os testes de regressão e o build de produção do Next.js. Em 27/09/2026, as quatro etapas passaram e os sete testes foram aprovados.

A configuração inicial do ESLint aplica as regras recomendadas do Next.js e trata dependências incorretas de hooks como erro. Três regras que gerariam uma refatoração ampla no código legado (`no-unused-vars`, pureza de hooks e atualização de estado em effects) estão temporariamente desativadas; elas devem ser ativadas gradualmente nas atividades de limpeza, acompanhadas das correções correspondentes.

Os testes cobrem paridade dos catálogos PT/EN, interpolação, plurais, fallback de idioma, mensagens estruturadas, formatação de datas e a criação de um repositório Git descartável a partir de um projeto Java mínimo. A fixture e o repositório temporário não usam projetos cadastrados pelo usuário.

O backend declarou suporte a testes da plataforma IntelliJ. Os comandos registrados para a verificação foram os seguintes.

```powershell
.\gradlew.bat test
.\gradlew.bat verifyPlugin
```

A máquina usada naquela execução estava sem JDK e Docker. O registro de 27/09/2026, portanto, só cobre o resultado das verificações do frontend. O repositório atual também inclui [testes com MySQL descartável](../scripts/test-git-recording.mjs).
