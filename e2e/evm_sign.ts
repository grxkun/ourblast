// Signs an EIP-191 message for the e2e test wallet: bun e2e/evm_sign.ts <privHex> <message>
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
const [priv, message] = process.argv.slice(2) as [string, string];
const m = new TextEncoder().encode(message);
const p = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`);
const rec = secp256k1.sign(keccak_256(new Uint8Array([...p, ...m])), Buffer.from(priv, "hex"), { prehash: false, format: "recovered" });
const pub = secp256k1.getPublicKey(Buffer.from(priv, "hex"), false);
const addr = "0x" + Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex");
process.stdout.write(JSON.stringify({ addr, sig: "0x" + Buffer.from([...rec.slice(1), rec[0]! + 27]).toString("hex") }));
