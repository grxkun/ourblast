// SPDX-License-Identifier: BUSL-1.1
/**
 * Edge-safe Mayan EVM → Sui (MCTP) transaction builder: REST quotes + viem
 * ABI encoding. Mirrors the SDK's getMctpFromEvmTxPayload (auction path)
 * without pulling Solana libraries into the worker bundle.
 */
import { encodeFunctionData, pad, parseUnits, type Hex } from "viem";

export const MAYAN_FORWARDER = "0x337685fdaB40D39bd02028545a4FfA7D287cC3E2" as Hex;
const PRICE_API = "https://price-api.mayan.finance/v3";
const SDK_VERSION = "15_2_2";
const ZERO = "0x0000000000000000000000000000000000000000";
const WH_SUI = 21;
const WH_CHAIN: Record<string, number> = { base: 30, arbitrum: 23 };
const ZERO32 = pad("0x", { size: 32 }); // Solana system program = 32 zero bytes

const createOrderAbi = [{
  type: "function", name: "createOrder", stateMutability: "payable", outputs: [{ name: "sequence", type: "uint64" }],
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "gasDrop", type: "uint64" },
    { name: "destAddr", type: "bytes32" }, { name: "destChain", type: "uint16" }, { name: "tokenOut", type: "bytes32" },
    { name: "minAmountOut", type: "uint64" }, { name: "deadline", type: "uint64" }, { name: "redeemFee", type: "uint64" },
    { name: "referrerAddr", type: "bytes32" }, { name: "referrerBps", type: "uint8" },
  ] }],
}] as const;

