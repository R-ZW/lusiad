# Distribuição candidata 2026-11-15-rc1

Esta é uma **candidata local**, pendente de licença autoral, teste do ZIP do plugin em IntelliJ descartável e revisão final do autor. Não publicar como versão final antes dessas verificações.

- `lusiad-plugin-2026-11-15-rc1.zip`: plugin IntelliJ construído do backend copiado. A versão interna ainda é `1.0-SNAPSHOT`. Instalar pela opção **Install Plugin from Disk** da IDE.
- `lusiad-frontend-2026-11-15-rc1.zip`: frontend Next.js com o build de produção, sem dependências instaladas. Descompactar, entrar em `lusiad-frontend`, executar `yarn install --frozen-lockfile` e `yarn start`.
- `SHA256SUMS.txt`: hashes dos dois ZIPs.

Pré-requisitos e configuração: [Português](../docs/pt-BR/instalacao.md) · [English](../docs/en/installation.md). O esquema para um banco **vazio** está em `../lusiad-backend/db/lusiad.sql`; nunca aplicar sobre o banco de trabalho. A interface demonstrativa em `localhost:3000` usou as revisões listadas em `../VERSIONS.md`, não esta instalação da release. O build do frontend foi gerado com `yarn build --webpack`; o do plugin com JDK 23 e `gradlew buildPlugin`.
