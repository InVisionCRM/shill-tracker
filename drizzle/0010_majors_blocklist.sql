-- Majors and stablecoins are never a shill (Kyle: "not bitcoin, PulseChain, or any really popular
-- ticker"). liquidity_usd stores the most liquid DexScreener PulseChain pair for a token, written by
-- the existing price_now refresh (no new API calls); a later pass rejects anything at or above
-- MAJOR_LIQUIDITY_USD (src/lib/detect/majors.ts) once that figure is populated. This migration only
-- does the static part: reject every existing mention of a symbol or PulseChain contract on the
-- blocklist (src/lib/detect/majors.ts MAJOR_SYMBOLS / MAJOR_CONTRACTS), right now, with no API calls.
ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "liquidity_usd" double precision;

UPDATE mentions
SET resolution_status = 'rejected',
    price_status = 'excluded',
    updated_at = now()
WHERE resolution_status <> 'rejected'
  AND (
    upper(symbol) IN (
      'BTC', 'WBTC', 'ETH', 'WETH', 'STETH', 'LSETH',
      'PLS', 'WPLS', 'PLSX', 'HEX', 'EHEX', 'PHEX', 'INC',
      'USDC', 'USDT', 'DAI', 'PDAI', 'USDL', 'GUSD', 'XUSD', 'PXDC',
      'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'LTC', 'BCH', 'TRX', 'LINK', 'DOT',
      'AVAX', 'MATIC', 'POL', 'UNI', 'AAVE', 'MKR', 'XLM', 'ATOM', 'ETC'
    )
    OR lower(contract_address) IN (
      '0xa1077a294dde1b09bb078844df40758a5d0f9a27',
      '0x95b303987a60c71504d99aa1b13b4da07b0790ab',
      '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39',
      '0x57fde0a71132198bbec939b98976993d8d89d225',
      '0x2fa878ab3f87cc1c9737fc071108f904c0b0c95d',
      '0x6b175474e89094c44da98b954eedeac495271d0f',
      '0xefd766ccb38eaf1dfd701853bfce31359239f305',
      '0xf598cb1d27fb2c5c731f535ad6c1d0ec5efe1320',
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07',
      '0x0cb6f5a34ad42ec934882a05265a7d5f59b51a2f',
      '0xdac17f958d2ee523a2206206994597c13d831ec7',
      '0xb17d901469b9208b17d916112988a3fed19b5ca1',
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      '0x02dcdd04e3f455d838cd1249292c58f3b79e3c3c',
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      '0x1c3c50bd18e3f0c7c23666b8e8a843238a359386',
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
      '0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549'
    )
  );
