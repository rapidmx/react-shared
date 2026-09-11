///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Session handling for a service that never issues its own JWTs — identity comes entirely from a separate
 * `auth-server` deployment (see `.claude/NOTES.md`). `userUid` (present when the `jwt` cookie auth-server
 * set is valid) and `authServerUrl` are both supplied by the page's server-side `fetchProps` (see
 * `src/{mongo,sql}/routes/{wwwRoute,AdminConsoleRoute}.ts`), not fetched client-side.
 *
 * There is deliberately no local token-refresh polling here (unlike auth-server's own `useSessionRefresh`,
 * which this replaces): refreshing a token issued by a *different* service means calling that service's
 * refresh endpoint cross-origin, which needs CORS/cookie-domain coordination between the two deployments
 * that hasn't been established yet (a Helm-chart-level concern — see NOTES.md). For now, an expired session
 * is handled the same as never having one: redirect to auth-server's sign-in page.
 */
import { useEffect } from "react";

/**
 * Redirects the browser to auth-server's sign-in page when `userUid` is absent, carrying the current URL as
 * `return_to` so auth-server can send the browser back here afterward. A no-op once `userUid` is present.
 */
export function useRedirectIfUnauthenticated(userUid: string | undefined, authServerUrl: string | undefined): void {
    useEffect(() => {
        if (userUid) {
            return;
        }
        if (!authServerUrl) {
            console.error("Cannot redirect to sign-in: mail:auth_server_url is not configured.");
            return;
        }
        const returnTo = encodeURIComponent(window.location.href);
        window.location.href = `${authServerUrl}/auth/signin?return_to=${returnTo}`;
    }, [userUid, authServerUrl]);
}
