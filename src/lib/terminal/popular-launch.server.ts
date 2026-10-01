/**
 * OurBlast launch path for POPULAR (popularsui.xyz), traced from POPULAR's own
 * launch client and verified against the live Move signatures:
 *
 *   1. Publish POPULAR's coin template (6 decimals, zero supply) + make_immutable.
 *      Its init keeps the TreasuryCap and MetadataCap with the sender and hands
 *      Currency<T> to the coin registry.
 *   2. 0x2::coin_registry::finalize_registration → Currency<T> becomes shared.
 *   3. curve::create<T>(config, treasury, cetus config, cetus pools, treasury cap,
 *      metadata cap, &Currency<T>, fee coin, dev buy, website, x, telegram,
 *      fee mode, Random, Clock) opens the bonding curve.
 *   4. When the launcher's wallet is known, curve::transfer_creator hands the
 *      curve's creator role (and its creator fees) to that wallet.
 *
 * Nothing is reported as launched until Sui confirms curve::Created.
 */
import { Transaction } from "@mysten/sui/transactions";

import { patchCoinTemplateByValue } from "./maelstrom-template.server";
import { tokenIconUrl } from "./xLauncher";
import {
  gasCoins,
  loadDeployer,
  normalizeType,
  referenceGasPrice,
  rpc,
  sharedRef,
  signAndExecute,
  withGas,
} from "./suipump-launch.server";

export const POPULAR_ORIGINAL_PACKAGE = "0x918d32f8a0b349584e96113ec425708374161d4798f8c28d63362602831b33ef";
export const POPULAR_LATEST_PACKAGE = "0x0b53342164c85a911bb34e997bf51173e781c5e8578c771d1fd8997c5a82d657";
export const POPULAR_CONFIG = "0xc5ebd57da4387a39b5af7cd149242d437c0d195471b4e0534c08d868e77e7015";
export const POPULAR_TREASURY = "0x1468a17bb12c64ac7254d46c8b67a2cb77dca087ef14e49e9fafb93c53f756b8";
const CETUS_GLOBAL_CONFIG = "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";
const CETUS_POOLS = "0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0";
const COIN_REGISTRY = "0xc";
const RANDOM = "0x8";
const CLOCK = "0x6";
/** Fee mode 0 = the creator keeps the creator share. */
const FEE_MODE_CREATOR = 0;
const PUBLISH_BUDGET = 300_000_000;
const LAUNCH_BUDGET = 500_000_000;
const GAS_HEADROOM_MIST = 1_000_000_000n;
export const POPULAR_EVENT_CREATED = `${POPULAR_ORIGINAL_PACKAGE}::curve::Created`;

/** POPULAR's public coin template (from its launch form). */
const TEMPLATE_B64 =
  "oRzrCwcAAAUKAQAMAgweAyohBEsIBVNaB60BwwEI8AJgBtADXQqtBAUMsgQ6AA8BDgIGAgcCEAIRAAMCAAECBwACBAwBAAEDAAABAAEDAQwBAAEFBQIAAAoAAQABEgMEAAMJCAkBAAMLBgcBAgQMDQEBDAUNCgsAAwUCBQQMBA4CCAAHCAUAAgsEAQgACwIBCAABCgIBCAEBCAAHCQACCAEIAQgBCAEHCAUCCwMBCQALAgEJAAILAwEJAAcIBQELBAEJAAEGCAUBBQELAgEIAAIJAAUBCwQBCAATQ3VycmVuY3lJbml0aWFsaXplcgtNZXRhZGF0YUNhcAZTdHJpbmcFVE9LRU4LVHJlYXN1cnlDYXAJVHhDb250ZXh0BGNvaW4NY29pbl9yZWdpc3RyeQtkdW1teV9maWVsZAhmaW5hbGl6ZQRpbml0FW5ld19jdXJyZW5jeV93aXRoX290dw9wdWJsaWNfdHJhbnNmZXIGc2VuZGVyBnN0cmluZwV0b2tlbgh0cmFuc2Zlcgp0eF9jb250ZXh0BHV0ZjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAQYKAgUEVE1QTAoCDg1UZW1wbGF0ZSBDb2luCgIaGVRlbXBsYXRlIENvaW4gRGVzY3JpcHRpb24KAiEgaHR0cHM6Ly9wb3B1bGFyLmZ1bi90ZW1wbGF0ZS5wbmcAAgEIAQAAAAACGwsABwAHAREBBwIRAQcDEQEHBBEBCgE4AAwDCgE4AQwCCwMKAS4RBTgCCwILAS4RBTgDAgAA";

