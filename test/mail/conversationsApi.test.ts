// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { listConversations } from "../../src/mail/conversationsApi.js";

const conversation = {
    conversationId: "c1",
    subject: "Hello there",
    messageUids: ["m1", "m2"],
    folderUids: ["f1"],
    messageCount: 2,
    unreadCount: 1,
    latestDate: "2026-01-01T00:00:00.000Z",
    participants: [{ address: "sender@example.com", displayName: "Sender One", type: "to" }],
    hasAttachments: false,
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listConversations", () => {
    it("fetches with the mailboxUid query param, no pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [conversation]));
        const result = await listConversations("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/conversations?mailboxUid=mb1", expect.anything());
        expect(result).toEqual([conversation]);
    });

    it("encodes the mailboxUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listConversations("mb/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/conversations?mailboxUid=mb%2F1", expect.anything());
    });
});
