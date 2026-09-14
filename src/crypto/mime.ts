///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * A small, dependency-free MIME (RFC 5322 / RFC 2045-2047) parser used by `smimeMessage.ts` and
 * `messageSecurity.ts` to read *received* messages - which, unlike this package's own output, can come
 * from any foreign MUA/MTA. It deliberately covers exactly what S/MIME evaluation needs and nothing more:
 *
 * header unfolding (RFC 5322 §2.2.3) and CRLF-or-bare-LF line endings; case-insensitive RFC 2045
 * `type/subtype; name=value` parameters, quoted or unquoted; RFC 2046 multipart splitting with
 * preamble/epilogue, transport padding after the delimiter, and delimiters only recognized at the start
 * of a line; `Content-Transfer-Encoding` decoding (base64, quoted-printable; 7bit/8bit/binary pass
 * through) plus `charset` decoding via `TextDecoder`; and picking the displayable body (text/html
 * preferred, text/plain otherwise) out of a nested multipart.
 *
 * Not supported (documented, not silently wrong): RFC 2231 parameter continuations/charset-encoded
 * parameters and RFC 2047 encoded-words in header values - neither is needed to classify, decrypt, or
 * verify a message, and both are left verbatim.
 */

/** One header field, unfolded, with its name exactly as written and its value trimmed. */
export interface MimeHeaderField {
    name: string;
    value: string;
}

export interface MimeEntity {
    /** Every header field in order - including repeated names (e.g. RFC 9788 `HP-Outer`). */
    fields: MimeHeaderField[];
    /** Lowercased name -> value of that name's FIRST occurrence. */
    headers: Record<string, string>;
    /** The raw, still-folded header block text (everything before the blank separator line). */
    rawHeaderBlock: string;
    /** The raw, undecoded body (everything after the blank separator line). */
    body: string;
}

export interface ParameterizedHeader {
    /** The lowercased main value (e.g. `multipart/signed`). */
    value: string;
    /** Lowercased parameter name -> unquoted value. */
    params: Record<string, string>;
}

/** Maximum multipart nesting `extractDisplayBody()` descends into - a hostile message can nest
 * arbitrarily deep, and nothing legitimate needs more than a handful of levels. */
const MAX_MULTIPART_DEPTH = 8;

/** Splits a MIME entity into its header fields and body. Never throws. */
export function parseMimeEntity(entity: string): MimeEntity {
    let rawHeaderBlock: string;
    let body: string;
    const leading = /^\r?\n/.exec(entity);
    if (leading) {
        // An entity whose very first line is blank has no headers at all (RFC 2046 §5.1.1 - a body part
        // with no header fields defaults to text/plain; charset=us-ascii).
        rawHeaderBlock = "";
        body = entity.slice(leading[0].length);
    } else {
        const separator = /\r?\n\r?\n/.exec(entity);
        rawHeaderBlock = separator ? entity.slice(0, separator.index) : entity;
        body = separator ? entity.slice(separator.index + separator[0].length) : "";
    }

    const fields: MimeHeaderField[] = [];
    const headers: Record<string, string> = {};
    const unfolded = rawHeaderBlock.replace(/\r?\n(?=[ \t])/g, "");
    for (const line of unfolded.split(/\r?\n/)) {
        const colonIndex = line.indexOf(":");
        if (colonIndex <= 0) {
            continue;
        }
        const name = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        fields.push({ name, value });
        const key = name.toLowerCase();
        if (!(key in headers)) {
            headers[key] = value;
        }
    }
    return { fields, headers, rawHeaderBlock, body };
}

/** Parses an RFC 2045 parameterized header value (`Content-Type`, `Content-Disposition`). */
export function parseParameterizedHeader(headerValue: string | undefined): ParameterizedHeader {
    const segments: string[] = [];
    let current = "";
    let inQuotes = false;
    const input = headerValue ?? "";
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inQuotes && ch === "\\" && i + 1 < input.length) {
            current += input[++i];
        } else if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ";" && !inQuotes) {
            segments.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    segments.push(current);

    const [main, ...rest] = segments;
    const params: Record<string, string> = {};
    for (const segment of rest) {
        const eq = segment.indexOf("=");
        const name = segment.slice(0, Math.max(eq, 0)).trim().toLowerCase();
        if (name && !(name in params)) {
            params[name] = segment.slice(eq + 1).trim();
        }
    }
    return { value: main.trim().toLowerCase(), params };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits a multipart body on `boundary` per RFC 2046 §5.1.1: a delimiter is `--boundary` at the start of
 * a line (optionally followed by transport-padding whitespace), the CRLF preceding it belongs to the
 * delimiter (not the previous part), text before the first delimiter is preamble and text after the close
 * delimiter (`--boundary--`) is epilogue - both discarded. Each returned part is the exact text between
 * delimiter lines, which is what a `multipart/signed` signature covers.
 */
export function splitMultipart(body: string, boundary: string): string[] {
    const delimiter = new RegExp(`(?:^|\\r?\\n)--${escapeRegExp(boundary)}(--)?[ \\t]*(?=\\r?\\n|$)`, "g");
    const parts: string[] = [];
    let partStart = -1;
    let match: RegExpExecArray | null;
    while ((match = delimiter.exec(body)) !== null) {
        if (partStart !== -1) {
            parts.push(body.slice(partStart, Math.max(partStart, match.index)));
        }
        if (match[1]) {
            return parts;
        }
        const end = match.index + match[0].length;
        partStart = end + (body.startsWith("\r\n", end) ? 2 : body.startsWith("\n", end) ? 1 : 0);
    }
    // No close delimiter (a truncated message): whatever follows the last delimiter is still a part.
    if (partStart !== -1) {
        parts.push(body.slice(partStart));
    }
    return parts;
}

/** Returns the lowercased, trimmed `Content-Transfer-Encoding` mechanism, or `undefined`. */
function transferEncodingOf(entity: MimeEntity): string | undefined {
    return entity.headers["content-transfer-encoding"]?.trim().toLowerCase();
}

/** Decodes a base64 body into bytes, ignoring whitespace/line breaks. Returns `undefined` for invalid
 * base64 rather than throwing. */
export function decodeBase64Text(text: string): Uint8Array | undefined {
    try {
        const binary = atob(text.replace(/\s+/g, ""));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return undefined;
    }
}

/** Decodes a quoted-printable body (RFC 2045 §6.7) into bytes. Literal non-ASCII characters (which
 * can't legally appear in QP, but do after an 8-bit-unsafe gateway) are kept as their UTF-8 bytes. */
export function decodeQuotedPrintable(text: string): Uint8Array {
    const withoutSoftBreaks = text.replace(/=[ \t]*\r?\n/g, "");
    const bytes: number[] = [];
    const encoder = new TextEncoder();
    for (let i = 0; i < withoutSoftBreaks.length; i++) {
        const ch = withoutSoftBreaks[i];
        const hex = withoutSoftBreaks.slice(i + 1, i + 3);
        if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 2;
        } else {
            bytes.push(...encoder.encode(ch));
        }
    }
    return new Uint8Array(bytes);
}