const TEMPLATE_IDS = new Set(
  "CurrencyInitializer MetadataCap String TOKEN TreasuryCap TxContext coin coin_registry dummy_field finalize init new_currency_with_otw public_transfer sender string token transfer tx_context utf8"
    .split(" ")
    .map((id) => id.toLowerCase()),
);
const MOVE_KEYWORDS = new Set(
  "abort.acquires.as.break.const.continue.copy.else.entry.enum.false.friend.fun.has.if.invariant.let.loop.macro.match.module.move.mut.native.public.return.script.spec.struct.true.type.use.while".split("."),
);
/** Tickers POPULAR's own form prefixes with coin_ (well-known coins). */
const KNOWN_TICKERS = new Set(
  "SUI WSUI USDC USDT USDY AUSD FDUSD BUCK WAL DEEP CETUS NS NAVX SCA HASUI AFSUI VSUI BTC WBTC LBTC ETH WETH SOL APT".split(" "),
);
const RESERVED_TICKERS = new Set(["POP", "POPULAR"]);

export function popularModuleName(symbol: string): { module: string; witness: string } {
  const lower = symbol.toLowerCase();
  const module =
    /^[0-9]/.test(lower) || MOVE_KEYWORDS.has(lower) || TEMPLATE_IDS.has(lower) || KNOWN_TICKERS.has(symbol.toUpperCase())
      ? `coin_${lower}`
      : lower;
  return { module, witness: module.toUpperCase() };
}

/** The template's text constants must stay unique: nudge a name equal to the ticker. */
export function popularCoinName(name: string, symbol: string): string {
  const trimmed = name.trim().slice(0, 64) || symbol;
  if (trimmed !== symbol) return trimmed;
  const title = symbol.charAt(0) + symbol.slice(1).toLowerCase();
  return title !== symbol ? title : `${symbol} Token`;
}

export interface PopularLaunchInput {
  symbol: string;
  name: string;
  description: string;
  iconUrl: string;
  website?: string | null;
  xLink?: string | null;
  telegram?: string | null;
  /** Launcher wallet that should own the curve's creator role; null keeps it with the bot. */
  creatorWallet?: string | null;
}

export interface PopularLaunchResult {
  status: "CONFIRMED" | "FAILED";
  error: string | null;
  digest: string | null;
  coinType: string | null;
  curveId: string | null;
  creatorTransferred: boolean;
}

const fail = (error: string, extra: Partial<PopularLaunchResult> = {}): PopularLaunchResult => ({
  status: "FAILED",
  error,
  digest: null,
  coinType: null,
  curveId: null,
  creatorTransferred: false,
  ...extra,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Receipt {
  ok: boolean;
  error: string | null;
  created: { objectId: string; objectType: string; version: string; digest: string }[];
  events: { type: string; parsedJson: Record<string, unknown> }[];
}

async function receipt(digest: string): Promise<Receipt> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const block = await rpc<{
      effects?: { status?: { status?: string; error?: string } };
      events?: { type?: string; parsedJson?: Record<string, unknown> }[];
      objectChanges?: { type: string; objectId?: string; objectType?: string; version?: string; digest?: string }[];
    }>("sui_getTransactionBlock", [digest, { showEffects: true, showEvents: true, showObjectChanges: true }]).catch(
      () => null,
    );
    const status = block?.effects?.status?.status;
    if (status) {
      return {
        ok: status === "success",
        error: status === "success" ? null : block?.effects?.status?.error ?? "Transaction failed.",
        created: (block?.objectChanges ?? [])
          .filter((c) => c.type === "created" && c.objectId && c.objectType)
          .map((c) => ({
            objectId: c.objectId as string,
            objectType: normalizeType(c.objectType as string),
            version: String(c.version),
            digest: c.digest as string,
          })),
        events: (block?.events ?? [])
          .filter((e) => typeof e.type === "string")
          .map((e) => ({ type: normalizeType(e.type as string), parsedJson: e.parsedJson ?? {} })),
      };
    }
    await sleep(1500);
  }
  return { ok: false, error: "Transaction not visible on chain.", created: [], events: [] };
}

async function freshGas(sender: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const coins = await gasCoins(sender).catch(() => []);
    if (coins.length > 0) return coins;
    await sleep(1500);
  }
  return [];
}

/** Live POPULAR settings: launch fee and whether new launches are allowed. */
async function popularSettings(): Promise<{ launchFee: bigint }> {
  const result = await rpc<{
    data?: { content?: { fields?: { sell_only?: boolean; params?: { fields?: { launch_fee?: string } } } } | null };
  }>("sui_getObject", [POPULAR_CONFIG, { showContent: true }]);
  const fields = result.data?.content?.fields;
  if (!fields?.params?.fields?.launch_fee) throw new Error("Could not read POPULAR's launch settings.");
  if (fields.sell_only) throw new Error("POPULAR launches are paused right now.");
  return { launchFee: BigInt(fields.params.fields.launch_fee) };
}

