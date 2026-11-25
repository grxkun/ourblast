// SPDX-License-Identifier: BUSL-1.1
/**
 * Blast.fun v2 (production) launch, copied from a live mainnet launch
 * (publish EkaG3Ta…, finalize_registration J2maRwF…, launch HHm5XB7…):
 *
 *   1. publish the official v2 coin template (init → LaunchTicket + SealedTreasuryCap),
 *      then make the package immutable;
 *   2. 0x2::coin_registry::finalize_registration shares the coin's Currency;
 *   3. venue_admission → cetus::prepare → launch::new → set_virtual_quote /
 *      set_graduation_target / allocation plan / LP fee split (Blast app defaults)
 *      → [set_partner when BLAST_PARTNER_ID is set] → finalize → share.
 *
 * The bot wallet signs and is the curve's creator, so creator fees follow the
 * same OurBlast split as the other pads. Reported CONFIRMED only after step 3 succeeds.
 */
import { Transaction } from "@mysten/sui/transactions";

import { BLAST_V2_LAUNCH_CONFIG, BLAST_V2_LAUNCH_PKG, BLAST_V2_RUNTIME, BLAST_V2_VERSION } from "@/lib/blast/contracts";
import { patchBlastV2Template } from "./blastV2-template.server";
import { zeroSelfAddress } from "./coin-template.server";
import { gasCoins, gql, loadDeployer, normalizeType, referenceGasPrice, rpc, sharedRef, signAndExecute, withGas } from "./suipump-launch.server";

const DOMAIN_PKG = "0xd70a8d11582fd1997380bc59bfd56a2f9028ebe11da74514ea3d386258d932fc";
const MIGRATORS_PKG = "0xb8146388d5098524e767a8708354e5390d69ebb2840835d4426cd180df898df4";
const PARTNERS_PKG = "0x2998c10c91e46082548b2f3205f84f09377bbbedf2b0f617f70575a09ec69a54";
const MIGRATORS_VERSION = "0x05057043d181d3c31f2e1990b6b7ac17c6814feb3069332b47eb8a6cd5d6b6b6";
const VENUE_CONFIG = "0x7ee32ce175c6aec6bb0c30c1d72a8bea02ea50701a67780b53b6ba84d0dbbf64";
const CETUS_GLOBAL_CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";
const CETUS_POOLS = "0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0";
const LAUNCH_REGISTRY = "0xfd17081d0992842070b4d59ee8eae94a088959a8e6692f06aebe71f39ddf6cc1";
const COIN_REGISTRY = "0x000000000000000000000000000000000000000000000000000000000000000c";
const TEMPLATE_PACKAGE = "0x5d51b557205a34b86d3e3728ebee2201315a2a19eac420a4323426bdbc6594d8";
const TEMPLATE_NAMES = { module: "blast", struct: "BLAST" };
const TEMPLATE_DEPS = [
  "0x1", "0x2",
  "0xb4c52669d7a07ce26d8fc91ba577b0a05f1f3d0cb9b1ba230c6419fb7ddd55fd",
  PARTNERS_PKG,
  "0x85fdb7e3d28162b99e0df758069a3d23cff874c400b2160fc0d4618aefd3ec5c",
  DOMAIN_PKG,
  BLAST_V2_LAUNCH_PKG,
];
const SUI = "0x2::sui::SUI";

// Blast app defaults read from the live launch: 1,000 SUI virtual quote and
// graduation target, allocation bps 7823/1927/9850, owner LP route 100%, tick 200.
export const BLAST_V2_DEFAULTS = {
  virtualQuote: 1_000_000_000_000n,
  graduationTarget: 1_000_000_000_000n,
  allocationBps: [7823, 1927, 9850] as const,
  ownerLpBps: 10_000,
  cetusTickSpacing: 200,
};

const BLACKLIST = ["SUI", "ETH", "USDC", "USDT", "SOL", "BNB", "WBNB", "WETH", "BTC", "WBTC", "BLAST"];
const MOVE_KEYWORDS = new Set(["abort", "acquires", "as", "break", "const", "continue", "copy", "else", "false", "fun", "friend", "if", "let", "loop", "module", "move", "mut", "native", "public", "return", "struct", "true", "use", "while", "enum", "match", "type"]);

export interface BlastV2LaunchInput { symbol: string; name: string; description: string; iconUrl: string }
export interface BlastV2LaunchResult { status: "CONFIRMED" | "FAILED"; error: string | null; coinType: string | null; poolId: string | null; digest: string | null }

