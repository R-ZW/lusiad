# Revisão antes da divulgação

Este repositório é uma preparação local. Os ZIPs da candidata estão em `release/` e devem ser anexados manualmente a uma GitHub Release depois da revisão. O depósito Zenodo candidato fica fora do Git em `zenodo/`. Nada foi enviado externamente.

1. **Licença:** escolher a licença autoral para código e documentação; criar `LICENSE` na raiz e, se necessário, arquivo separado para dados. Verificar compatibilidade com os avisos de terceiros do plugin e dependências.
2. **Revisões avaliadas:** confrontar registros locais da coleta e identificar os hashes exatos backend/frontend; atualizar `VERSIONS.md`, notas e TCC. As revisões de 08/11 são apenas candidatas.
3. **Plugin:** instalar `release/lusiad-plugin-2026-11-15-rc1.zip` numa IntelliJ 2025.2.4 descartável; configurar MySQL isolado, abrir um projeto Java descartável, iniciar API, editar no modelo e consultar histórico. Documentar versão da IDE e resultado. Se falhar, registrar log e corrigir na cópia antes de gerar novo ZIP e hashes.
4. **Cenário:** iniciar MySQL 8 isolado e seguir `evaluation/scenario/README.md`; confirmar que as versões B/C e mudanças aparecem. Não usar o banco de trabalho.
5. **Mídia:** capturar o painel do plugin conforme `docs/pt-BR/manual.md`. Revisar imagens e protótipos visualmente. GIF é opcional; só incluir se curto, legível e capturado da interação real.
6. **Dados:** revisar os relatórios privados e cada transcrição. Publicar somente dados agregados, salvo autorização adicional específica.
7. **Publicação:** criar o repositório remoto, enviar esta revisão aprovada, anexar ZIPs à Release, depositar o ZIP candidato no Zenodo e inserir o DOI da versão no TCC. Nenhum DOI foi reservado nesta rodada.
