# `Lusiad` – Arquitetura

[🇺🇸 English](../en/architecture.md) · **🇧🇷 Português (Brasil)**

### Nesta página

> [1. Componentes](#-1-componentes)<br>
> [2. Fluxo de uma alteração](#-2-fluxo-de-uma-alteração)<br>
> [3. Onde localizar o código](#-3-onde-localizar-o-código)<br>
> [Índice da documentação](#índice-da-documentação)

---

<a name="componentes"></a>

## 🧩 1. Componentes

O plugin `lusiad-backend` roda dentro do IntelliJ. Ele usa a PSI da plataforma para ler e modificar programas Java, executa operações nos arquivos e fornece uma API HTTP local autenticada. O `lusiad-frontend` é uma aplicação Next.js que apresenta os painéis de edição, consulta e histórico. Seu servidor coordena operações Git, chamadas à API do plugin e consultas ao MySQL. O navegador recebe a interface, sem precisar de credenciais do banco.

O MySQL guarda projetos, branches, commits, eventos de mudança e recibos de operações. O repositório Git do projeto guarda os estados versionados. Os dois precisam permanecer associados ao mesmo projeto para reconstrução histórica. A configuração de exemplo fica nos arquivos `.env.example` de cada componente.

<a name="fluxo-de-uma-alteração"></a>

## 🔀 2. Fluxo de uma alteração

1. O usuário seleciona ou move um elemento no modelo exibido pelo frontend.
2. O frontend envia a operação à API do plugin, que usa PSI e aplica a edição ao arquivo Java.
3. O serviço registra a operação e o elemento afetado no MySQL. Mudanças pendentes podem ser reunidas em um commit Git pela interface.
4. Na consulta ao histórico, o frontend carrega o registro e solicita os estados reconstruídos para mostrar o antes e o depois.

O fluxo completo, com os limites entre dados de apresentação e reconstrução, é descrito em [Implementação](elementos-notaveis-da-implementacao.md).

<a name="onde-localizar-o-código"></a>

## 📂 3. Onde localizar o código

| Diretório | Conteúdo principal |
| --- | --- |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/psi/` | Edição e diagnóstico do modelo Java. |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/change/` | Registro e descrição estrutural de mudanças. |
| `lusiad-backend/src/main/java/com/lusiad/backend/service/restore/` | Reconstrução e restauração. |
| `lusiad-backend/src/main/java/com/lusiad/toolwindow/` | Painel nativo do plugin. |
| `lusiad-backend/db/migrations/` | Evolução aditiva do esquema. |
| `lusiad-frontend/src/features/` | Funcionalidades da interface. |
| `lusiad-frontend/src/lib/services/` | Coordenação de Git, backend e histórico. |
| `lusiad-frontend/src/lib/models/` | Representações e validações usadas na interface. |

---

<table width="100%">
<tr>
<td align="left"><a href="implementacao.md">⬅️ Página anterior</a> | Implementação</td>
<td align="center"><a href="index.md">🔟 Arquitetura</a></td>
<td align="right">Elementos notáveis da implementação | <a href="elementos-notaveis-da-implementacao.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)
- [🎬 Demonstração](demonstracao.md)

**[⚙️ Instalação](preparacao.md)**

- [🔧 Guia de instalação](instalacao.md)
- [🚀 Primeiros passos](primeiros-passos.md)

**[📐 Projeto](projeto.md)**

- [📋 Requisitos](requisitos.md)
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md) 👈
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)
