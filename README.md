# Slack Forge

Slack Forge 是一個 Slack-based Local AI Ops Agent POC。專案目標是在三天內驗證一條可用的工作流：使用者透過 Slack 與本機啟動的 Local Agent 互動，查詢本機文件與 Google Workspace 文件、產生摘要、建立個人任務，並留下可追蹤的 audit log。

目前 repo 已建立 Slack Local File Search v0 的 Node.js/TypeScript 骨架。v0 聚焦最短可驗證路徑：使用者在自己的電腦啟動 Local Agent，Slack 透過 Socket Mode 將 `/agent find <query>` 事件送到 Local Agent，Local Agent 只搜尋 allowlist watched folders 內的本機文字檔，再把結果回覆 Slack 並寫入 JSONL audit log。

下一階段已加入 Slack-native App Home / Messages chat 入口。使用者可以在 Slack 左側「應用程式」點開 `Slack Beaver Local Agent`，在 Messages tab 直接輸入 `find <query>`。`/agent find <query>` slash command 仍保留。

下一階段已加入 Local Memory + OpenAI token safety 的第一個可驗收切片：Local Agent 會用 SQLite 記住使用者允許讀取的 local folders，沒有特別指定路徑時使用已知 allowed folders，並透過受限 Tool Registry 執行 local search。OpenAI token 可透過本機 CLI 儲存為 local secret metadata；Slack 內貼上的 token-like 訊息會被拒絕。完整 OpenAI API 呼叫與 LLM agent runner 尚未接上。

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

# Local memory and paid-token setup
LOCAL_MEMORY_ENABLED=true
LOCAL_MEMORY_DB_PATH=./data/slack-beaver.sqlite
OPENAI_TOKEN_PATH=./tokens/openai.key

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

本機搜尋測試資料：

- `doc-test/` 提供可直接 allowlist 的 synthetic fixture corpus。
- 內容包含詩歌、短篇散文、短劇、股市 CSV/Markdown、世界新聞風格 JSON/Markdown、編造對話與代辦事項。
- 目錄從 `doc-test` 起算最深五層，方便驗證 nested folder traversal。
- 所有 market data、news brief、conversation 與 task item 都是測試資料，不代表真實事實或投資建議。

可用 `.env` 暫時設定：

```env
WATCHED_FOLDERS=/Users/romazrau/dev/slack-beaver/doc-test
```

可用查詢範例：

```text
find moonlit harbor
find semiconductor revenue
find monsoon vaccine corridor
find Mira deployment checklist
find TODO owner Priya
```

## Slack Local File Search v0 Demo Flow

1. 在 Slack app 啟用 Socket Mode，並建立 `/agent` slash command。
2. 設定 `.env`，包含 `SLACK_BOT_TOKEN`、`SLACK_APP_TOKEN`、`WATCHED_FOLDERS` 與 `AUDIT_LOG_PATH`。
3. 在使用者電腦上執行 `npm run dev` 啟動 Local Agent。
4. 在 Slack 執行 `/agent find onboarding`。
5. 確認 Slack 回覆只包含 allowlisted folders 內的 filename、path、match type 與 snippet。
6. 檢查 `AUDIT_LOG_PATH` 是否新增一筆 JSONL audit entry。

v0 手動驗收應覆蓋：成功搜尋、no result、denylist folder 不被讀取、oversized file 被跳過、empty query 被拒絕、Local Agent 停止時 Slack 無法查 local files。

## Slack App Home Chat 使用方式

在 Slack 左側「應用程式」打開 `Slack Beaver Local Agent`：

1. Home tab 顯示 Local Agent 狀態、allowed folder 數量、denylist folder 數量、OpenAI token local setup 狀態與可用指令。
2. Messages tab 輸入 `find Socket` 或 `find onboarding`。
3. Local Agent 透過 Socket Mode 收到 `message.im` event。
4. Local Agent 搜尋 allowlisted local folders。
5. Bot 在同一個 app chat 回覆結果。

Slack app 需要啟用：

- App Home
- Messages tab
- Event Subscriptions
- Bot events: `app_home_opened`, `message.im`
- Bot scopes: `commands`, `chat:write`, `im:history`

每次 App Home message search 會在 audit log 記錄 `source=app_home_message`。Slash command search 會記錄 `source=slash_command`。

## Local Memory And OpenAI Token Safety

Local Memory 第一版已實作 SQLite local store，用來保存 allowed folders、provider setup metadata、conversation/tool-call schema，以及 local search tool call summaries。`WATCHED_FOLDERS` 仍可用；當 `LOCAL_MEMORY_ENABLED=true` 時，Local Agent 會把 `.env` 的 watched folders 與 SQLite 中 enabled allowed folders 合併使用。

Local folder setup：

```sh
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
npm run agent:folders:remove -- /absolute/path/to/folder
```

Folder add 會驗證 absolute path、realpath、存在性、目錄型態、OS readable permission、`DENYLIST_FOLDERS`。如果沒有任何 known folders，App Home 和 chat search 會提示使用者用 local CLI 新增 folder，而不是直接失敗。

OpenAI provider 第一版只做 local token setup 與 metadata，不會把 token 送進 Slack 或 audit log。AI token 是付費機密，不能透過 Slack DM、App Home message、文件或 audit log 傳遞。請只在使用者電腦上透過 local CLI 設定：

```sh
npm run agent:secrets:set-openai
```

預設 token path 是 `./tokens/openai.key`，由 `.gitignore` 保護，寫入權限為 `0600`。Slack 中若收到 token-like 字串，bot 會拒絕接收並提示使用 local CLI。

