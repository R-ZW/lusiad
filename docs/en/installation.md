# Installation

## On this page

- [Requirements](#requirements)
- [From a release](#from-a-release)
- [From source](#from-source)
- [Configuration](#configuration)
- [Check](#check)

## Requirements

Windows, IntelliJ IDEA 2025.2.4 with Java support, JDK 21, Node.js 24.12 or newer, Yarn 1.22.22, Git, and MySQL 8.0. The IDE must be running to provide the local API. The frontend and plugin use the same database. The commands below assume PowerShell at the repository root.

## From a release

1. Install the plugin ZIP through **Settings → Plugins → gear → Install Plugin from Disk**, then restart the IDE. Use `release/lusiad-plugin-2026-11-15-rc1.zip` and verify its hash in `release/SHA256SUMS.txt`. Its internal plugin version is still `1.0-SNAPSHOT`; this is a newly built archive.
2. Extract `release/lusiad-frontend-2026-11-15-rc1.zip`. Inside the extracted `lusiad-frontend`, run `yarn install --frozen-lockfile` and `yarn start`. The production build is included. To rebuild, run `yarn build --webpack`.
3. Prepare an empty database and apply `lusiad-backend/db/lusiad.sql` on a dedicated MySQL instance. The schema file uses the database name `lusiad`.
4. Open the IntelliJ **Lusiad** panel, configure MySQL, start the local service, and open `http://localhost:3000`.

The candidate was packaged locally. The extracted frontend started successfully; installing the plugin ZIP in a disposable IDE still requires the check described in `release/README.md`.

## From source

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

## Configuration

Examples are available in `lusiad-backend/.env.example` and `lusiad-frontend/.env.example`. Supply your own credentials and use a test database. The plugin panel configures the database, frontend address, and Java environment. The API listens on `127.0.0.1:8765` by default, while the browser opens `localhost:3000`. Keep API tokens and passwords out of the repository. The frontend connects to MySQL and the local API from its server side.

## Check

With the IDE, local service, and frontend running, open the project page. Create a disposable Java project, initialize Git, open a class, edit it, and inspect the history. Follow the [first steps guide](first-steps.md) for the full walkthrough.

---

[← Home](index.md) · [Index](index.md) · [First steps →](first-steps.md) · [Português](../pt-BR/instalacao.md)
