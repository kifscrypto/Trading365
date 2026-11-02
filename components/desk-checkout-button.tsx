'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DeskCheckoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function checkout() {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/desk/checkout', { method: 'POST' })
      const data = await response.json()
      if (response.status === 401 && data.signIn) {
        router.push('/login?next=/desk')
        return
      }
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.')
      window.location.assign(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not be started.')
      setPending(false)
    }
  }

  return (
    <div>
      <Button size="lg" className="gap-2 text-base font-semibold" onClick={checkout} disabled={pending}>
        {pending ? 'Starting secure checkout…' : 'Buy T365 Desk once'}<ArrowRight className="h-4 w-4" />
      </Button>
      {error && <p className="mt-3 text-sm text-rose-400" role="alert">{error}</p>}
    </div>
  )
}
