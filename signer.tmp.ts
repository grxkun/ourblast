import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { toBase64, fromBase64 } from "@mysten/sui/utils";
const kp = new Ed25519Keypair();
const address = kp.getPublicKey().toSuiAddress();
console.log("ADDRESS", address);
Bun.serve({
  port: 8099,
  async fetch(req) {
    const h = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const url = new URL(req.url);
    if (url.pathname === "/address") return Response.json({ address, publicKey: toBase64(kp.getPublicKey().toRawBytes()) }, { headers: h });
    const { messageB64 } = await req.json();
    const bytes = fromBase64(messageB64);
    const res = await kp.signPersonalMessage(bytes);
    return Response.json({ bytes: res.bytes, signature: res.signature }, { headers: h });
  },
});
