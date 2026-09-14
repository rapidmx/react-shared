// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import { configureApiBaseUrl } from "../../src/util/api.js";
import {
    approveReceipt,
    archiveMessage,
    assembleDraft,
    assembleDraftRaw,
    attachmentContentUrl,
    autoProvisionMailbox,
    cancelScheduledSend,
    classifyMessage,
    createDraft,
    deleteMessage,
    createFolder,
    createMailbox,
    declineReceipt,
    deleteMailbox,
    getMailbox,
    getMailboxAcl,
    getMessage,
    getMessageRawContent,
    grantMailboxAccess,
    impersonateUser,
    listAttachments,
    listFolders,
    listIngestQueue,
    listMailboxDomains,
    listMailboxes,
    listMessages,
    listResourceMailboxes,
    listQuarantine,
    recallMessage,
    releaseQuarantineEntry,
    revokeMailboxAccess,
    sendMessage,
    setMessageLabels,
    setMessageRead,
    setMessageRequestReceipt,
    stopImpersonating,
    updateFolder,
    updateMailbox,
    uploadAttachment,
} from "../../src/mail/mailApi.js";

const mailbox = {
    uid: "mb1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    ownerUserUid: "u1",
    primarySmtpAddress: "u1@example.com",
    aliasAddresses: [],
    displayName: "User One",
    timezone: "UTC",
    quotaBytes: 1_000_000_000,
    usedBytes: 0,
};

afterEach(() => {
    vi.unstubAllGlobals();
    configureApiBaseUrl("");
});

describe("listMailboxes", () => {
    it("fetches with default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [mailbox]));
        const result = await listMailboxes();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes?limit=25&page=0", expect.anything());
        expect(result).toEqual([mailbox]);
    });

    it("forwards a custom page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listMailboxes({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes?limit=10&page=2", expect.anything());
    });
});

describe("listResourceMailboxes", () => {
    it("fetches with the isResource filter and default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [mailbox]));
        const result = await listResourceMailboxes();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes?limit=25&page=0&isResource=true", expect.anything());
        expect(result).toEqual([mailbox]);
    });

    it("forwards a custom page/limit alongside the isResource filter", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listResourceMailboxes({ page: 1, limit: 100 });
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes?limit=100&page=1&isResource=true", expect.anything());
    });
});

describe("getMailbox", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, mailbox));
        const result = await getMailbox("mb/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb%2F1", expect.anything());
        expect(result).toEqual(mailbox);
    });
});

describe("createMailbox", () => {
    it("posts the input with aliasAddresses/usedBytes defaults", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, mailbox));
        await createMailbox({
            primarySmtpAddress: "support@example.com",
            displayName: "Support",
            timezone: "UTC",
            quotaBytes: 5_000_000_000,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    aliasAddresses: [],
                    usedBytes: 0,
                    primarySmtpAddress: "support@example.com",
                    displayName: "Support",
                    timezone: "UTC",
                    quotaBytes: 5_000_000_000,
                }),
            }),
        );
    });

    it("omits ownerUserUid when not given, for a true ownerless shared mailbox", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, mailbox));
        await createMailbox({
            primarySmtpAddress: "support@example.com",
            displayName: "Support",
            timezone: "UTC",
            quotaBytes: 5_000_000_000,
        });
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(body.ownerUserUid).toBeUndefined();
    });
});

describe("listMailboxDomains", () => {
    it("fetches the configured domain list", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, ["example.com", "example.org"]));
        const result = await listMailboxDomains();
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/domains", expect.anything());
        expect(result).toEqual(["example.com", "example.org"]);
    });
});

describe("autoProvisionMailbox", () => {
    it("posts an empty body when called with no selection", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { status: "created", mailbox }));
        const result = await autoProvisionMailbox();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/auto-provision",
            expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
        );
        expect(result).toEqual({ status: "created", mailbox });
    });

    it("posts the given alias/domain selection", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { status: "existing", mailbox }),
        );
        const result = await autoProvisionMailbox({ alias: "support", domain: "example.com" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/auto-provision",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ alias: "support", domain: "example.com" }) }),
        );
        expect(result).toEqual({ status: "existing", mailbox });
    });

    it("resolves needs_selection with the alias options to choose from", async () => {
        const options = [{ alias: "jane", domain: "example.com", primarySmtpAddress: "jane@example.com" }];
        mockFetch(() => jsonResponse(200, { status: "needs_selection", options }));
        const result = await autoProvisionMailbox();
        expect(result).toEqual({ status: "needs_selection", options });
    });
});

