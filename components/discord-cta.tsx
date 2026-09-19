import { siteConfig } from "@/lib/data/site-config"
import { Button } from "@/components/ui/button"
import { DiscordIcon } from "@/components/discord-icon"

const DISCORD_BLURPLE = "#5865F2"

// Compact Join-the-Discord CTA, sized to sit under the hero stats.
// Hidden if no invite is configured.
export function DiscordCta() {
  const url = siteConfig.socials.discord
  if (!url) return null

  return (
    <div
      className="mx-auto mt-12 flex w-full max-w-xl flex-col items-center gap-3 rounded-xl border px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left"
      style={{
        borderColor: "rgba(88,101,242,0.35)",
        background: "linear-gradient(135deg, rgba(88,101,242,0.15), rgba(88,101,242,0.03))",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: DISCORD_BLURPLE }}
        >
          <DiscordIcon className="h-6 w-6 text-white" />
        </span>
        <div>
          <p className="font-semibold leading-tight text-foreground">Join the Trading365 Discord</p>
          <p className="text-xs text-muted-foreground">Live scanner signals &amp; exclusive bonus alerts.</p>
        </div>
      </div>
      <Button
        asChild
        className="shrink-0 gap-2 font-semibold text-white hover:opacity-90"
        style={{ background: DISCORD_BLURPLE }}
      >
        <a href={url} target="_blank" rel="noopener noreferrer">
          <DiscordIcon className="h-4 w-4" />
          Join the Discord
        </a>
      </Button>
    </div>
  )
}
