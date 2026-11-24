# `Lusiad` – Guia de instalação

[🇺🇸 English](../en/installation.md) · **🇧🇷 Português (Brasil)**

### Nesta página

> [1. Pré-requisitos](#-1-pré-requisitos)<br>
> [2. Pela release](#-2-pela-release)<br>
> [3. A partir do código](#-3-a-partir-do-código)<br>
> [4. Configuração](#-4-configuração)<br>
> [5. Conferência](#-5-conferência)<br>
> [Índice da documentação](#índice-da-documentação)

---

<a name="pré-requisitos"></a>

## 📋 1. Pré-requisitos

Windows, IntelliJ IDEA 2025.2.4 com suporte a Java, JDK 21, Node.js 24.12 ou superior, Yarn 1.22.22, Git e MySQL 8.0. A IDE precisa estar aberta para fornecer a API local. O frontend e o plugin usam o mesmo banco. Os comandos abaixo pressupõem PowerShell aberto na raiz do repositório.

<a name="pela-release"></a>

## 📦 2. Pela release

1. Instale o ZIP do plugin em **Settings → Plugins → engrenagem → Install Plugin from Disk** e reinicie a IDE. Use `release/lusiad-plugin-2026-11-15-rc1.zip`, identificado pelo hash em `release/SHA256SUMS.txt`. A versão interna do plugin ainda é `1.0-SNAPSHOT`; não confunda este arquivo recém-gerado com o ZIP de outubro.
2. Descompacte `release/lusiad-frontend-2026-11-15-rc1.zip`. No diretório extraído `lusiad-frontend`, instale as dependências com `yarn install --frozen-lockfile` e inicie com `yarn start`. O build de produção já está incluído. Se optar por recompilar, execute `yarn build --webpack`.
3. Prepare um banco vazio e aplique o esquema em `lusiad-backend/db/lusiad.sql` em uma instância MySQL dedicada. O arquivo usa o nome `lusiad`.
4. Abra o painel **Lusiad** no IntelliJ, configure a conexão MySQL e inicie o servidor local. Confira a URL do frontend e abra `http://localhost:3000`.

A candidata foi empacotada localmente. A abertura do frontend extraído foi testada; a instalação do ZIP do plugin na IDE ainda requer a conferência descrita em `release/README.md`.

<a name="a-partir-do-código"></a>

## 🛠️ 3. A partir do código

```powershell
cd lusiad-backend
.\gradlew.bat buildPlugin
```

Instale o ZIP resultante de `build/distributions/` na IDE. Para desenvolvimento, a tarefa `runIde` inicia outra instância do IntelliJ. Em outro terminal:

```powershell
cd lusiad-frontend
yarn install --frozen-lockfile
yarn build --webpack
yarn start
```

Para usar a interface em desenvolvimento, substitua `yarn build` e `yarn start` por `yarn dev`.

<a name="configuração"></a>

## ⚙️ 4. Configuração

Os exemplos ficam em `lusiad-backend/.env.example` e `lusiad-frontend/.env.example`. Use credenciais próprias e um banco de teste. O painel do plugin permite configurar o banco, o endereço da interface e o ambiente Java. A API escuta em `127.0.0.1:8765` por padrão. O navegador acessa `localhost:3000`. Mantenha o token da API e as senhas fora do repositório. O frontend usa configuração do lado servidor para consultar MySQL e a API local.

<a name="conferência"></a>

## ✅ 5. Conferência

Com a IDE, o servidor local e o frontend ativos, abra a página de projetos. Crie um projeto em uma pasta Java descartável, inicie o repositório Git, abra uma classe e faça uma edição. Consulte o histórico antes de usar um projeto próprio. Consulte [Primeiros passos](primeiros-passos.md) para o percurso completo.

---

<table width="100%">
<tr>
<td align="left"><a href="preparacao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="index.md">4️⃣ Guia de instalação</a></td>
<td align="right"><a href="primeiros-passos.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)
- [🎬 Demonstração](demonstracao.md)

**[⚙️ Instalação](preparacao.md)**

- [🔧 Guia de instalação](instalacao.md) 👈
- [🚀 Primeiros passos](primeiros-passos.md)

**[📐 Projeto](projeto.md)**

- [📋 Requisitos](requisitos.md)
- [✏️ Prototipação](prototipacao.md)

**[💻 Implementação](implementacao.md)**

- [🏗️ Arquitetura](arquitetura.md)
- [📂 Estrutura de diretórios](estrutura-de-diretorios.md)
- [🧰 Tecnologias utilizadas](tecnologias-utilizadas.md)
- [🗃️ Modelo de dados](modelo-de-dados.md)
- [🔌 Referência da API](referencia-da-api.md)
- [🔀 Diagramas de interação](diagramas-de-interacao.md)
- [🧭 Decisões de projeto](decisoes-de-projeto.md)
- [🔍 Elementos notáveis da implementação](elementos-notaveis-da-implementacao.md)
