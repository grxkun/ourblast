// Perpsplexity (timecurve) — mainnet constants and helpers.
//
// Everything here was read verbatim from the official perpsplexity.app
// deployment config and its audited launch transaction builders — nothing is
// invented. A launch creates a meme coin AND a composite pool bound to a
// leveraged position on an underlying Aftermath market: the pool's NAV is
// backed by that position (market-backed memecoin, not a separate listing).

// Latest on-chain version of the launchpad package (upgrade of the original
// below). Read from live mainnet launches — the pad's own frontend calls this id.
export const PERPSPLEXITY_PACKAGE_ID =
  "0x70798463adae26d663d67b152e6531a4eaf48b541d6d3db11d730663dab20e8a";
/** Original (publish) package id — event types keep it, so match on this. */
export const PERPSPLEXITY_ORIGINAL_PACKAGE_ID =
  "0x97fea95545c04dc73f8174c6195013b100a26e3fa978e7cf8b100a51dfaf8354";
export const PERPSPLEXITY_CONFIG_ID =
  "0x7566f0f6508b7797f906c78ae5a39aaf1cd5aec58ff765b2599a6fba1dfce12c";
export const PERPSPLEXITY_LAUNCHPAD_ID =
  "0x6131090639b7c4a5af741ae1163e480f0b2cf50e74823d7c2261b5a3a3d5a586";
export const PERPSPLEXITY_ENGINE_PACKAGE_ID =
  "0x2ec50cc9740fa5cf75dd7d57e0cb3e1394f3b5cb153806b2168e8e3be681e8c1";
export const PERPSPLEXITY_AFTERMATH_PACKAGE_ID =
  "0x3ec740df8428aa9c93aaef7f8cc1542ac3194fd014826b51bfe245346d64efc7";
export const PERPSPLEXITY_REGISTRY_ID =
  "0xda0bd7a60182efd662b70e0de99218bbd2b6c4bbe9de23c0bb5a87ec52b37c37";
export const PERPSPLEXITY_LENDING_MARKET_ID =
  "0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1";
export const PERPSPLEXITY_LENDING_TYPE =
  "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL";
export const PERPSPLEXITY_QUOTE_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

export const PERPSPLEXITY_MEME_DECIMALS = 6n;
export const PERPSPLEXITY_MEME_SUPPLY = 1_000_000_000n;
export const PERPSPLEXITY_QUOTE_DECIMALS = 6;

// ---------------------------------------------------------------------------
// Virtual (bonding-curve) launches — the default, and the only path OurBlast
// uses. Read verbatim from live mainnet launch_registered transactions
// (FLUFFY, MIZU, CAT): quote is SUI, the pool seed is 1 SUI, supply is 1e15
// meme units and the curve's virtual quote is the starting cap minus the seed.
// Composite / market-backed pools are a separate product and are NOT used
// here: they need an Aftermath clearing house plus a Suilend market and kept
// failing at activation.
// ---------------------------------------------------------------------------

/**
 * Curves are quoted in native USDC — the pad's own launch form default, and
 * what the MONEROCHAN / BBW launches used on chain (quote_type usdc::USDC,
 * quote_reserve 1000000 = 1 USDC seed, virtual quote 4,999 USDC for the
 * 5,000 USDC starting cap).
 */
export const PERPSPLEXITY_CURVE_QUOTE_TYPE = PERPSPLEXITY_QUOTE_TYPE;
export const PERPSPLEXITY_CURVE_QUOTE_SYMBOL = "USDC";
export const PERPSPLEXITY_CURVE_QUOTE_DECIMALS = 6;
/** Pool seed the official form uses: exactly 1 USDC (1,000,000 base units). */
export const PERPSPLEXITY_CURVE_SEED_UNITS = 1_000_000n;
/** Default starting market cap: 5,000 USDC, the production default. */
export const PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS = 5_000_000_000n;
export const PERPSPLEXITY_CURVE_DEFAULT_CAP_USD = 5_000;
/** Meme units minted into the curve: 1B tokens at 6 decimals. */
export const PERPSPLEXITY_CURVE_SUPPLY = 1_000_000_000n * 1_000_000n;
/**
 * settings::spot(base_fee_bps, hibernation_enabled) — every live launch passes
 * 0, which keeps the platform's own configured base fee.
 */
