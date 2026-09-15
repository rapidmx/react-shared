///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Evaluates a *received* message's raw MIME source into one of `specs/end-to-end_encryption.md`'s
 * "Message Security Indicators" states, and recovers the plaintext body when applicable. Reads the
 * outer envelope's own `Content-Type` (via `mime.ts`'s `parseMimeEntity()`) to decide whether the message
 * is `multipart/signed`, `application/pkcs7-mime; smime-type="enveloped-data"`, or neither.
 *
 * **What a verified state means.** `"signed_verified"`/`"encrypted_verified"` require ALL of: (1) a
 * cryptographically valid CMS signature (`smime.ts` - detached signatures carrying their own eContent are
 * rejected, the signer certificate is the one matched to the SignerInfo, never simply the first embedded
 * certificate, and a `multipart/signed` body must hold exactly the signed part and the signature); (2) the
 * signer certificate's fingerprint is one the reader already trusts - a pinned `Contact` signing key passed
 * as `pinnedSignerFingerprints`, or the unlocked mailbox's own `signingFingerprint`; (3) the signer
 * certificate names the sender: one of its email addresses (SAN rfc822Name, else subject emailAddress /
 * email-shaped CN) equals the single address in the protected `From` (or the outer `From` when the signed
 * content carries no protected headers, as with non-RFC 9788 senders); (4) the protected `From`/`To`/`Cc`
 * address sets (when present) equal the outer envelope's, a signed-only message's protected `Subject` equals
 * its outer one (what the mail list shows), and neither header block carries more than one
 * `From`/`To`/`Cc`/`Sender` field.
 *
 * **No trust anchor, no verified badge.** Certificates aren't chain-validated (there is no trust store), so
 * checks 1, 3 and 4 alone prove only that *someone* holding a certificate naming the sender signed it - a
 * self-issued certificate with SAN `ceo@victim.com` passes them. Without a matching pin the result is
 * `"signed_unverified_signer"`/`"encrypted_unverified_signer"` instead, carrying `signerFingerprint` and
 * `signerEmails` so a UI can show "signed by an unverified certificate" and offer to trust it. A pin that was
 * supplied but doesn't match is `"signature_failed"` (`untrusted_signer`), and a failure of checks 1, 3 or 4
 * is `"signature_failed"` with `signatureFailureReason` saying which check failed.
 */
import { DisplayBody, MimeAttachment, MimeHeaderField, decodeHeaderText, extractAddresses, parseMimeEntity, parseParameterizedHeader, plainTextToHtml } from "./mime.js";
import { toBase64 } from "./encoding.js";
import { computeCertFingerprint, extractCertificateEmails } from "./smime.js";
import { ComparableOuterHeaders, ProtectedHeaders, parseEncryptedMessage, parseSignedOnlyMessage } from "./smimeMessage.js";

export { signingKeyFingerprints } from "./keyvaultApi.js";


/** `"signed_unverified_signer"`/`"encrypted_unverified_signer"`: the signature is valid and its certificate
 * names the sender, but the certificate isn't one the reader trusts (no pinned key matched) - see this module's
 * doc comment. The encrypted variant's content was decrypted like `"encrypted_verified"`'s. */
export type MessageSecurityState =
    | "encrypted"
    | "signed_verified"
    | "encrypted_verified"
    | "signed_unverified_signer"
    | "encrypted_unverified_signer"
    | "signature_failed"
    | "unprotected";

/** Why a message is `"signature_failed"`. `invalid_signature`: the CMS signature itself is malformed or
 * doesn't verify over the content (or a `multipart/signed` body doesn't hold exactly two parts).
 * `untrusted_signer`: pinned fingerprints were supplied and the signer certificate matches none of them (or no
 * signer certificate could be resolved at all). `signer_identity_mismatch`: the signer certificate doesn't name
 * the message's `From` address (or `From` doesn't hold exactly one address). `header_mismatch`: the
 * signed/protected `From`/`To`/`Cc` (or a signed-only message's `Subject`) disagree with the outer envelope's,
 * or either header block repeats a `From`/`To`/`Cc`/`Sender` field. */
export type SignatureFailureReason = "invalid_signature" | "untrusted_signer" | "signer_identity_mismatch" | "header_mismatch";

/** The header fields recovered from inside the signed/encrypted entity (RFC 9788 header protection), decoded
 * for display where they are text. */
