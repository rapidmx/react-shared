// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    createDomain,
    deleteDomain,
    getDnsSetup,
    getDomain,
    listDomains,
    updateDomain,
    verifyDomain,
} from "../../src/admin/domainsApi.js";

const domain = {
    uid: "example.com",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    name: "example.com",
    enabled: true,
    verified: false,
    verificationToken: "tok123",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listDomains", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [domain]));
        const result = await listDomains();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/domains?limit=25&page=0", expect.anything());
        expect(result).toEqual([domain]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listDomains({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/domains?limit=10&page=2", expect.anything());
    });
});

describe("getDomain", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, domain));
        const result = await getDomain("example.com/x");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/domains/example.com%2Fx", expect.anything());
        expect(result).toEqual(domain);
    });
});

describe("createDomain", () => {
    it("posts the input with enabled defaulted to true", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, domain));
        await createDomain({ name: "example.com" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/domains",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ enabled: true, name: "example.com" }),
            }),
        );
    });

    it("forwards an explicit enabled value instead of the default", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...domain, enabled: false }));
        await createDomain({ name: "example.com", enabled: false });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.enabled).toBe(false);
    });
});

describe("updateDomain", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...domain, enabled: false }));
        const result = await updateDomain({ uid: "example.com", version: 0, enabled: false });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/domains/example.com",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "example.com", version: 0, enabled: false }),
            }),
        );
        expect(result.enabled).toBe(false);
    });
});

describe("deleteDomain", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteDomain("example.com", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/domains/example.com?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});

describe("verifyDomain", () => {
    it("POSTs to the encoded uid's verify route", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...domain, verified: true }));
        const result = await verifyDomain("example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/domains/example.com/verify",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result.verified).toBe(true);
    });
});

describe("getDnsSetup", () => {
    it("fetches the encoded uid's dns-setup route", async () => {
        const checks = [{ type: "mx", recordKind: "MX", recordName: "example.com", configured: true, found: true, matches: true }];
        const fetchMock = mockFetch(() => jsonResponse(200, checks));
        const result = await getDnsSetup("example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/domains/example.com/dns-setup", expect.anything());
        expect(result).toEqual(checks);
    });
});
