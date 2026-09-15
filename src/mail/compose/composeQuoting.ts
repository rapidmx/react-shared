///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Builds what a Reply/Reply All/Forward compose starts with - its recipients, its quoted original message, and the
 * body layout around the quote - entirely client-side, same "restapi never composes message bodies" convention as
 * `mailApi.ts`'s `assembleDraft()`.
 *
 * The quote carries the original's full body, as the reader saw it: the caller passes a `QuotedBody` (the message's
 * sanitized HTML body, its decrypted/verified content, or its plain-text body). HTML is sanitized again here with
 * the same remote-resource-stripping policy used to display a client-rendered body (`messageBodySanitizer.ts`), plus
 * a stricter tag list for the editor. `message.bodyPreview` - a server-derived excerpt, truncated - is only the last
 * resort, when no body could be loaded.
 */

import { Message, Recipient } from "../mailApi.js";
import { sanitizeQuotedHtml } from "../messageBodySanitizer.js";

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function textToHtml(text: string): string {
    return escapeHtml(text)
        .split(/\r?\n/)
        .map((line) => `<p>${line || "&nbsp;"}</p>`)
        .join("");
}

/**
 * A recipient's display name, without the address the server sometimes leaves in it: an ingested message's `from`
 * carries the whole `"Bob Allen" <bob@example.com>` From header as its display name, which would otherwise be shown
 * (and addressed) as `"Bob Allen" <bob@example.com> <bob@example.com>`. A name that is, or ends in, the recipient's
 * own address is reduced to the part before it; a name that is any other address is dropped entirely.
 */
export function recipientDisplayName(recipient: Recipient): string | undefined {
    const name = recipient.displayName?.trim();
    if (!name) {
        return undefined;
    }
    const angle = /^(.*)<([^<>]*)>$/.exec(name);
    const inner = angle ? angle[2].trim() : name;
    if (!inner.includes("@")) {
        return name;
    }
    if (inner.toLowerCase() !== recipient.address.trim().toLowerCase()) {
        return undefined;
    }
    const before = (angle ? angle[1] : "").trim().replace(/^"(.*)"$/s, "$1").trim();
    return before || undefined;
}

/** The same recipient with `recipientDisplayName()`'s cleaned-up name (absent when nothing is left of it). */
function cleaned(recipient: Recipient): Recipient {
    const name = recipientDisplayName(recipient);
    return name === recipient.displayName ? recipient : { ...recipient, ...(name ? { displayName: name } : { displayName: undefined }) };
}

function displayName(recipient: Recipient): string {
    return recipientDisplayName(recipient) || recipient.address;
}

/** `Name <address>`, or the bare address when there's no usable display name. */
function nameAndAddress(recipient: Recipient): string {
    const name = recipientDisplayName(recipient);
    return name ? `${name} <${recipient.address}>` : recipient.address;
}

const QUOTE_STYLE = "border-left:2px solid #ccc;margin:0;padding-left:1em;color:#666;";

/** The body of the message being quoted, as loaded by the caller. `html` is preferred over `text`; either may be
 * absent (e.g. an encrypted message this device can't open, or a failed fetch). */
export interface QuotedBody {
    /** An HTML body. Sanitized again by the quote builders, so it may come from any source. */
    html?: string;
    /** A plain-text body. HTML-escaped by the quote builders. */
    text?: string;
}

/** Whether sanitized HTML still shows anything: text other than whitespace, or an image. */
function hasVisibleContent(html: string): boolean {
    return /<img\b/i.test(html) || html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "") !== "";
}

/** The quoted content: the sanitized HTML body, else the text body, else the body preview. */
function quotedContent(message: Message, body: QuotedBody | undefined): string {
    if (body?.html) {
        const sanitized = sanitizeQuotedHtml(body.html);
        if (hasVisibleContent(sanitized)) {
            return sanitized;
        }
    }
    if (body?.text?.trim()) {
        return textToHtml(body.text);
    }
    return textToHtml(message.bodyPreview ?? "");
}

/** Prepends "Re: " unless `subject` already starts with it (any casing) — the same convention every
 * mail client uses to avoid a "Re: Re: Re: ..." chain. */
