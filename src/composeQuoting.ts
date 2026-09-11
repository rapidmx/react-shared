///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Builds the quoted-original-message HTML a Reply/Reply All/Forward compose starts with — this app's
 * own job entirely, same "restapi never composes message bodies" convention as `mailApi.ts`'s
 * `assembleDraft()`. Quotes `message.bodyPreview` (a plain-text excerpt the server already derives at
 * ingest time) rather than the message's full rendered HTML body: `MessageDetailPane`'s own body
 * renders via a sandboxed `<iframe src=".../content">`, so the raw HTML is never available to this
 * app's own JavaScript to re-embed without a second fetch and its own HTML-in-HTML sanitization pass —
 * a plain-text quote is a smaller, safer outcome, and no less faithful in practice since
 * `sanitizeComposeHtml()` (the server-side gate every compose body passes through regardless of origin)
 * strips active content out of a full HTML quote anyway.
 */

import { Message, Recipient } from "./mailApi.js";

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

function displayName(recipient: Recipient): string {
    return recipient.displayName || recipient.address;
}

const QUOTE_STYLE = "border-left:2px solid #ccc;margin:0;padding-left:1em;color:#666;";

/** Prepends "Re: " unless `subject` already starts with it (any casing) — the same convention every
 * mail client uses to avoid a "Re: Re: Re: ..." chain. */
export function replySubject(subject: string): string {
    return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

/** Same convention as `replySubject()`, for forwards. */
export function forwardSubject(subject: string): string {
    return /^fwd:/i.test(subject.trim()) ? subject : `Fwd: ${subject}`;
}

/** The quoted body a Reply/Reply All compose starts with, below the resolved signature (if any). */
export function buildReplyQuote(message: Message): string {
    const when = new Date(message.receivedDate).toLocaleString();
    return (
        `<p>On ${escapeHtml(when)}, ${escapeHtml(displayName(message.from))} wrote:</p>` +
        `<blockquote style="${QUOTE_STYLE}">${textToHtml(message.bodyPreview)}</blockquote>`
    );
}

/** The quoted body a Forward compose starts with — includes the original headers block, matching every
 * major mail client's own forward convention, since a forward (unlike a reply) has no visible reply
 * chain of its own to imply who originally sent it. */
export function buildForwardQuote(message: Message): string {
    const when = new Date(message.receivedDate).toLocaleString();
    const to = message.recipients
        .filter((r) => r.type === "to")
        .map(displayName)
        .join(", ");
    return (
        `<p>---------- Forwarded message ----------<br>` +
        `From: ${escapeHtml(displayName(message.from))}<br>` +
        `Date: ${escapeHtml(when)}<br>` +
        `Subject: ${escapeHtml(message.subject || "(no subject)")}<br>` +
        `To: ${escapeHtml(to)}</p>` +
        `<blockquote style="${QUOTE_STYLE}">${textToHtml(message.bodyPreview)}</blockquote>`
    );
}
