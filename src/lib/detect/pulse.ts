/** PulseChain assets Richard Heart's ecosystem actually trades. */
export type PulseAsset = {
  symbol: string
  name: string
  contract: string
  pair: string
  logo: string | null
  reason: string
}

const HEX_LOGO =
  "https://cdn.dexscreener.com/cms/images/84a9562c3b7fb9c77486a7d267bd4dea495e19a9c1bcc14923ada2d8f3f271b5?width=128&height=128&quality=90&format=auto"
const PLSX_LOGO =
  "https://cdn.dexscreener.com/cms/images/38f4b2e53fe707a17ea8171c01dc4d6ceda344b6a352fe248a151c8a80bd59b8?width=128&height=128&quality=90&format=auto"

export const PULSE_BOOK: Record<string, PulseAsset> = {
  HEX: {
    symbol: "HEX",
    name: "HEX",
    contract: "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
    pair: "0x19bb45a7270177e303dee6eaa6f5ad700812ba98",
    logo: HEX_LOGO,
    reason:
      "PulseChain-focused account. HEX is the PulseChain pool, not the Ethereum listing that shares this contract address.",
  },
  PLS: {
    symbol: "PLS",
    name: "Pulse",
    contract: "0xa1077a294dde1b09bb078844df40758a5d0f9a27",
    pair: "0x6753560538eca67617a9ce605178f788be7e524e",
    logo: null,
    reason: "PulseChain native gas token, priced from the WPLS pool.",
  },
  PLSX: {
    symbol: "PLSX",
    name: "PulseX",
    contract: "0x95b303987a60c71504d99aa1b13b4da07b0790ab",
    pair: "0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9",
    logo: PLSX_LOGO,
    reason: "PulseX on PulseChain, most liquid PLSX pool.",
  },
  INC: {
    symbol: "INC",
    name: "Incentive",
    contract: "0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d",
    pair: "0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa",
    logo: null,
    reason: "Incentive on PulseChain.",
  },
  PDAI: {
    symbol: "PDAI",
    name: "DAI",
    contract: "0x6b175474e89094c44da98b954eedeac495271d0f",
    pair: "0xfc64556faa683e6087f425819c7ca3c558e13ac1",
    logo: null,
    reason:
      "$PDAI is PulseChain DAI at 0x6b175474e89094c44da98b954eedeac495271d0f. GeckoTerminal's symbol is DAI.",
  },
}

export const VOICE_PRESETS: Record<string, { chainBias: "pulsechain"; aliases: Record<string, string> }> = {
  iambroots: {
    chainBias: "pulsechain",
    aliases: {
      hex: "HEX",
      pulsechain: "PLS",
      pulsex: "PLSX",
      plsx: "PLSX",
      incentive: "INC",
      pdai: "PDAI",
    },
  },
}

export function pulseAsset(symbol: string | null | undefined) {
  if (!symbol) return null
  return PULSE_BOOK[symbol.toUpperCase()] ?? null
}

export function dexUrl(pair: string) {
  return `https://dexscreener.com/pulsechain/${pair}`
}