安全邊界：

- Slack 仍只是 UI/control surface，不直接讀 OS folder。
- Local Agent code 決定 folder permission，不交給 LLM 決定。
- Agent/tool path 只能透過 allowlisted Tool Registry 調用工具。
- 不做任意 shell command，不修改 local files。
- Slack messages、local file content、LLM output 都視為 untrusted input。
- 任何 prompt injection 試圖要求讀取 denylist/non-allowlisted paths、洩漏 token、或改寫 tool policy，都必須被拒絕。

尚未實作：OpenAI API 呼叫、LLM tool-choice loop、多 provider routing、AI summary。

## For Coding Workspace Setup Notes

2026-06-28 已在 `For Coding` Slack workspace 建立並驗證 internal/test app：

- App name: `Slack Beaver Local Agent`
- App ID: `A0BDL410MPF`
- App-level token name: `slack-beaver-local-agent-socket`
- Socket Mode: enabled
- Slash command: `/agent`
- Usage hint: `find <query>`
- App Home Home tab: enabled
- App Home Messages tab: enabled
- App Home Messages tab user messages: enabled
- Event Subscriptions: enabled
- Bot events: `app_home_opened`, `message.im`
- OAuth scopes used for Slack-native UI: `commands`, `chat:write`, `im:history`
- App icon asset: `assets/slack-beaver-local-agent-avatar.png`
- Reinstall after App Home chat setup: completed

機密處理規則：

- Actual Slack tokens only live in local `.env`.
- `.env` is gitignored and should remain `0600`.
- Do not paste, log, commit, or document token values.
- Regenerate tokens from Slack app settings if token exposure is suspected.

目前本機 demo 設定使用：

```env
SLACK_SOCKET_MODE_ENABLED=true
WATCHED_FOLDERS=/Users/romazrau/dev/slack-beaver/docs
DENYLIST_FOLDERS=/Users/romazrau/.ssh,/Users/romazrau/Library
MAX_LOCAL_FILE_BYTES=1048576
MAX_SEARCH_RESULTS=5
AUDIT_LOG_PATH=./logs/audit.jsonl
```

可用 CLI 前景啟動：

```sh
npm run dev
```

若要用可辨識且可刪除的 macOS user job 啟動 local daemon：

```sh
launchctl submit -l slack-beaver-local-agent -- /bin/zsh -lc 'cd /Users/romazrau/dev/slack-beaver && npm run dev >> /tmp/slack-beaver-agent.log 2>&1'
```

檢查 daemon：

```sh
launchctl list slack-beaver-local-agent
tail -n 30 /tmp/slack-beaver-agent.log
```

停止並刪除 daemon：

```sh
launchctl remove slack-beaver-local-agent
```

已完成的 live UAT：

- Local Agent connected to Slack Socket Mode.
- `/agent find Socket` was run in Slack `#社交`.
- Slack returned 3 local file matches from the allowlisted `docs` folder.
- Response was visible only to the requester.
- `logs/audit.jsonl` recorded `status=success`, query, result count, Slack user ID, channel ID, and timestamp without full file contents.
- App Home Home tab was opened from Slack left sidebar > Applications > `Slack Beaver Local Agent`.
- Home tab rendered Local Agent status, watched folder count, denylist count, max results, and `find <query>` without token values or local folder paths.
- Messages tab accepted `find Socket` and returned local file results in the app chat.
- Messages tab accepted `list tasks` and returned `Unsupported command. Usage: find <query>`.
- Messages tab accepted a no-result query and returned a clear no-result response.
- `logs/audit.jsonl` recorded App Home successful and no-result searches with `source=app_home_message`.
- Slack app Basic Information uses `assets/slack-beaver-local-agent-avatar.png` as the app icon; Slack app chat and sidebar display the updated icon.

## 文件導覽

- `doc-test/`: Local file search synthetic fixture corpus, containing nested Markdown, TXT, CSV, and JSON files for manual validation.
- `docs/repo-goal/00-poc.md`: 三天 POC 分析、架構建議、phase 規劃與驗收標準。
- `docs/repo-goal/01-accelerated-local-file-search.md`: Slack Local File Search v0 的加速 phase、runtime decision 與驗收標準。
- `docs/repo-goal/02-v0-facts-and-hardening.md`: 下一階段 facts inventory、剩餘 UAT、coverage gap review、demo runbook 與 Phase 5 readiness decision。
- `docs/repo-goal/03-local-memory-and-ai-agent.md`: Local Memory、OpenAI token safety、Tool Registry guardrails 與 prompt-injection 驗收標準和執行結果。
- `docs/runbooks/slack-local-file-search-v0.md`: 可重跑的 v0 setup、foreground demo、optional launchctl demo、manual UAT 與 cleanup runbook。
- `docs/memory/`: 專案決策、進度與下一步紀錄。
- `AGENTS.md`: Agent 工作規則、測試要求與文件更新要求。

## 目前狀態

目前狀態是 Slack Local File Search v0 已建立並用真實 Slack internal/test app 完成 live UAT。已包含 config validation、guarded direct local search、Slack `/agent find <query>` command handler、Slack App Home / Messages chat handler、JSONL audit log、behavior-focused tests、Socket Mode setup 與 For Coding workspace demo notes。Local Memory 第一版已加入 SQLite allowed folders、local folder CLI、OpenAI token local setup、Slack token-like refusal、App Home setup guidance、以及 local search Tool Registry audit summary。下一步是接上真正的 OpenAI agent runner 與 prompt-injection fixture UAT。
