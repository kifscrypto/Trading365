import { Suspense } from 'react'
import SuccessClient from './success-client'

export const metadata = { title: 'Payment received — Trading365 Scanner', robots: 'noindex' }

export default function PremiumSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessClient />
    </Suspense>
  )
}