describe("updateMailbox", () => {
    it("PUTs the encoded uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...mailbox, displayName: "Renamed" }));
        const result = await updateMailbox({ uid: "mb/1", version: 0, displayName: "Renamed" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/mailboxes/mb%2F1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "mb/1", version: 0, displayName: "Renamed" }),
            }),
        );
        expect(result.displayName).toBe("Renamed");
    });
});

describe("deleteMailbox", () => {
    it("DELETEs the encoded uid with the version query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteMailbox("mb/1", 3);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/mailboxes/mb%2F1?version=3", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("listQuarantine", () => {
    it("fetches with the mailboxUid query param and default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listQuarantine("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/quarantine?limit=25&page=0&mailboxUid=mb1", expect.anything());
    });
});

describe("releaseQuarantineEntry", () => {
    it("PUTs releasedAt/releasedByUserUid for the encoded uid", async () => {
        const now = new Date("2026-06-01T00:00:00.000Z");
        vi.useFakeTimers().setSystemTime(now);
        const released = { uid: "q1", version: 1, releasedAt: now.toISOString(), releasedByUserUid: "admin-1" };
        const fetchMock = mockFetch(() => jsonResponse(200, released));

        const result = await releaseQuarantineEntry("q/1", 0, "admin-1");

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/quarantine/q%2F1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "q/1", version: 0, releasedAt: now.toISOString(), releasedByUserUid: "admin-1" }),
            }),
        );
        expect(result).toEqual(released);
        vi.useRealTimers();
    });
});

describe("listIngestQueue", () => {
    it("fetches with the mailboxUid query param and default pagination", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listIngestQueue("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/ingest-queue?limit=25&page=0&mailboxUid=mb1", expect.anything());
    });
});

describe("getMailboxAcl", () => {
    it("fetches the encoded mailbox uid", async () => {
        const acl = { uid: "mb1", version: 0, records: [] };
        const fetchMock = mockFetch(() => jsonResponse(200, acl));
        const result = await getMailboxAcl("mb/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/acls/mb%2F1", expect.anything());
        expect(result).toEqual(acl);
    });
});

describe("grantMailboxAccess", () => {
    it("reads the current ACL then PUTs it with the new record appended", async () => {
        const acl = { uid: "mb1", version: 0, records: [{ userOrRoleId: "owner-1", actions: ["*"] }] };
        const fetchMock = mockFetch((url, init) => {
            if ((init?.method ?? "GET") === "GET") return jsonResponse(200, acl);
            return jsonResponse(200, { ...acl, version: 1 });
        });

        await grantMailboxAccess("mb1", "delegate-1", ["read", "list"]);

        expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/acls/mb1", expect.anything());
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/acls/mb1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    uid: "mb1",
                    version: 0,
                    records: [
                        { userOrRoleId: "owner-1", actions: ["*"] },
                        { userOrRoleId: "delegate-1", actions: ["read", "list"] },
                    ],
                }),
            }),
        );
    });

    it("replaces an existing record for the same userOrRoleId rather than duplicating it", async () => {
        const acl = { uid: "mb1", version: 0, records: [{ userOrRoleId: "delegate-1", actions: ["read"] }] };
        mockFetch((url, init) => ((init?.method ?? "GET") === "GET" ? jsonResponse(200, acl) : jsonResponse(200, acl)));

        const fetchMock2 = mockFetch((url, init) => ((init?.method ?? "GET") === "GET" ? jsonResponse(200, acl) : jsonResponse(200, acl)));
        await grantMailboxAccess("mb1", "delegate-1", ["read", "list", "count"]);
        const body = JSON.parse((fetchMock2.mock.calls[1][1] as RequestInit).body as string);
        expect(body.records).toEqual([{ userOrRoleId: "delegate-1", actions: ["read", "list", "count"] }]);
    });
});

