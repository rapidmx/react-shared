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
 * auth-server's own `api.ts`, which this is a trimmed sibling of): a request to an elevation-gated endpoint
 * (`@RequiresElevation()` on the server) made with a non-elevated token fails with an `ApiRequestError` of
 * status 403 and code `"api-104"`, and it is up to the caller to send the browser to auth-server's
 * `/auth/elevate?return_to=...` page, which returns it to `return_to` once the user has confirmed their identity
 * (the admin console does exactly that - see `AdminShell` in `@rapidmx/web-client`). Code `"api-103"` is a
 * different 403 - the caller lacks a required role, and elevating won't help.
 */

export class ApiRequestError extends Error {
    status: number;
    code?: string;
    /**
     * The response's whole parsed JSON body, for an endpoint that says more than `message` - e.g. a failed send's
     * per-recipient SMTP results under `details`. `undefined` when the response had no JSON body (or the error
     * was raised on the client), so a caller must treat it as untyped, untrusted data and read it defensively.
     */
    details?: unknown;

    constructor(message: string, status: number, code?: string, details?: unknown) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.code = code;
        this.details = details;
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
 * The origin `configureApiBaseUrl()` set - `""` (same origin) when it never was. For a caller that talks to the
 * RapidMX server some way `apiFetch()` can't, such as the push WebSocket, which must go to the same origin.
 */
export function apiOrigin(): string {
    return apiBaseUrl;
}

/**
 * The full URL for an `@ApiRoute`-declared `path` (e.g. `/mail/attachments/a1/content`) - the `/api`
 * prefix plus whatever origin `configureApiBaseUrl()` set (a same-origin relative `/api/...` path when
 * it was never called). Every call site that can't go through `apiFetch()` - a raw-bytes upload, a
 * non-JSON download, or a plain URL handed to an `<a href>`/`<img src>` - must build its URL here rather
 * than hard-coding `/api...`, or it silently ignores a configured cross-origin base URL. A raw `fetch()`
 * built on this should also pass `credentials: "include"` so a cross-origin call still carries the `jwt`
 * cookie (harmless for a same-origin one).
 */
export function apiUrl(path: string): string {
    return `${apiBaseUrl}/api${path}`;
}

/**
 * Mirrors `@rapidrest/service-core`'s `DEFAULT_CSRF_COOKIE_NAME`/`DEFAULT_CSRF_HEADER_NAME` — kept as
 * local literals since this package has no dependency on that one.
 */
const CSRF_COOKIE_NAME = "csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Reads the CSRF double-submit cookie a `jwt`-cookie-issuing server sets (see `@rapidrest/auth`'s
 * `CsrfUtils`) directly off `document.cookie`. That cookie is deliberately host-only and non-`HttpOnly`
 * — see `@rapidrest/service-core`'s `src/http/csrf/csrf.ts` for the full rationale, in particular why a
 * *cross-origin* call (`authApiFetch()` below) can never find one here: a cookie set by auth-server's
 * host is never present in this app's own `document.cookie`, by design — that's what makes the cookie
 * host-only in the first place, and it's why `authApiFetch()`'s CSRF protection has to come from the
 * server checking its Origin allow-list instead (see its own doc comment).
 */
function readCsrfCookie(): string | undefined {
    if (typeof document === "undefined") {
        return undefined;
    }
    for (const part of document.cookie.split("; ")) {
        const idx = part.indexOf("=");
        if (idx > 0 && part.slice(0, idx) === CSRF_COOKIE_NAME) {
            return part.slice(idx + 1);
        }
    }
    return undefined;
}

/**
 * Echoes the CSRF double-submit cookie back as a header on `headers`, for a mutating request that doesn't
 * already carry one — the browser-side half of the double-submit check `@rapidrest/service-core`'s
 * `RouteUtils.checkCsrf()` enforces server-side. A safe method, a caller-supplied header already present,
 * or simply no cookie yet (e.g. this page's very first request) all leave `headers` untouched — the
 * server itself never requires this for any of those cases.
 */
function applyCsrfHeader(headers: Headers, method: string | undefined): void {
    const m = (method ?? "GET").toUpperCase();
    if (CSRF_SAFE_METHODS.has(m) || headers.has(CSRF_HEADER_NAME)) {
        return;
    }
    const token = readCsrfCookie();
    if (token) {
        headers.set(CSRF_HEADER_NAME, token);
    }
}

/**
 * `headers` as a `Headers` with the CSRF double-submit header added, for a mutating request that is built without `apiFetch()` - an upload of a
 * file's own bytes, which cannot go through `apiFetch()` because that always sends JSON. Without it the server refuses the request as "missing a valid
 * CSRF token". `method` defaults to `POST`; a safe method or no cookie leaves the headers as they were, exactly as `apiFetch()` does.
 */
export function withCsrfHeader(headers: Record<string, string>, method: string = "POST"): Headers {
    const result = new Headers(headers);
    applyCsrfHeader(result, method);
    return result;
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
    applyCsrfHeader(headers, init.method);
    const credentials = apiBaseUrl ? "include" : init.credentials;

    const res = await fetch(apiUrl(path), { ...init, headers, credentials });
    return decodeApiResponse<T>(res, true);
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
 *
 * `applyCsrfHeader()` is still called here for consistency, but it never actually finds a token for a truly
 * cross-origin call — see its own doc comment on `readCsrfCookie()` for why that's correct rather than a
 * gap: auth-server's CSRF protection for this call shape comes from its own Origin allow-list check, not a
 * double-submit cookie this app's JavaScript could never read in the first place.
 */
export async function authApiFetch<T = unknown>(authServerUrl: string, path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    applyCsrfHeader(headers, init.method);

    const res = await fetch(`${authServerUrl}/api${path}`, { ...init, headers, credentials: "include" });
    return decodeApiResponse<T>(res);
}

let unauthorizedObserver: ((error: ApiRequestError) => void) | undefined;

/**
 * Registers the one function that hears about every `401` this server's API (`apiFetch()`, not auth-server's) answers - the
 * signed-in session has ended or expired. It only observes: the request still rejects with the same `ApiRequestError`, so
 * a caller's own handling is unchanged. The app frame uses it to say "Your session expired" once, whichever request noticed
 * first (a background refresh included). Pass `undefined` to remove it. A throwing observer never affects the request.
 */
export function setApiUnauthorizedObserver(observer: ((error: ApiRequestError) => void) | undefined): void {
    unauthorizedObserver = observer;
}

async function decodeApiResponse<T>(res: Response, observeUnauthorized = false): Promise<T> {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
        const message = (body && (body.message || body.error)) || res.statusText || "Request failed.";
        const error = new ApiRequestError(message, res.status, body?.code, body);
        if (observeUnauthorized && res.status === 401) {
            try {
                unauthorizedObserver?.(error);
            } catch {
                // An observer's failure must not change what the caller sees.
            }
        }
        throw error;
    }

    return body as T;
}
