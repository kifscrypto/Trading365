'use client'

import { useState } from 'react'
import { Check, Copy, Download, MonitorDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DeskPurchase } from '@/lib/desk'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

export function DeskPurchases({ purchases, checkoutSuccess }: { purchases: DeskPurchase[]; checkoutSuccess: boolean }) {
  const [copied, setCopied] = useState<string | null>(null)
  if (!purchases.length && !checkoutSuccess) return null

  return (
    <section className="mt-8 rounded-xl border border-primary/25 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><MonitorDown className="h-5 w-5 text-primary" />T365 Desk</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your desktop installers, offline licences, and update entitlements.</p>
        </div>
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Perpetual licence</Badge>
      </div>
      {checkoutSuccess && (
        <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm text-emerald-300" role="status">
          Your T365 Desk purchase is confirmed. Download the installer and activate it with the licence below.
        </p>
      )}
      {purchases.map(purchase => (
        <div key={purchase.order_id} className="mt-5 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">T365 Desk · version 1</p>
              <p className="mt-1 text-xs text-muted-foreground">Order {purchase.order_id} · updates until {formatDate(purchase.license_updates_until)}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href="/api/desk/download"><Download className="mr-2 h-4 w-4" />Download installer</a>
            </Button>
          </div>
          <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor={`licence-${purchase.order_id}`}>Offline licence key</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id={`licence-${purchase.order_id}`}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
              value={purchase.license_key}
              readOnly
              onFocus={event => event.target.select()}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(purchase.license_key)
                setCopied(purchase.order_id)
                setTimeout(() => setCopied(null), 1800)
              }}
            >
              {copied === purchase.order_id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === purchase.order_id ? 'Copied' : 'Copy key'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Open T365 Desk, go to Settings, and paste this key into Offline licence key. Activation works without our server.</p>
        </div>
      ))}
    </section>
  )
}
