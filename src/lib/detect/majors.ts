/**
 * Majors and stablecoins are never a "shill": Kyle — "we are not listing bitcoin, PulseChain, or
 * any really popular tickers." Two independent checks, either one excludes a mention for good:
 *
 * 1. MAJOR_SYMBOLS / MAJOR_CONTRACTS: a static list of the globally obvious majors and stables,
 *    PulseChain's own foundational tokens, and the specific PulseChain contract addresses for the
 *    wrapped/bridged versions of each (a cashtag and a bare contract post of the same token both
 *    get caught). This list is intentionally short — meme coins and small/mid caps are exactly
 *    what this app exists to track, so only names everyone already knows are blocked by identity.
 * 2. MAJOR_LIQUIDITY_USD (liquidity.ts / now.ts): anything else that trades with PulseChain
 *    liquidity at or above that figure, whatever its ticker.
 */

export const MAJOR_SYMBOLS = new Set([
  // Bitcoin and its wrapped PulseChain forms
  "BTC",
  "WBTC",
  // Ethereum and its wrapped/staked PulseChain forms
  "ETH",
  "WETH",
  "STETH",
  "LSETH",
  // PulseChain-native foundational tokens
  "PLS",
  "WPLS",
  "PLSX",
  "HEX",
  "EHEX",
  "PHEX",
  "INC",
  // Stablecoins: native, pDAI, and bridged
  "USDC",
  "USDT",
  "DAI",
  "PDAI",
  "USDL",
  "GUSD",
  "XUSD",
  "PXDC",
  // Other globally obvious majors
  "SOL",
  "BNB",
  "XRP",
  "DOGE",
  "ADA",
  "LTC",
  "BCH",
  "TRX",
  "LINK",
  "DOT",
  "AVAX",
  "MATIC",
  "POL",
  "UNI",
  "AAVE",
  "MKR",
  "XLM",
  "ATOM",
  "ETC",
])

/** Lowercased PulseChain contract addresses for the tokens above (bridged majors often have more than one). */
export const MAJOR_CONTRACTS = new Set(
  [
    "0xa1077a294dde1b09bb078844df40758a5d0f9a27", // WPLS, also the native PLS quote
    "0x95b303987a60c71504d99aa1b13b4da07b0790ab", // PLSX
    "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39", // pHEX
    "0x57fde0a71132198bbec939b98976993d8d89d225", // eHEX, bridged
    "0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d", // INC
    "0x6b175474e89094c44da98b954eedeac495271d0f", // pDAI / bridged DAI
    "0xefd766ccb38eaf1dfd701853bfce31359239f305", // bridged DAI, second bridge
    "0xf598cb1d27fb2c5c731f535ad6c1d0ec5efe1320", // bridged DAI, third bridge
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // bridged USDC
    "0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07", // bridged USDC, second bridge
    "0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f", // bridged USDT
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // bridged USDT, second bridge
    "0xb17d901469b9208b17d916112988a3fed19b5ca1", // bridged WBTC
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // bridged WBTC, second bridge
    "0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c", // bridged WETH
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // bridged WETH, second bridge
    "0x1c3c50bd18e3f0c7c23666b8e8a843238a359386", // bridged SOL
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // bridged stETH
    "0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549", // bridged LsETH
  ].map((address) => address.toLowerCase()),
)

/**
 * Compared against mentions.liquidity_usd, which the price-now refresh fills with the liquidity of the
 * token's most liquid DexScreener PulseChain pair. Picked from a live snapshot on 2026-11-02
 * (/workspace/st-liq/liquidity_snapshot_2026-11-02.tsv, max_pair column). Outside the blocklist the
 * deepest pools were ATROPA ~$11.8M and dOWN ~$1.75M, then a clear gap down to ㉣ ~$0.88M,
 * PCOCK ~$0.77M, PRVX ~$0.74M and smaller. No PulseChain token is anywhere near $5M except ATROPA's
 * single DAI pool, so $1M catches only that handful and leaves real shill targets alone.
 */
export const MAJOR_LIQUIDITY_USD = 1_000_000

export function isMajorSymbol(symbol: string | null | undefined) {
  if (!symbol) return false
  return MAJOR_SYMBOLS.has(symbol.toUpperCase())
}

export function isMajorContract(address: string | null | undefined) {
  if (!address) return false
  return MAJOR_CONTRACTS.has(address.toLowerCase())
}