export function replySubject(subject: string): string {
    return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

/** Same convention as `replySubject()`, for forwards. */
export function forwardSubject(subject: string): string {
    return /^fwd:/i.test(subject.trim()) ? subject : `Fwd: ${subject}`;
}

/** The quoted original a Reply/Reply All compose starts with: an "On <date>, Name <address> wrote:" line and the
 * original body in a blockquote. `buildComposeBodyHtml()` places it in the body. */
export function buildReplyQuote(message: Message, body?: QuotedBody): string {
    const when = new Date(message.receivedDate).toLocaleString();
    return (
        `<p>On ${escapeHtml(when)}, ${escapeHtml(nameAndAddress(message.from))} wrote:</p>` +
        `<blockquote style="${QUOTE_STYLE}">${quotedContent(message, body)}</blockquote>`
    );
}

/** The quoted body a Forward compose starts with — includes the original headers block, matching every
 * major mail client's own forward convention, since a forward (unlike a reply) has no visible reply
 * chain of its own to imply who originally sent it. */
export function buildForwardQuote(message: Message, body?: QuotedBody): string {
    const when = new Date(message.receivedDate).toLocaleString();
    const to = message.recipients
        .filter((r) => r.type === "to")
        .map(displayName)
        .join(", ");
    return (
        `<p>---------- Forwarded message ----------<br>` +
        `From: ${escapeHtml(nameAndAddress(message.from))}<br>` +
        `Date: ${escapeHtml(when)}<br>` +
        `Subject: ${escapeHtml(message.subject || "(no subject)")}<br>` +
        `To: ${escapeHtml(to)}</p>` +
        `<blockquote style="${QUOTE_STYLE}">${quotedContent(message, body)}</blockquote>`
    );
}

/**
 * The HTML a compose body starts with, laid out the way Outlook and Gmail do: an empty paragraph first (where the
 * caret goes, so typing lands above everything else), then the signature, then the quoted original. `""` when there
 * is neither a signature nor a quote, which leaves the editor's own single empty paragraph.
 */
export function buildComposeBodyHtml(signatureHtml?: string, quotedHtml?: string): string {
    if (!signatureHtml && !quotedHtml) {
        return "";
    }
    const separator = signatureHtml && quotedHtml ? "<p></p>" : "";
    return `<p></p>${signatureHtml ?? ""}${separator}${quotedHtml ?? ""}`;
}

/** The To and Cc a reply starts with. */
export interface ReplyRecipients {
    to: Recipient[];
    cc: Recipient[];
}

/**
 * Who a Reply or Reply All goes to. The replying mailbox itself (`ownAddresses`: its primary address and aliases,
 * compared case-insensitively) is left out, and no address is repeated.
 *
 * A reply to someone else's message goes to its sender. Reply All adds the original To recipients to To and the
 * original Cc recipients to Cc.
 *
 * A reply to a message the mailbox sent itself (e.g. from Sent Items) goes to the original To recipients instead of
 * back to the mailbox, and Reply All keeps the original Cc as Cc. With no other To recipient, the original Cc
 * recipients become To. Only a message the mailbox sent to nobody but itself is replied to itself.
 *
 * Bcc recipients are never carried over. Display names are kept.
 */
export function buildReplyRecipients(message: Message, ownAddresses: string[], replyAll: boolean): ReplyRecipients {
    const own = new Set(ownAddresses.map((address) => address.trim().toLowerCase()));
    const seen = new Set<string>();
    const take = (recipients: Recipient[]): Recipient[] =>
        recipients
            .filter((recipient) => {
                const key = recipient.address.trim().toLowerCase();
                if (!key || own.has(key) || seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            })
            .map(cleaned);
    const originalTo = message.recipients.filter((r) => r.type === "to");
    const originalCc = message.recipients.filter((r) => r.type === "cc");

    if (!own.has(message.from.address.trim().toLowerCase())) {
        const to = take([message.from, ...(replyAll ? originalTo : [])]);
        return { to, cc: replyAll ? take(originalCc) : [] };
    }
    const to = take(originalTo);
    const cc = take(originalCc);
    if (to.length > 0) {
        return { to, cc: replyAll ? cc : [] };
    }
    if (cc.length > 0) {
        return { to: cc, cc: [] };
    }
    return { to: [cleaned(message.from)], cc: [] };
}
