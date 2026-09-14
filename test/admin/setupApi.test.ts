// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { completeSetup, getSetupStatus, reopenSetup, saveSetupStep } from "../../src/admin/setupApi.js";
import { getMailboxPolicy, updateMailboxPolicy } from "../../src/admin/mailboxPolicyApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("setupApi", () => {
    it("reads, saves progress, completes and reopens setup", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { required: true }));
        expect(await getSetupStatus()).toEqual({ required: true });
        await saveSetupStep("domain");
        await completeSetup();
        await reopenSetup();
        expect(fetchMock).toHaveBeenCalledWith("/api/system/setup", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith("/api/system/setup", expect.objectContaining({ method: "PUT", body: JSON.stringify({ currentStep: "domain" }) }));
        expect(fetchMock).toHaveBeenCalledWith("/api/system/setup/complete", expect.objectContaining({ method: "POST" }));
        expect(fetchMock).toHaveBeenCalledWith("/api/system/setup/reopen", expect.objectContaining({ method: "POST" }));
    });
});

describe("mailboxPolicyApi", () => {
    it("reads and patches the mailbox policy", async () => {
        const policy = { defaultQuotaBytes: 1, autoProvisionEnabled: false, autoProvisionQuotaBytes: 2 };
        const fetchMock = mockFetch(() => jsonResponse(200, policy));
        expect(await getMailboxPolicy()).toEqual(policy);
        await updateMailboxPolicy({ autoProvisionEnabled: true });
        expect(fetchMock).toHaveBeenCalledWith("/api/system/mailbox-policy", expect.anything());
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/system/mailbox-policy",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ autoProvisionEnabled: true }) }),
        );
    });
});
