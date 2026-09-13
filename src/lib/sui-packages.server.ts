const SUI_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";

type PackageProof = { packageId: string; moduleNames: string[]; version: number; digest: string | null; publisher: string | null; timestamp: string | null };

async function querySui<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(SUI_GRAPHQL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }), signal: controller.signal });
    if (!response.ok) throw new Error("Sui network lookup failed.");
    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (!payload.data) throw new Error(payload.errors?.[0]?.message ?? "Sui returned no package data.");
    return payload.data;
  } finally { clearTimeout(timer); }
}

export function extractPackageIds(...sources: Array<string | undefined>) {
  const ids = new Set<string>();
  for (const source of sources) {
    for (const match of source?.matchAll(/0x[a-fA-F0-9]{1,64}(?=::|\b)/g) ?? []) {
      const value = match[0].toLowerCase();
      if (value !== "0x1" && value !== "0x2" && value.length >= 10) ids.add(value);
    }
  }
  return [...ids].slice(0, 12);
}

export async function verifySuiPackage(packageId: string): Promise<PackageProof | null> {
  try {
    const data = await querySui<{ object?: { address: string; version?: number | null; previousTransaction?: { digest: string; sender?: { address?: string } | null; effects?: { status?: string; timestamp?: string | null } | null } | null; asMovePackage?: { modules?: { nodes?: Array<{ name: string }> } } | null } | null }>(
      `query Package($id: SuiAddress!) { object(address: $id) { address version previousTransaction { digest sender { address } effects { status timestamp } } asMovePackage { modules(first: 50) { nodes { name } } } } }`,
      { id: packageId },
    );
    const object = data.object;
    const modules = object?.asMovePackage?.modules?.nodes ?? [];
    if (!object || modules.length === 0 || object.previousTransaction?.effects?.status !== "SUCCESS") return null;
    return { packageId: object.address, moduleNames: modules.map((item) => item.name), version: Number(object.version ?? 1), digest: object.previousTransaction?.digest ?? null, publisher: object.previousTransaction?.sender?.address?.toLowerCase() ?? null, timestamp: object.previousTransaction?.effects?.timestamp ?? null };
  } catch { return null; }
}

export async function detectWalletPackages(wallet: string): Promise<PackageProof[]> {
  try {
    const data = await querySui<{ transactions?: { nodes?: Array<{ digest: string; sender?: { address?: string } | null; effects?: { status?: string; timestamp?: string | null; objectChanges?: { nodes?: Array<{ idCreated?: boolean | null; outputState?: { address: string; version?: number | null; asMovePackage?: { modules?: { nodes?: Array<{ name: string }> } } | null } | null }> } | null } | null }> } }>(
      `query Published($sender: SuiAddress!) { transactions(last: 50, filter: { sentAddress: $sender }) { nodes { digest sender { address } effects { status timestamp objectChanges(first: 50) { nodes { idCreated outputState { address version asMovePackage { modules(first: 50) { nodes { name } } } } } } } } } }`,
      { sender: wallet },
    );
    const packages: PackageProof[] = [];
    for (const tx of data.transactions?.nodes ?? []) {
      if (tx.effects?.status !== "SUCCESS") continue;
      for (const change of tx.effects.objectChanges?.nodes ?? []) {
        const object = change.outputState;
        const modules = object?.asMovePackage?.modules?.nodes ?? [];
        if (!change.idCreated || !object || modules.length === 0) continue;
        packages.push({ packageId: object.address, moduleNames: modules.map((item) => item.name), version: Number(object.version ?? 1), digest: tx.digest, publisher: tx.sender?.address?.toLowerCase() ?? null, timestamp: tx.effects.timestamp ?? null });
      }
    }
    return packages;
  } catch { return []; }
}