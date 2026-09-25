// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { ApiRequestError, apiFetch, apiOrigin, apiUrl, authApiFetch, configureApiBaseUrl, setApiUnauthorizedObserver, withCsrfHeader } from "../../src/util/api.js";

afterEach(() => {
    vi.unstubAllGlobals();
    // apiBaseUrl is module-level state - reset to the default so a test that calls configureApiBaseUrl()
    // never leaks into a later test in this file (or another file sharing this module instance).
    configureApiBaseUrl("");
    setApiUnauthorizedObserver(undefined);
});

describe("setApiUnauthorizedObserver", () => {
    it("hears a 401 from apiFetch, which still rejects with the same error", async () => {
        const observer = vi.fn();
        setApiUnauthorizedObserver(observer);
        mockFetch(() => jsonResponse(401, { message: "Sign in." }));
        await expect(apiFetch("/mail/mailboxes")).rejects.toMatchObject({ status: 401, message: "Sign in." });
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer.mock.calls[0][0]).toBeInstanceOf(ApiRequestError);
    });

    it("is not told about other failures or about auth-server's own 401s", async () => {
        const observer = vi.fn();
        setApiUnauthorizedObserver(observer);
        mockFetch(() => jsonResponse(403, { message: "No." }));
        await expect(apiFetch("/mail/mailboxes")).rejects.toMatchObject({ status: 403 });
        mockFetch(() => jsonResponse(401, { message: "Bad password." }));
        await expect(authApiFetch("https://auth.example.com", "/auth/login")).rejects.toMatchObject({ status: 401 });
        expect(observer).not.toHaveBeenCalled();
    });

    it("never lets a throwing observer change what the caller sees, and works with none registered", async () => {
        setApiUnauthorizedObserver(() => {
            throw new Error("observer bug");
        });
        mockFetch(() => jsonResponse(401, { message: "Sign in." }));
        await expect(apiFetch("/x")).rejects.toMatchObject({ status: 401, message: "Sign in." });
        setApiUnauthorizedObserver(undefined);
        await expect(apiFetch("/x")).rejects.toMatchObject({ status: 401 });
    });
});

describe("ApiRequestError", () => {
    it("carries status and code", () => {
        const err = new ApiRequestError("nope", 403, "api-102");
        expect(err.message).toBe("nope");
        expect(err.name).toBe("ApiRequestError");
        expect(err.status).toBe(403);
        expect(err.code).toBe("api-102");
        expect(err).toBeInstanceOf(Error);
    });

    it("code and details are optional", () => {
        const err = new ApiRequestError("nope", 500);
        expect(err.code).toBeUndefined();
        expect(err.details).toBeUndefined();
    });

    it("keeps the details it is given", () => {
        const details = { message: "nope", details: { recipients: [] } };
        expect(new ApiRequestError("nope", 502, "api-1", details).details).toBe(details);
    });
});

describe("apiFetch", () => {
    it("prefixes the path with /api and parses a JSON response", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ok: true }));
        const result = await apiFetch("/status");
        expect(fetchMock).toHaveBeenCalledWith("/api/status", expect.anything());
        expect(result).toEqual({ ok: true });
    });

    it("leaves a caller-supplied Authorization header untouched", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/mail/mailboxes", { headers: { Authorization: "Basic xyz" } });
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        expect(headers.get("Authorization")).toBe("Basic xyz");
    });

    it("sends no Authorization header by default (auth rides the jwt cookie instead)", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/mail/mailboxes");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        expect(headers.has("Authorization")).toBe(false);
    });

    it("returns undefined for a non-JSON response body", async () => {
        mockFetch(() => new Response("plain text", { status: 200, headers: { "content-type": "text/plain" } }));
        const result = await apiFetch("/whatever");
        expect(result).toBeUndefined();
    });

    it("treats an unparseable JSON body as no body", async () => {
        mockFetch(() => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
        const result = await apiFetch("/whatever");
        expect(result).toBeUndefined();
    });

    it("throws ApiRequestError using the body's message field on a non-ok response", async () => {
        mockFetch(() => jsonResponse(400, { message: "bad input", code: "api-101" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({
            name: "ApiRequestError",
            message: "bad input",
            status: 400,
            code: "api-101",
        });
    });

    it("keeps the whole parsed error body as details, for endpoints that say more than a message", async () => {
        const body = {
            message: "The message could not be delivered.",
            code: "api-500",
            details: { recipients: [{ address: "x@example.com", smtpCode: 550, response: "5.1.1 No such user" }] },
        };
        mockFetch(() => jsonResponse(502, body));
        const err = await apiFetch("/whatever").catch((e) => e);
        expect(err).toBeInstanceOf(ApiRequestError);
        expect(err.details).toEqual(body);
    });

    it("has no details when the error response has no JSON body", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));
        const err = await apiFetch("/whatever").catch((e) => e);
        expect(err.details).toBeUndefined();
    });

    it("falls back to the body's error field when message is absent", async () => {
        mockFetch(() => jsonResponse(400, { error: "bad input" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "bad input" });
    });

    it("falls back to statusText when the error response has no JSON body", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "Server Error", status: 500 });
    });

    it("falls back to a generic message when there is no body and no statusText", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "Request failed." });
    });

    it("uses a plain relative path and default credentials mode by default", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/status");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(fetchMock.mock.calls[0][0]).toBe("/api/status");
        expect(init.credentials).toBeUndefined();
    });

    it("targets the configured base URL and switches to credentials: include once configureApiBaseUrl() is set", async () => {
        configureApiBaseUrl("https://mail.example.com");
        const fetchMock = mockFetch(() => jsonResponse(200, { ok: true }));
        const result = await apiFetch("/mail/mailboxes");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://mail.example.com/api/mail/mailboxes",
            expect.objectContaining({ credentials: "include" }),
        );
        expect(result).toEqual({ ok: true });
    });

    it("strips a trailing slash from the configured base URL", async () => {
        configureApiBaseUrl("https://mail.example.com/");
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/status");
        expect(fetchMock).toHaveBeenCalledWith("https://mail.example.com/api/status", expect.anything());
    });

    it("reverts to the default relative behavior once reconfigured back to an empty base URL", async () => {
        configureApiBaseUrl("https://mail.example.com");
        configureApiBaseUrl("");
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/status");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(fetchMock.mock.calls[0][0]).toBe("/api/status");
        expect(init.credentials).toBeUndefined();
    });

    describe("withCsrfHeader()", () => {
        afterEach(() => {
            document.cookie = "csrf=; Max-Age=0; path=/";
        });

        it("adds the csrf cookie as x-csrf-token to a request built without apiFetch(), keeping the headers it was given", () => {
            document.cookie = "csrf=tok-upload";
            const headers = withCsrfHeader({ "Content-Type": "image/png" });
            expect(headers.get("x-csrf-token")).toBe("tok-upload");
            expect(headers.get("Content-Type")).toBe("image/png");
        });

        it("adds nothing without the cookie, or for a safe method", () => {
            expect(withCsrfHeader({ "Content-Type": "text/css" }).has("x-csrf-token")).toBe(false);
            document.cookie = "csrf=tok-upload";
            expect(withCsrfHeader({}, "GET").has("x-csrf-token")).toBe(false);
        });
    });

    describe("CSRF header echo", () => {
        afterEach(() => {
            document.cookie = "csrf=; Max-Age=0; path=/";
        });

        it("echoes the csrf cookie as x-csrf-token on a mutating request once the cookie exists", async () => {
            document.cookie = "csrf=tok-abc123";
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await apiFetch("/mail/mailboxes", { method: "POST" });
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.get("x-csrf-token")).toBe("tok-abc123");
        });

        it("sends no x-csrf-token header when the cookie hasn't been issued yet", async () => {
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await apiFetch("/mail/mailboxes", { method: "POST" });
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.has("x-csrf-token")).toBe(false);
        });

        it("never sends x-csrf-token on a safe GET request, even with a cookie present", async () => {
            document.cookie = "csrf=tok-abc123";
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await apiFetch("/mail/mailboxes");
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.has("x-csrf-token")).toBe(false);
        });

        it("never overrides a caller-supplied x-csrf-token header", async () => {
            document.cookie = "csrf=tok-abc123";
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await apiFetch("/mail/mailboxes", { method: "POST", headers: { "x-csrf-token": "caller-supplied" } });
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.get("x-csrf-token")).toBe("caller-supplied");
        });
    });
});

