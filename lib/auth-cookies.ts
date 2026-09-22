/**
 * The two cookie NAMES, in a module with no imports at all.
 *
 * WHY THEY ARE NOT JUST IN lib/users.ts
 * Three places need the name of the client-readable flag, and two of them cannot
 * import lib/users.ts:
 *
 *   - app/layout.tsx renders the header on EVERY page. lib/users.ts creates a Neon
 *     client at module scope, so importing it there would put a database client in
 *     every page's server bundle and make the build depend on DATABASE_URL merely
 *     to render a header.
 *   - components/site-header.tsx is a client component. Importing lib/users.ts
 *     would try to ship the database client to the browser.
 *
 * This file has no imports and no path aliases, so it is safe for the server
 * layout, the client header, and scripts run directly by node.
 */

/** httpOnly. The only thing here that authorises anything. */
export const SESSION_COOKIE = 't365_session'

/** Not httpOnly, value '1'. A UI hint for the header — authorises nothing. */
export const SIGNED_IN_COOKIE = 't365_signed_in'
