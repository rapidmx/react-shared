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
 * `fetch()` against the same-origin API, decoding RapidMX-shaped errors. `path` is the route as
 * declared by `@ApiRoute` (e.g. `/mail/mailboxes`) — the `/api` prefix that decorator always adds is
 * applied here, in one place, rather than repeated at every call site.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");

    const res = await fetch(`/api${path}`, { ...init, headers });
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
