const STABLES = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE'])
// Symbol → CoinGecko id for the handful of coins a commission might be paid in.
const CG_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', TRX: 'tron', TON: 'the-open-network', DOGE: 'dogecoin',
}

// Normalize an amount in `currency` to USD. Stablecoins are 1:1; known coins are
// priced via CoinGecko; anything unknown falls back to 1:1 and is flagged so the
// admin can correct it rather than silently mis-recording the figure.
export async function toUsd(amount: number, currency: string): Promise<{ usd: number; rate: number; approximated: boolean }> {
  const cur = currency.toUpperCase()
  if (STABLES.has(cur)) return { usd: amount, rate: 1, approximated: false }
  const id = CG_IDS[cur]
  if (!id) return { usd: amount, rate: 1, approximated: true }
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { usd: amount, rate: 1, approximated: true }
    const data = await res.json()
    const rate = Number(data?.[id]?.usd)
    if (!rate || !isFinite(rate)) return { usd: amount, rate: 1, approximated: true }
    return { usd: +(amount * rate).toFixed(2), rate, approximated: false }
  } catch {
    return { usd: amount, rate: 1, approximated: true }
  }
}
