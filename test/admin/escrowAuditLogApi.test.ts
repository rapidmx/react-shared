// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { getAuditLogEntry, listAuditLogEntries, verifyAuditChain } from "../../src/admin/escrowAuditLogApi.js";

const entry = {
    uid: "eal1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    sequence: 0,
    hash: "abc123",
    action: "escrow_access_request.created" as const,
    holderUserUid: "u1",
    matterId: "m1",
    mailboxUid: "mb1",
    requestId: "ar1",
    occurredAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listAuditLogEntries", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [entry]));
        const result = await listAuditLogEntries();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/audit-log?limit=25&page=0", expect.anything());
        expect(result).toEqual([entry]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAuditLogEntries({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/audit-log?limit=10&page=2", expect.anything());
    });
});

describe("getAuditLogEntry", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, entry));
        const result = await getAuditLogEntry("eal/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/audit-log/eal%2F1", expect.anything());
        expect(result).toEqual(entry);
    });
});

describe("verifyAuditChain", () => {
    it("GETs the verify sub-route", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { valid: true }));
        const result = await verifyAuditChain();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/audit-log/verify", expect.anything());
        expect(result).toEqual({ valid: true });
    });

    it("surfaces a broken chain's sequence number", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { valid: false, brokenAtSequence: 4 }));
        const result = await verifyAuditChain();
        expect(fetchMock).toHaveBeenCalledWith("/api/escrow/audit-log/verify", expect.anything());
        expect(result).toEqual({ valid: false, brokenAtSequence: 4 });
    });
});
