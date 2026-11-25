# `Lusiad` – Implementação

[🇺🇸 English](../en/implementation.md) · **🇧🇷 Português (Brasil)**

Esta seção explica como o Lusiad transforma código Java em um modelo editável, registra mudanças e reconstrói estados anteriores para comparação. Use o índice abaixo para encontrar arquivos-fonte, estruturas de dados, contratos da API e fluxos de interação.

### Nesta página

> [Nesta seção](#-nesta-seção)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 📑 Nesta seção

- [**🏗️ Arquitetura**](arquitetura.md) — Responsabilidades da aplicação Next.js e do plugin do IntelliJ, da leitura da PSI ao registro de uma edição com Git e MySQL.
- [**📂 Estrutura de diretórios**](estrutura-de-diretorios.md) — Árvore do repositório e localização do frontend, do plugin, dos testes e da documentação.
- [**🧰 Tecnologias utilizadas**](tecnologias-utilizadas.md) — Versões de execução e build, dependências, ferramentas Java e comandos de verificação.
- [**🗃️ Modelo de dados**](modelo-de-dados.md) — Identificadores e armazenamento de projetos, branches, commits, mudanças, tags e registros de operações.
- [**🔌 Referência da API**](referencia-da-api.md) — Rotas e ações de servidor do Next.js, endpoints locais do plugin, convenções de requisição e respostas de erro.
- [**🔀 Diagramas de interação**](diagramas-de-interacao.md) — Diagramas de sequência para carregar o modelo, editar código, registrar commits, comparar versões, restaurar estados e executar Java.
- [**🧭 Decisões de projeto**](decisoes-de-projeto.md) — Motivos para a adoção do plugin do IntelliJ, da arquitetura cliente–servidor, de Java e TypeScript, do MySQL e das bibliotecas selecionadas.
- [**🔍 Elementos notáveis da implementação**](elementos-notaveis-da-implementacao.md) — Como os nós da PSI viram blocos editáveis, como o movimento de um método é registrado e como a reaplicação reconstrói os estados anterior e posterior.

---

<table width="100%">
<tr>
<td align="left"><a href="prototipacao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">8️⃣ Implementação</a></td>
<td align="right"><a href="arquitetura.md">Próxima página ➡️</a></td>
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

**[💻 Implementação](implementacao.md)** 👈

- [🏗️ Arquitetura](arquitetura.md)
- [📂 Estrutura de diretórios](estrutura-de-diretorios.md)
- [🧰 Tecnologias utilizadas](tecnologias-utilizadas.md)
- [🗃️ Modelo de dados](modelo-de-dados.md)
- [🔌 Referência da API](referencia-da-api.md)
- [🔀 Diagramas de interação](diagramas-de-interacao.md)
- [🧭 Decisões de projeto](decisoes-de-projeto.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)

**[📊 Avaliação](avaliacao.md)**

- [📋 Planejamento](avaliacao-planejamento.md)
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
