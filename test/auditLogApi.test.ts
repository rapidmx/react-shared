// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "./testUtils.js";
import { listAuditLog } from "../src/auditLogApi.js";

const entry = {
    uid: "al1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    actorUserUid: "u1",
    action: "domain.create",
    targetType: "Domain",
    targetUid: "example.com",
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listAuditLog", () => {
    it("fetches with default pagination and no filters", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [entry]));
        const result = await listAuditLog();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/audit-log?limit=25&page=0", expect.anything());
        expect(result).toEqual([entry]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAuditLog({}, { page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/audit-log?limit=10&page=2", expect.anything());
    });

    it("forwards every provided filter", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAuditLog({ mailboxUid: "mb1", actorUserUid: "u1", action: "domain.create", targetType: "Domain" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/audit-log?limit=25&page=0&mailboxUid=mb1&actorUserUid=u1&action=domain.create&targetType=Domain",
            expect.anything(),
        );
    });

    it("omits filters that are not provided", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAuditLog({ mailboxUid: "mb1" });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/audit-log?limit=25&page=0&mailboxUid=mb1", expect.anything());
    });
});
