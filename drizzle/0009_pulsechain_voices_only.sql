-- PulseChain influencers only, voice side. Both of these were tracked on Kyle's rule ("mostly
-- PulseChain tokens") but their actual shill history is not: mrJackLevin is the XEN Crypto
-- founder whose calls are almost entirely XEN-ecosystem tokens, Bitcoin ordinals/BRC20, and
-- stock tickers (NVDA, MSTR, SPCX) with a single incidental, non-shill mention of PulseChain.
-- JakeGagain is a general-crypto gambling-stream content creator whose recent calls are Solana
-- and BSC memecoins, with no PulseChain content in any of his last 30 posts. Untracking (not
-- deleting) matches how a stopped voice is normally removed, so history is kept but the voice
-- drops off the leaderboard, the feed, search, and the dock.
UPDATE influencers
SET tracked = false,
    updated_at = now()
WHERE username IN ('mrjacklevin', 'jakegagain')
  AND tracked = true;
