Esta pasta contém os três arquivos Java e uma cópia do histórico Git em `aval-base.bundle`. O banco de origem foi um backup histórico do AVAL-BASE. `aval-base-template.sql` preserva somente as linhas desse projeto e substitui caminhos locais por marcadores. Um segundo dump histórico foi descartado porque seus hashes não correspondiam ao repositório original.

O repositório distribuído contém o snapshot inicial `a4406d8`, a versão B `ededce5` e a versão C `9ca1db2`. Os metadados de autoria foram substituídos por uma identidade fictícia; as árvores e o conteúdo dos arquivos não mudaram. As referências a commits no SQL foram atualizadas para os novos hashes. Os seis hashes de objetos Git encontrados no template existem no bundle.

## Restaurar em um ambiente descartável

1. Use uma instância MySQL 8.0 dedicada e vazia. O SQL contém `CREATE DATABASE lusiad` e `USE lusiad`. Não o importe na instância que contém seus projetos atuais.
2. No diretório deste cenário, execute `git clone aval-base.bundle work/AVAL-BASE`. Confira os três arquivos Java e os commits do clone.
3. Execute `python render-sql.py --project work/AVAL-BASE --output aval-base-local.sql`. O script preenche os caminhos para esse clone e seu diretório temporário. O SQL gerado deve permanecer local e está ignorado no Git.
4. Importe `aval-base-local.sql` na instância descartável com um cliente MySQL. Configure o plugin e o frontend para ela.
5. Abra AVAL-BASE na interface e confira as versões B e C, a branch `master` e as três mudanças da versão B. Consulte `HistoricoExemplo.java` antes de iniciar as tarefas. A versão D será criada durante a sessão.
6. Para reiniciar a sessão, crie outro clone do bundle e outra instância MySQL descartável a partir do template.

A importação e a navegação de ponta a ponta ainda dependem de uma execução em instância isolada. A verificação estática confirmou todos os objetos Git referenciados pelo template, mas não substitui esse teste.

As tarefas aplicadas usam `Construcao.java`, `Organizacao.java` e `HistoricoExemplo.java`. O roteiro requer as versões B e C e cria a versão D durante a sessão. A restauração do estado inicial deve ser feita sobre uma cópia do cenário. O projeto e o banco originais devem permanecer intactos.
