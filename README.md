# Slack Forge

Slack Forge 是一個 Slack-based Local AI Ops Agent POC。專案目標是在三天內驗證一條可用的工作流：使用者透過 Slack 與本機啟動的 Local Agent 互動，查詢本機文件與 Google Workspace 文件、產生摘要、建立個人任務，並留下可追蹤的 audit log。

目前 repo 已建立 Slack Local File Search v0 的 Node.js/TypeScript 骨架。v0 聚焦最短可驗證路徑：使用者在自己的電腦啟動 Local Agent，Slack 透過 Socket Mode 將 `/agent find <query>` 事件送到 Local Agent，Local Agent 只搜尋 allowlist watched folders 內的本機文字檔，再把結果回覆 Slack 並寫入 JSONL audit log。

## Local Agent Runtime 決策

Slack bot 本身不能直接操作使用者電腦上的 OS folder。Slack 在本專案中只是 control surface；真正讀取本機資料夾的是使用者電腦上執行的 Local Agent process。

v0 採用下列架構：

```text
Slack User
  -> Slack Workspace
  -> Slack Socket Mode WebSocket
  -> Local Agent running on user's computer
  -> allowlisted local folders
  -> Slack response
```

第一版決策是 `Local Agent = Slack bot backend + local file reader`。因此不需要 cloud-hosted Slack backend、不需要 local companion app registration/pairing，也不需要 desktop app packaging。使用者必須在本機啟動 agent；如果 agent offline，Slack 就無法查找該電腦上的 local files。

macOS 使用時需注意：Local Agent 只能讀取執行它的 OS account 有權限讀取的資料夾。若 watched folder 位於 Desktop、Documents、Downloads 或外接磁碟等受保護位置，可能需要在 macOS Privacy & Security 設定中允許 Terminal 或未來封裝後的 app 存取。

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

`.env.example` 已提供 v0 所需設定範例。請不要提交實際 `.env`、tokens 或 credentials。

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SOCKET_MODE_ENABLED=true

# Local file access
WATCHED_FOLDERS=/absolute/path/to/folder-a,/absolute/path/to/folder-b
DENYLIST_FOLDERS=/Users/example/.ssh,/Users/example/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5

# Local audit
AUDIT_LOG_PATH=./logs/audit.jsonl
```

## 開發與驗證

安裝依賴：

```sh
npm install
```

啟動 Local Agent：

```sh
npm run dev
```

執行測試與型別檢查：

```sh
npm test
npm run typecheck
```

repo-level 檢查：

```sh
git status --short
git diff --check
```

## Slack Local File Search v0 Demo Flow

1. 在 Slack app 啟用 Socket Mode，並建立 `/agent` slash command。
2. 設定 `.env`，包含 `SLACK_BOT_TOKEN`、`SLACK_APP_TOKEN`、`WATCHED_FOLDERS` 與 `AUDIT_LOG_PATH`。
3. 在使用者電腦上執行 `npm run dev` 啟動 Local Agent。
4. 在 Slack 執行 `/agent find onboarding`。
5. 確認 Slack 回覆只包含 allowlisted folders 內的 filename、path、match type 與 snippet。
6. 檢查 `AUDIT_LOG_PATH` 是否新增一筆 JSONL audit entry。

v0 手動驗收應覆蓋：成功搜尋、no result、denylist folder 不被讀取、oversized file 被跳過、empty query 被拒絕、Local Agent 停止時 Slack 無法查 local files。

## 文件導覽

- `docs/repo-goal/00-poc.md`: 三天 POC 分析、架構建議、phase 規劃與驗收標準。
- `docs/repo-goal/01-accelerated-local-file-search.md`: Slack Local File Search v0 的加速 phase、runtime decision 與驗收標準。
- `docs/memory/`: 專案決策、進度與下一步紀錄。
- `AGENTS.md`: Agent 工作規則、測試要求與文件更新要求。

## 目前狀態

目前狀態是 Slack Local File Search v0 skeleton 已建立。已包含 config validation、guarded direct local search、Slack `/agent find <query>` command handler、JSONL audit log 與 behavior-focused tests。下一步是用真實 Slack internal/test app 與安全的 watched folder 進行手動 UAT。
