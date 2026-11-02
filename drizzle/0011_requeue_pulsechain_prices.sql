-- One-time backfill: resolved PulseChain first calls got stuck unverifiable/unavailable for a
-- transient or code reason, not because no price exists.
--   1) On-chain reserve reads trusted whatever pair DexScreener/GeckoTerminal ranked deepest, which is
--      sometimes a concentrated-liquidity pool on a different PulseChain DEX (or an exotic quote
--      token). getReserves() reverts on those, so every sample came back empty ("no candle within
--      36h", "cached window has N candles") even though a classic PulseX pair existed for the same
--      token. onchain.ts now always discovers the PulseX pair first.
--   2) A GeckoTerminal/RPC rate limit, timeout, or a pass that ran out of budget counted toward the
--      give-up threshold the same as a real "no data" answer. backlog.ts and job.ts now leave the
--      attempt count untouched for those.
-- Keyed on price_error text from the old behavior, so it only touches rows plausibly hit by one of
-- the two bugs above; safe to re-run, and a token that is genuinely untradeable just lands back in
-- the same status after one more attempt.
UPDATE mentions
SET price_status = 'pending',
    price_attempts = 0,
    price_error = null,
    updated_at = now()
WHERE chain = 'pulsechain'
  AND price_at IS NULL
  AND price_status IN ('unverifiable', 'unavailable')
  AND price_error ~* '429|cooldown|abort|timeout|timed out|5\d\d from|no pulsex pair|no candle within|cached window has|ran out of budget';
