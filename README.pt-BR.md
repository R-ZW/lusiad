# `Lusiad` – Programação baseada em modelos com rastreamento de mudanças

[🇺🇸 English](README.md) · **🇧🇷 Português (Brasil)**

O Lusiad permite editar código Java como um modelo de blocos aninhados e acompanhar suas mudanças. Um plugin do IntelliJ IDEA usa a Program Structure Interface (PSI) para associar cada bloco ao elemento Java que ele representa. Na interface web, é possível acompanhar uma classe ou um método desde a edição no modelo até o registro no histórico.

### Nesta página

> [1. Usando o Lusiad](#-1-usando-o-lusiad)<br>
> [2. Organização do repositório](#-2-organização-do-repositório)<br>
> [Índice da documentação](#índice-da-documentação)

---

## 🧩 1. Usando o Lusiad

A tela de modelagem mostra a estrutura do arquivo Java aberto. O histórico permite examinar cada uma das edições agrupadas em um commit.

- [**🖥️ Manual de uso**](docs/pt-BR/manual.md) — Localize os controles de projetos, edição e histórico.
- [**🎬 Demonstração**](docs/pt-BR/demonstracao.md) — Acompanhe a movimentação de um método no modelo, no código Java e na comparação entre commits.

## 📂 2. Organização do repositório

| Diretório | Conteúdo |
| --- | --- |
| [`lusiad-backend/`](lusiad-backend/) | Plugin do IntelliJ IDEA, API HTTP local, serviços de PSI para Java, esquema do MySQL e migrações. |
| [`lusiad-frontend/`](lusiad-frontend/) | Interface web em Next.js e serviços que realizam operações Git e consultas ao banco. |
| [`docs/pt-BR/`](docs/pt-BR/index.md) · [`docs/en/`](docs/en/index.md) | Manuais e documentação técnica em português e inglês. |

O código e a documentação são distribuídos sob a [licença MIT](LICENSE).

---

<table width="100%">
<tr>
<td align="left">⬅️ Página anterior</td>
<td align="center">0️⃣ Visão geral</td>
<td align="right">Manual de uso | <a href="docs/pt-BR/manual.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](README.pt-BR.md)** 👈

- [🖥️ Manual de uso](docs/pt-BR/manual.md)
- [🎬 Demonstração](docs/pt-BR/demonstracao.md)

**[⚙️ Instalação](docs/pt-BR/preparacao.md)**

- [🔧 Guia de instalação](docs/pt-BR/instalacao.md)
- [🚀 Primeiros passos](docs/pt-BR/primeiros-passos.md)

**[📐 Projeto](docs/pt-BR/projeto.md)**

- [📋 Requisitos](docs/pt-BR/requisitos.md)
- [✏️ Prototipação](docs/pt-BR/prototipacao.md)

**[💻 Implementação](docs/pt-BR/implementacao.md)**

- [🏗️ Arquitetura](docs/pt-BR/arquitetura.md)
- [🔍 Elementos notáveis da implementação](docs/pt-BR/elementos-notaveis-da-implementacao.md)
