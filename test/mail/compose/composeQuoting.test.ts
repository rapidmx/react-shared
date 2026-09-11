// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    buildForwardQuote,
    buildReplyQuote,
    forwardSubject,
    replySubject,
} from "../../../src/mail/compose/composeQuoting.js";

function messageFixture(overrides: Record<string, unknown> = {}) {
    return {
        uid: "m1",
        version: 0,
        dateCreated: "2026-01-01T00:00:00.000Z",
        dateModified: "2026-01-01T00:00:00.000Z",
        folderUid: "f1",
        mailboxUid: "mb1",
        messageId: "abc@example.com",
        subject: "Hello there",
        from: { address: "sender@example.com", displayName: "Sender One", type: "to" as const },
        recipients: [
            { address: "u1@example.com", displayName: "Me", type: "to" as const },
            { address: "other@example.com", type: "cc" as const },
        ],
        sentDate: "2026-01-01T00:00:00.000Z",
        receivedDate: "2026-01-01T00:00:00.000Z",
        bodyPreview: "Hi there,\njust checking in.",
        flags: { read: false, flagged: false, answered: false, forwarded: false },
        importance: "normal" as const,
        hasAttachments: false,
        ...overrides,
    };
}

describe("replySubject", () => {
    it("prepends 'Re: ' when the subject doesn't already have it", () => {
        expect(replySubject("Hello there")).toBe("Re: Hello there");
    });

    it("leaves a subject that already starts with 'Re:' (any casing) unchanged", () => {
        expect(replySubject("Re: Hello there")).toBe("Re: Hello there");
        expect(replySubject("RE: Hello there")).toBe("RE: Hello there");
    });
});

describe("forwardSubject", () => {
    it("prepends 'Fwd: ' when the subject doesn't already have it", () => {
        expect(forwardSubject("Hello there")).toBe("Fwd: Hello there");
    });

    it("leaves a subject that already starts with 'Fwd:' (any casing) unchanged", () => {
        expect(forwardSubject("Fwd: Hello there")).toBe("Fwd: Hello there");
        expect(forwardSubject("FWD: Hello there")).toBe("FWD: Hello there");
    });
});

describe("buildReplyQuote", () => {
    it("includes the sender's display name and the body preview, one <p> per line", () => {
        const html = buildReplyQuote(messageFixture());
        expect(html).toContain("Sender One");
        expect(html).toContain("<p>Hi there,</p>");
        expect(html).toContain("<p>just checking in.</p>");
    });

    it("renders a blank line as a non-collapsing paragraph", () => {
        const message = messageFixture({ bodyPreview: "Hi there,\n\nJust checking in." });
        expect(buildReplyQuote(message)).toContain("<p>&nbsp;</p>");
    });

    it("falls back to the raw address when the sender has no display name", () => {
        const message = messageFixture({ from: { address: "sender@example.com", type: "to" as const } });
        expect(buildReplyQuote(message)).toContain("sender@example.com");
    });

    it("HTML-escapes the body preview", () => {
        const message = messageFixture({ bodyPreview: "<script>alert(1)</script> & \"quoted\"" });
        const html = buildReplyQuote(message);
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(html).toContain("&amp;");
        expect(html).toContain("&quot;quoted&quot;");
    });
});

describe("buildForwardQuote", () => {
    it("includes the forwarded-message header block with From/Date/Subject/To", () => {
        const html = buildForwardQuote(messageFixture());
        expect(html).toContain("---------- Forwarded message ----------");
        expect(html).toContain("From: Sender One");
        expect(html).toContain("Subject: Hello there");
        expect(html).toContain("To: Me");
    });

    it("omits cc/bcc recipients from the To: header line", () => {
        const html = buildForwardQuote(messageFixture());
        expect(html).not.toContain("other@example.com");
    });

    it("falls back to '(no subject)' when the subject is blank", () => {
        const html = buildForwardQuote(messageFixture({ subject: "" }));
        expect(html).toContain("Subject: (no subject)");
    });
});
