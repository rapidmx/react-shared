///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Evaluates a *received* message's raw MIME source into one of `specs/end-to-end_encryption.md`'s
 * "Message Security Indicators" five states, and recovers the plaintext body when applicable. Reads the
 * outer envelope's own `Content-Type` (via `smimeMessage.ts`'s `splitHeadersAndBody()`) to decide
 * whether the message is one this system's own `buildSignedOnlyMessage()`/`buildEncryptedMessage()`
 * shape (`multipart/signed`, `application/pkcs7-mime; smime-type="enveloped-data"`) or neither.
 *
 * **Trust Model gap, disclosed not silent**: the spec's own Trust Model requires validating a signature
 * "against the known public key in the Contact's record" (TOFU pinning), not merely checking that the
 * embedded certificate's signature is mathematically self-consistent. `evaluateMessageSecurity()` takes
 * an optional `pinnedSignerFingerprint` for exactly this - when supplied, a cryptographically valid
 * signature whose embedded certificate doesn't match it is downgraded to `"signature_failed"` rather
 * than trusted. No caller passes it yet (Contact key-pinning UI is Phase 4's "Discovery & contacts UI"
 * work, not this pass) - every signature this module verifies today is checked for mathematical
 * validity only, not against a pinned identity.
 */
import { computeCertFingerprint } from "./smime.js";
import { ComparableOuterHeaders, parseEncryptedMessage, parseSignedOnlyMessage, splitHeadersAndBody } from "./smimeMessage.js";

export type MessageSecurityState = "encrypted" | "signed_verified" | "encrypted_verified" | "signature_failed" | "unprotected";

export interface MessageSecurityResult {
    state: MessageSecurityState;
    /** The verified/decrypted plaintext HTML this module recovered - still needs client-side
     * sanitization before touching the DOM (this module does none itself; see `MessageDetailPane.tsx`).
     * Absent for `"unprotected"` (the caller should keep using the server's own sanitized `/content`
     * body) and for an encrypted message this device couldn't open (see `decryptError`). */
    html?: string;
    /** Present only when the message was encrypted but this device couldn't decrypt it (a wrong or
     * since-rotated key, or corrupt/foreign data) - the caller should keep showing whatever
     * `GET /:id/content` already produced (empty, per `BaseMailComposeRoute.assembleRaw()`'s design)
     * alongside this explanation, rather than a blank pane with no context. */
    decryptError?: string;
    /** See `ParsedEncryptedMessage.headerTamperDetected`'s own doc comment - a deliberately separate,
     * orthogonal signal from `state`, since RFC 9788's `HP-Outer` is written on every encrypted message
     * regardless of whether it's also signed, and folding a header-mismatch into `"signature_failed"`
     * would misrepresent an unsigned-but-tampered message as a signature problem it doesn't have.
     * `undefined` for anything that isn't an encrypted message this device could decrypt (unprotected,
     * signed-only, or an encrypted message that failed to decrypt at all - nothing to compare). */
    headerTamperDetected?: boolean;
}

function isSignedOnlyContentType(contentType: string): boolean {
    return contentType.toLowerCase().trimStart().startsWith("multipart/signed");
}

/** Matches `buildEncryptedMessage()`'s own output shape, and leniently accepts the equivalent legacy/
 * AEAD `smime-type` values a foreign S/MIME sender could produce (mirrors `@rapidmx/restapi`'s own
 * server-side `SmimeUtils.isEncryptedBody()` classification, so the two systems agree on what counts as
 * encrypted). */
function isEncryptedContentType(contentType: string): boolean {
    const value = contentType.toLowerCase();
    if (value.trimStart().startsWith("multipart/encrypted")) {
        return true;
    }
    if (!value.includes("pkcs7-mime")) {
        return false;
    }
    return /smime-type\s*=\s*"?(enveloped-data|authenveloped-data)"?/.test(value);
}

const NO_KEY_ERROR = "This device doesn't have the key needed to decrypt this message.";

/**
 * Evaluates one received message's raw MIME source (see `mailApi.ts`'s `getMessageRawContent()`) into
 * a security state + recovered plaintext. Never throws — a parse failure, wrong key, or unrecognized
 * content type all degrade to a result the caller can render directly, matching `smime.ts`'s own
 * "malformed input is the signature-failed case, not an exception" contract.
 */
export async function evaluateMessageSecurity(
    rawMime: string,
    unlocked: { encryptionPrivateKey?: CryptoKey; encryptionCertDer?: Uint8Array } | undefined,
    pinnedSignerFingerprint?: string,
): Promise<MessageSecurityResult> {
    const { contentType, body, headers } = splitHeadersAndBody(rawMime);
    if (!contentType) {
        return { state: "unprotected" };
    }

    // The received message's own *real* outer envelope - what `HP-Outer`'s field copies (written at
    // send time, inside the encrypted content) are compared against to detect post-send tampering with
    // the unprotected envelope. Built from whichever of these five headers this outer envelope actually
    // has; a missing one is simply absent from the comparison (see `outerHeadersMatch()`).
    const actualOuterHeaders: ComparableOuterHeaders = {
        from: headers["from"],
        to: headers["to"],
        cc: headers["cc"],
        date: headers["date"],
        subject: headers["subject"],
    };

    async function checkPinning(signerCertificateDer: Uint8Array | undefined): Promise<boolean> {
        if (!pinnedSignerFingerprint || !signerCertificateDer) {
            return true;
        }
        return (await computeCertFingerprint(signerCertificateDer)) === pinnedSignerFingerprint;
    }

    if (isSignedOnlyContentType(contentType)) {
        const parsed = await parseSignedOnlyMessage(contentType, body);
        if (!parsed.verified || !(await checkPinning(parsed.signerCertificateDer))) {
            return { state: "signature_failed" };
        }
        return { state: "signed_verified", html: parsed.bodyText };
    }

    if (isEncryptedContentType(contentType)) {
        if (!unlocked?.encryptionPrivateKey || !unlocked.encryptionCertDer) {
            return { state: "encrypted", decryptError: NO_KEY_ERROR };
        }
        const parsed = await parseEncryptedMessage(body, unlocked.encryptionCertDer, unlocked.encryptionPrivateKey, actualOuterHeaders);
        if (!parsed.decrypted) {
            return { state: "encrypted", decryptError: NO_KEY_ERROR };
        }
        if (parsed.signatureVerified === undefined) {
            return { state: "encrypted", html: parsed.bodyText, headerTamperDetected: parsed.headerTamperDetected };
        }
        if (parsed.signatureVerified && (await checkPinning(parsed.signerCertificateDer))) {
            return { state: "encrypted_verified", html: parsed.bodyText, headerTamperDetected: parsed.headerTamperDetected };
        }
        return { state: "signature_failed", html: parsed.bodyText, headerTamperDetected: parsed.headerTamperDetected };
    }

    return { state: "unprotected" };
}
