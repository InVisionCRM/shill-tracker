-- PulseChain tickers only. Any mention already resolved off PulseChain (Robinhood, Ethereum HEX,
-- Binance/Coinbase majors, any other chain) is rejected so it disappears from the app and the price
-- job never touches it again.
UPDATE mentions
SET resolution_status = 'rejected',
    price_status = 'excluded',
    updated_at = now()
WHERE resolution_status = 'resolved'
  AND coalesce(chain, '') <> 'pulsechain';

-- Drop cached quotes for anything that is no longer a visible PulseChain asset.
DELETE FROM quotes
WHERE asset_key NOT IN (
  SELECT DISTINCT asset_key FROM mentions WHERE chain = 'pulsechain' AND asset_key IS NOT NULL
);
