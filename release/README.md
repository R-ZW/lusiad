# Distribuição candidata 2026-11-15-rc1

Esta é uma **candidata a pré-release** do repositório conjunto, disponibilizado sob a [licença MIT](../LICENSE). O teste do ZIP do plugin em uma instalação descartável do IntelliJ e a confirmação das revisões exatas usadas na avaliação ainda estão pendentes. Não apresentá-la como versão final verificada antes dessas conferências. O DOI informado para o depósito associado é [10.5281/zenodo.24266445](https://doi.org/10.5281/zenodo.24266445), tratado como reservado até a confirmação da publicação.

- `lusiad-plugin-2026-11-15-rc1.zip`: plugin IntelliJ construído do backend copiado. A versão interna ainda é `1.0-SNAPSHOT`. Instalar pela opção **Install Plugin from Disk** da IDE.
- `lusiad-frontend-2026-11-15-rc1.zip`: frontend Next.js com o build de produção, sem dependências instaladas. Descompactar, entrar em `lusiad-frontend`, executar `yarn install --frozen-lockfile` e `yarn start`.
- `SHA256SUMS.txt`: hashes dos dois ZIPs.

Pré-requisitos e configuração: [Português](../docs/pt-BR/instalacao.md) · [English](../docs/en/installation.md). O esquema para um banco **vazio** está em `../lusiad-backend/db/lusiad.sql`; nunca aplicar sobre o banco de trabalho. A interface demonstrativa em `localhost:3000` usou as revisões listadas em `../VERSIONS.md`, não esta instalação da release. O build do frontend foi gerado com `yarn build --webpack`; o do plugin com JDK 23 e `gradlew buildPlugin`.
