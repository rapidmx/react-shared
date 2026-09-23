// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { getMailboxPolicy, updateMailboxPolicy } from "../../src/admin/mailboxPolicyApi.js";

const policy = {
    defaultQuotaBytes: 1_000_000_000,
    autoProvisionEnabled: true,
    autoProvisionQuotaBytes: 500_000_000,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getMailboxPolicy", () => {
    it("fetches the deployment-wide policy", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, policy));
        const result = await getMailboxPolicy();
        expect(fetchMock).toHaveBeenCalledWith("/api/system/mailbox-policy", expect.anything());
        expect(result).toEqual(policy);
    });

    it("passes through a `defaults` block when the server includes one", async () => {
        const withDefaults = { ...policy, defaults: { ...policy } };
        mockFetch(() => jsonResponse(200, withDefaults));
        const result = await getMailboxPolicy();
        expect(result).toEqual(withDefaults);
    });

    it("rejects with the server's own message on failure", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        await expect(getMailboxPolicy()).rejects.toMatchObject({ status: 500, message: "boom" });
    });
});

describe("updateMailboxPolicy", () => {
    it("PUTs only the supplied fields as a partial patch", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...policy, autoProvisionEnabled: false }));
        const result = await updateMailboxPolicy({ autoProvisionEnabled: false });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/mailbox-policy",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ autoProvisionEnabled: false }) }),
        );
        expect(result.autoProvisionEnabled).toBe(false);
    });

    it("forwards multiple patched fields at once", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, policy));
        await updateMailboxPolicy({ defaultQuotaBytes: 2_000_000_000, autoProvisionQuotaBytes: 1_000_000_000 });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/mailbox-policy",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ defaultQuotaBytes: 2_000_000_000, autoProvisionQuotaBytes: 1_000_000_000 }),
            }),
        );
    });

    it("rejects with the server's own message when a non-admin caller is refused", async () => {
        mockFetch(() => jsonResponse(403, { message: "Forbidden.", code: "api-103" }));
        await expect(updateMailboxPolicy({ autoProvisionEnabled: false })).rejects.toMatchObject({
            status: 403,
            code: "api-103",
        });
    });
});
