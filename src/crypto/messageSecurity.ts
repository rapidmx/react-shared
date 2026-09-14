///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Evaluates a *received* message's raw MIME source into one of `specs/end-to-end_encryption.md`'s
 * "Message Security Indicators" five states, and recovers the plaintext body when applicable. Reads the
 * outer envelope's own `Content-Type` (via `mime.ts`'s `parseMimeEntity()`) to decide whether the message
 * is `multipart/signed`, `application/pkcs7-mime; smime-type="enveloped-data"`, or neither.
 *
 * **What a verified state means.** `"signed_verified"`/`"encrypted_verified"` require ALL of: (1) a
 * cryptographically valid CMS signature (`smime.ts` - detached signatures carrying their own eContent are
 * rejected, and the signer certificate is the one matched to the SignerInfo, never simply the first
 * embedded certificate); (2) when `pinnedSignerFingerprint` is supplied, that signer certificate's
 * fingerprint matches it - and a supplied pin with no resolvable certificate fails closed; (3) the signer
 * certificate names the sender: one of its email addresses (SAN rfc822Name, else subject emailAddress /
 * email-shaped CN) equals the single address in the protected `From` (or the outer `From` when the signed
 * content carries no protected headers, as with non-RFC 9788 senders); (4) the protected `From`/`To`
 * address sets (when present) equal the outer envelope's - the outer envelope is what the mail list and
 * reading pane display as the sender. Any failure downgrades to `"signature_failed"`, with `signatureFailureReason` saying which check failed.
 * The state union itself is unchanged (a distinct identity-mismatch state would break existing
 * exhaustive consumers); the reason is an additive, optional field.
 *
 * **Trust Model gap, disclosed not silent**: the spec's own Trust Model requires validating a signature
 * "against the known public key in the Contact's record" (TOFU pinning). Without a
 * `pinnedSignerFingerprint`, check 2 is skipped and a self-issued certificate naming the sender's address
 * passes checks 1, 3 and 4 - callers that have a pinned Contact key MUST pass it.
 */
import { DisplayBody, extractAddresses, parseMimeEntity, parseParameterizedHeader, plainTextToHtml } from "./mime.js";
import { computeCertFingerprint, extractCertificateEmails } from "./smime.js";
import { ComparableOuterHeaders, ProtectedHeaders, parseEncryptedMessage, parseSignedOnlyMessage } from "./smimeMessage.js";

export type MessageSecurityState = "encrypted" | "signed_verified" | "encrypted_verified" | "signature_failed" | "unprotected";

/** Why a message is `"signature_failed"`. `invalid_signature`: the CMS signature itself is malformed or
 * doesn't verify over the content. `untrusted_signer`: a pinned fingerprint was supplied and the signer
 * certificate doesn't match it (or no signer certificate could be resolved at all).
 * `signer_identity_mismatch`: the signer certificate doesn't name the message's `From` address (or `From`
 * doesn't hold exactly one address). `header_mismatch`: the signed/protected `From`/`To` disagree with
 * the outer envelope's. */
export type SignatureFailureReason = "invalid_signature" | "untrusted_signer" | "signer_identity_mismatch" | "header_mismatch";

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
     * recovered (`signed_verified`/`encrypted`/`encrypted_verified`/`signature_failed` after decrypt). */
    subject?: string;
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

export interface SignerBindingInput {
    /** The certificate matched to the verified SignerInfo; `undefined` fails closed. */
    signerCertificateDer: Uint8Array | undefined;
    /** Headers recovered from inside the signed content (RFC 9788), if any. */
    protectedHeaders: Pick<ProtectedHeaders, "from" | "to"> | undefined;
    /** The received message's outer header map (lowercased names), as `parseMimeEntity()` returns it. */
    outerHeaders: Record<string, string>;
    pinnedSignerFingerprint?: string;
}

/** Checks 2-4 from this module's doc comment for an already cryptographically verified signature.
 * Returns `undefined` when the signer is accepted, otherwise the failure reason. */
export async function checkSignerBinding(input: SignerBindingInput): Promise<SignatureFailureReason | undefined> {
    const { protectedHeaders, outerHeaders, pinnedSignerFingerprint } = input;
    // Fail closed: an absent certificate hashes/extracts as empty, which can never match a pin or From.
    const certDer = input.signerCertificateDer ?? new Uint8Array();
    if (pinnedSignerFingerprint !== undefined && (await computeCertFingerprint(certDer)) !== pinnedSignerFingerprint.toLowerCase()) {
        return "untrusted_signer";
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
    return undefined;
}

/**
 * Evaluates one received message's raw MIME source (see `mailApi.ts`'s `getMessageRawContent()`) into
 * a security state + recovered plaintext. Never throws — a parse failure, wrong key, or unrecognized
 * content type all degrade to a result the caller can render directly.
 */
export async function evaluateMessageSecurity(
    rawMime: string,
    unlocked: { encryptionPrivateKey?: CryptoKey; encryptionCertDer?: Uint8Array } | undefined,
    pinnedSignerFingerprint?: string,
): Promise<MessageSecurityResult> {
    const { headers, body } = parseMimeEntity(rawMime);
    const rawContentType = headers["content-type"];
    if (!rawContentType) {
        return { state: "unprotected" };
    }
    const contentType = parseParameterizedHeader(rawContentType);

    // The received message's own *real* outer envelope - what `HP-Outer`'s field copies (written at
    // send time, inside the encrypted content) are compared against to detect post-send tampering.
    const actualOuterHeaders: ComparableOuterHeaders = {
        from: headers["from"],
        to: headers["to"],
        cc: headers["cc"],
        date: headers["date"],
        subject: headers["subject"],
    };

    const checkSigner = (signerCertificateDer: Uint8Array | undefined, protectedHeaders: ProtectedHeaders | undefined) =>
        checkSignerBinding({ signerCertificateDer, protectedHeaders, outerHeaders: headers, pinnedSignerFingerprint });

    if (isSignedOnlyContentType(contentType.value)) {
        const parsed = await parseSignedOnlyMessage(rawContentType, body);
        if (!parsed.verified) {
            return { state: "signature_failed", signatureFailureReason: "invalid_signature" };
        }
        const failure = await checkSigner(parsed.signerCertificateDer, parsed.protectedHeaders);
        if (failure) {
            return { state: "signature_failed", signatureFailureReason: failure };
        }
        return { state: "signed_verified", ...renderDisplayBody(parsed.displayBody), subject: parsed.protectedHeaders?.subject || undefined };
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
        };
        if (parsed.signatureVerified === undefined) {
            return { state: "encrypted", ...content };
        }
        if (!parsed.signatureVerified) {
            return { state: "signature_failed", signatureFailureReason: "invalid_signature", ...content };
        }
        const failure = await checkSigner(parsed.signerCertificateDer, parsed.protectedHeaders);
        if (failure) {
            return { state: "signature_failed", signatureFailureReason: failure, ...content };
        }
        return { state: "encrypted_verified", ...content };
    }

    return { state: "unprotected" };
}
