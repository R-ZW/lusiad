# Candidata local 2026-11-15-rc1

O plugin e o frontend foram compilados a partir dos commits identificados em `VERSIONS.md`. Na cópia de distribuição, o descritor do plugin substitui o fornecedor fictício de template por `Lusiad`; exemplos de caminhos locais nos arquivos de consulta foram normalizados. Não há evidência suficiente para enumerar todas as diferenças em relação ao executável usado nas sessões de avaliação, pois as revisões avaliadas não foram confirmadas.

**Verificado:** build do plugin; build do frontend com Webpack; integridade dos ZIPs; instalação de dependências e abertura HTTP 200 da página inicial e do projeto demonstrativo a partir do ZIP final extraído.

**Antes de publicar:** definir licença, instalar o ZIP do plugin numa IDE descartável e verificar API, projeto, edição e histórico; restaurar o cenário em MySQL isolado; revisar as imagens e o consentimento. A versão interna do plugin ainda é `1.0-SNAPSHOT`.
