import { createPrivateKey, sign as nodeSign } from "node:crypto";

import { blake2b } from "@noble/hashes/blake2b";

/**
 * Minimal Turnkey API client for OurBank wallets. Keys live inside Turnkey's
 * hardware enclaves; this server only ever sees addresses and signatures.
 * Every request is stamped with the project's P-256 API key.
 */
const BASE_URL = "https://api.turnkey.com";

function config() {
  const organizationId = process.env['TURNKEY_ORGANIZATION_ID'];
  const publicKey = process.env['TURNKEY_API_PUBLIC_KEY'];
  const privateKey = process.env['TURNKEY_API_PRIVATE_KEY'];
  if (!organizationId || !publicKey || !privateKey) return null;
  return { organizationId, publicKey, privateKey };
}

export function turnkeyConfigured(): boolean {
  return config() !== null;
}

/** Builds the x-stamp header: P-256 signature over the exact request body. */
function stamp(body: string, publicKey: string, privateKey: string): string {
  // Turnkey API public keys are uncompressed P-256 points (04 || x || y).
  const raw = Buffer.from(publicKey, "hex");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: raw.subarray(1, 33).toString("base64url"),
    y: raw.subarray(33, 65).toString("base64url"),
    d: Buffer.from(privateKey, "hex").toString("base64url"),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const signature = nodeSign("sha256", Buffer.from(body), { key, dsaEncoding: "ieee-p1363" });
  const payload = JSON.stringify({
    publicKey,
    scheme: "SIGNATURE_SCHEME_TK_API_P256",
    signature: signature.toString("hex"),
  });
  return Buffer.from(payload).toString("base64url");
}

