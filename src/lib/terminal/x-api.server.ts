/**
 * Minimal X API v2 client using OAuth 1.0a user-context signing, so @ourblastbot can
 * read its mentions and post replies. Server-only: credentials are read from env here.
 */

const API = "https://api.x.com";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

export function readXCredentials(): XCredentials | null {
  const apiKey = process.env["X_BOT_API_KEY"];
  const apiSecret = process.env["X_BOT_API_SECRET"];
  const accessToken = process.env["X_BOT_ACCESS_TOKEN"];
  const accessSecret = process.env["X_BOT_ACCESS_SECRET"];
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

const rfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmacSha1(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function authorizationHeader(
  credentials: XCredentials,
  method: "GET" | "POST",
  url: string,
  queryParams: Record<string, string>,
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  // JSON request bodies are not part of the OAuth 1.0a signature base string.
  const all = { ...oauth, ...queryParams };
  const parameterString = Object.keys(all)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(all[key] as string)}`)
    .join("&");

  const base = [method, rfc3986(url), rfc3986(parameterString)].join("&");
  const signingKey = `${rfc3986(credentials.apiSecret)}&${rfc3986(credentials.accessSecret)}`;
  oauth["oauth_signature"] = await hmacSha1(signingKey, base);

  return `OAuth ${Object.keys(oauth)
    .sort()
    .map((key) => `${rfc3986(key)}="${rfc3986(oauth[key] as string)}"`)
    .join(", ")}`;
}

async function request<T>(
  credentials: XCredentials,
  method: "GET" | "POST",
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const url = `${API}${path}`;
  const query = options.query ?? {};
  const header = await authorizationHeader(credentials, method, url, query);
  const search = new URLSearchParams(query).toString();

  const response = await fetch(search ? `${url}?${search}` : url, {
    method,
    headers: {
      authorization: header,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`X API ${method} ${path} failed [${response.status}]: ${detail}`);
    throw new Error(`X API ${method} ${path} failed [${response.status}]: ${detail.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

/** The authenticated bot account. */
export async function getBotAccount(credentials: XCredentials) {
  const result = await request<{ data: { id: string; username: string; name: string } }>(
    credentials,
    "GET",
    "/2/users/me",
  );
  return result.data;
}

export interface XMentionItem {
  id: string;
  text: string;
  author_id?: string;
  username?: string;
}

/** Mentions of the bot, newest last, restricted to anything after `sinceId`. */
export async function listMentions(credentials: XCredentials, botUserId: string, sinceId?: string | null) {
  const query: Record<string, string> = {
    max_results: "25",
    "tweet.fields": "author_id,created_at",
    expansions: "author_id",
    "user.fields": "username",
  };
  if (sinceId) query["since_id"] = sinceId;

  const result = await request<{
    data?: Array<{ id: string; text: string; author_id?: string }>;
    includes?: { users?: Array<{ id: string; username: string }> };
  }>(credentials, "GET", `/2/users/${botUserId}/mentions`, { query });

  const users = new Map((result.includes?.users ?? []).map((user) => [user.id, user.username]));
  return (result.data ?? [])
    .map((tweet): XMentionItem => ({
      id: tweet.id,
      text: tweet.text,
      ...(tweet.author_id ? { author_id: tweet.author_id, username: users.get(tweet.author_id) ?? "" } : {}),
    }))
    .reverse();
}

/** Post a reply to a tweet. Returns the new post id. */
export async function postReply(credentials: XCredentials, inReplyToPostId: string, text: string): Promise<string> {
  const result = await request<{ data: { id: string } }>(credentials, "POST", "/2/tweets", {
    body: { text, reply: { in_reply_to_tweet_id: inReplyToPostId } },
  });
  return result.data.id;
}
