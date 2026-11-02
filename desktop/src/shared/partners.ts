import type { Partner } from './types'

// The renderer sends only an ID; the main process resolves the approved URL.
export const PARTNERS: readonly Partner[] = [
  {
    id: 'bydfi',
    name: 'BYDFi',
    label: 'Best no-KYC',
    offer: 'Up to 8,100 USDT bonus',
    url: 'https://partner.bydfi.com/register?vipCode=TU06w4',
  },
  {
    id: 'weex',
    name: 'WEEX',
    label: 'Welcome bonus',
    offer: 'Up to 10,000 USDT welcome bonus',
    url: 'https://www.weex.com/en/register?vipCode=tj9t',
  },
  {
    id: 'bybit',
    name: 'Bybit',
    label: 'Best overall',
    offer: 'Up to 30,000 USDT in rewards',
    url: 'https://partner.bybit.com/b/2705',
  },
]
