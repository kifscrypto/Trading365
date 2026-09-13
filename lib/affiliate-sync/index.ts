import type { Adapter } from './types'
import { bybit } from './adapters/bybit'
import { okx } from './adapters/okx'
import { kucoin } from './adapters/kucoin'
import { gateio } from './adapters/gateio'
import { mexc } from './adapters/mexc'
import { bingx } from './adapters/bingx'
import { bydfi } from './adapters/bydfi'
import { blofin } from './adapters/blofin'
import { weex } from './adapters/weex'
import { toobit } from './adapters/toobit'
import { xt } from './adapters/xt'
import { ourbit } from './adapters/ourbit'

// Registry of exchange sync adapters keyed by affiliate_accounts.slug.
export const adapters: Record<string, Adapter> = {
  bybit,
  okx,
  kucoin,
  gateio,
  mexc,
  bingx,
  bydfi,
  blofin,
  weex,
  toobit,
  xt,
  ourbit,
}
