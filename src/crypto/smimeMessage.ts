///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * MIME assembly around `smime.ts`'s CMS primitives, implementing `specs/end-to-end_encryption.md`'s
 * "Header Protection" requirement — RFC 9788, not the older, spec-forbidden RFC 8551 §3.1
 * `message/rfc822`-wrapping approach.
 *
 * RFC 9788's actual mechanism (verified against the RFC text directly, not assumed from memory,
 * given how easy it is to get a narrow/recent spec wrong from recollection alone): protected header
 * fields are **not** wrapped in a `multipart/mixed` gutter part. They become literal header lines
 * prepended directly to the MIME entity that is signed/encrypted (the "Cryptographic Payload"),
 * whose own `Content-Type` gains an `hp="clear"` (signed-only) or `hp="cipher"` (encrypted) parameter.
 * For encrypted messages, `HP-Outer: <Field>: <value>` lines carry a copy of the outer envelope's
 * headers inside the protected payload, so a recipient can detect outer-header tampering. The outer,
 * unprotected envelope keeps real `From`/`To`/`Cc`/`Date` values but MUST obscure `Subject` to the
 * literal `"[...]"` under `hcp_baseline` — RFC 9788's own required minimum default policy (a
 * conformant MUA "MUST have a default HCP that offers confidentiality for the Subject Header Field at
 * least" — Section 3.3); this module implements exactly that baseline, not the more ambitious
 * `hcp_shy` policy (which also strips display names and normalizes Date to UTC).
 *
 * Combined sign-then-encrypt uses **opaque** signing (`smime.ts`'s `signOpaque()`), embedding the
 * `hp="cipher"`-tagged content inside an `application/pkcs7-mime; smime-type="signed-data"` entity,
 * which is then itself the plaintext encrypted into the final `enveloped-data` — matching the nesting
 * RFC 9788's own worked example uses (outer enveloped-data → decrypts to signed-data → unwraps to the
 * real `hp="cipher"` content), not a `multipart/signed` structure encrypted as a whole.
 */
import { fromBase64, toBase64 } from "./encoding.js";
import {
    decryptEnvelopedData,
    encryptForRecipients,
    signDetached,
    signOpaque,
    verifyDetached,
    verifyOpaque,
} from "./smime.js";

const CRLF = "\r\n";
/** RFC 2045's own line-length limit for base64-encoded body content. */
const BASE64_LINE_WIDTH = 76;

export interface ProtectedHeaders {
    from: string;
    to: string;
    cc?: string;
    /** An RFC 5322 date string (e.g. `new Date().toUTCString()`-shaped, `Date:`-header ready). */
    date: string;
    subject: string;
    messageId: string;
}

/** RFC 9788's `hcp_baseline` Header Confidentiality Policy — the RFC's own required minimum default
 * (Section 3.3). Applied to produce the OUTER, unprotected envelope's headers from the real
 * (protected) ones; `From`/`To`/`Cc`/`Date` pass through unchanged, `Subject` is obscured. */
export function applyBaselineOuterHeaders(headers: ProtectedHeaders): ProtectedHeaders {
    return { ...headers, subject: "[...]" };
}

function base64Wrapped(bytes: Uint8Array): string {
    const encoded = toBase64(bytes);
    const lines: string[] = [];
    for (let i = 0; i < encoded.length; i += BASE64_LINE_WIDTH) {
        lines.push(encoded.slice(i, i + BASE64_LINE_WIDTH));
    }
    return lines.join(CRLF);
}

function generateBoundary(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `----=_RapidMX_${Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`;
}

