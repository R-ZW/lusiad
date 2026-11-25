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

Os passos abaixo usam PowerShell no Windows. O repositório tem como referência IntelliJ IDEA 2025.2.4 com suporte a Java, Java 21 para o plugin, Node.js 24.12.0 ou superior, Yarn Classic 1.22.22 e MySQL 8.0. Disponibilize `git` e `tar` no PATH do frontend. O Lusiad usa os dois para preparar prévias históricas. Mantenha a IDE aberta para fornecer a API local. [Tecnologias utilizadas](tecnologias-utilizadas.md)

Configure `user.name` e `user.email` no Git para a conta que executa o frontend. O Git usa essa identidade quando o Lusiad cria o primeiro commit e registra as mudanças posteriores. [Criação de commits Git](../../lusiad-frontend/src/lib/services/commit-menu/git-operation.ts)

<a name="pela-release"></a>

## 📦 2. Pela release

Se você tem os ZIPs da mesma release, siga os passos abaixo. Se o checkout contém apenas o código e a tag da release, siga [A partir do código](#a-partir-do-código).

Os arquivos da candidata `v2026-11-15-rc1` se chamam `lusiad-plugin-2026-11-15-rc1.zip` e `lusiad-frontend-2026-11-15-rc1.zip`.

1. Compare os ZIPs com o `SHA256SUMS.txt` da release usando `Get-FileHash -Algorithm SHA256`. Para a candidata marcada como `v2026-11-15-rc1`, consulte o arquivo de checksums com `git show v2026-11-15-rc1:release/SHA256SUMS.txt`.
2. No IntelliJ, use **Settings → Plugins → engrenagem → Install Plugin from Disk**, selecione o ZIP do plugin e reinicie a IDE.
3. Descompacte o ZIP do frontend em um diretório próprio. Na pasta `lusiad-frontend` extraída, execute `yarn install --frozen-lockfile`. O pacote inclui o build de produção. Siga a [Configuração](#configuração).

<a name="a-partir-do-código"></a>

## 🛠️ 3. A partir do código

Abra o PowerShell na raiz do repositório e gere o pacote do plugin.

```powershell
cd lusiad-backend
.\gradlew.bat buildPlugin
```

Instale o ZIP de `lusiad-backend/build/distributions/` pela opção **Install Plugin from Disk** e reinicie o IntelliJ. Para desenvolver o plugin, execute `.\gradlew.bat runIde` em `lusiad-backend/`. Em outro terminal PowerShell aberto na raiz do repositório, prepare o frontend.

```powershell
cd lusiad-frontend
yarn install --frozen-lockfile
yarn build --webpack
```

Siga a [Configuração](#configuração). Para desenvolver o frontend, você pode pular `yarn build --webpack` e iniciar o servidor de desenvolvimento durante a configuração.

<a name="configuração"></a>

## ⚙️ 4. Configuração

1. **Prepare o MySQL.** Execute [`lusiad-backend/db/lusiad.sql`](../../lusiad-backend/db/lusiad.sql) em uma instância nova ou em um esquema `lusiad` vazio. O script seleciona `lusiad` explicitamente. Use credenciais com acesso ao esquema e permissão de escrita nas tabelas de projeto e histórico. Em uma instalação existente, faça backup do banco e aplique somente as [migrações pertinentes](../../lusiad-backend/db/migrations).
2. **Configure o plugin.** Abra um projeto Java no IntelliJ e vá a **View → Tool Windows → Lusiad → Ambiente**. Preencha host, porta, nome, usuário e senha do banco. Por padrão, o plugin e o frontend compartilham `~/.lusiad/config.json`. Se definir `LUSIAD_CONFIG_FILE`, use o mesmo caminho absoluto nos dois processos. [Opções do backend](../../lusiad-backend/.env.example) · [Opções do frontend](../../lusiad-frontend/.env.example)
3. **Inicie os serviços.** Reabra o IntelliJ e o terminal do frontend depois de alterar opções operacionais. Em **Lusiad → Execução**, verifique a conexão ao banco e inicie a API local. O endereço padrão é `http://127.0.0.1:8765`. Em `lusiad-frontend/`, execute `yarn start` para rodar o build de produção ou `yarn dev` para desenvolvimento. Verifique **Interface web** e abra `http://localhost:3000`.

O plugin gerencia o token compartilhado da API. Mantenha o arquivo de configuração e as credenciais fora do repositório. Defina JDK, raízes de código e dependências de cada projeto em **Configurações → Java**, na interface web. [Controles do plugin](manual.md#painel-do-plugin) · [Configuração Java](manual.md#java)

<a name="conferência"></a>

## ✅ 5. Conferência

Na aba **Execução**, confira se a API está ativa, se a verificação do banco passou e se a interface web está disponível. Use um projeto Java descartável para confirmar que um arquivo abre como modelo e que uma edição aparece no histórico pendente antes do commit. [Primeiros passos](primeiros-passos.md)

---

<table width="100%">
<tr>
<td align="left"><a href="preparacao.md">⬅️ Página anterior</a></td>
<td align="center"><a href="../../README.pt-BR.md#índice-da-documentação">3️⃣ Guia de instalação</a></td>
<td align="right"><a href="primeiros-passos.md">Próxima página ➡️</a></td>
</tr>
</table>

### Índice da documentação

**[📖 Visão geral](../../README.pt-BR.md)**

- [🖥️ Manual de uso](manual.md)

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

**[📊 Avaliação](avaliacao.md)**

- [📋 Planejamento](avaliacao-planejamento.md)
- [🧪 Execução](avaliacao-execucao.md)
- [📈 Resultados](avaliacao-resultados.md)
- [💬 Discussão](avaliacao-discussao.md)
- [📂 Materiais e dados](avaliacao-dados.md)
- [🗂️ Arquivos da avaliação](../zenodo/)
