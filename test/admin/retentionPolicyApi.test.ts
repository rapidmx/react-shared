// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { getRetentionPolicy, updateRetentionPolicy } from "../../src/admin/retentionPolicyApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getRetentionPolicy", () => {
    it("fetches the singleton policy", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { messageRetentionDays: 90, auditLogRetentionDays: 2190 }));
        const result = await getRetentionPolicy();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/retention-policy", expect.anything());
        expect(result).toEqual({ messageRetentionDays: 90, auditLogRetentionDays: 2190 });
    });

    it("returns an empty object when nothing has been configured yet", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        const result = await getRetentionPolicy();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/retention-policy", expect.anything());
        expect(result).toEqual({});
    });
});

describe("updateRetentionPolicy", () => {
    it("PUTs only the supplied fields", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { messageRetentionDays: 90 }));
        const result = await updateRetentionPolicy({ messageRetentionDays: 90 });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/retention-policy",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ messageRetentionDays: 90 }) }),
        );
        expect(result).toEqual({ messageRetentionDays: 90 });
    });
});
