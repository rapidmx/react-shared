// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { ApiRequestError, apiFetch, authApiFetch, configureApiBaseUrl } from "../../src/util/api.js";

afterEach(() => {
    vi.unstubAllGlobals();
    // apiBaseUrl is module-level state - reset to the default so a test that calls configureApiBaseUrl()
    // never leaks into a later test in this file (or another file sharing this module instance).
    configureApiBaseUrl("");
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

    it("code is optional", () => {
        const err = new ApiRequestError("nope", 500);
        expect(err.code).toBeUndefined();
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
});
