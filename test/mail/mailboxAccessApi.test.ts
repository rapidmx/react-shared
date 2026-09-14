// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    getMyMailboxAccess,
    listMailboxAccess,
    lookupMailboxOwnerByEmail,
    removeMailboxAccess,
    setMailboxAccess,
} from "../../src/mail/mailboxAccessApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getMyMailboxAccess", () => {
    it("fetches the caller's own access with the mailboxUid encoded", async () => {
        const access = { canRead: true, canCreate: true, canUpdate: false, canDelete: false, canManage: false };
        const fetchMock = mockFetch(() => jsonResponse(200, access));
        expect(await getMyMailboxAccess("mb/1")).toEqual(access);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb%2F1/access/me", expect.anything());
    });
});

describe("listMailboxAccess", () => {
    it("fetches the mailbox's member list", async () => {
        const members = [{ userOrRoleId: "u1", role: "viewer" }];
        const fetchMock = mockFetch(() => jsonResponse(200, members));
        const result = await listMailboxAccess("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb1/access", expect.anything());
        expect(result).toEqual(members);
    });

    it("encodes the mailboxUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listMailboxAccess("mb/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb%2F1/access", expect.anything());
    });
});

describe("setMailboxAccess", () => {
    it("PUTs the role to the member's own path segment", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { userOrRoleId: "u1", role: "manager" }));
        const result = await setMailboxAccess("mb1", "u1", "manager");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb1/access/u1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ role: "manager" }) }),
        );
        expect(result).toEqual({ userOrRoleId: "u1", role: "manager" });
    });

    it("encodes the userOrRoleId", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { userOrRoleId: "u/1", role: "viewer" }));
        await setMailboxAccess("mb1", "u/1", "viewer");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb1/access/u%2F1", expect.anything());
    });
});

describe("removeMailboxAccess", () => {
    it("DELETEs the member's own path segment", async () => {
        const fetchMock = mockFetch(() => jsonResponse(204, undefined));
        await removeMailboxAccess("mb1", "u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb1/access/u1", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("lookupMailboxOwnerByEmail", () => {
    it("fetches with the email query param and returns the match", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { userUid: "u1", displayName: "Jane Doe" }));
        const result = await lookupMailboxOwnerByEmail("jane@example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/lookup-by-email?email=jane%40example.com", expect.anything());
        expect(result).toEqual({ userUid: "u1", displayName: "Jane Doe" });
    });

    it("returns null for no match", async () => {
        mockFetch(() => jsonResponse(200, null));
        const result = await lookupMailboxOwnerByEmail("nobody@example.com");
        expect(result).toBeNull();
    });
});
