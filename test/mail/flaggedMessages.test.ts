// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { listFlaggedMessages } from "../../src/mail/flaggedMessages.js";

function folder(uid: string, type: string) {
    return {
        uid,
        version: 0,
        dateCreated: "",
        dateModified: "",
        mailboxUid: "mb1",
        name: type,
        type,
        unreadCount: 0,
        totalCount: 0,
    };
}

function message(uid: string, flagged: boolean, receivedDate: string) {
    return {
        uid,
        version: 0,
        dateCreated: "",
        dateModified: "",
        folderUid: "f-inbox",
        mailboxUid: "mb1",
        messageId: `${uid}@test`,
        subject: uid,
        from: { address: "a@example.com", type: "to" },
        recipients: [],
        sentDate: receivedDate,
        receivedDate,
        bodyPreview: "",
        flags: { read: true, flagged, answered: false, forwarded: false },
        importance: "normal",
        hasAttachments: false,
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("listFlaggedMessages", () => {
    it("returns an empty list when the mailbox has no mail folders at all.", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [folder("f-cal", "calendar")]);
            throw new Error(`unexpected ${url}`);
        });
        const result = await listFlaggedMessages("mb1");
        expect(result).toEqual([]);
    });

    it("returns an empty list when no message in any mail folder is flagged.", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [folder("f-inbox", "inbox")]);
            if (url.startsWith("/api/mail/messages")) return jsonResponse(200, [message("m1", false, "2026-01-01T00:00:00.000Z")]);
            throw new Error(`unexpected ${url}`);
        });
        const result = await listFlaggedMessages("mb1");
        expect(result).toEqual([]);
    });

    it("fans out across every mail folder (excluding calendar/contacts/tasks/notes), merging flagged messages newest-first.", async () => {
        const folders = [
            folder("f-inbox", "inbox"),
            folder("f-sent", "sent_items"),
            folder("f-cal", "calendar"),
            folder("f-contacts", "contacts"),
            folder("f-tasks", "tasks"),
        ];
        const fetchMock = mockFetch((url) => {
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, folders);
            if (url.includes("folderUid=f-inbox")) {
                return jsonResponse(200, [message("older", true, "2026-01-01T00:00:00.000Z"), message("not-flagged", false, "2026-01-05T00:00:00.000Z")]);
            }
            if (url.includes("folderUid=f-sent")) {
                return jsonResponse(200, [message("newer", true, "2026-01-10T00:00:00.000Z")]);
            }
            throw new Error(`unexpected ${url}`);
        });

        const result = await listFlaggedMessages("mb1");

        expect(result.map((m) => m.uid)).toEqual(["newer", "older"]);
        // Only inbox/sent_items should ever have been queried — calendar/contacts/tasks folders excluded.
        expect(fetchMock.mock.calls.filter((c) => (c[0] as string).startsWith("/api/mail/messages"))).toHaveLength(2);
    });

    it("pages through a folder holding more than one 500-message page, and includes archive folders.", async () => {
        const fullPage = Array.from({ length: 500 }, (_, i) => message(`p0-${i}`, false, "2026-01-01T00:00:00.000Z"));
        const fetchMock = mockFetch((url) => {
            if (url.startsWith("/api/mail/folders")) return jsonResponse(200, [folder("f-archive", "archive")]);
            if (url.includes("folderUid=f-archive") && url.includes("page=0")) return jsonResponse(200, fullPage);
            if (url.includes("folderUid=f-archive") && url.includes("page=1")) {
                return jsonResponse(200, [message("second-page-flagged", true, "2026-01-02T00:00:00.000Z")]);
            }
            throw new Error(`unexpected ${url}`);
        });

        const result = await listFlaggedMessages("mb1");

        expect(result.map((m) => m.uid)).toEqual(["second-page-flagged"]);
        const messageCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith("/api/mail/messages"));
        expect(messageCalls).toHaveLength(2);
        expect(messageCalls[0]).toContain("limit=500");
    });
});