export interface MessageProtectedHeaders {
    from: string;
    to: string;
    cc?: string;
    subject: string;
}

export interface MessageSecurityResult {
    state: MessageSecurityState;
    /** The verified/decrypted content as HTML - still needs client-side sanitization before touching the
     * DOM (this module does none itself; see `MessageDetailPane.tsx`). For a `text/html` body this is that
     * HTML; for a `text/plain` body it is the text HTML-escaped inside a whitespace-preserving `<pre>`
     * (never plain text passed through as markup), with the raw text in `text`. Absent for
     * `"unprotected"` (the caller should keep using the server's own sanitized `/content` body) and for an
     * encrypted message this device couldn't open (see `decryptError`). */
    html?: string;
    /** The raw plain text, present only when the recovered body was `text/plain` (not `text/html`). */
    text?: string;
    /** `true` when `evaluateMessageSecurity()` was given a `readerAddress` and recovered protected `To`/`Cc`
     * headers that don't include it - e.g. a genuinely signed message re-sent verbatim to someone it was
     * never addressed to. Informational, orthogonal to `state` (a Bcc recipient legitimately sees this
     * too), so a UI can say "this message wasn't addressed to you" next to an otherwise valid signature.
     * `undefined` when no reader address was given or nothing protected was recovered. */
    notAddressedToReader?: boolean;
    /** Present only for `"signature_failed"`: which verification step failed. */
    signatureFailureReason?: SignatureFailureReason;
    /** Present only when the message was encrypted but this device couldn't decrypt it (a wrong or
     * since-rotated key, non-AEAD content encryption, or corrupt/foreign data) - the caller should keep
     * showing whatever `GET /:id/content` already produced alongside this explanation. */
    decryptError?: string;
    /** See `ParsedEncryptedMessage.headerTamperDetected`'s own doc comment - a deliberately separate,
     * orthogonal signal from `state`, since RFC 9788's `HP-Outer` is written on every encrypted message
     * regardless of whether it's also signed. `undefined` for anything that isn't an encrypted message
     * this device could decrypt. */
    headerTamperDetected?: boolean;
    /** The real subject recovered from the message's protected headers - RFC 9788 header protection
     * obscures the outer envelope's own `Subject` to `"[...]"`. Populated only when content was actually
     * recovered and it carried a protected Subject. */
    subject?: string;
    /** Every protected header recovered from inside the signed/decrypted entity - present only when that entity
     * carries RFC 9788 protected headers (a protected `From`). Absent for a legacy S/MIME sender's signed-only
     * message: its outer Subject/To/Cc were then never signed, and a UI should not present them as verified. */
    protectedHeaders?: MessageProtectedHeaders;
    /** The attachments inside the verified/decrypted entity - for a signed-only message the only attachments the
     * signature covers, so a UI showing a verified badge should list these rather than the server's attachment
     * records (which include anything outside the signed part). Present whenever content was recovered. */
    attachments?: MimeAttachment[];
    /** SHA-256 fingerprint (hex) of the certificate that produced a cryptographically valid signature - present
     * for `"signed_verified"`, `"encrypted_verified"`, the `*_unverified_signer` states and a `"signature_failed"`
     * whose signature itself was valid. Compare against / pin as a `PublicKey.fingerprint`. */
    signerFingerprint?: string;
    /** The email addresses that signer certificate asserts (lowercased), alongside `signerFingerprint`. */
    signerEmails?: string[];
    /** Base64 DER of the certificate that verified the signature - what `keyvaultApi.ts`'s `trustSigner()` pins for
     * a "trust this signer" action. Present alongside `signerFingerprint` for `"signed_verified"`,
     * `"encrypted_verified"` and the `*_unverified_signer` states; never for `"signature_failed"`, even when its
     * signature itself was valid (a failed binding or pin mismatch is not something to offer trusting). */
    signerCertificate?: string;
}

function isSignedOnlyContentType(contentTypeValue: string): boolean {
    return contentTypeValue === "multipart/signed";
}

/** Matches `buildEncryptedMessage()`'s own output shape, and leniently accepts the equivalent legacy/
 * AEAD `smime-type` values a foreign S/MIME sender could produce (mirrors `@rapidmx/restapi`'s own
 * server-side `SmimeUtils.isEncryptedBody()` classification, so the two systems agree on what counts as
 * encrypted). Parameters are matched case-insensitively, quoted or not. */