const fail = (error: string, extra: Partial<BlastV2LaunchResult> = {}): BlastV2LaunchResult => ({ status: "FAILED", error, coinType: null, poolId: null, digest: null, ...extra });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Created = { objectId: string; objectType: string; version: string; digest: string };
async function receipt(digest: string): Promise<{ ok: boolean; error: string | null; created: Created[] }> {
  for (let i = 0; i < 12; i += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      objectChanges?: { type: string; objectId?: string; objectType?: string; version?: string; digest?: string }[];
    }>("sui_getTransactionBlock", [digest, { showEffects: true, showObjectChanges: true }]).catch(() => null);
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: block?.effects?.status?.error ?? null,
        created: (block?.objectChanges ?? [])
          .flatMap((c) => c.type === "created" && c.objectId && c.objectType && c.version && c.digest
            ? [{ objectId: c.objectId, objectType: normalizeType(c.objectType), version: String(c.version), digest: c.digest }]
            : []),
      };
    }
    await sleep(1500);
  }
  return { ok: false, error: "Transaction not visible on chain.", created: [] };
}

export async function blastV2TemplateModule(): Promise<Uint8Array> {
  const data = await gql<{ object: { asMovePackage: { modules: { nodes: { name: string; bytes: string }[] } } | null } | null }>(
    `query($a:SuiAddress!){object(address:$a){asMovePackage{modules{nodes{name bytes}}}}}`,
    { a: TEMPLATE_PACKAGE },
  );
  const mod = data.object?.asMovePackage?.modules.nodes.find((m) => m.name === TEMPLATE_NAMES.module);
  if (!mod) throw new Error("Could not read the Blast.fun coin template from chain.");
  return Uint8Array.from(Buffer.from(mod.bytes, "base64"));
}

export function coinModuleName(symbol: string): string {
  const m = symbol.toLowerCase();
  return MOVE_KEYWORDS.has(m) ? `${m}_coin` : m;
}

/** Finalization deletes the receiving Currency and creates a different shared ID. */
export async function findBlastV2Currency(coinType: string): Promise<string | null> {
  const type = normalizeType(`0x2::coin_registry::Currency<${coinType}>`);
  const data = await gql<{ objects: { nodes: {
    address: string;
    owner: { __typename: string } | null;
    asMoveObject: { contents: { type: { repr: string } } | null } | null;
  }[] } }>(
    `query($t:String!){objects(first:3,filter:{type:$t}){nodes{address owner{__typename} asMoveObject{contents{type{repr}}}}}}`,
    { t: type },
  );
  const matches = data.objects.nodes.filter((node) => node.owner?.__typename === "Shared"
    && normalizeType(node.asMoveObject?.contents?.type.repr ?? "") === type);
  return matches.length === 1 ? matches[0]?.address ?? null : null;
}

/** Submit registration at most once; another actor may win before or during it. */
export async function ensureBlastV2Currency(actions: {
  lookup: () => Promise<string | null>;
  register: () => Promise<void>;
  wait: () => Promise<void>;
}): Promise<string> {
  const existing = await actions.lookup();
  if (existing) return existing;
  let registrationError: unknown;
  try { await actions.register(); } catch (error) { registrationError = error; }
  for (let i = 0; i < 8; i += 1) {
    const shared = await actions.lookup();
    if (shared) return shared;
    if (i < 7) await actions.wait();
  }
  throw registrationError ?? new Error("The shared coin Currency has not appeared; curve opening stopped.");
}

/** Step 1 transaction (publish), exported for unsigned simulation. */
export async function buildBlastV2Publish(input: BlastV2LaunchInput, sender: string): Promise<Transaction> {
  const symbol = input.symbol.toUpperCase();
  const bytes = patchBlastV2Template(zeroSelfAddress(await blastV2TemplateModule()), TEMPLATE_NAMES, {
    module: coinModuleName(symbol),
    struct: symbol,
    symbol,
    name: (input.name.trim() || symbol).slice(0, 64),
    description: input.description.trim().slice(0, 500) || `${input.name} — launched on Blast.fun via OurBlast.`,
    iconUrl: input.iconUrl,
    creator: sender,
  });
  const tx = new Transaction();
  tx.setSender(sender);
  const [cap] = tx.publish({ modules: [Array.from(bytes)], dependencies: TEMPLATE_DEPS.map((d) => d.replace(/^0x/, "").padStart(64, "0")).map((d) => `0x${d}`) });
  if (!cap) throw new Error("The publish transaction has no upgrade capability.");
  tx.moveCall({ target: "0x2::package::make_immutable", arguments: [cap] });
  return tx;
}