function decodeCharset(bytes: Uint8Array, charset: string | undefined): string {
    try {
        return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch {
        // An unknown/unsupported charset label - UTF-8 is the least-bad fallback (a superset of ASCII).
        return new TextDecoder("utf-8").decode(bytes);
    }
}

/** Decodes an entity's body into bytes per its `Content-Transfer-Encoding`. 7bit/8bit/binary (or no
 * header) return the body's own UTF-8 bytes. Returns `undefined` only for invalid base64. */
export function decodeBodyBytes(entity: MimeEntity): Uint8Array | undefined {
    const cte = transferEncodingOf(entity);
    if (cte === "base64") {
        return decodeBase64Text(entity.body);
    }
    if (cte === "quoted-printable") {
        return decodeQuotedPrintable(entity.body);
    }
    return new TextEncoder().encode(entity.body);
}

/** Decodes an entity's body to text: transfer encoding first, then its `charset` parameter. */
export function decodeBodyText(entity: MimeEntity): string {
    const cte = transferEncodingOf(entity);
    if (cte !== "base64" && cte !== "quoted-printable") {
        // Already text - the raw message was read as a string, so an 8bit body is already decoded.
        return entity.body;
    }
    const charset = parseParameterizedHeader(entity.headers["content-type"]).params["charset"];
    return decodeCharset(decodeBodyBytes(entity) ?? new Uint8Array(), charset);
}

/** A message's displayable content: `html` only for a real `text/html` part, `text` only for a
 * `text/plain` part - never plain text mislabeled as HTML. */
export interface DisplayBody {
    html?: string;
    text?: string;
}

function isAttachment(entity: MimeEntity): boolean {
    return parseParameterizedHeader(entity.headers["content-disposition"]).value === "attachment";
}

/** Picks the displayable body out of an entity: a `text/html` part is preferred over `text/plain`, and a
 * multipart entity is searched (non-attachment children only, bounded depth). Entities with no
 * Content-Type default to text/plain per RFC 2045 §5.2. */
export function extractDisplayBody(entity: MimeEntity, depth = 0): DisplayBody {
    const contentType = parseParameterizedHeader(entity.headers["content-type"] ?? "text/plain");
    if (contentType.value === "text/html") {
        return { html: decodeBodyText(entity) };
    }
    if (contentType.value === "text/plain") {
        return { text: decodeBodyText(entity) };
    }
    const boundary = contentType.params["boundary"];
    if (!contentType.value.startsWith("multipart/") || !boundary || depth >= MAX_MULTIPART_DEPTH) {
        return {};
    }
    let text: string | undefined;
    for (const part of splitMultipart(entity.body, boundary)) {
        const child = parseMimeEntity(part);
        if (isAttachment(child)) {
            continue;
        }
        const found = extractDisplayBody(child, depth + 1);
        if (found.html !== undefined) {
            return { html: found.html };
        }
        text ??= found.text;
    }
    return text === undefined ? {} : { text };
}

/** HTML-escapes plain text and wraps it in a whitespace-preserving `<pre>`, so a `text/plain` body can be
 * rendered through the same HTML path without ever being interpreted as markup. */
export function plainTextToHtml(text: string): string {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return `<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit">${escaped}</pre>`;
}

/** Extracts the bare, lowercased addr-specs from an address-list header value (`"Name" <a@b>, c@d`).
 * Handles quoted display names containing commas/angle brackets and RFC 5322 comments. */
export function extractAddresses(headerValue: string | undefined): string[] {
    if (!headerValue) {
        return [];
    }
    const withoutQuoted = headerValue.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\((?:[^()\\]|\\.)*\)/g, "");
    const addresses: string[] = [];
    for (const item of withoutQuoted.split(",")) {
        const angle = /<([^>]*)>/.exec(item);
        // A bare addr-spec may carry RFC 5322 group syntax around it (`Team: a@b, c@d;`).
        const address = (angle ? angle[1] : item.replace(/^[^:]*:/, "").replace(/;\s*$/, "")).trim().toLowerCase();
        if (address.includes("@")) {
            addresses.push(address);
        }
    }
    return addresses;
}