function isEncryptedContentType(contentType: { value: string; params: Record<string, string> }): boolean {
    if (contentType.value === "multipart/encrypted") {
        return true;
    }
    if (!contentType.value.endsWith("pkcs7-mime")) {
        return false;
    }
    const smimeType = contentType.params["smime-type"]?.toLowerCase();
    return smimeType === "enveloped-data" || smimeType === "authenveloped-data";
}

const NO_KEY_ERROR = "This device doesn't have the key needed to decrypt this message.";
const UNSUPPORTED_ENCRYPTION_ERROR =
    "This message uses an older, unauthenticated encryption algorithm that RapidMX doesn't accept, so it can't be opened safely.";

function renderDisplayBody(display: DisplayBody | undefined): Pick<MessageSecurityResult, "html" | "text"> {
    if (display?.html !== undefined) {
        return { html: display.html };
    }
    if (display?.text !== undefined) {
        return { html: plainTextToHtml(display.text), text: display.text };
    }
    return {};
}

function sameAddressSet(a: string[], b: string[]): boolean {
    const left = new Set(a);
    const right = new Set(b);
    return left.size === right.size && [...left].every((address) => right.has(address));
}

/** Normalizes whitespace runs, so a Subject refolded in transit still compares equal. */
function normalizeSubject(value: string | undefined): string {
    return decodeHeaderText(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}


export interface SignerBindingInput {
    /** The certificate matched to the verified SignerInfo; `undefined` fails closed. */
    signerCertificateDer: Uint8Array | undefined;
    /** Headers recovered from inside the signed content (RFC 9788), if any. */
    protectedHeaders: (Pick<ProtectedHeaders, "from" | "to"> & Partial<Pick<ProtectedHeaders, "cc" | "subject">>) | undefined;
    /** The received message's outer header map (lowercased names), as `parseMimeEntity()` returns it. */
    outerHeaders: Record<string, string>;
    /** Every outer header field in order (`parseMimeEntity()`'s `fields`) - checked for repeated
     * `From`/`To`/`Cc`/`Sender`. Omitted, only the first-occurrence map above is available. */
    outerFields?: MimeHeaderField[];
    /** Every protected header field in order - checked for repeats the same way. */
    protectedFields?: MimeHeaderField[];
    /** One trusted fingerprint or several (any match is accepted). An empty array counts as none supplied. */
    pinnedSignerFingerprint?: string | string[];
    /** Also require the protected `Subject` (when protected headers are present) to equal the outer one - right for
     * a signed-only (`hp="clear"`) message, wrong for an encrypted one whose outer Subject is obscured. */
    compareSubject?: boolean;
}

/** Address header fields a message must carry at most once (RFC 5322 §3.6 allows exactly zero or one). */
const SINGLETON_ADDRESS_FIELDS = ["from", "to", "cc", "sender"];

function hasRepeatedAddressField(fields: MimeHeaderField[] | undefined): boolean {
    const counts = new Map<string, number>();
    for (const { name } of fields ?? []) {
        const key = name.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return SINGLETON_ADDRESS_FIELDS.some((name) => (counts.get(name) ?? 0) > 1);
}

function normalizePins(pins: string | string[] | undefined): string[] {
    return (Array.isArray(pins) ? pins : pins === undefined ? [] : [pins]).map((pin) => pin.toLowerCase());
}

/** Checks 2-4 from this module's doc comment for an already cryptographically verified signature.
 * Returns `undefined` when the signer is accepted, otherwise the failure reason.
 *
 * With no `pinnedSignerFingerprint` (or an empty array), check 2 is skipped and `undefined` means only that the
 * certificate names the sender consistently - NOT that the signer is trusted. Use `evaluateMessageSecurity()`
 * (which reports that case as `*_unverified_signer`) unless you enforce a pin yourself. */
export async function checkSignerBinding(input: SignerBindingInput): Promise<SignatureFailureReason | undefined> {
    const { protectedHeaders, outerHeaders } = input;
    const pins = normalizePins(input.pinnedSignerFingerprint);
    // Fail closed: an absent certificate hashes/extracts as empty, which can never match a pin or From.
    const certDer = input.signerCertificateDer ?? new Uint8Array();
    if (pins.length > 0 && !pins.includes(await computeCertFingerprint(certDer))) {
        return "untrusted_signer";
    }
    if (hasRepeatedAddressField(input.outerFields) || hasRepeatedAddressField(input.protectedFields)) {
        return "header_mismatch";
    }
    const outerFrom = extractAddresses(outerHeaders["from"]);
    const protectedFrom = extractAddresses(protectedHeaders?.from);
    const senderAddresses = protectedFrom.length > 0 ? protectedFrom : outerFrom;
    if (senderAddresses.length !== 1 || !extractCertificateEmails(certDer).includes(senderAddresses[0])) {
        return "signer_identity_mismatch";
    }
    const protectedTo = extractAddresses(protectedHeaders?.to);
    if (!sameAddressSet(senderAddresses, outerFrom) || (protectedTo.length > 0 && !sameAddressSet(protectedTo, extractAddresses(outerHeaders["to"])))) {
        return "header_mismatch";
    }
    if (protectedFrom.length > 0) {
        // RFC 9788 protected headers are present, so Cc (possibly absent on both sides) and - for a signed-only
        // message - Subject were signed: an outer copy that differs was changed (or added) after signing.
        if (!sameAddressSet(extractAddresses(protectedHeaders?.cc), extractAddresses(outerHeaders["cc"]))) {
            return "header_mismatch";
        }
        if (input.compareSubject && normalizeSubject(protectedHeaders?.subject) !== normalizeSubject(outerHeaders["subject"])) {
            return "header_mismatch";
        }
    }
    return undefined;
}

/**
 * Evaluates one received message's raw MIME source (see `mailApi.ts`'s `getMessageRawContent()`) into
 * a security state + recovered plaintext. Never throws — a parse failure, wrong key, or unrecognized
 * content type all degrade to a result the caller can render directly.
 *
 * `pinnedSignerFingerprints` - the sender's trusted signing-key fingerprint(s): `signingKeyFingerprints()` of the
 * sender's `Contact.keys` (see `contactsApi.ts`'s `fetchPinnedSigningFingerprints()`). The unlocked mailbox's own
 * `signingFingerprint` is always trusted too (mail this mailbox signed itself). Omitted or empty, a valid signature
 * from any other certificate is `*_unverified_signer`, never verified. `readerAddress` - the unlocked mailbox's own
 * address - enables `notAddressedToReader`.
 */
export async function evaluateMessageSecurity(
    rawMime: string,
    unlocked: { encryptionPrivateKey?: CryptoKey; encryptionCertDer?: Uint8Array; signingFingerprint?: string } | undefined,
    pinnedSignerFingerprints?: string | string[],
    readerAddress?: string,
): Promise<MessageSecurityResult> {
    const { headers, body, fields } = parseMimeEntity(rawMime);
    const rawContentType = headers["content-type"];
    if (!rawContentType) {
        return { state: "unprotected" };
    }
    const contentType = parseParameterizedHeader(rawContentType);
    const callerPins = normalizePins(pinnedSignerFingerprints);

    // The received message's own *real* outer envelope - what `HP-Outer`'s field copies (written at
    // send time, inside the encrypted content) are compared against to detect post-send tampering.
    const actualOuterHeaders: ComparableOuterHeaders = {
        from: headers["from"],
        to: headers["to"],
        cc: headers["cc"],
        date: headers["date"],
        subject: headers["subject"],
    };

    /** Runs checks 2-4 and resolves the trust outcome: a failure reason, or whether a pin matched. */
    const checkSigner = async (
        signerCertificateDer: Uint8Array | undefined,
        protectedHeaders: ProtectedHeaders | undefined,
        protectedFields: MimeHeaderField[] | undefined,
        compareSubject: boolean,
    ): Promise<{
        failure?: SignatureFailureReason;
        trusted: boolean;
        signer: Pick<MessageSecurityResult, "signerFingerprint" | "signerEmails">;
        acceptedSigner: Pick<MessageSecurityResult, "signerFingerprint" | "signerEmails" | "signerCertificate">;
    }> => {
        const certDer = signerCertificateDer ?? new Uint8Array();
        const fingerprint = await computeCertFingerprint(certDer);
        const signer = signerCertificateDer ? { signerFingerprint: fingerprint, signerEmails: extractCertificateEmails(certDer) } : {};
        // The certificate itself (for "trust this signer") only accompanies a signature that didn't fail - and an accepted
        // signer always has a certificate (a missing one fails the binding check closed), so `certDer` is the real one.
        const acceptedSigner = { ...signer, signerCertificate: toBase64(certDer) };
        const trustedPins = unlocked?.signingFingerprint ? [...callerPins, unlocked.signingFingerprint.toLowerCase()] : callerPins;
        const failure = await checkSignerBinding({
            signerCertificateDer,
            protectedHeaders,
            outerHeaders: headers,
            outerFields: fields,
            protectedFields,
            // Only pins the caller supplied make a mismatch a failure; the mailbox's own key alone never does.
            pinnedSignerFingerprint: callerPins.length > 0 ? trustedPins : undefined,
            compareSubject,
        });
        return { failure, trusted: trustedPins.includes(fingerprint), signer, acceptedSigner };
    };

    const addressing = (protectedHeaders: ProtectedHeaders | undefined): Pick<MessageSecurityResult, "notAddressedToReader"> => {
        const recipients = [...extractAddresses(protectedHeaders?.to), ...extractAddresses(protectedHeaders?.cc)];
        if (!readerAddress || recipients.length === 0) {
            return {};
        }
        return { notAddressedToReader: !recipients.includes(readerAddress.trim().toLowerCase()) };
    };

    const exposedHeaders = (protectedHeaders: ProtectedHeaders | undefined): Pick<MessageSecurityResult, "protectedHeaders"> => {
        if (!protectedHeaders || extractAddresses(protectedHeaders.from).length === 0) {
            return {};
        }
        const { from, to, cc, subject } = protectedHeaders;
        return { protectedHeaders: { from, to, ...(cc !== undefined ? { cc } : {}), subject } };
    };

    if (isSignedOnlyContentType(contentType.value)) {
        const parsed = await parseSignedOnlyMessage(rawContentType, body);
        if (!parsed.verified) {
            return { state: "signature_failed", signatureFailureReason: "invalid_signature" };
        }
        const { failure, trusted, signer, acceptedSigner } = await checkSigner(parsed.signerCertificateDer, parsed.protectedHeaders, parsed.protectedHeaderFields, true);
        if (failure) {
            return { state: "signature_failed", signatureFailureReason: failure, ...signer };
        }
        return {
            state: trusted ? "signed_verified" : "signed_unverified_signer",
            ...renderDisplayBody(parsed.displayBody),
            subject: parsed.protectedHeaders?.subject || undefined,
            ...exposedHeaders(parsed.protectedHeaders),
            attachments: parsed.attachments,
            ...acceptedSigner,
            ...addressing(parsed.protectedHeaders),
        };
    }

    if (isEncryptedContentType(contentType)) {
        if (!unlocked?.encryptionPrivateKey || !unlocked.encryptionCertDer) {
            return { state: "encrypted", decryptError: NO_KEY_ERROR };
        }
        const parsed = await parseEncryptedMessage(body, unlocked.encryptionCertDer, unlocked.encryptionPrivateKey, actualOuterHeaders);
        if (!parsed.decrypted) {
            return { state: "encrypted", decryptError: parsed.unsupportedContentEncryption ? UNSUPPORTED_ENCRYPTION_ERROR : NO_KEY_ERROR };
        }
        const content = {
            ...renderDisplayBody(parsed.displayBody),
            headerTamperDetected: parsed.headerTamperDetected,
            subject: parsed.protectedHeaders?.subject || undefined,
            ...exposedHeaders(parsed.protectedHeaders),
            attachments: parsed.attachments,
            ...addressing(parsed.protectedHeaders),
        };
        if (parsed.signatureVerified === undefined) {
            return { state: "encrypted", ...content };
        }
        if (!parsed.signatureVerified) {
            return { state: "signature_failed", signatureFailureReason: "invalid_signature", ...content };
        }
        const { failure, trusted, signer, acceptedSigner } = await checkSigner(parsed.signerCertificateDer, parsed.protectedHeaders, parsed.protectedHeaderFields, false);
        if (failure) {
            return { state: "signature_failed", signatureFailureReason: failure, ...content, ...signer };
        }
        return { state: trusted ? "encrypted_verified" : "encrypted_unverified_signer", ...content, ...acceptedSigner };
    }

    return { state: "unprotected" };
}
