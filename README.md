# Slack Forge

Slack Forge 是一個 Slack-based Local AI Ops Agent POC。專案目標是在三天內驗證一條可用的工作流：使用者透過 Slack 與本機啟動的 Local Agent 互動，查詢本機文件與 Google Workspace 文件、產生摘要、建立個人任務，並留下可追蹤的 audit log。

目前 repo 仍在初始化階段，尚未建立 Node.js package manifest、source code 或測試框架。本 README 先記錄 POC 目標、預期技術棧、設定方向與開發驗證方式，後續實作時應隨功能同步更新。

## POC 目標

三天 POC 聚焦以下能力：

- Slack 作為主要入口，支援 `@bot`、`/agent` 與 thread follow-up。
- Local Agent 可讀取 allowlist watched folders 內的 TXT、Markdown、CSV、JSON。
- 使用 metadata、modified time、file size、必要時 SHA-256 hash 建立本機文件索引與 summary cache。
- 以 read-only Google OAuth installed-app flow 查詢 Google Drive、讀取 Google Docs 與 Google Sheets 指定範圍。
- 可從 Slack thread 建立、查詢、更新個人 local tasks。
- 每次 tool call 都寫入基本 audit log，保留輸入摘要、輸出摘要、狀態與錯誤資訊。

## 不在三天 POC 範圍

第一版明確不處理下列項目：

- 多人 shared task state 或 Central Server。
- 任意 shell command。
- 自動修改 Google Docs 或 Google Sheets。
- Browser automation。
- Vector DB 或 embeddings search。
- Local LLM。
- 完整 PDF、DOCX、XLSX parser。
- Slack Marketplace 發布。

## 建議技術棧

- Runtime: Node.js LTS
- Language: TypeScript
- Slack: Slack Bolt for JavaScript + Socket Mode
- Storage: SQLite + Drizzle ORM + better-sqlite3
- Google Workspace: Drive API、Docs API、Sheets API、OAuth installed-app flow
- AI: Cloud LLM API
- Local file processing: Node.js `fs` + `crypto.createHash`

## 預期架構

```text
Slack User
  |
  v
Slack Workspace
  |
  v
Local Agent
  |-- Slack Adapter
  |-- AI Orchestrator
  |-- Tool Registry
  |-- Permission Guard
  |-- Document Indexer
  |-- Task Repository
  |-- Audit Logger
  |
  |-- SQLite local storage
  |-- Local file system
  |-- Google Workspace APIs
  `-- Cloud LLM API
```

設計上應保留 server-ready abstraction。POC 可使用 SQLite 實作 repositories；未來若導入 Central Server，應能以 central API implementation 取代 local repositories，而不重寫 Slack handler 或 orchestration flow。

## 未來環境變數範例

目前尚未建立 `.env.example`。實作 Node.js 專案骨架時，應以 `.env.example` 提供下列設定範例，並避免提交實際 `.env`、tokens 或 credentials。

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/oauth/google/callback

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=...
LLM_MODEL=...

# Local storage
DATABASE_URL=file:./data/slack-forge.sqlite
LOCAL_DATA_DIR=./data

# Local file access
WATCHED_FOLDERS=/absolute/path/to/folder-a,/absolute/path/to/folder-b
DENYLIST_FOLDERS=/Users/example/.ssh,/Users/example/Library
MAX_LOCAL_FILE_BYTES=1048576
```

## 開發與驗證

目前尚未建立 `package.json`，因此還沒有可執行的 install、dev、test 或 lint 指令。建立 Node.js 專案骨架後，README 應更新為實際命令，例如：

```sh
npm install
npm run dev
npm test
npm run lint
```

在目前初始化階段，可用下列 repo-level 檢查：

```sh
git status --short
git diff --check
```

## 文件導覽

- `docs/repo-goal/00-poc.md`: 三天 POC 分析、架構建議、phase 規劃與驗收標準。
- `docs/memory/`: 專案決策、進度與下一步紀錄。
- `AGENTS.md`: Agent 工作規則、測試要求與文件更新要求。

## 目前狀態

目前狀態是 repo 文件初始化。下一步是建立 Node.js/TypeScript 專案骨架、設定 Slack Bolt Socket Mode、建立 SQLite schema 與 repository interfaces。
