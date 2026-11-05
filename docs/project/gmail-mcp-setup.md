# Gmail MCP — read-only setup (Windows)

Purpose: let job-apply agents **search/read** verification emails (Databricks, Karat, etc.).  
**Scope:** `gmail.readonly` only — no send, delete, or modify.

Package: `@klodr/gmail-mcp` (supports `--scopes=gmail.readonly`).

## 1. Google Cloud OAuth (one-time)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or pick a project.
2. Enable **Gmail API**.
3. **OAuth consent screen** → External (or Internal if Workspace) → add yourself as test user.
4. Scopes: add only  
   `https://www.googleapis.com/auth/gmail.readonly`
5. **Credentials** → Create OAuth client ID → Application type **Desktop app**.
6. Download the JSON → rename to `gcp-oauth.keys.json`.

## 2. Place keys + authorize (PowerShell)

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.gmail-mcp"
Move-Item -Force "$env:USERPROFILE\Downloads\gcp-oauth.keys.json" "$env:USERPROFILE\.gmail-mcp\gcp-oauth.keys.json"
```

```powershell
npx --yes @klodr/gmail-mcp auth --scopes=gmail.readonly
```

Complete the browser consent. Tokens land in `%USERPROFILE%\.gmail-mcp\credentials.json`.

## 3. Cursor MCP config

Edit `%USERPROFILE%\.cursor\mcp.json` (merge with existing servers; keep `chrome-devtools` if present):

```json
{
  "mcpServers": {
    "gmail": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@klodr/gmail-mcp"]
    },
    "chrome-devtools": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Restart Cursor. Confirm **gmail** is green under Settings → MCP.

## 4. Self-hosted worker

Restart the worker so it picks up MCP:

```powershell
cd "D:\Python Projects\cursor-job-search-agent"
agent worker start --name "durgesh-laptop" --worker-dir .
```

## 5. Smoke test

In chat: “Search my Gmail for the latest Databricks application security code.”  
Agent should use Gmail search/read tools only.

## Revoke

Google Account → Security → Third-party access → remove the OAuth app.  
Delete `%USERPROFILE%\.gmail-mcp\credentials.json`.
