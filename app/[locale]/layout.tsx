import { notFound } from "next/navigation"
import { isValidLocale, LOCALE_CODES } from "@/lib/i18n/config"

export async function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!isValidLocale(params.locale)) notFound()
  return <>{children}</>
}