/** Step 3: build the launch PTB from the objects step 1/2 created. */
export async function buildBlastV2Launch(args: {
  coinType: string;
  ticket: Created;
  sealedCap: Created;
  currencyId: string;
  partnerId?: string | null;
}): Promise<{ tx: Transaction }> {
  const { coinType } = args;
  const tx = new Transaction();
  const ver = tx.sharedObjectRef({ ...BLAST_V2_VERSION, mutable: false });
  const cfgRef = await sharedRef(BLAST_V2_LAUNCH_CONFIG);
  const cfg = () => tx.sharedObjectRef({ ...cfgRef, mutable: false });
  const ref = async (id: string, mutable: boolean) => tx.sharedObjectRef({ ...(await sharedRef(id)), mutable });
  // Live order: cetus::prepare borrows the SealedTreasuryCap; launch::new consumes ticket + cap.
  const ticket = tx.objectRef({ objectId: args.ticket.objectId, version: args.ticket.version, digest: args.ticket.digest });
  const sealedCap = tx.objectRef({ objectId: args.sealedCap.objectId, version: args.sealedCap.version, digest: args.sealedCap.digest });
  const venue = `${MIGRATORS_PKG}::cetus::Venue`;
  const types = [coinType, SUI];

  const admission = tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch_config::venue_admission`, typeArguments: [venue], arguments: [cfg()] });
  const venueTicket = tx.moveCall({
    target: `${MIGRATORS_PKG}::cetus::prepare`,
    typeArguments: types,
    arguments: [await ref(MIGRATORS_VERSION, false), await ref(VENUE_CONFIG, true), await ref(CETUS_GLOBAL_CONFIG, false), await ref(CETUS_POOLS, true), sealedCap, admission, tx.pure.u32(BLAST_V2_DEFAULTS.cetusTickSpacing)],
  });
  const init = tx.moveCall({
    target: `${BLAST_V2_LAUNCH_PKG}::launch::new`,
    typeArguments: types,
    arguments: [ticket, sealedCap, ver, cfg(), venueTicket],
  });
  tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::set_virtual_quote`, typeArguments: types, arguments: [init, ver, tx.pure.u64(BLAST_V2_DEFAULTS.virtualQuote)] });
  tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::set_graduation_target`, typeArguments: types, arguments: [init, ver, tx.pure.u64(BLAST_V2_DEFAULTS.graduationTarget)] });
  const bps = (n: number) => tx.moveCall({ target: `${DOMAIN_PKG}::bps::new`, arguments: [tx.pure.u64(n)] });
  const [a, b, c] = BLAST_V2_DEFAULTS.allocationBps;
  const shares = tx.makeMoveVec({ type: `${BLAST_V2_LAUNCH_PKG}::allocation::RecipientShare`, elements: [] });
  const plan = tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::allocation::plan`, arguments: [bps(a), bps(b), bps(c), shares] });
  tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::set_allocation_plan`, typeArguments: types, arguments: [init, ver, plan] });
  const dest = tx.moveCall({ target: `${DOMAIN_PKG}::fee_split::owner_destination` });
  const route = tx.moveCall({ target: `${DOMAIN_PKG}::fee_split::route`, arguments: [dest, bps(BLAST_V2_DEFAULTS.ownerLpBps)] });
  const routes = tx.makeMoveVec({ type: `${DOMAIN_PKG}::fee_split::Route`, elements: [route] });
  const split = tx.moveCall({ target: `${DOMAIN_PKG}::fee_split::new`, arguments: [routes] });
  tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::set_lp_fee_split`, typeArguments: types, arguments: [init, ver, split] });
  if (args.partnerId) {
    tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::set_partner`, typeArguments: types, arguments: [init, ver, cfg(), await ref(args.partnerId, false), tx.object.clock()] });
  }
  const fee = tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
  const launch = tx.moveCall({
    target: `${BLAST_V2_LAUNCH_PKG}::launch::finalize`,
    typeArguments: types,
    arguments: [init, ver, await ref(LAUNCH_REGISTRY, true), await ref(args.currencyId, true), cfg(), fee],
  });
  tx.moveCall({ target: `${BLAST_V2_LAUNCH_PKG}::launch::share`, typeArguments: types, arguments: [launch, ver, tx.object.clock()] });
  void BLAST_V2_RUNTIME;
  return { tx };
}

export function validateBlastV2Symbol(raw: string, name: string): string | null {
  const symbol = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) return null;
  if (BLACKLIST.includes(symbol) || BLACKLIST.includes(name.trim().toUpperCase())) return null;
  return symbol;
}

export async function launchOnBlastV2(input: BlastV2LaunchInput): Promise<BlastV2LaunchResult> {
  const name = input.name.trim() || input.symbol;
  const symbol = validateBlastV2Symbol(input.symbol, name);
  if (!symbol) return fail("Ticker must be 2–10 letters/digits starting with a letter, and not a reserved name.");
  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();
  const gasPrice = await referenceGasPrice().catch(() => 1000);
  const gas = async () => {
    for (let i = 0; i < 8; i += 1) { const g = await gasCoins(sender).catch(() => []); if (g.length) return g; await sleep(1500); }
    return [];
  };

  // 1 — publish the coin.
  let publishTx: Transaction;
  try { publishTx = await buildBlastV2Publish({ ...input, symbol, name }, sender); } catch (e) { return fail(`Could not prepare the coin: ${(e as Error).message}`); }
  const g1 = await gas();
  if (!g1.length) return fail("The bot wallet has no SUI for gas.");
  withGas(publishTx, sender, g1, gasPrice, 200_000_000);
  const pub = await signAndExecute(publishTx, keypair);
  if (!pub.ok || !pub.digest) return fail(pub.error ?? "Coin publish failed.");
  const r1 = await receipt(pub.digest);
  if (!r1.ok) return fail(r1.error ?? "Coin publish failed on chain.");
  const ticket = r1.created.find((c) => c.objectType.includes("::launch_ticket::LaunchTicket<"));
  const sealedCap = r1.created.find((c) => c.objectType.includes("::sealed_treasury_cap::SealedTreasuryCap<"));
  const currency = r1.created.find((c) => c.objectType.includes("::coin_registry::Currency<"));
  if (!ticket || !sealedCap || !currency) return fail("The coin published but its launch ticket did not appear.");
  const coinType = ticket.objectType.slice(ticket.objectType.indexOf("<") + 1, -1);

  // 2 — resolve the shared Currency, including permissionless-finalization races.
  let currencyId: string;
  try {
    currencyId = await ensureBlastV2Currency({
      lookup: () => findBlastV2Currency(coinType),
      wait: () => sleep(1500),
      register: async () => {
        const reg = new Transaction();
        withGas(reg, sender, await gas(), gasPrice, 50_000_000);
        reg.moveCall({
          target: "0x2::coin_registry::finalize_registration",
          typeArguments: [coinType],
          arguments: [reg.object(COIN_REGISTRY), reg.receivingRef({ objectId: currency.objectId, version: currency.version, digest: currency.digest })],
        });
        const fin = await signAndExecute(reg, keypair);
        if (!fin.ok || !fin.digest) throw new Error(fin.error ?? "Coin registration failed.");
        const r2 = await receipt(fin.digest);
        if (!r2.ok) throw new Error(r2.error ?? "Coin registration failed on chain.");
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Coin registration could not be verified.", { coinType });
  }

  // 3 — open the Blast.fun curve.
  const partnerId = process.env["BLAST_PARTNER_ID"]?.trim() || null;
  let tx: Transaction;
  try {
    ({ tx } = await buildBlastV2Launch({ coinType, ticket, sealedCap, currencyId, partnerId }));
  } catch (error) {
    return fail(`Could not prepare the curve: ${error instanceof Error ? error.message : "shared object read failed"}`, { coinType });
  }
  withGas(tx, sender, await gas(), gasPrice, 300_000_000);
  const made = await signAndExecute(tx, keypair);
  if (!made.ok || !made.digest) return fail(made.error ?? "Blast.fun launch failed.", { coinType });
  const r3 = await receipt(made.digest);
  if (!r3.ok) return fail(r3.error ?? "Blast.fun launch failed on chain.", { coinType, digest: made.digest });
  const launchObj = r3.created.find((c) => c.objectType.includes("::launch::Launch<"));
  if (!launchObj) return fail("The transaction succeeded but no Blast.fun launch appeared.", { coinType, digest: made.digest });
  return { status: "CONFIRMED", error: null, coinType, poolId: launchObj.objectId, digest: made.digest };
}
