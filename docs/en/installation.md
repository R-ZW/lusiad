# `Lusiad` – Installation guide

**🇺🇸 English** · [🇧🇷 Português (Brasil)](../pt-BR/instalacao.md)

### On this page

> [1. Requirements](#-1-requirements)<br>
> [2. From a release](#-2-from-a-release)<br>
> [3. From source](#-3-from-source)<br>
> [4. Configuration](#-4-configuration)<br>
> [5. Check](#-5-check)<br>
> [Documentation index](#documentation-index)

---

<a name="requirements"></a>

## 📋 1. Requirements

Windows, IntelliJ IDEA 2025.2.4 with Java support, JDK 21, Node.js 24.12 or newer, Yarn 1.22.22, Git, and MySQL 8.0. The IDE must be running to provide the local API. The frontend and plugin use the same database. The commands below assume PowerShell at the repository root.

<a name="from-a-release"></a>

## 📦 2. From a release

1. Install the plugin ZIP through **Settings → Plugins → gear → Install Plugin from Disk**, then restart the IDE. Use `release/lusiad-plugin-2026-11-15-rc1.zip` and verify its hash in `release/SHA256SUMS.txt`. Its internal plugin version is still `1.0-SNAPSHOT`; this is a newly built archive.
2. Extract `release/lusiad-frontend-2026-11-15-rc1.zip`. Inside the extracted `lusiad-frontend`, run `yarn install --frozen-lockfile` and `yarn start`. The production build is included. To rebuild, run `yarn build --webpack`.
3. Prepare an empty database and apply `lusiad-backend/db/lusiad.sql` on a dedicated MySQL instance. The schema file uses the database name `lusiad`.
4. Open the IntelliJ **Lusiad** panel, configure MySQL, start the local service, and open `http://localhost:3000`.

The candidate was packaged locally. The extracted frontend started successfully; installing the plugin ZIP in a disposable IDE still requires the check described in `release/README.md`.

<a name="from-source"></a>

## 🛠️ 3. From source

```powershell
cd lusiad-backend
.\gradlew.bat buildPlugin
```

Install the resulting `build/distributions/` ZIP in IntelliJ. For development, `runIde` starts another IDE instance. In another terminal:

```powershell
cd lusiad-frontend
yarn install --frozen-lockfile
yarn build --webpack
yarn start
```

For web development, use `yarn dev` in place of the build and start commands.

<a name="configuration"></a>

## ⚙️ 4. Configuration

Examples are available in `lusiad-backend/.env.example` and `lusiad-frontend/.env.example`. Supply your own credentials and use a test database. The plugin panel configures the database, frontend address, and Java environment. The API listens on `127.0.0.1:8765` by default, while the browser opens `localhost:3000`. Keep API tokens and passwords out of the repository. The frontend connects to MySQL and the local API from its server side.

<a name="check"></a>

## ✅ 5. Check

With the IDE, local service, and frontend running, open the project page. Create a disposable Java project, initialize Git, open a class, edit it, and inspect the history. Follow the [first steps guide](first-steps.md) for the full walkthrough.

---

<table width="100%">
<tr>
<td align="left"><a href="setup.md">⬅️ Previous page</a></td>
<td align="center"><a href="index.md">4️⃣ Installation guide</a></td>
<td align="right"><a href="first-steps.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)
- [🎬 Demo](demo.md)

**[⚙️ Installation](setup.md)**

- [🔧 Installation guide](installation.md) 👈
- [🚀 First steps](first-steps.md)

**[📐 Project](project.md)**

- [📋 Requirements](requirements.md)
- [✏️ Prototyping](prototyping.md)

**[💻 Implementation](implementation.md)**

- [🏗️ Architecture](architecture.md)
- [📂 Directory structure](directory-structure.md)
- [🧰 Technology stack](technology-stack.md)
- [🗃️ Data model](data-model.md)
- [🔌 API reference](api-reference.md)
- [🔀 Interaction diagrams](interaction-diagrams.md)
- [🧭 Design decisions](design-decisions.md)
- [🔍 Notable implementation elements](notable-implementation-elements.md)
