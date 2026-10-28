-- PulseChain tickers only, round 2: a mention that was still pending but already carried a definite
-- non-PulseChain chain hint (an explicit "chain:0x" prefix, a Solana mint, or "#base"/"on ethereum"
-- context) was showing up in the dock and feed while it waited on a lookup that would never matter.
-- Reject it immediately instead, same as an already-resolved off-chain call.
UPDATE mentions
SET resolution_status = 'rejected',
    price_status = 'excluded',
    updated_at = now()
WHERE resolution_status = 'pending'
  AND chain IS NOT NULL
  AND chain NOT IN ('pulsechain', 'unknown-evm');
