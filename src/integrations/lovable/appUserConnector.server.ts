function requireApiKey(): string {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error("GitHub connections are not configured.");
  return key;
}

const gateway = "https://connector-gateway.lovable.dev";

export async function authorizeGitHub(params: { appUserId: string; returnUrl: string; connectionAPIKey?: string }) {
  const clientAPIKey = process.env['GITHUB_APP_USER_CONNECTOR_CLIENT_API_KEY'];
  if (!clientAPIKey) throw new Error("GitHub connections are not configured.");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireApiKey()}`,
    "Content-Type": "application/json",
    "X-Client-Api-Key": clientAPIKey,
  };
  if (params.connectionAPIKey) headers["X-Connection-Api-Key"] = params.connectionAPIKey;
  const response = await fetch(`${gateway}/api/v1/app-users/oauth2/authorize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      connector_id: "github",
      app_user_id: params.appUserId,
      return_url: params.returnUrl,
      credentials_configuration: { scopes: ["read:user", "public_repo"] },
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub connection failed (${response.status}): ${text}`);
  const body = JSON.parse(text) as { authorization_url?: string };
  if (!body.authorization_url) throw new Error("GitHub did not return a connection URL.");
  return body.authorization_url;
}

export async function exchangeGitHubCode(code: string) {
  const response = await fetch(`${gateway}/api/v1/app-users/oauth2/exchange`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub completion failed (${response.status}): ${text}`);
  const body = JSON.parse(text) as { api_key?: string; connector_id?: string };
  if (!body.api_key || body.connector_id !== "github") throw new Error("GitHub completion returned an invalid connection.");
  return body.api_key;
}

export async function callGitHub(connectionAPIKey: string, path: string) {
  return fetch(`${gateway}/github${path}`, {
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "X-Connection-Api-Key": connectionAPIKey,
      "X-Lovable-Required-Scopes": "read:user public_repo",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}
