///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Minimal client-side helper shared by every app in this project: a `fetch` wrapper that talks to the
 * same-origin RapidMX API. There is no client router or HTTP client shipped by `@rapidrest/react`, so this
 * is deliberately small and framework-free.
 *
 * This service never issues its own JWTs — identity comes entirely from a separate `auth-server` deployment
 * (see `.claude/NOTES.md`). Authentication rides along via the `jwt` HttpOnly cookie that auth-server sets on
 * sign-in — the browser attaches it automatically to every same-origin `fetch()` call (the default
 * `credentials: "same-origin"` mode), and this server's `JWTStrategy` accepts it as a credential for every
 * authenticated request, not just SSR page loads. There is no local elevation/step-up flow here (unlike
 * auth-server's own `api.ts`, which this is a trimmed sibling of) — that would need a cross-origin call to
 * auth-server's own elevation endpoint, not wired up yet (see `session.ts`).
 */

export class ApiRequestError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.code = code;
    }
}

/**
 * Absolute origin `apiFetch()` targets instead of a same-origin relative path - unset (`""`, the
 * default) everywhere this library has run until now (the SSR web/admin apps, always served from the
 * same origin as the API they call). Set once via `configureApiBaseUrl()` by a consumer that genuinely
 * runs on a *different* origin than the API - e.g. the Electron desktop client, whose renderer has no
 * "same origin as the server" to rely on the way a browser tab loaded from that server does.
 */
let apiBaseUrl = "";

/**
 * Points `apiFetch()` at `baseUrl` (e.g. `"https://mail.example.com"`) instead of the default
 * same-origin relative path. Only needed by a consumer whose own origin genuinely differs from the
 * RapidMX server's - see `apiBaseUrl`'s own doc comment. Requires that server's `cors:origins` config
 * include this consumer's own origin (see `@rapidrest/service-core`'s `Server.js` CORS middleware,
 * which only reflects `access-control-allow-credentials` for an explicitly allow-listed origin - the
 * default "allow every origin" behavior when `cors:origins` is unset does NOT carry credentials) and
 * that whatever sets the `jwt` cookie issues it with `SameSite=None; Secure` - a same-origin deployment
 * never needed either, and this function alone does not make a cross-origin deployment secure or
 * functional on its own.
 */
export function configureApiBaseUrl(baseUrl: string): void {
    apiBaseUrl = baseUrl.replace(/\/$/, "");
}

/**
 * `fetch()` against the RapidMX server's API - same-origin unless `configureApiBaseUrl()` has been
 * called, in which case this also switches to `credentials: "include"` so the configured cross-origin
 * call still carries the `jwt` cookie (a plain relative fetch never needs this - `credentials:
 * "same-origin"`, fetch's own default, already attaches it). `path` is the route as declared by
 * `@ApiRoute` (e.g. `/mail/mailboxes`) — the `/api` prefix that decorator always adds is applied here,
 * in one place, rather than repeated at every call site.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    const credentials = apiBaseUrl ? "include" : init.credentials;

    const res = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers, credentials });
    return decodeApiResponse<T>(res);
}

/**
 * `fetch()` against auth-server's API — a *different* origin than this app, unlike `apiFetch()` above. Used
 * only for the handful of actions that must be issued by auth-server itself (e.g. admin impersonation, which
 * needs to mint a token with the target user's real roles/scopes the way auth-server's own sign-in does —
 * see `.claude/NOTES.md`).
 *
 * Requires `credentials: "include"` so the browser both attaches this app's own `jwt` cookie to the request
 * and accepts whatever `Set-Cookie` auth-server's response carries back. This only actually works when
 * auth-server and this app are deployed under a shared parent cookie domain (e.g. `Domain=.example.com`) —
 * a deployment-level requirement owned by auth-server/the Helm chart, not configured here — and auth-server's
 * CORS config must explicitly allow this app's origin with credentials.
 */
export async function authApiFetch<T = unknown>(authServerUrl: string, path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");

    const res = await fetch(`${authServerUrl}/api${path}`, { ...init, headers, credentials: "include" });
    return decodeApiResponse<T>(res);
}

async function decodeApiResponse<T>(res: Response): Promise<T> {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
        const message = (body && (body.message || body.error)) || res.statusText || "Request failed.";
        throw new ApiRequestError(message, res.status, body?.code);
    }

    return body as T;
}