describe("revokeMailboxAccess", () => {
    it("reads the current ACL then PUTs it with the matching record removed", async () => {
        const acl = {
            uid: "mb1",
            version: 2,
            records: [
                { userOrRoleId: "owner-1", actions: ["*"] },
                { userOrRoleId: "delegate-1", actions: ["read"] },
            ],
        };
        const fetchMock = mockFetch((url, init) => (
            (init?.method ?? "GET") === "GET" ? jsonResponse(200, acl) : jsonResponse(200, { ...acl, version: 3 })
        ));

        await revokeMailboxAccess("mb1", "delegate-1");

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/acls/mb1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "mb1", version: 2, records: [{ userOrRoleId: "owner-1", actions: ["*"] }] }),
            }),
        );
    });
});

const folder = {
    uid: "f1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    mailboxUid: "mb1",
    name: "Inbox",
    type: "inbox" as const,
    unreadCount: 2,
    totalCount: 5,
};

describe("listFolders", () => {
    it("fetches with the mailboxUid query param", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [folder]));
        const result = await listFolders("mb1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/folders?limit=200&page=0&mailboxUid=mb1", expect.anything());
        expect(result).toEqual([folder]);
    });
});

describe("createFolder", () => {
    it("posts with zeroed counts filled in, and the given fields", async () => {
        const created = { ...folder, uid: "f-new", name: "Birthdays", type: "calendar" as const, color: "#2563eb" };
        const fetchMock = mockFetch(() => jsonResponse(200, created));
        const result = await createFolder({ mailboxUid: "mb1", name: "Birthdays", type: "calendar", color: "#2563eb" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/folders",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ unreadCount: 0, totalCount: 0, mailboxUid: "mb1", name: "Birthdays", type: "calendar", color: "#2563eb" }),
            }),
        );
        expect(result).toEqual(created);
    });
});

describe("updateFolder", () => {
    it("puts the given fields to the folder's uid", async () => {
        const updated = { ...folder, name: "Renamed", color: "#dc2626" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await updateFolder({ uid: "f1", version: 0, name: "Renamed", color: "#dc2626" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/folders/f1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ uid: "f1", version: 0, name: "Renamed", color: "#dc2626" }) }),
        );
        expect(result).toEqual(updated);
    });
});

const message = {
    uid: "m1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    folderUid: "f1",
    mailboxUid: "mb1",
    messageId: "abc@example.com",
    subject: "Hello",
    from: { address: "a@example.com", type: "to" as const },
    recipients: [{ address: "b@example.com", type: "to" as const }],
    sentDate: "2026-01-01T00:00:00.000Z",
    receivedDate: "2026-01-01T00:00:00.000Z",
    bodyPreview: "Hi there",
    flags: { read: false, flagged: false, answered: false, forwarded: false },
    importance: "normal" as const,
    hasAttachments: false,
};