const short = (value: string | null | undefined, max: number) => (value ?? "").trim().slice(0, max);

export async function launchOnPopular(input: PopularLaunchInput): Promise<PopularLaunchResult> {
  const symbol = input.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) return fail("Ticker must be 2–10 letters/digits starting with a letter.");
  if (RESERVED_TICKERS.has(symbol)) return fail(`$${symbol} is reserved on POPULAR.`);
  const name = popularCoinName(input.name, symbol);
  const description = short(input.description, 280) || `${name} — launched on POPULAR via OurBlast.`;
  const iconUrl = tokenIconUrl(input.iconUrl).slice(0, 300);
  const { module, witness } = popularModuleName(symbol);

  const keypair = await loadDeployer();
  if (!keypair) return fail("The bot launch wallet is not configured.");
  const sender = keypair.getPublicKey().toSuiAddress();

  let settings: { launchFee: bigint };
  try {
    settings = await popularSettings();
  } catch (error) {
    return fail((error as Error).message);
  }
  const balance = await rpc<{ totalBalance?: string }>("suix_getBalance", [sender, "0x2::sui::SUI"])
    .then((r) => BigInt(r.totalBalance ?? "0"))
    .catch(() => 0n);
  const needed = settings.launchFee + GAS_HEADROOM_MIST;
  if (balance > 0n && balance < needed) {
    return fail(`The bot wallet needs about ${Number(needed) / 1e9} SUI for POPULAR's launch fee and gas.`);
  }

  let bytes: Uint8Array;
  try {
    bytes = patchCoinTemplateByValue(
      new Uint8Array(Buffer.from(TEMPLATE_B64, "base64")),
      { token: module, TOKEN: witness },
      {
        TMPL: symbol,
        "Template Coin": name,
        "Template Coin Description": description,
        "https://popular.fun/template.png": iconUrl,
      },
    );
  } catch (error) {
    return fail(`Could not prepare the coin: ${(error as Error).message}`);
  }

  const gasPrice = await referenceGasPrice().catch(() => 1000);

  // Step 1 — publish the coin.
  const publishGas = await freshGas(sender);
  if (publishGas.length === 0) return fail("The bot wallet has no SUI coin left to pay gas.");
  const publishTx = new Transaction();
  withGas(publishTx, sender, publishGas, gasPrice, PUBLISH_BUDGET);
  const [upgradeCap] = publishTx.publish({
    modules: [Array.from(bytes)],
    dependencies: [
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    ],
  });
  publishTx.moveCall({ target: "0x2::package::make_immutable", arguments: [upgradeCap!] });
  const publishRun = await signAndExecute(publishTx, keypair);
  if (!publishRun.ok || !publishRun.digest) return fail(publishRun.error ?? "Coin publish failed.");
  const published = await receipt(publishRun.digest);
  if (!published.ok) return fail(published.error ?? "Coin publish failed on chain.");
  const treasuryCap = published.created.find((c) => /^0x2::coin::TreasuryCap<.+>$/.test(c.objectType));
  const metadataCap = published.created.find((c) => /^0x2::coin_registry::MetadataCap<.+>$/.test(c.objectType));
  const currency = published.created.find((c) => /^0x2::coin_registry::Currency<.+>$/.test(c.objectType));
  if (!treasuryCap || !metadataCap || !currency) {
    return fail("The coin published but its caps did not appear in the launch wallet.", { digest: publishRun.digest });
  }
  const coinType = normalizeType(treasuryCap.objectType.replace(/^0x2::coin::TreasuryCap<(.+)>$/, "$1"));

  // Step 2 — finalize the registry entry so Currency<T> is shared.
  const [registryRef, registerGas] = await Promise.all([sharedRef(COIN_REGISTRY), freshGas(sender)]);
  if (registerGas.length === 0) return fail("The bot wallet has no SUI coin left to register the coin.", { coinType });
  const registerTx = new Transaction();
  withGas(registerTx, sender, registerGas, gasPrice, PUBLISH_BUDGET);
  registerTx.moveCall({
    target: "0x2::coin_registry::finalize_registration",
    typeArguments: [coinType],
    arguments: [registerTx.sharedObjectRef({ ...registryRef, mutable: true }), registerTx.receivingRef(currency)],
  });
  const registerRun = await signAndExecute(registerTx, keypair);
  if (!registerRun.ok || !registerRun.digest) {
    return fail(registerRun.error ?? "Coin registration failed.", { coinType, digest: publishRun.digest });
  }
  const registered = await receipt(registerRun.digest);
  if (!registered.ok) return fail(registered.error ?? "Coin registration failed on chain.", { coinType });

  // Step 3 — open the POPULAR curve. Finalizing creates the shared Currency at a new derived ID.
  const sharedCurrencyId =
    registered.created.find((c) => c.objectType.includes("::coin_registry::Currency<"))?.objectId ?? currency.objectId;
  let currencyRef: Awaited<ReturnType<typeof sharedRef>> | null = null;
  for (let attempt = 0; attempt < 8 && !currencyRef; attempt += 1) {
    currencyRef = await sharedRef(sharedCurrencyId).catch(() => null);
    if (!currencyRef) await sleep(1500);
  }
  if (!currencyRef) return fail("The coin registered but its shared metadata is not visible yet.", { coinType });

  const [configRef, treasuryRef, cetusConfigRef, cetusPoolsRef, randomRef, clockRef, launchGas] = await Promise.all([
    sharedRef(POPULAR_CONFIG),
    sharedRef(POPULAR_TREASURY),
    sharedRef(CETUS_GLOBAL_CONFIG),
    sharedRef(CETUS_POOLS),
    sharedRef(RANDOM),
    sharedRef(CLOCK),
    freshGas(sender),
  ]);
  if (launchGas.length === 0) return fail("The bot wallet has no SUI coin left to pay gas.", { coinType });

  const tx = new Transaction();
  withGas(tx, sender, launchGas, gasPrice, LAUNCH_BUDGET);
  const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(settings.launchFee)]);
  tx.moveCall({
    target: `${POPULAR_LATEST_PACKAGE}::curve::create`,
    typeArguments: [coinType],
    arguments: [
      tx.sharedObjectRef({ ...configRef, mutable: false }),
      tx.sharedObjectRef({ ...treasuryRef, mutable: true }),
      tx.sharedObjectRef({ ...cetusConfigRef, mutable: false }),
      tx.sharedObjectRef({ ...cetusPoolsRef, mutable: true }),
      tx.objectRef({ objectId: treasuryCap.objectId, version: treasuryCap.version, digest: treasuryCap.digest }),
      tx.objectRef({ objectId: metadataCap.objectId, version: metadataCap.version, digest: metadataCap.digest }),
      tx.sharedObjectRef({ ...currencyRef, mutable: false }),
      feeCoin!,
      tx.pure.u64(0), // no dev buy: the bot never buys for the creator
      tx.pure.string(short(input.website, 200)),
      tx.pure.string(short(input.xLink, 200)),
      tx.pure.string(short(input.telegram, 200)),
      tx.pure.u8(FEE_MODE_CREATOR),
      tx.sharedObjectRef({ ...randomRef, mutable: false }),
      tx.sharedObjectRef({ ...clockRef, mutable: false }),
    ],
  });
  const run = await signAndExecute(tx, keypair);
  if (!run.ok || !run.digest) return fail(run.error ?? "The POPULAR launch failed.", { coinType, digest: run.digest });
  const launched = await receipt(run.digest);
  if (!launched.ok) return fail(launched.error ?? "The POPULAR launch failed on chain.", { coinType, digest: run.digest });
  const created = launched.events.find((e) => e.type === normalizeType(POPULAR_EVENT_CREATED));
  const curveId = typeof created?.parsedJson["curve_id"] === "string" ? (created.parsedJson["curve_id"] as string) : null;
  if (!curveId) return fail("The launch finished without POPULAR's on-chain confirmation.", { coinType, digest: run.digest });

  // Step 4 — hand the creator role (and its fees) to the launcher's wallet.
  let creatorTransferred = false;
  const wallet = input.creatorWallet?.trim();
  if (wallet && /^0x[0-9a-fA-F]{64}$/.test(wallet) && wallet.toLowerCase() !== sender.toLowerCase()) {
    const [curveRef, cfgRef, gas] = await Promise.all([sharedRef(curveId), sharedRef(POPULAR_CONFIG), freshGas(sender)]);
    if (gas.length > 0) {
      const transfer = new Transaction();
      withGas(transfer, sender, gas, gasPrice, PUBLISH_BUDGET);
      transfer.moveCall({
        target: `${POPULAR_LATEST_PACKAGE}::curve::transfer_creator`,
        typeArguments: [coinType],
        arguments: [
          transfer.sharedObjectRef({ ...curveRef, mutable: true }),
          transfer.sharedObjectRef({ ...cfgRef, mutable: false }),
          transfer.pure.address(wallet),
        ],
      });
      const moved = await signAndExecute(transfer, keypair);
      creatorTransferred = moved.ok && !!moved.digest && (await receipt(moved.digest)).ok;
      if (!creatorTransferred) console.error("POPULAR transfer_creator failed", curveId, moved.error);
    }
  }

  return { status: "CONFIRMED", error: null, digest: run.digest, coinType, curveId, creatorTransferred };
}