function protectedHeaderLines(headers: ProtectedHeaders, hpOuter?: ProtectedHeaders): string {
    const lines = [
        `From: ${headers.from}`,
        `To: ${headers.to}`,
        ...(headers.cc ? [`Cc: ${headers.cc}`] : []),
        `Date: ${headers.date}`,
        `Subject: ${headers.subject}`,
        `Message-ID: ${headers.messageId}`,
    ];
    if (hpOuter) {
        // RFC 9788 Section 2.2.1's `hp-outer` field: the literal string "HP-Outer:" followed by the
        // original field name and its (outer, possibly-obscured) value. Written on every encrypted
        // message per the spec, but not yet read back and compared against the actual outer envelope
        // on receipt (that comparison - detecting a tampered outer header - is real received-message
        // work for a later pass, not implemented by parseEncryptedMessage() below yet).
        lines.push(`HP-Outer: From: ${hpOuter.from}`);
        lines.push(`HP-Outer: To: ${hpOuter.to}`);
        if (hpOuter.cc) {
            lines.push(`HP-Outer: Cc: ${hpOuter.cc}`);
        }
        lines.push(`HP-Outer: Date: ${hpOuter.date}`);
        lines.push(`HP-Outer: Subject: ${hpOuter.subject}`);
    }
    return lines.join(CRLF);
}

/** One MIME entity's worth of headers-beyond-Content-Type plus body, ready for a caller (the actual
 * outbound-message compose step, built on top of this module) to combine with the outer envelope's
 * own `From`/`To`/`Subject`/`Date`/`Message-ID`. */
export interface MimePart {
    /** The full `Content-Type` header value, including any parameters. */
    contentType: string;
    /** Any other headers this entity needs (`Content-Transfer-Encoding`, `Content-Disposition`, ...). */
    additionalHeaders?: Record<string, string>;
    body: string;
}

/**
 * Builds a detached `multipart/signed` message with RFC 9788 header protection (`hp="clear"`) — per
 * the spec, the only form signature-only messages may use (opaque signing is reserved for the
 * sign-then-encrypt case in `buildEncryptedMessage()`, where no legacy client is ever exposed to it).
 */
