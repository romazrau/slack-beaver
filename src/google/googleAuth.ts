import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { AppConfig } from "../config/config.js";

export const GOOGLE_PROVIDER_NAME = "google";
export const GOOGLE_GRANTED_SCOPES_SETTING_KEY = "google.granted_scopes";
export const GOOGLE_ACCOUNT_EMAIL_SETTING_KEY = "google.account_email";

export const DEFAULT_GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly"
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleOAuthToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
  accountEmail?: string;
};

export type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type GoogleOAuthLoginResult = {
  token: GoogleOAuthToken;
  accountEmail?: string;
  scopes: string[];
};

export type GoogleOAuthLoginOptions = {
  config: AppConfig;
  scopes?: string[];
  openUrl?: (url: string) => Promise<void>;
  fetchFn?: typeof fetch;
};

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildGoogleOAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function validateGoogleOAuthCallback(searchParams: URLSearchParams, expectedState: string): string {
  const state = searchParams.get("state");
  const receivedCode = searchParams.get("code");
  if (state !== expectedState || !receivedCode) {
    throw new Error("Google OAuth callback failed state validation.");
  }
  return receivedCode;
}

export async function runGoogleOAuthLogin(options: GoogleOAuthLoginOptions): Promise<GoogleOAuthLoginResult> {
  const clientId = options.config.googleWorkspace.oauthClientId;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is required before running Google login.");
  }

  const scopes = options.scopes ?? DEFAULT_GOOGLE_WORKSPACE_SCOPES;
  const state = base64Url(crypto.randomBytes(24));
  const pkce = generatePkcePair();
  const fetchFn = options.fetchFn ?? fetch;

  const callback = await waitForGoogleOAuthCallback(options.config.googleWorkspace.redirectHost, state);
  const authUrl = buildGoogleOAuthUrl({
    clientId,
    redirectUri: callback.redirectUri,
    scopes,
    state,
    codeChallenge: pkce.challenge
  });

  await (options.openUrl ?? openSystemBrowser)(authUrl);
  const code = await callback.code;
  const tokenResponse = await exchangeGoogleOAuthCode({
    code,
    codeVerifier: pkce.verifier,
    config: options.config,
    redirectUri: callback.redirectUri,
    fetchFn
  });

  const token = normalizeTokenResponse(tokenResponse, scopes);
  token.accountEmail = await fetchGoogleAccountEmail(token.accessToken, fetchFn);
  await saveGoogleOAuthToken(options.config.googleWorkspace.tokenPath, token);
  return {
    token,
    accountEmail: token.accountEmail,
    scopes: token.scopes
  };
}

export async function exchangeGoogleOAuthCode(input: {
  code: string;
  codeVerifier: string;
  config: AppConfig;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<GoogleTokenResponse> {
  const clientId = input.config.googleWorkspace.oauthClientId;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is required before exchanging a Google OAuth code.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri
  });
  if (input.config.googleWorkspace.oauthClientSecret) {
    body.set("client_secret", input.config.googleWorkspace.oauthClientSecret);
  }

  const response = await (input.fetchFn ?? fetch)(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: HTTP ${response.status}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleOAuthToken(input: {
  config: AppConfig;
  token: GoogleOAuthToken;
  fetchFn?: typeof fetch;
}): Promise<GoogleOAuthToken> {
  if (!input.token.refreshToken) {
    throw new Error("Google refresh token is missing. Run `npm run agent:google:login`.");
  }
  const clientId = input.config.googleWorkspace.oauthClientId;
  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is required before refreshing Google OAuth tokens.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: input.token.refreshToken
  });
  if (input.config.googleWorkspace.oauthClientSecret) {
    body.set("client_secret", input.config.googleWorkspace.oauthClientSecret);
  }

  const response = await (input.fetchFn ?? fetch)(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new Error("Google OAuth refresh failed. Run `npm run agent:google:login`.");
  }

  const refreshed = normalizeTokenResponse((await response.json()) as GoogleTokenResponse, input.token.scopes);
  const merged = {
    ...input.token,
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? input.token.refreshToken,
    accountEmail: input.token.accountEmail
  };
  await saveGoogleOAuthToken(input.config.googleWorkspace.tokenPath, merged);
  return merged;
}

export async function saveGoogleOAuthToken(tokenPath: string, token: GoogleOAuthToken): Promise<void> {
  await fs.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(tokenPath, 0o600);
}

export async function loadGoogleOAuthToken(tokenPath: string): Promise<GoogleOAuthToken> {
  let stat;
  try {
    stat = await fs.stat(tokenPath);
  } catch {
    throw new Error("Google account is not connected. Run `npm run agent:google:login`.");
  }
  if (!stat.isFile()) {
    throw new Error("Google token path is not a file. Run `npm run agent:google:login`.");
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error("Google token file permissions are too broad. Run `npm run agent:google:login`.");
  }

  const parsed = JSON.parse(await fs.readFile(tokenPath, "utf8")) as Partial<GoogleOAuthToken>;
  if (!parsed.accessToken || typeof parsed.expiresAt !== "number" || !Array.isArray(parsed.scopes)) {
    throw new Error("Google token file is invalid. Run `npm run agent:google:login`.");
  }
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    expiresAt: parsed.expiresAt,
    scopes: parsed.scopes,
    accountEmail: parsed.accountEmail
  };
}

export async function deleteGoogleOAuthToken(tokenPath: string): Promise<void> {
  await fs.rm(tokenPath, { force: true });
}

export function isGoogleTokenExpired(token: GoogleOAuthToken, now = Date.now()): boolean {
  return token.expiresAt - now < 60_000;
}

function normalizeTokenResponse(response: GoogleTokenResponse, fallbackScopes: string[]): GoogleOAuthToken {
  if (!response.access_token) {
    throw new Error("Google OAuth response did not include an access token.");
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
    scopes: response.scope ? response.scope.split(/\s+/).filter(Boolean) : fallbackScopes
  };
}

async function fetchGoogleAccountEmail(accessToken: string, fetchFn: typeof fetch): Promise<string | undefined> {
  const response = await fetchFn(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    return undefined;
  }
  const body = (await response.json()) as { email?: string };
  return body.email;
}

async function waitForGoogleOAuthCallback(
  redirectHost: string,
  expectedState: string
): Promise<{ redirectUri: string; code: Promise<string> }> {
  let server: http.Server;
  const code = new Promise<string>((resolve, reject) => {
    server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://${redirectHost}`);
      if (url.pathname !== "/oauth/google/callback") {
        response.writeHead(404).end("Not found.");
        return;
      }
      let receivedCode: string;
      try {
        receivedCode = validateGoogleOAuthCallback(url.searchParams, expectedState);
      } catch (error) {
        response.writeHead(400).end("Google login failed. You can close this tab.");
        reject(error);
        server.close();
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" }).end("Google login complete. You can close this tab.");
      resolve(receivedCode);
      server.close();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, redirectHost, resolve);
    server.once("error", reject);
  });
  const address = server!.address() as AddressInfo;
  return {
    redirectUri: `http://${redirectHost}:${address.port}/oauth/google/callback`,
    code
  };
}

async function openSystemBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.unref();
}

function base64Url(input: Buffer): string {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