describe("apiOrigin", () => {
    it("is empty (same origin) by default, and the configured base URL without its trailing slash once set", () => {
        expect(apiOrigin()).toBe("");
        configureApiBaseUrl("https://mail.example.com/");
        expect(apiOrigin()).toBe("https://mail.example.com");
    });
});

describe("apiUrl", () => {
    it("returns a same-origin /api-prefixed path by default", () => {
        expect(apiUrl("/mail/attachments/a1/content")).toBe("/api/mail/attachments/a1/content");
    });

    it("prefixes the configured base URL once configureApiBaseUrl() is set", () => {
        configureApiBaseUrl("https://mail.example.com/");
        expect(apiUrl("/mail/attachments/a1/content")).toBe("https://mail.example.com/api/mail/attachments/a1/content");
    });
});

describe("authApiFetch", () => {
    it("prefixes the path with the given origin's /api and includes credentials", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ok: true }));
        const result = await authApiFetch("https://auth.example.com", "/admin/impersonate");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://auth.example.com/api/admin/impersonate",
            expect.objectContaining({ credentials: "include" }),
        );
        expect(result).toEqual({ ok: true });
    });

    it("decodes an error response the same way apiFetch does", async () => {
        mockFetch(() => jsonResponse(403, { message: "nope", code: "api-103" }));
        await expect(authApiFetch("https://auth.example.com", "/admin/impersonate")).rejects.toMatchObject({
            name: "ApiRequestError",
            message: "nope",
            status: 403,
            code: "api-103",
        });
    });

    describe("CSRF header echo", () => {
        afterEach(() => {
            document.cookie = "csrf=; Max-Age=0; path=/";
        });

        // authApiFetch() calls the exact same applyCsrfHeader()/readCsrfCookie() helpers apiFetch() does —
        // this test just confirms that wiring, using this app's own document.cookie. It does NOT, and
        // can't, simulate the real cross-origin case: a genuine authApiFetch() call targets a different
        // host than the page it runs on, and that host's CSRF cookie (host-only, per
        // @rapidrest/service-core's src/http/csrf/csrf.ts) is never present in this app's document.cookie
        // to begin with — that's a property of the cookie's Domain scope, enforced by the browser itself,
        // not something this client-side code could get wrong. See applyCsrfHeader()'s own doc comment.
        it("echoes whatever csrf cookie this app's own document.cookie holds, same as apiFetch()", async () => {
            document.cookie = "csrf=tok-abc123";
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await authApiFetch("https://auth.example.com", "/admin/impersonate/stop", { method: "POST" });
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.get("x-csrf-token")).toBe("tok-abc123");
        });

        it("never sends x-csrf-token on a safe request, even with a cookie present", async () => {
            document.cookie = "csrf=tok-abc123";
            const fetchMock = mockFetch(() => jsonResponse(200, {}));
            await authApiFetch("https://auth.example.com", "/admin/impersonate");
            const init = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = init.headers as Headers;
            expect(headers.has("x-csrf-token")).toBe(false);
        });
    });
});
