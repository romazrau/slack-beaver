# Node Runtime And Native SQLite

## Context

The Local Agent uses `better-sqlite3` for SQLite local memory. `better-sqlite3` loads a native `.node` binding that is compiled for the active Node ABI.

## Decision

The project now standardizes local development and runtime commands on Node.js 22. The repository includes `.nvmrc` and `.node-version` set to `22.23.1`, and `package.json` declares `node >=22 <23`.

## Reason

The Local Agent failed in VS Code when Node.js 22 tried to load a `better-sqlite3` binary previously compiled under Node.js 20. Node.js 20 uses `NODE_MODULE_VERSION 115`; Node.js 22 uses `NODE_MODULE_VERSION 127`. The runtime and installed native binding must match.

## Validation

- Rebuilt `better-sqlite3` from the VS Code terminal running Node.js `v22.23.1`.
- VS Code terminal reported `rebuilt dependencies successfully`.
- `better-sqlite3` loaded successfully under Node.js `v22.23.1` with `NODE_MODULE_VERSION 127`.
- `npm run verify` passed under Node.js `v22.23.1`.

## Follow-Up

If a developer switches Node major versions after installing dependencies, run `npm rebuild better-sqlite3` or reinstall dependencies with the target Node version.
