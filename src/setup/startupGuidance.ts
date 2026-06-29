import type { AppConfig } from "../config/config.js";
import {
  GOOGLE_ACCOUNT_EMAIL_SETTING_KEY,
  GOOGLE_GRANTED_SCOPES_SETTING_KEY,
  GOOGLE_PROVIDER_NAME,
  isGoogleTokenExpired,
  loadGoogleOAuthToken
} from "../google/googleAuth.js";
import { LocalMemoryStore } from "../memory/localMemory.js";

export type GoogleWorkspaceStartupCheck =
  | { status: "disabled" }
  | { status: "connected"; accountEmail?: string; scopes: string[] }
  | { status: "needs_setup"; reason: string };

export function formatMissingAiAgentTokenStartupGuidance(): string {
  return [
    "AI agent token is not configured locally.",
    "To enable `ask <question>` and natural App DM answers, keep this server running and run this in another terminal:",
    "  npm run agent:secrets:set-openai",
    "Paste the OpenAI API key only when the local prompt asks for it. Do not paste API keys into Slack."
  ].join("\n");
}

export async function checkGoogleWorkspaceStartupConnection(
  config: AppConfig,
  now = Date.now()
): Promise<GoogleWorkspaceStartupCheck> {
  if (!config.googleWorkspace.enabled) {
    return { status: "disabled" };
  }

  if (!config.googleWorkspace.oauthClientId) {
    return {
      status: "needs_setup",
      reason: "GOOGLE_OAUTH_CLIENT_ID is missing."
    };
  }

  try {
    const token = await loadGoogleOAuthToken(config.googleWorkspace.tokenPath);
    if (isGoogleTokenExpired(token, now) && !token.refreshToken) {
      return {
        status: "needs_setup",
        reason: "Google token is expired and does not include a refresh token."
      };
    }
    return {
      status: "connected",
      accountEmail: token.accountEmail,
      scopes: token.scopes
    };
  } catch (error) {
    return {
      status: "needs_setup",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export function recordGoogleWorkspaceStartupCheck(config: AppConfig, check: GoogleWorkspaceStartupCheck): void {
  if (!config.localMemory.enabled || check.status === "disabled") {
    return;
  }

  const store = new LocalMemoryStore(config.localMemory.dbPath);
  try {
    store.setProviderTokenConfigured(GOOGLE_PROVIDER_NAME, check.status === "connected");
    if (check.status === "connected") {
      store.setSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY, check.scopes.join(" "));
      if (check.accountEmail) {
        store.setSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY, check.accountEmail);
      }
    } else {
      store.deleteSetting(GOOGLE_GRANTED_SCOPES_SETTING_KEY);
      store.deleteSetting(GOOGLE_ACCOUNT_EMAIL_SETTING_KEY);
    }
  } finally {
    store.close();
  }
}

export function formatGoogleWorkspaceStartupGuidance(check: GoogleWorkspaceStartupCheck): string | undefined {
  if (check.status !== "needs_setup") {
    return undefined;
  }

  return [
    "Google Workspace is enabled but this computer is not connected to Google.",
    `Reason: ${check.reason}`,
    "To connect Google Workspace read-only search, keep this server running and run this in another terminal:",
    "  npm run agent:google:login",
    "Then verify the connection with:",
    "  npm run agent:google:status",
    "Make sure `GOOGLE_OAUTH_CLIENT_ID` is set in `.env`. Do not paste Google tokens into Slack."
  ].join("\n");
}