async function activity<T>(type: string, parameters: Record<string, unknown>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Turnkey is not configured.");
  const body = JSON.stringify({
    type: `ACTIVITY_TYPE_${type}`,
    timestampMs: String(Date.now()),
    organizationId: cfg.organizationId,
    parameters,
  });
  const res = await fetch(`${BASE_URL}/public/v1/submit/${snakeCase(type)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stamp": stamp(body, cfg.publicKey, cfg.privateKey) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Turnkey ${type} failed: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text) as { activity?: { result?: T } };
  if (!parsed.activity?.result) throw new Error(`Turnkey ${type} returned no result.`);
  return parsed.activity.result;
}

async function query<T>(path: string, parameters: Record<string, unknown>): Promise<T> {
  const cfg = config();
  if (!cfg) throw new Error("Turnkey is not configured.");
  const body = JSON.stringify({ organizationId: cfg.organizationId, ...parameters });
  const res = await fetch(`${BASE_URL}/public/v1/query/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stamp": stamp(body, cfg.publicKey, cfg.privateKey) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Turnkey ${path} failed: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

function snakeCase(type: string): string {
  return type.toLowerCase().replace(/_([a-z])/g, (_, c: string) => `_${c}`).replace(/_/g, "_");
}

export interface TurnkeySuiAccount {
  walletId: string;
  address: string;
  publicKey: string; // hex, 32-byte Ed25519 public key
}

/** Creates a fresh Sui (Ed25519) account inside a new Turnkey wallet. */
export async function createSuiWallet(name: string): Promise<TurnkeySuiAccount> {
  const result = await activity<{
    createWalletResult?: { walletId: string; addresses: { address: string; publicKey?: string }[] };
  }>("CREATE_WALLET", {
    walletName: name,
    accounts: [
      {
        curve: "CURVE_ED25519",
        pathFormat: "PATH_FORMAT_BIP32",
        path: "m/44'/784'/0'/0'/0'",
        addressFormat: "ADDRESS_FORMAT_SUI",
      },
    ],
  });
  const wallet = result.createWalletResult;
  const account = wallet?.addresses[0];
  if (!wallet || !account?.address) throw new Error("Turnkey did not return a wallet address.");
  return { walletId: wallet.walletId, address: account.address, publicKey: account.publicKey ?? "" };
}

/** The org user that owns this API key — needed as the target of key imports. */
async function whoamiUserId(): Promise<string> {
  const result = await query<{ userId?: string }>("whoami", {});
  if (!result.userId) throw new Error("Turnkey did not identify the API key user.");
  return result.userId;
}

/**
 * Imports an existing Sui private key into Turnkey. The key is encrypted to
 * the enclave's public key in this process and is never stored by us.
 */
export async function importSuiPrivateKey(name: string, privateKeyHex: string): Promise<TurnkeySuiAccount> {
  const cfg = config();
  if (!cfg) throw new Error("Turnkey is not configured.");
  const userId = await whoamiUserId();
  const init = await activity<{ initImportPrivateKeyResult?: { importBundle: string } }>(
    "INIT_IMPORT_PRIVATE_KEY",
    { userId },
  );
  const importBundle = init.initImportPrivateKeyResult?.importBundle;
  if (!importBundle) throw new Error("Turnkey did not return an import bundle.");
  const { encryptPrivateKeyToBundle } = await import("@turnkey/crypto");
  const encryptedBundle = encryptPrivateKeyToBundle({
    privateKey: privateKeyHex.replace(/^0x/, ""),
    keyFormat: "HEXADECIMAL",
    importBundle,
    userId,
    organizationId: cfg.organizationId,
  });
  const result = await activity<{
    importPrivateKeyResult?: { privateKeyId: string; addresses: { address: string; publicKey?: string }[] };
  }>("IMPORT_PRIVATE_KEY", {
    userId,
    privateKeyName: name,
    encryptedBundle,
    curve: "CURVE_ED25519",
    addressFormats: ["ADDRESS_FORMAT_SUI"],
  });
  const imported = result.importPrivateKeyResult;
  const account = imported?.addresses[0];
  if (!imported || !account?.address) throw new Error("Turnkey did not import the key.");
  return { walletId: imported.privateKeyId, address: account.address, publicKey: account.publicKey ?? "" };
}

/** Signs a raw 32-byte digest with a Turnkey-held Ed25519 key. Returns 64-byte signature. */
export async function signRawDigest(signWith: string, digest: Uint8Array): Promise<Uint8Array> {
  const result = await activity<{ signRawPayloadResult?: { r: string; s: string } }>("SIGN_RAW_PAYLOAD", {
    signWith,
    payload: Buffer.from(digest).toString("hex"),
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
  });
  const sig = result.signRawPayloadResult;
  if (!sig?.r || !sig.s) throw new Error("Turnkey did not return a signature.");
  return new Uint8Array(Buffer.from(sig.r + sig.s, "hex"));
}

/** Serialized Sui signature: scheme flag (0x00 = Ed25519) || 64-byte sig || 32-byte pubkey, base64. */
export function assembleSuiSignature(signature: Uint8Array, publicKey: Uint8Array): string {
  if (signature.length !== 64) throw new Error("Ed25519 signature must be 64 bytes.");
  if (publicKey.length !== 32) throw new Error("Ed25519 public key must be 32 bytes.");
  const serialized = new Uint8Array(1 + 64 + 32);
  serialized[0] = 0;
  serialized.set(signature, 1);
  serialized.set(publicKey, 65);
  return Buffer.from(serialized).toString("base64");
}

/** The message Sui wallets actually sign: intent bytes (0,0,0) prefix + tx bytes, blake2b-256. */
export function suiIntentDigest(txBytes: Uint8Array): Uint8Array {
  const intent = new Uint8Array(3 + txBytes.length);
  intent.set([0, 0, 0]); // TransactionData, V0, Sui
  intent.set(txBytes, 3);
  return blake2b(intent, { dkLen: 32 });
}

/**
 * Signs Sui transaction bytes the way a wallet would: blake2b over the
 * intent-prefixed message, then the serialized signature flag || sig || pubkey.
 */
export async function signSuiTransaction(
  signWith: string,
  publicKeyHex: string,
  txBytes: Uint8Array,
): Promise<string> {
  const signature = await signRawDigest(signWith, suiIntentDigest(txBytes));
  const publicKey = Buffer.from(publicKeyHex.replace(/^0x/, ""), "hex");
  return assembleSuiSignature(signature, publicKey);
}
