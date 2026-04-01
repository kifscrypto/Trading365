import { CheckCircle2, XCircle } from "lucide-react"

interface ProsConsListProps {
  pros: string[]
  cons: string[]
}

export function ProsConsList({ pros, cons }: ProsConsListProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-chart-3/20 bg-chart-3/5 p-5">
        <h3 className="mb-4 text-sm font-semibold text-chart-3">Pros</h3>
        <ul className="flex flex-col gap-2.5">
          {pros.map((pro) => (
            <li key={pro} className="flex items-start gap-2 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" />
              {pro}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
        <h3 className="mb-4 text-sm font-semibold text-destructive">Cons</h3>
        <ul className="flex flex-col gap-2.5">
          {cons.map((con) => (
            <li key={con} className="flex items-start gap-2 text-sm text-foreground">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              {con}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
