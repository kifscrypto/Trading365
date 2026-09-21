/**
 * The FREE Telegram channel's invite.
 *
 * WHY THIS IS NOT `siteConfig.socials.telegram`
 * That field is consumed twice in public: `components/site-footer.tsx` renders it
 * as a link in the footer of EVERY page, and `lib/schema.ts` emits it as `sameAs`
 * in the JSON-LD. A private invite must not appear in either place — the footer
 * would publish it sitewide and search engines would index it. So the invite
 * lives here, is delivered in exactly one place (/account, behind a sign-in),
 * and the public pages advertise the account as the way to get it.
 *
 * This used to be a public @username (https://t.me/trading365Sub). When the
 * channel went private that URL stopped working for anyone who was not already
 * a member, so the links pointing at it were dead until they were repointed at
 * /signup?next=/account.
 *
 * Invite-hash links cannot be rotated from here — if the invite is revoked in
 * Telegram, replace this value and the change ships with the next deploy.
 */
export const FREE_CHANNEL_INVITE = 'https://t.me/+y3SAVsRC9IAzZDE0'
