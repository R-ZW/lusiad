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

The steps below use PowerShell on Windows. The repository targets IntelliJ IDEA 2025.2.4 with Java support, Java 21 for the plugin, Node.js 24.12.0 or newer, Yarn Classic 1.22.22, and MySQL 8.0. Make `git` and `tar` available on the frontend's PATH. Lusiad uses them to prepare historical previews. Keep the IDE running to provide the local API. [Technology stack](technology-stack.md)

Configure Git's `user.name` and `user.email` for the account that runs the frontend. Git uses this identity when Lusiad creates the first commit and records later changes. [Git commit creation](../../lusiad-frontend/src/lib/services/commit-menu/git-operation.ts)

<a name="from-a-release"></a>

## 📦 2. From a release

If you have the ZIPs for the same release, use the steps below. For a checkout containing the source and the release tag only, use [From source](#from-source).

The candidate `v2026-11-15-rc1` names its archives `lusiad-plugin-2026-11-15-rc1.zip` and `lusiad-frontend-2026-11-15-rc1.zip`.

1. Compare the ZIPs with that release's `SHA256SUMS.txt` using `Get-FileHash -Algorithm SHA256`. For the candidate tagged `v2026-11-15-rc1`, the checksum file is available in the tag via `git show v2026-11-15-rc1:release/SHA256SUMS.txt`.
2. In IntelliJ, use **Settings → Plugins → gear → Install Plugin from Disk**, select the plugin ZIP, and restart the IDE.
3. Extract the frontend ZIP to its own directory. From the extracted `lusiad-frontend` folder, run `yarn install --frozen-lockfile`. The archive includes the production build. Continue with [Configuration](#configuration).

<a name="from-source"></a>

## 🛠️ 3. From source

Open PowerShell at the repository root and build the plugin.

```powershell
cd lusiad-backend
.\gradlew.bat buildPlugin
```

Install the ZIP from `lusiad-backend/build/distributions/` through **Install Plugin from Disk** and restart IntelliJ. For plugin development, run `.\gradlew.bat runIde` from `lusiad-backend/` to launch a development IDE. In another PowerShell terminal opened at the repository root, prepare the frontend.

```powershell
cd lusiad-frontend
yarn install --frozen-lockfile
yarn build --webpack
```

Continue with [Configuration](#configuration). For frontend development, you can skip `yarn build --webpack` and start the development server during configuration.

<a name="configuration"></a>

## ⚙️ 4. Configuration

1. **Initialize MySQL.** Run [`lusiad-backend/db/lusiad.sql`](../../lusiad-backend/db/lusiad.sql) in a fresh MySQL instance or a fresh `lusiad` schema. The script selects `lusiad` explicitly. Use credentials that can access the schema, including writing the project and history tables. For an existing installation, back up the database and apply only the [applicable migrations](../../lusiad-backend/db/migrations).
2. **Configure the plugin.** Open a Java project in IntelliJ and go to **View → Tool Windows → Lusiad → Environment**. Set the database host, port, name, user, and password. The plugin and frontend share `~/.lusiad/config.json` by default. If you override `LUSIAD_CONFIG_FILE`, point both processes at the same absolute path. [Backend overrides](../../lusiad-backend/.env.example) · [Frontend overrides](../../lusiad-frontend/.env.example)
3. **Start the services.** Reopen IntelliJ and the frontend terminal after changing operational settings. In **Lusiad → Running**, check the database connection and start the local API. Its default address is `http://127.0.0.1:8765`. From `lusiad-frontend/`, run `yarn start` for the production build or `yarn dev` for development. Check **Web interface** and open `http://localhost:3000`.

The plugin manages the shared API token. Keep the configuration file and credentials outside the repository. Configure JDK, source roots, and dependencies for each project in the web interface under **Settings → Java**. [Plugin controls](manual.md#plugin-panel) · [Java configuration](manual.md#java)

<a name="check"></a>

## ✅ 5. Check

Check that **Running** reports an active API, a successful database check, and an available web interface. Use a disposable Java project to verify that a file opens as a model and that an edit appears in the pending history before committing it. [First steps](first-steps.md)

---

<table width="100%">
<tr>
<td align="left"><a href="setup.md">⬅️ Previous page</a></td>
<td align="center"><a href="../../README.md#documentation-index">3️⃣ Installation guide</a></td>
<td align="right"><a href="first-steps.md">Next page ➡️</a></td>
</tr>
</table>

### Documentation index

**[📖 Overview](../../README.md)**

- [🖥️ User guide](manual.md)

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

**[📊 Evaluation](evaluation.md)**

- [📋 Planning](evaluation-planning.md)
- [🧪 Execution](evaluation-execution.md)
- [📈 Results](evaluation-results.md)
- [💬 Discussion](evaluation-discussion.md)
- [📂 Materials and data](evaluation-data.md)
- [🗂️ Evaluation files](../zenodo/)