const permit = { name: "permitParams", type: "tuple", components: [
  { name: "value", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
] } as const;

export const forwarderAbi = [
  { type: "function", name: "forwardERC20", stateMutability: "payable", outputs: [], inputs: [
    { name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }, permit, { name: "mayanProtocol", type: "address" }, { name: "protocolData", type: "bytes" },
  ] },
  { type: "function", name: "swapAndForwardEth", stateMutability: "payable", outputs: [], inputs: [
    { name: "amountIn", type: "uint256" }, { name: "swapProtocol", type: "address" }, { name: "swapData", type: "bytes" },
    { name: "middleToken", type: "address" }, { name: "minMiddleAmount", type: "uint256" }, { name: "mayanProtocol", type: "address" }, { name: "mayanData", type: "bytes" },
  ] },
] as const;

export interface MayanQuote {
  type: string;
  hasAuction: boolean;
  fromChain: string;
  toChain: string;
  fromToken: { contract: string };
  toToken: { contract: string; verifiedAddress?: string; decimals: number };
  effectiveAmountIn64: string;
  bridgeFee: number;
  gasDrop: number;
  redeemRelayerFee: number;
  minAmountOut: number;
  minMiddleAmount?: number;
  mctpInputContract: string;
  mctpMayanContract: string;
  deadline64: string;
  referrerBps?: number;
  slippageBps: number;
}

/** SDK-identical fixed-point conversion (truncates to ≤8 decimals). */
export function fractional(amount: number, decimals: number): bigint {
  const cut = Math.min(8, decimals);
  const m = Number(amount).toFixed(cut + 1).match(new RegExp(`^-?\\d+(?:\\.\\d{0,${cut}})?`));
  if (!m) throw new Error("Bad amount");
  return parseUnits(m[0], decimals);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = (await res.json()) as T & { message?: string };
  if (!res.ok) throw new Error(`Mayan: ${json.message ?? res.status}`);
  return json;
}

export async function fetchMayanQuote(chain: string, token: string, amount: bigint, toToken = "0x2::sui::SUI"): Promise<MayanQuote> {
  const q = new URLSearchParams({
    amountIn64: amount.toString(), fromToken: token, fromChain: chain, toToken, toChain: "sui",
    slippageBps: "300", swift: "true", mctp: "true", fastMctp: "true", sdkVersion: SDK_VERSION,
  });
  const json = await getJson<{ quotes?: MayanQuote[] }>(`${PRICE_API}/quote?${q}`);
  const quote = json.quotes?.find((x) => x.type === "MCTP" && x.hasAuction);
  if (!quote) throw new Error("No Mayan MCTP route for this deposit.");
  return quote;
}

export async function fetchMayanRouterSwap(quote: MayanQuote): Promise<{ swapRouterAddress: Hex; swapRouterCalldata: Hex }> {
  const q = new URLSearchParams({
    fromToken: quote.fromToken.contract, slippageBps: String(quote.slippageBps), forwarderAddress: MAYAN_FORWARDER,
    amountIn64: quote.effectiveAmountIn64, chainName: quote.fromChain, middleToken: quote.mctpInputContract, sdkVersion: SDK_VERSION,
  });
  return getJson(`${PRICE_API}/get-swap/evm?${q}`);
}

/** Builds the forwarder tx for an auction MCTP quote into a Sui address. Pure. */
export function buildMayanTx(quote: MayanQuote, suiDestination: string, router?: { swapRouterAddress: Hex; swapRouterCalldata: Hex }): { to: Hex; data: Hex; value: bigint } {
  if (quote.type !== "MCTP" || !quote.hasAuction) throw new Error("Unsupported Mayan route.");
  if (quote.toChain !== "sui" || !WH_CHAIN[quote.fromChain]) throw new Error("Unsupported Mayan chain.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(suiDestination)) throw new Error("Invalid Sui destination.");
  if (!quote.toToken.verifiedAddress || !Number(quote.deadline64)) throw new Error("Incomplete Mayan quote.");
  const bridgeFee = fractional(quote.bridgeFee, 18);
  const amountIn = BigInt(quote.effectiveAmountIn64);
  const mayanData = encodeFunctionData({
    abi: createOrderAbi,
    functionName: "createOrder",
    args: [{
      tokenIn: quote.mctpInputContract as Hex,
      amountIn,
      gasDrop: fractional(quote.gasDrop, 8),
      destAddr: pad(suiDestination as Hex, { size: 32 }),
      destChain: WH_SUI,
      tokenOut: quote.toToken.contract === ZERO ? ZERO32 : pad(quote.toToken.verifiedAddress as Hex, { size: 32 }),
      minAmountOut: fractional(quote.minAmountOut, Math.min(8, quote.toToken.decimals)),
      deadline: BigInt(quote.deadline64),
      redeemFee: fractional(quote.redeemRelayerFee, 6),
      referrerAddr: ZERO32,
      referrerBps: quote.referrerBps ?? 0,
    }],
  });
  const mayan = quote.mctpMayanContract as Hex;
  if (quote.fromToken.contract.toLowerCase() === quote.mctpInputContract.toLowerCase()) {
    const data = encodeFunctionData({ abi: forwarderAbi, functionName: "forwardERC20", args: [quote.mctpInputContract as Hex, amountIn, { value: 0n, deadline: 0n, v: 0, r: ZERO32, s: ZERO32 }, mayan, mayanData] });
    return { to: MAYAN_FORWARDER, data, value: bridgeFee };
  }
  if (quote.fromToken.contract !== ZERO) throw new Error("Only ETH or USDC deposits are supported.");
  if (!router || quote.minMiddleAmount == null) throw new Error("Mayan swap route missing.");
  if (amountIn <= bridgeFee) throw new Error("Amount in is less than bridge fee");
  const data = encodeFunctionData({
    abi: forwarderAbi,
    functionName: "swapAndForwardEth",
    args: [amountIn - bridgeFee, router.swapRouterAddress, router.swapRouterCalldata, quote.mctpInputContract as Hex, fractional(quote.minMiddleAmount, 6), mayan, mayanData],
  });
  return { to: MAYAN_FORWARDER, data, value: amountIn };
}
