# Local Server

Local Server is the existing Slack Beaver Local Agent.

## Responsibility

- Connect to Slack through Socket Mode for the current POC.
- Handle `/agent find <query>`, App Home messages, `ask <question>`, and natural
  App DM conversation.
- Read only allowlisted local folders.
- Own local OpenAI token setup and local Google OAuth token files.
- Execute guarded Tool Registry tools.
- Write local audit logs and local memory.

## Current Commands

```sh
npm run dev
npm run agent:folders:add -- /absolute/path/to/folder
npm run agent:folders:list
npm run agent:secrets:set-openai
npm run agent:models:list
npm run agent:google:status
```

## Boundary

Local Server should continue to own local machine capabilities. It should not
store shared TODO state after Central Server TODO management is implemented.

Central Server integration should be added only through explicit APIs. Local
Server should not directly read or write the central SQLite file.

The current Center Server TODO slice is available separately through
`npm run center:dev` and the `npm run center:tasks:*` commands.