describe("listMessages", () => {
    it("fetches with the folderUid query param and a newest-first sort", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [message]));
        const result = await listMessages("f1");
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/mail/messages?limit=25&page=0&folderUid=f1&sort=${encodeURIComponent(JSON.stringify({ receivedDate: "DESC" }))}`,
            expect.anything(),
        );
        expect(result).toEqual([message]);
    });
});

describe("getMessage", () => {
    it("fetches the encoded uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        const result = await getMessage("m/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/m%2F1", expect.anything());
        expect(result).toEqual(message);
    });
});

describe("recallMessage", () => {
    it("POSTs to the encoded uid's recall route", async () => {
        const updated = { ...message, recallRequestedAt: "2026-01-02T00:00:00.000Z" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await recallMessage("m/1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m%2F1/recall",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result).toEqual(updated);
    });
});

describe("archiveMessage", () => {
    it("POSTs to the encoded uid's archive route", async () => {
        const updated = { ...message, folderUid: "archive-folder" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await archiveMessage("m/1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m%2F1/archive",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result).toEqual(updated);
    });
});

describe("classifyMessage", () => {
    it("POSTs classifyAs with applyToSender defaulted to false", async () => {
        const updated = { ...message, inferenceClassification: "other" };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await classifyMessage("m1", "other");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1/classify",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ classifyAs: "other", applyToSender: false }) }),
        );
        expect(result).toEqual(updated);
    });

    it("forwards an explicit applyToSender", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        await classifyMessage("m1", "focused", true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1/classify",
            expect.objectContaining({ body: JSON.stringify({ classifyAs: "focused", applyToSender: true }) }),
        );
    });
});

describe("setMessageRead", () => {
    it("PUTs the message's uid/version with only the read flag changed", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...message, flags: { ...message.flags, read: true } }));
        await setMessageRead(message, true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({
                    uid: "m1",
                    version: 0,
                    flags: { read: true, flagged: false, answered: false, forwarded: false },
                }),
            }),
        );
    });
});

describe("setMessageLabels", () => {
    it("PUTs the message's uid/version with the full new labelUids list", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...message, labelUids: ["l1", "l2"] }));
        await setMessageLabels(message, ["l1", "l2"]);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "m1", version: 0, labelUids: ["l1", "l2"] }),
            }),
        );
    });
});

describe("cancelScheduledSend", () => {
    it("PUTs the message's uid/version, clearing scheduledSendTime and moving it into the given Drafts folder", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...message, folderUid: "f-drafts", scheduledSendTime: undefined }));
        await cancelScheduledSend(message, "f-drafts");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "m1", version: 0, scheduledSendTime: null, folderUid: "f-drafts" }),
            }),
        );
    });
});

describe("setMessageRequestReceipt", () => {
    it("PUTs the message's uid/version with requestReceipt", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...message, requestReceipt: true }));
        await setMessageRequestReceipt(message, true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ uid: "m1", version: 0, requestReceipt: true }) }),
        );
    });
});

describe("approveReceipt", () => {
    it("POSTs the receipt type to the approve route", async () => {
        const updated = { ...message, deliveryReceiptPending: false };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await approveReceipt("m1", "delivery");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1/receipt/approve",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "delivery" }) }),
        );
        expect(result).toEqual(updated);
    });
});

describe("declineReceipt", () => {
    it("POSTs the receipt type to the decline route", async () => {
        const updated = { ...message, readReceiptPending: false };
        const fetchMock = mockFetch(() => jsonResponse(200, updated));
        const result = await declineReceipt("m1", "read");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1/receipt/decline",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ type: "read" }) }),
        );
        expect(result).toEqual(updated);
    });
});

const attachment = {
    uid: "a1",
    version: 0,
    dateCreated: "2026-01-01T00:00:00.000Z",
    dateModified: "2026-01-01T00:00:00.000Z",
    messageUid: "m1",
    folderUid: "f1",
    mailboxUid: "mb1",
    filename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1234,
    isInline: false,
};

describe("listAttachments", () => {
    it("fetches with the folderUid/messageUid query params", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [attachment]));
        const result = await listAttachments("f1", "m1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/attachments?limit=200&page=0&folderUid=f1&messageUid=m1",
            expect.anything(),
        );
        expect(result).toEqual([attachment]);
    });
});

describe("attachmentContentUrl", () => {
    it("builds the same-origin download URL for an encoded uid", () => {
        expect(attachmentContentUrl("a/1")).toBe("/api/mail/attachments/a%2F1/content");
    });

    it("prefixes the configured API base URL", () => {
        configureApiBaseUrl("https://mail.example.com");
        expect(attachmentContentUrl("a1")).toBe("https://mail.example.com/api/mail/attachments/a1/content");
    });
});

describe("uploadAttachment", () => {
    it("posts the file's raw bytes with its own content-type, not JSON", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        const fetchMock = mockFetch(() => jsonResponse(200, attachment));

        const result = await uploadAttachment("m1", file);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/attachments/upload?messageUid=m1&filename=note.txt&mimeType=text%2Fplain",
            expect.objectContaining({ method: "POST", body: file, credentials: "include" }),
        );
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/plain");
        expect(result).toEqual(attachment);
    });

    it("targets the configured API base URL", async () => {
        configureApiBaseUrl("https://mail.example.com");
        const fetchMock = mockFetch(() => jsonResponse(200, attachment));
        await uploadAttachment("m1", new File(["hello"], "note.txt", { type: "text/plain" }));
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://mail.example.com/api/mail/attachments/upload?messageUid=m1&filename=note.txt&mimeType=text%2Fplain",
        );
    });

    it("falls back to application/octet-stream when the file has no type", async () => {
        const file = new File(["hello"], "note");
        const fetchMock = mockFetch(() => jsonResponse(200, attachment));

        await uploadAttachment("m1", file);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/attachments/upload?messageUid=m1&filename=note&mimeType=application%2Foctet-stream",
            expect.anything(),
        );
    });

    it("throws ApiRequestError using the body's message field on a non-ok response", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => jsonResponse(400, { message: "too large", code: "api-101" }));

        await expect(uploadAttachment("m1", file)).rejects.toMatchObject({
            name: "ApiRequestError",
            message: "too large",
            status: 400,
            code: "api-101",
        });
    });

    it("falls back to the body's error field when message is absent", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => jsonResponse(400, { error: "too large" }));

        await expect(uploadAttachment("m1", file)).rejects.toMatchObject({ message: "too large" });
    });

    it("treats an unparseable JSON body as no body", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));

        const result = await uploadAttachment("m1", file);

        expect(result).toBeUndefined();
    });

    it("returns undefined for a non-JSON success response body", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => new Response("", { status: 200, headers: { "content-type": "text/plain" } }));

        const result = await uploadAttachment("m1", file);

        expect(result).toBeUndefined();
    });

    it("falls back to statusText when the error response has no JSON body", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));

        await expect(uploadAttachment("m1", file)).rejects.toMatchObject({ message: "Server Error", status: 500 });
    });

    it("falls back to statusText when the JSON body has neither message nor error", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => jsonResponse(400, {}, { statusText: "Bad Request" }));

        await expect(uploadAttachment("m1", file)).rejects.toMatchObject({ message: "Bad Request" });
    });

    it("falls back to a generic message when there is no body and no statusText", async () => {
        const file = new File(["hello"], "note.txt", { type: "text/plain" });
        mockFetch(() => new Response(null, { status: 500, statusText: "" }));

        await expect(uploadAttachment("m1", file)).rejects.toMatchObject({ message: "Upload failed." });
    });
});

describe("createDraft", () => {
    it("posts the mailboxUid/folderUid with a generated messageId", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        await createDraft("mb1", "f1");
        const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
        expect(body.mailboxUid).toBe("mb1");
        expect(body.folderUid).toBe("f1");
        expect(body.messageId).toMatch(/@webmail$/);
    });
});

describe("deleteMessage", () => {
    it("DELETEs the encoded message uid with its version", async () => {
        const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
        await deleteMessage("m/1", 3);
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/m%2F1?version=3", expect.objectContaining({ method: "DELETE" }));
    });
});

describe("assembleDraft", () => {
    it("posts the compose input to the encoded draft's assemble endpoint", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        const input = { to: [{ address: "b@example.com" }], subject: "Hi", html: "<p>Hi</p>" };
        const result = await assembleDraft("m/1", input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/compose/m%2F1/assemble",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
        expect(result).toEqual(message);
    });
});

describe("assembleDraftRaw", () => {
    it("posts the raw MIME source to the encoded draft's assemble-raw endpoint", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        const input = { to: [{ address: "b@example.com" }], subject: "[...]", rawMime: "raw mime source" };
        const result = await assembleDraftRaw("m/1", input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/compose/m%2F1/assemble-raw",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
        expect(result).toEqual(message);
    });
});

describe("getMessageRawContent", () => {
    it("fetches the encoded message's raw endpoint and returns its text body", async () => {
        const fetchMock = mockFetch(() => new Response("From: a@example.com\r\n\r\nbody", { status: 200, headers: { "content-type": "message/rfc822" } }));
        const result = await getMessageRawContent("m/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/m%2F1/raw", { credentials: "include" });
        expect(result).toBe("From: a@example.com\r\n\r\nbody");
    });

    // Round-4 review: `res.text()` UTF-8-decoded the whole message, replacing a non-UTF-8 8bit part's bytes
    // with U+FFFD before its charset was known. The result is now a binary string: one code unit per byte.
    it("returns the body as a byte-preserving binary string, not UTF-8-decoded text", async () => {
        const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0xc3, 0xa9, 0x80, 0xff]);
        mockFetch(() => new Response(bytes, { status: 200, headers: { "content-type": "message/rfc822" } }));
        const result = await getMessageRawContent("m1");
        expect(Array.from(result, (ch) => ch.charCodeAt(0))).toEqual(Array.from(bytes));
    });

    it("targets the configured API base URL", async () => {
        configureApiBaseUrl("https://mail.example.com");
        const fetchMock = mockFetch(() => new Response("raw", { status: 200 }));
        await getMessageRawContent("m1");
        expect(fetchMock).toHaveBeenCalledWith("https://mail.example.com/api/mail/messages/m1/raw", { credentials: "include" });
    });

    it("throws ApiRequestError using the body's message field on a non-ok JSON response", async () => {
        mockFetch(() => jsonResponse(404, { message: "no such message", code: "api-404" }));
        await expect(getMessageRawContent("m1")).rejects.toMatchObject({
            name: "ApiRequestError",
            message: "no such message",
            status: 404,
            code: "api-404",
        });
    });

    it("falls back to statusText when a non-ok response has no JSON body", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));
        await expect(getMessageRawContent("m1")).rejects.toMatchObject({ message: "Server Error", status: 500 });
    });

    it("falls back to the body's error field when message is absent", async () => {
        mockFetch(() => jsonResponse(500, { error: "internal failure" }));
        await expect(getMessageRawContent("m1")).rejects.toMatchObject({ message: "internal failure" });
    });

    it("falls back to a generic message when there is no body and no statusText", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "" }));
        await expect(getMessageRawContent("m1")).rejects.toMatchObject({ message: "Could not load this message's raw content." });
    });

    it("falls back to a generic message when the error response claims JSON but isn't parseable", async () => {
        mockFetch(() => new Response("not actually json", { status: 500, statusText: "", headers: { "content-type": "application/json" } }));
        await expect(getMessageRawContent("m1")).rejects.toMatchObject({ message: "Could not load this message's raw content." });
    });
});

describe("sendMessage", () => {
    it("posts to the encoded message's send endpoint", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, message));
        const result = await sendMessage("m/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/mail/messages/m%2F1/send", expect.objectContaining({ method: "POST" }));
        expect(result).toEqual(message);
        expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
    });

    it("sends a scheduled time in the send request's body", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ...message, scheduledSendTime: "2026-06-01T09:00:00.000Z" }));
        await sendMessage("m1", { scheduledSendTime: "2026-06-01T09:00:00.000Z" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/mail/messages/m1/send",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ scheduledSendTime: "2026-06-01T09:00:00.000Z" }) }),
        );
    });
});

describe("impersonateUser", () => {
    it("posts the target user's uid to auth-server, with credentials included", async () => {
        const impersonationResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, impersonationResult));
        const result = await impersonateUser("https://auth.example.com", "u1");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://auth.example.com/api/admin/impersonate",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ userUid: "u1" }),
                credentials: "include",
            }),
        );
        expect(result).toEqual(impersonationResult);
    });

    it("posts to this app's own local dev-only endpoint when impersonationBaseUrl is empty", async () => {
        const impersonationResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, impersonationResult));
        const result = await impersonateUser("", "u1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/impersonate",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ userUid: "u1" }) }),
        );
        expect(result).toEqual(impersonationResult);
    });
});

describe("stopImpersonating", () => {
    it("GETs auth-server's stop endpoint with credentials included", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { restored: true }));
        const result = await stopImpersonating("https://auth.example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://auth.example.com/api/admin/impersonate/stop",
            expect.objectContaining({ method: "GET", credentials: "include" }),
        );
        expect(result).toEqual({ restored: true });
    });

    it("GETs this app's own local dev-only stop endpoint when impersonationBaseUrl is empty", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { restored: true }));
        const result = await stopImpersonating("");
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/impersonate/stop", expect.objectContaining({ method: "GET" }));
        expect(result).toEqual({ restored: true });
    });
});