export const PERPSPLEXITY_CURVE_BASE_FEE_BPS = 0;
export const PERPSPLEXITY_CURVE_HIBERNATION = false;
/** Initial creator buy presets offered in the terminal, in USDC. */
export const PERPSPLEXITY_DEV_BUY_PRESETS = [0, 10, 25, 50, 100] as const;

/**
 * Curve virtual quote in USDC units: starting cap minus the 1 USDC seed — the
 * same formula the official launch form applies (5,000 → 4,999 USDC).
 */
export function perpsCurveVirtualQuote(startingCapUnits: bigint): bigint {
  const cap = startingCapUnits > 0n ? startingCapUnits : PERPSPLEXITY_CURVE_DEFAULT_CAP_UNITS;
  if (cap <= PERPSPLEXITY_CURVE_SEED_UNITS) {
    throw new Error("Starting market cap must be above the 1 USDC pool seed.");
  }
  return cap - PERPSPLEXITY_CURVE_SEED_UNITS;
}

/** Parses a decimal USD amount into USDC base units (6 decimals). */
export function perpsQuoteUnits(amount: string | number): bigint {
  const text = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Invalid amount.");
  const [whole = "0", fraction = ""] = text.split(".");
  const padded = (fraction + "000000").slice(0, PERPSPLEXITY_QUOTE_DECIMALS);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

/**
 * Official virtualQuote formula (router chunk export g): the starting market
 * cap minus the seed, in quote units. Zero when the cap is at or below the
 * seed; the seed must be at least 1 USDC to set a starting cap.
 */
export function perpsVirtualQuote(startingCapUnits: bigint, seedUnits: bigint): bigint {
  if (startingCapUnits <= seedUnits) return 0n;
  if (seedUnits < 1_000_000n) throw new Error("Seed at least 1 USDC to use a starting market cap.");
  const difference = startingCapUnits - seedUnits;
  if (difference > 1_000_000_000_000_000n) throw new Error("Starting market cap is too high.");
  return difference;
}

export interface PerpsMarket {
  marketId: string;
  baseOracleId: string;
  collateralOracleId: string;
  symbol: string;
  label: string;
}

/** Live underlying markets on Perpsplexity mainnet (from the official config). */
export const PERPSPLEXITY_MARKETS: PerpsMarket[] = [
  { marketId: "0x3071216e5e9c07a4cebd3b3d3b9789ef76da44a8cfd2928292fd9f16dc7ce502", baseOracleId: "0x3de956675eb0038d48f0f59fac681df6ed80733076fb1cb911562171485b104f", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "GOOGLUSD", label: "GOOGL" },
  { marketId: "0x8d7bfd380f89e0998a0d71cf46615948f4f2fab3d3904fe8a522c50a8cb0f3df", baseOracleId: "0xecb2b7d4e11d4d68ecdd32e6b67c1994d04437ab5505d770f45f147ea21738c3", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "AMCUSD", label: "AMC" },
  { marketId: "0x05b5c3bea84c4b8f33cf592d899008336dcbae8c9c6c75b2f8e7b8f7878744c1", baseOracleId: "0xc729d56d7de4e22ad6e21f379f79c68d277a49789ac5b52b8df51ed16bc4a9a0", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "BTCUSD", label: "BTC" },
  { marketId: "0x65f2c4a8f6b96a48d91fff678783decb0d8e28dec9a722f05a78f5601f2c4f76", baseOracleId: "0x7c7abb2f203c872ecedafbdf3874a97d794d949e7cca5c4b9f739544af3e6ada", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "BRENTUSD", label: "BRENT" },
  { marketId: "0x1b1ce878827314011ed1081431de037eb620b5eb18532f08a77c8226fe33b91a", baseOracleId: "0xd1971049f9dc34a7df636bad6054c122bb4e2c25bfa20151353eb6bd90dc797f", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "CRCLUSD", label: "CRCL" },
  { marketId: "0x90df6a2acc9df2edb7316822621f06c6dc5ba5329f59166baa92c9b19fce1199", baseOracleId: "0xb9e052f52be76d2bebe99c3cc0d72f8197779f6336602cb0c7b62f6b05d89382", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "CARDSUSD", label: "CARDS" },
  { marketId: "0xdc19f381028e5276d0a8db7403773e7a0e6610557c6c00e6c8a79fb969bd0ef2", baseOracleId: "0x1058172beea1906699d64ab3a323bf4f7ec9ca02f9dbc1797d330336c2930d29", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "CYPHUSD", label: "CYPH" },
  { marketId: "0x7b302ca4ed5a96654612fd94363a925f7c71dfa9678d4ab4e10ae8825941a5c0", baseOracleId: "0xf722e7e1becb145aa69242a537f423b2a442edb7748016c57ab23afa5b85081a", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "LLYUSD", label: "LLY" },
  { marketId: "0x69f182c8d2cf3e128fe6073242e9ad62af57e71ca3069647b496399cf30ae0db", baseOracleId: "0xd98176408c7341a5a3efe8a9a7babcb76df555ead88948ce3927cb4cb732a711", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "ETHUSD", label: "ETH" },
  { marketId: "0x98accf0e005744bebabb894f17972ab0b2ae0b415452f31a1ba7e4548edba43c", baseOracleId: "0xcf3de3cfb595f976fa103393b43a32fb8b2abbd18eca0ae9bcf519279a7e0c5b", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "HYPEUSD", label: "HYPE" },
  { marketId: "0xabc5065cf350f65da0c7b9245db4ed5f14ffa0119f950c2a6dcd8c3839c80ce3", baseOracleId: "0xa5979c4b5f60739bc38833a0d2337e02d67c7f2d6c0ec789c910479eab05dfaf", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "INTCUSD", label: "INTC" },
  { marketId: "0x164773ec0aa7a04f0882800a36cd7f8bdbd8f1d850bfdc6e82fa0fd923b178ad", baseOracleId: "0xe3a4e3f7f62bbad387a6644cca405b81f0568a9ec819ce4ca0006f9a033e413b", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "IOVAUSD", label: "IOVA" },
  { marketId: "0x057643bb31a32339169e16671b43178df4a727d1bb18f1cd269ab33126d0eeaf", baseOracleId: "0x2469d2d326b2939c8fe53140284c79b3738871b89a258f6827c149d6fa68ab94", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "LITUSD", label: "LIT" },
  { marketId: "0xdc6c56990c660a57ac5f8a4f66238be7d09365dc181a79abdbe400c28a727305", baseOracleId: "0x39f7e70a9ba88a2ba9f7d1d0edf45e870b1c143095b3630f3e4303bd4728884f", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "MRVLUSD", label: "MRVL" },
  { marketId: "0x5f3f15a86700bb14be62dcff0924e6e0d974e5d831f0e0bc4c5852a977f14204", baseOracleId: "0xb6e3cad5b53b8c0a20cb377a7342c0b68ced50f9b893f7cff15474a6ccbc7344", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "METAUSD", label: "META" },
  { marketId: "0x791bbd6bbb5a65932022b710034be4f8b95f1046ac5fcd0bb3a059a35ff84c62", baseOracleId: "0x752e022e05e3e633eb8d49a3c785efcc70a8ccb88e093a0b4c75708edc26cdd2", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "MUUSD", label: "MU" },
  { marketId: "0xa4cd7737ad09d4e6c8377b7efa88258ef13d5ded76021579ae40418f4207dd23", baseOracleId: "0xe85fb75c05f8e8d5df7466e5ba9769f18452d62a25659b5fb6bb2c1ea1a9b586", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "MONUSD", label: "MON" },
  { marketId: "0xd29dd34e1414ceb557f90d16a7384df6fd5d444bc5941df71e025a0f1c640368", baseOracleId: "0x67c9ccfdd39f29afac9e755e79f770fade347525f7bc59d50215dd4d162c1749", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "XMRUSD", label: "XMR" },
  { marketId: "0x70519b6e514f78c266dec5f5406bc8ba953ee0941490181bcc7e31d6798999f8", baseOracleId: "0xc9c03df91207556078d643f4024e8ec3c132741c7979e2948fd0cb95fb496765", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "NVDAUSD", label: "NVDA" },
  { marketId: "0xd75e8847ef3b3ad1da28c95f662fc1fea7178fee1eb565e7696e4f2147db9bb1", baseOracleId: "0xa71003e7c6ebb681af2ab98da5f85314437e55b56e823356f7dee9a2518c4615", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "PUMPUSD", label: "PUMP" },
  { marketId: "0x143b0900a15a11af9764119ea7b72a25756484a60ad21024ed79325231ed7a9c", baseOracleId: "0xaae572d7948989e790b5cad0648230b0a51362c7eaabebc1bf9d50c02abb0c80", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "DRAMUSD", label: "DRAM" },
  { marketId: "0x6ab09dbe631656de5a7c7e6b2a5f3d2fef9bf326b77c01a43995bbcf5062a5f2", baseOracleId: "0xe7df5dd56bd4958feb1639ea73e03fbf1603c74ec045764784f59b75622ef22c", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "US500USD", label: "US500" },
  { marketId: "0xbb681b10f4578bb16a8b77c709d034bf4dcdb6ec8fb8dcc26d45f3d20270b10c", baseOracleId: "0xc5d7bb4ce46d00716809731c7837b5bcb4149f3bdacb77e69f9dbf1a768c4b3b", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SAMSUNGUSD", label: "SAMSUNG" },
  { marketId: "0xa7adf846c9c49bf8e8fcfee2049453dabf3cb3ae432adf92d80e172e42cfb414", baseOracleId: "0x4e40819e4581d4474d4c885f6b8c14cb6a9c6c0d3e9dfe314941fd5226564c50", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SNDKUSD", label: "SNDK" },
  { marketId: "0x38aca7076576e5f656e601ab34a55de2e66b7056a5652d16120671c7115b4057", baseOracleId: "0xd8bdec19a09dc81c93de164974c5bcd857509454a152d0590529db64db67f321", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "XAGUSD", label: "XAG" },
  { marketId: "0xbd0f8cf1fb501f159a5fa928a8efe716940d5809de55a26e186facd6add63d66", baseOracleId: "0xe045a8006d1118bf3611f5bbcb3fe080bd2867da363807c64213bf7e9776ea3c", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SKHYNIXUSD", label: "SKHYNIX" },
  { marketId: "0x5072ccd95e6ff7bd724f89aa8b8dc58d31f09a93467ef7b694e9f24c50a1e49a", baseOracleId: "0x9112b09eed71b512afeee090b656ad5e279aaf83b91b34b04a6992b6e2740e42", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SOLUSD", label: "SOL" },
  { marketId: "0x0d54c8e8d642d6c30412c48553628d9a91e2eb7e8f4e806bcb953c14cd1f5020", baseOracleId: "0x02d426b09be9ab1d10e4f8c3709be68588002174608f61485173718ba1d39db9", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SPCXUSD", label: "SPCX" },
  { marketId: "0xa97dacdd972a0414363290ec5752cb93ac47443c3e7710df145cc7f337575002", baseOracleId: "0xa963d9abc71d27918befc697d0b584aa7906fd8fa698e8c8d0e982acc288d97c", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "SUIUSD", label: "SUI" },
  { marketId: "0x5dd43224d7fbf4e726ecd03e4eb620094d7a37d356f85734714ebaceb08211ee", baseOracleId: "0xf9e3d3600ec1626831a61d3b1a18137a6723d6034ec00361d1edf49e6c4b74de", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "TSLAUSD", label: "TSLA" },
  { marketId: "0xd57ae2c981c6fbf49870319ccfca4762721aaf6ea8ea7ce8fd038f74a552e664", baseOracleId: "0x4b26e502f671cfcc560f1db495b17259dec2dcffdeefed00a8bdfc08a37129e2", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "XAUTUSD", label: "XAUT" },
  { marketId: "0xe1c5f5c6b1c69bb83c3dc159db7e3f43417d733b8ffbd3aed5a348c2b3f2a1fe", baseOracleId: "0xf925d866d855f53abb561c7b9004c065ae342e468ce750333534c657c974e88d", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "UNIUSD", label: "UNI" },
  { marketId: "0x61b9b2d8c85a5d42e542f0b90749b8737d93b1e4b5cd25f50e480b26613e4e56", baseOracleId: "0x938d8f49e9e08605bdac4d9c1a243b54646c0253253731dce8b56496fcf49974", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "CHIPUSD", label: "CHIP" },
  { marketId: "0xdd5a6622612d131f90b114ba5f8c84e3ed75b4b40e9de8479a875e228940bcf6", baseOracleId: "0x5becac545b568f181b8f3bb1988ee00b92575697ec018b3e681bd9c15756c7b2", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "WTIUSD", label: "WTI" },
  { marketId: "0x59c1c2bf2ed158b14e283d4d4801a68a6038387e8f103d2b2279a55f1d53b8d3", baseOracleId: "0x5c9c65112aa9c4e966c0be30243b9c5ab71bbe5b82a5c64ba77ddbfd8eea7c7e", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "XRPUSD", label: "XRP" },
  { marketId: "0x435987c9e1b8f61a4cdfa220751b3324ebf5a7bfd1250b25c79412a71a20392f", baseOracleId: "0xce55ed56a18c3ac518c2c4defb80a0e885421078fae680ebe44c58743b2a67f4", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "ZECUSD", label: "ZEC" },
  { marketId: "0xdd29105a713ea821f4237ae8dd36c29b6ad022234996c2323ccf2f6d12fd5e2b", baseOracleId: "0x5bcca680d7a3cd6ef3a94ca2a20e1a500e8576e380eb5f1bcca0fdb72899386a", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "NEARUSD", label: "NEAR" },
  { marketId: "0x1165344c489ab4a4220b82b14fe5ab7c830bff20d8c6eb48d280664715053293", baseOracleId: "0xaf39a1eca5705b4290b84a85fd8016c5df0bfa5a8c325b6e132850f18fb81e91", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "BYDUSD", label: "BYD" },
  { marketId: "0xdc49c2af835c965733ae6e30d47c2ab36d27b3d5eb019e7f77f3972b332558e8", baseOracleId: "0x0d297ac073675d7cf1aa90ed0bfc07f775095852f07aaa7aaabaccf58cbf982b", collateralOracleId: "0x96ea92a33842446845c38992f5de53971471156e26b269c19a1f5864109ada03", symbol: "US100USD", label: "US100" },
];

/** Accepts "NVDA", "$NVDA", "nvda", "NVDAUSD" — returns the market or null. */
export function resolvePerpsMarket(underlying: string | null | undefined): PerpsMarket | null {
  if (!underlying) return null;
  const key = underlying.trim().replace(/^\$/, "").toUpperCase();
  if (!key) return null;
  return PERPSPLEXITY_MARKETS.find((m) => m.symbol === key || m.symbol === `${key}USD` || m.label === key) ?? null;
}

/** One-line card summary: "⚡ NVDA LONG 5x · MC ~$4K". */
export function describePerpsPosition(args: {
  underlying: string;
  long: boolean;
  leverageBps: number;
  startingCapUsd: number | null;
}): string {
  const leverage = args.leverageBps / 10_000;
  const leverageText = Number.isInteger(leverage) ? `${leverage}x` : `${leverage.toFixed(1)}x`;
  const market = resolvePerpsMarket(args.underlying);
  const label = market?.label ?? args.underlying.toUpperCase();
  const cap =
    args.startingCapUsd && args.startingCapUsd > 0
      ? ` · MC ~$${args.startingCapUsd >= 1000 ? `${Math.round(args.startingCapUsd / 100) / 10}K` : Math.round(args.startingCapUsd)}`
      : "";
  return `⚡ ${label} ${args.long ? "LONG" : "SHORT"} ${leverageText}${cap}`;
}

// ---------------------------------------------------------------------------
// Composite (market-backed) launches — a real leveraged position, e.g. NVDA 3L.
//
// Every constant below was read verbatim from live mainnet composite launches:
//   prepare  G3h8YzA64pnBDJ2Y1CWuCQSJfNZDU3tKBqLrm7LbWvyF ($UNI, SUI 1.5x long)
//            4AFUAA1MVnsVWUzU3SfKNc4Cfqah9wHLMz4vd31fYpDJ ($ADENIYI, SUI 3x long)
//   activate BvJX1KU4G8Ahgz1Gj4daTUN2B5pTadTPab9LBa8YffWs
// The only values that differ between those launches are the ticker/metadata
// and the leverage (15000 vs 30000 bps), so everything else is a pad constant.
// ---------------------------------------------------------------------------

/** Aftermath clearing-house / account / registry package (perp side). */
export const PERPSPLEXITY_AFTERMATH_REGISTRY_ID_FOR_COMPOSITE = PERPSPLEXITY_REGISTRY_ID;
/** Meme units minted into a composite pool: 1e15, same as the spot curve. */
export const PERPSPLEXITY_COMPOSITE_SUPPLY = PERPSPLEXITY_CURVE_SUPPLY;
/** base_fee_bps passed to prepare_composite_registered on every live launch. */
export const PERPSPLEXITY_COMPOSITE_BASE_FEE_BPS = 100n;
/**
 * The fifth trailing u64 of prepare_composite_registered. Constant (5000) on
 * every live composite launch; the pad does not document its meaning, so it is
 * copied verbatim rather than derived.
 */
export const PERPSPLEXITY_COMPOSITE_RESERVE_PARAM = 5000n;
/**
 * settings::new(u64,u64,u64,u64,u64,u64,u64,bool,bool) — identical on every
 * live composite launch. The fifth value (4500) is the engine's lend_bps, which
 * the engine::Created event confirms; the rest are pad fee/funding defaults.
 */
export const PERPSPLEXITY_COMPOSITE_SETTINGS_ARGS = [
  8000n,
  1000n,
  1000n,
  0n,
  4500n,
  0n,
  0n,
  false,
  true,
] as const;
/** Default leverage when a post names a market but no multiplier: 3x. */
export const PERPSPLEXITY_DEFAULT_LEVERAGE_BPS = 30_000;
/** Leverage bounds the pad's own launches stay within: 1x–10x. */
export const PERPSPLEXITY_MIN_LEVERAGE_BPS = 10_000;
export const PERPSPLEXITY_MAX_LEVERAGE_BPS = 100_000;

/** Validates a requested leverage in bps (10000 = 1x). */
export function perpsLeverageBps(requested: number | null | undefined): number {
  const bps = Math.round(requested && requested > 0 ? requested : PERPSPLEXITY_DEFAULT_LEVERAGE_BPS);
  if (bps < PERPSPLEXITY_MIN_LEVERAGE_BPS || bps > PERPSPLEXITY_MAX_LEVERAGE_BPS) {
    throw new Error("Leverage must be between 1x and 10x.");
  }
  return bps;
}