export async function buildSignedOnlyMessage(
    bodyContentType: string,
    bodyText: string,
    protectedHeaders: ProtectedHeaders,
    signingCertDer: Uint8Array,
    signingPrivateKey: CryptoKey,
): Promise<MimePart> {
    const boundary = generateBoundary();
    const innerEntity = [protectedHeaderLines(protectedHeaders), `Content-Type: ${bodyContentType}; hp="clear"`, "", bodyText].join(
        CRLF,
    );

    const signature = await signDetached(new TextEncoder().encode(innerEntity), signingCertDer, signingPrivateKey);

    const body = [
        `--${boundary}`,
        innerEntity,
        `--${boundary}`,
        `Content-Type: application/pkcs7-signature; name="smime.p7s"`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="smime.p7s"`,
        "",
        base64Wrapped(signature),
        `--${boundary}--`,
    ].join(CRLF);

    return { contentType: `multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`, body };
}

export interface ParsedSignedOnlyMessage {
    verified: boolean;
    signerCertificateDer?: Uint8Array;
    protectedHeaders?: ProtectedHeaders;
    bodyContentType?: string;
    bodyText?: string;
}

/** Parses and verifies a `multipart/signed` message built by `buildSignedOnlyMessage()`. Returns
 * `{ verified: false }` (never throws) for anything malformed — same "degrade to a failed-signature
 * state, don't crash" contract as `smime.ts`'s own verify functions. */
export async function parseSignedOnlyMessage(contentType: string, body: string): Promise<ParsedSignedOnlyMessage> {
    const boundary = extractBoundary(contentType);
    if (!boundary) {
        return { verified: false };
    }
    const parts = splitOnBoundary(body, boundary);
    if (parts.length < 2) {
        return { verified: false };
    }
    const [innerEntity, signaturePart] = parts;
    const signatureDer = extractBase64Body(signaturePart);
    if (!signatureDer) {
        return { verified: false };
    }

    const result = await verifyDetached(new TextEncoder().encode(innerEntity), signatureDer);
    if (!result.valid) {
        return { verified: false };
    }

    const { headers, contentType: bodyContentType, body: bodyText } = splitHeadersAndBody(innerEntity);
    return {
        verified: true,
        signerCertificateDer: result.signerCertificateDer,
        protectedHeaders: headersToProtectedHeaders(headers),
        bodyContentType,
        bodyText,
    };
}

/**
 * Builds an `application/pkcs7-mime; smime-type="enveloped-data"` message with RFC 9788 header
 * protection (`hp="cipher"`), optionally sign-then-encrypt when `signing` is supplied (opaque
 * signing — see this module's own doc comment for why). Per the spec's "Encrypt to Self"
 * requirement, `recipientCertDers` MUST include the sender's own encryption certificate.
 */
export async function buildEncryptedMessage(
    bodyContentType: string,
    bodyText: string,
    protectedHeaders: ProtectedHeaders,
    outerHeaders: ProtectedHeaders,
    recipientCertDers: Uint8Array[],
    signing?: { certDer: Uint8Array; privateKey: CryptoKey },
): Promise<MimePart> {
    const plaintextEntity = [
        protectedHeaderLines(protectedHeaders, outerHeaders),
        `Content-Type: ${bodyContentType}; hp="cipher"`,
        "",
        bodyText,
    ].join(CRLF);

    let contentToEncrypt: Uint8Array;
    if (signing) {
        const signedDer = await signOpaque(new TextEncoder().encode(plaintextEntity), signing.certDer, signing.privateKey);
        contentToEncrypt = new TextEncoder().encode(
            [
                `Content-Type: application/pkcs7-mime; smime-type="signed-data"; name="smime.p7m"`,
                `Content-Transfer-Encoding: base64`,
                "",
                base64Wrapped(signedDer),
            ].join(CRLF),
        );
    } else {
        contentToEncrypt = new TextEncoder().encode(plaintextEntity);
    }

    const envelopedDer = await encryptForRecipients(contentToEncrypt, recipientCertDers);
    return {
        contentType: `application/pkcs7-mime; smime-type="enveloped-data"; name="smime.p7m"`,
        additionalHeaders: { "Content-Transfer-Encoding": "base64", "Content-Disposition": 'attachment; filename="smime.p7m"' },
        body: base64Wrapped(envelopedDer),
    };
}

/**
 * Combines a `MimePart` (from `buildSignedOnlyMessage()`/`buildEncryptedMessage()`) with the outer
 * envelope's own headers into one complete RFC 5322 message source, ready for `mailApi.ts`'s
 * `assembleDraftRaw()`. `outerHeaders` MUST be the already-obscured headers for an encrypted message
 * (`applyBaselineOuterHeaders()`'s output) - this function does no obscuring itself, it only serializes
 * whatever headers it's given. Deliberately excludes `Bcc`: that recipient list is submission-only and
 * must never appear as a message header (see `AssembleDraftRawInput`'s own doc comment - `bcc` is passed
 * to that call separately, never baked into `rawMime`).
 */
export function assembleOutboundMime(outerHeaders: ProtectedHeaders, part: MimePart): string {
    const lines = [
        `From: ${outerHeaders.from}`,
        `To: ${outerHeaders.to}`,
        ...(outerHeaders.cc ? [`Cc: ${outerHeaders.cc}`] : []),
        `Date: ${outerHeaders.date}`,
        `Subject: ${outerHeaders.subject}`,
        `Message-ID: ${outerHeaders.messageId}`,
        `MIME-Version: 1.0`,
        `Content-Type: ${part.contentType}`,
        ...Object.entries(part.additionalHeaders ?? {}).map(([key, value]) => `${key}: ${value}`),
        "",
        part.body,
    ];
    return lines.join(CRLF);
}

export interface ParsedEncryptedMessage {
    decrypted: boolean;
    /** Whether an inner (opaque) signature was present and verified - `undefined` when the message
     * was encrypted without also being signed. */
    signatureVerified?: boolean;
    signerCertificateDer?: Uint8Array;
    protectedHeaders?: ProtectedHeaders;
    bodyContentType?: string;
    bodyText?: string;
    /** `true` when `actualOuterHeaders` was supplied and disagrees with the `HP-Outer:` field copies
     * found in the decrypted protected content - RFC 9788's own requirement to "visually distinguish a
     * message whose outer and protected headers disagree" (a MITM or malicious intermediary rewrote the
     * unprotected envelope after signing/encryption). `false` when both were supplied and agree.
     * `undefined` when there's nothing to compare - no `actualOuterHeaders` given, or the message
     * carries no `HP-Outer:` lines at all (a foreign sender's S/MIME implementation that doesn't write
     * them, or a message from before this field existed). */
    headerTamperDetected?: boolean;
}

/** RFC 9788's `HP-Outer:` field-copy fields to actually compare - a subset of `ProtectedHeaders`
 * (`messageId` has no `HP-Outer` counterpart; only the fields the outer envelope itself carries do).
 * Exported so `messageSecurity.ts` can build one from a received message's real outer envelope. */
export type ComparableOuterHeaders = Partial<Pick<ProtectedHeaders, "from" | "to" | "cc" | "date" | "subject">>;

/** Extracts the outer-envelope header values RFC 9788's `HP-Outer: <Field>: <value>` mechanism embeds
 * inside an encrypted message's protected content - one line per outer header, all sharing the literal
 * field name `HP-Outer`, which `splitHeadersAndBody()`'s own flat header map can hold only the last of
 * (a real bug if reused for this - JSON/`Record` keys aren't multi-valued). Scans the raw header block
 * text directly instead. Returns `undefined` when no `HP-Outer:` lines are present at all, so a caller
 * can distinguish "nothing to compare" from "compared and everything matched". */
function extractHpOuterHeaders(rawHeaderBlock: string): ComparableOuterHeaders | undefined {
    const result: ComparableOuterHeaders = {};
    let found = false;
    for (const line of rawHeaderBlock.split(CRLF)) {
        const match = /^HP-Outer:\s*(From|To|Cc|Date|Subject):\s*(.*)$/i.exec(line);
        if (!match) {
            continue;
        }
        found = true;
        const field = match[1].toLowerCase() as keyof ComparableOuterHeaders;
        result[field] = match[2].trim();
    }
    return found ? result : undefined;
}

/** `true` when every field `hpOuter` actually carries matches `actualOuterHeaders`' value for that same
 * field - a field `hpOuter` doesn't carry (e.g. no `Cc` on this message) is not compared, since RFC
 * 9788 never claims coverage for it either way. */
function outerHeadersMatch(hpOuter: ComparableOuterHeaders, actualOuterHeaders: ComparableOuterHeaders): boolean {
    return (Object.keys(hpOuter) as (keyof ComparableOuterHeaders)[]).every((field) => hpOuter[field] === actualOuterHeaders[field]);
}

/** Decrypts (and, if present, verifies the inner signature of) a message built by
 * `buildEncryptedMessage()`. Returns `{ decrypted: false }` (never throws) for anything malformed or
 * undecryptable with the given key — the caller's own concern is distinguishing "wrong key" from
 * "corrupt message," neither of which this function treats as exceptional.
 *
 * `actualOuterHeaders` — the received message's real, unprotected outer envelope headers (as the
 * caller itself read them, before ever calling this function) — enables the RFC 9788 `HP-Outer`
 * comparison (see `ParsedEncryptedMessage.headerTamperDetected`); omit it to skip that check entirely.
 */
export async function parseEncryptedMessage(
    base64Body: string,
    recipientCertDer: Uint8Array,
    recipientPrivateKey: CryptoKey,
    actualOuterHeaders?: ComparableOuterHeaders,
): Promise<ParsedEncryptedMessage> {
    const envelopedDer = decodeBase64Body(base64Body);
    if (!envelopedDer) {
        return { decrypted: false };
    }

    let decrypted: Uint8Array;
    try {
        decrypted = await decryptEnvelopedData(envelopedDer, recipientCertDer, recipientPrivateKey);
    } catch {
        return { decrypted: false };
    }

    function compareTamper(rawHeaderBlock: string): boolean | undefined {
        const hpOuter = extractHpOuterHeaders(rawHeaderBlock);
        if (!hpOuter || !actualOuterHeaders) {
            return undefined;
        }
        return !outerHeadersMatch(hpOuter, actualOuterHeaders);
    }

    const decoded = new TextDecoder().decode(decrypted);
    const { headers: outerContentHeaders, body: outerContentBody, rawHeaderBlock: outerRawHeaderBlock } = splitHeadersAndBody(decoded);
    const innerContentType = outerContentHeaders["content-type"];

    if (innerContentType?.includes('smime-type="signed-data"')) {
        const signedDer = decodeBase64Body(outerContentBody);
        if (!signedDer) {
            return { decrypted: false };
        }
        const verifyResult = await verifyOpaque(signedDer);
        if (!verifyResult.valid || !verifyResult.content) {
            return { decrypted: true, signatureVerified: false };
        }
        const plaintext = new TextDecoder().decode(verifyResult.content);
        const { headers, contentType: bodyContentType, body: bodyText, rawHeaderBlock } = splitHeadersAndBody(plaintext);
        return {
            decrypted: true,
            signatureVerified: true,
            signerCertificateDer: verifyResult.signerCertificateDer,
            protectedHeaders: headersToProtectedHeaders(headers),
            bodyContentType,
            bodyText,
            headerTamperDetected: compareTamper(rawHeaderBlock),
        };
    }

    const { headers, contentType: bodyContentType, body: bodyText } = splitHeadersAndBody(decoded);
    return {
        decrypted: true,
        protectedHeaders: headersToProtectedHeaders(headers),
        bodyContentType,
        bodyText,
        headerTamperDetected: compareTamper(outerRawHeaderBlock),
    };
}

// ---------------------------------------------------------------------------
// Small, targeted MIME parsing helpers - sufficient for entities this module
// itself produces; not a general-purpose MIME parser.
// ---------------------------------------------------------------------------

function extractBoundary(contentType: string): string | undefined {
    const match = /boundary="([^"]+)"/.exec(contentType);
    return match?.[1];
}

function splitOnBoundary(body: string, boundary: string): string[] {
    const delimiter = `--${boundary}`;
    return body
        .split(delimiter)
        .map((part) => part.replace(/^\r\n/, "").replace(/\r\n$/, ""))
        .filter((part) => part.length > 0 && part !== "--");
}

function extractBase64Body(part: string): Uint8Array | undefined {
    const { body } = splitHeadersAndBody(part);
    return decodeBase64Body(body);
}

function decodeBase64Body(base64Body: string): Uint8Array | undefined {
    try {
        return fromBase64(base64Body.replace(/[\r\n]/g, ""));
    } catch {
        return undefined;
    }
}

/** Splits a MIME entity's raw text into its header lines (lowercased-key map) and body, and returns
 * the entity's own Content-Type value (if present) for convenience. Exported for `messageSecurity.ts`,
 * which uses it to read a *received* message's own top-level Content-Type before deciding whether to
 * treat it as `buildEncryptedMessage()`- or `buildSignedOnlyMessage()`-shaped.
 *
 * Also returns the raw, unparsed header block text as `rawHeaderBlock` — the flat `headers` map can
 * only hold one value per (lowercased) name, which silently drops all but the last line for a
 * repeated-name header like RFC 9788's `HP-Outer` (see `extractHpOuterHeaders()`, which parses
 * `rawHeaderBlock` directly instead). */
export function splitHeadersAndBody(entity: string): { headers: Record<string, string>; contentType?: string; body: string; rawHeaderBlock: string } {
    const separatorIndex = entity.indexOf(`${CRLF}${CRLF}`);
    const headerBlock = separatorIndex === -1 ? entity : entity.slice(0, separatorIndex);
    const body = separatorIndex === -1 ? "" : entity.slice(separatorIndex + 2 * CRLF.length);

    const headers: Record<string, string> = {};
    for (const line of headerBlock.split(CRLF)) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) {
            continue;
        }
        const name = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        headers[name] = value;
    }
    return { headers, contentType: headers["content-type"], body, rawHeaderBlock: headerBlock };
}

function headersToProtectedHeaders(headers: Record<string, string>): ProtectedHeaders {
    return {
        from: headers["from"] ?? "",
        to: headers["to"] ?? "",
        cc: headers["cc"],
        date: headers["date"] ?? "",
        subject: headers["subject"] ?? "",
        messageId: headers["message-id"] ?? "",
    };
}
