///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The CMS (S/MIME) engine behind `specs/end-to-end_encryption.md`'s "Message Format" requirement
 * ("RapidMX MUST use S/MIME (CMS) as the on-the-wire message format for both signatures and
 * encryption"). This module operates on raw CMS structures (`SignedData`/`EnvelopedData`) via
 * `pkijs` — the actual MIME assembly (`multipart/signed`, RFC 9788 header protection, the
 * `application/pkcs7-mime` wrapping) is a distinct, mechanical layer built on top of these
 * primitives, not implemented here.
 *
 * Certificates are always the base64-decoded DER bytes — the same wire format
 * `keyvaultApi.ts`'s `PublicKey.publicKey` already uses — never PEM, so this module composes
 * directly with values read from a `Mailbox`/`Contact`'s `keys` array with no reformatting.
 */
import "reflect-metadata";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// Mirrors keys.ts's own WebCrypto engine setup - both @peculiar/x509 and pkijs need to be told which
// Crypto implementation to use; the browser/Electron renderer's own global `crypto` is exactly what
// both expect (unlike Node's global `crypto`, which @rapidmx/restapi's server-side code has to set up
// differently - see that repo's LocalX509CertificateAuthority.ts).
pkijs.setEngine("rapidmx", crypto, new pkijs.CryptoEngine({ name: "rapidmx", crypto, subtle: crypto.subtle }));

/** SHA-256 detached signatures throughout, matching this system's hash-algorithm default everywhere
 * else (fingerprints, HKDF). */
const DIGEST_ALGORITHM = "SHA-256";

/** AES-256-GCM for CMS content encryption, matching `masterKey.ts`'s own AEAD choice - one AEAD
 * construction used consistently across this entire E2E scheme. */
const CONTENT_ENCRYPTION_ALGORITHM: AesKeyGenParams = { name: "AES-GCM", length: 256 };

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function parseCertificate(certDer: Uint8Array): pkijs.Certificate {
    const asn1 = asn1js.fromBER(toArrayBuffer(certDer));
    if (asn1.offset === -1) {
        throw new Error("Could not parse the certificate as valid DER/BER.");
    }
    return new pkijs.Certificate({ schema: asn1.result });
}

/**
 * Builds a detached CMS `SignedData` structure over `content`, per the spec's "Digital Signatures"
 * section — detached, never opaque, so clients that don't understand S/MIME still render the
 * message body. The signer's own certificate is embedded in the `certificates` field (never sent
 * separately — unlike the encryption key, which travels in the `RapidMX-Key` header).
 */
export async function signDetached(content: Uint8Array, signingCertDer: Uint8Array, signingPrivateKey: CryptoKey): Promise<Uint8Array> {
    const cert = parseCertificate(signingCertDer);
    const signedData = new pkijs.SignedData({
        // No `eContent` - an omitted eContent is exactly what makes this a *detached* signature per
        // RFC 5652; the actual content is passed to sign()/verify() separately, never embedded here.
        encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: pkijs.ContentInfo.DATA }),
        signerInfos: [
            new pkijs.SignerInfo({
                sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
            }),
        ],
        certificates: [cert],
    });
    await signedData.sign(signingPrivateKey, 0, DIGEST_ALGORITHM, toArrayBuffer(content));

    const contentInfo = new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.SIGNED_DATA, content: signedData.toSchema(true) });
    return new Uint8Array(contentInfo.toSchema().toBER());
}

export interface VerifyResult {
    valid: boolean;
    /** The signer's certificate as embedded in the SignedData structure, if present - callers
     * compare its fingerprint against the pinned `Contact` key per the spec's Trust Model (TOFU);
     * this function only proves the signature is mathematically valid over `content`, not that the
     * certificate belongs to who the message claims. */
    signerCertificateDer?: Uint8Array;
}

/** Verifies a detached CMS signature (as produced by `signDetached()`) against `content`. A parse
 * failure or content-type mismatch is treated as an invalid signature (`valid: false`), not a thrown
 * error - a malformed/foreign CMS blob is exactly the "signature failed" case the spec's Message
 * Security Indicators table requires being able to render. */
export async function verifyDetached(content: Uint8Array, signatureDer: Uint8Array): Promise<VerifyResult> {
    let contentInfo: pkijs.ContentInfo;
    try {
        contentInfo = pkijs.ContentInfo.fromBER(toArrayBuffer(signatureDer));
    } catch {
        return { valid: false };
    }
    if (contentInfo.contentType !== pkijs.ContentInfo.SIGNED_DATA) {
        return { valid: false };
    }

    // Constructing SignedData from an untrusted schema, and verify() itself, can both throw on a
    // structurally-valid-BER-but-not-actually-SignedData blob (e.g. the right contentType with the
    // wrong content shape) - either failure degrades to "signature failed," never a thrown error, per
    // the spec's Message Security Indicators (a malformed CMS blob is exactly that state, not a crash).
    let signedData: pkijs.SignedData;
    let valid: boolean;
    try {
        signedData = new pkijs.SignedData({ schema: contentInfo.content });
        valid = await signedData.verify({ signer: 0, data: toArrayBuffer(content) });
    } catch {
        return { valid: false };
    }

    // `certificates` is a CertificateSetItem union (Certificate | AttributeCertificateV1/V2 |
    // OtherCertificateFormat) - `signDetached()` only ever embeds a plain Certificate, so the
    // non-Certificate branch here is defensive against a foreign/malformed CMS blob, not reachable
    // through this module's own signing path (not exercised in tests for that reason).
    const signerCertificate = signedData.certificates?.[0];
    const signerCertificateDer =
        signerCertificate && signerCertificate instanceof pkijs.Certificate
            ? new Uint8Array(signerCertificate.toSchema().toBER())
            : undefined;
    return { valid, signerCertificateDer };
}

/**
 * Builds a CMS `EnvelopedData` structure encrypting `content` to every certificate in
 * `recipientCertDers` — per the spec's "Encrypt to Self" requirement, callers MUST include the
 * sender's own encryption certificate in this list alongside the actual recipients' certificates, or
 * the sender's own Sent-folder copy becomes unreadable to them.
 */
export async function encryptForRecipients(content: Uint8Array, recipientCertDers: Uint8Array[]): Promise<Uint8Array> {
    const envelopedData = new pkijs.EnvelopedData();
    for (const certDer of recipientCertDers) {
        envelopedData.addRecipientByCertificate(parseCertificate(certDer));
    }
    await envelopedData.encrypt(CONTENT_ENCRYPTION_ALGORITHM, toArrayBuffer(content));

    const contentInfo = new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.ENVELOPED_DATA, content: envelopedData.toSchema() });
    return new Uint8Array(contentInfo.toSchema().toBER());
}

/**
 * Decrypts a CMS `EnvelopedData` structure using one recipient's own certificate/private key.
 * `EnvelopedData` doesn't label which `RecipientInfo` belongs to which recipient in a way this
 * function's own caller already knows in advance, so it tries every recipient slot in turn with the
 * one keypair it has, succeeding on whichever slot was actually built for it and discarding the rest
 * — the same shape as trying every wrapped-key entry in `KeyVault.masterKeyWraps` until one unwraps.
 */
export async function decryptEnvelopedData(
    envelopedDer: Uint8Array,
    recipientCertDer: Uint8Array,
    recipientPrivateKey: CryptoKey,
): Promise<Uint8Array> {
    const contentInfo = pkijs.ContentInfo.fromBER(toArrayBuffer(envelopedDer));
    if (contentInfo.contentType !== pkijs.ContentInfo.ENVELOPED_DATA) {
        throw new Error("This CMS content is not EnvelopedData.");
    }
    const envelopedData = new pkijs.EnvelopedData({ schema: contentInfo.content });
    const recipientCertificate = parseCertificate(recipientCertDer);

    let lastError: unknown;
    for (let index = 0; index < envelopedData.recipientInfos.length; index++) {
        try {
            const decrypted = await envelopedData.decrypt(index, { recipientCertificate, recipientPrivateKey });
            return new Uint8Array(decrypted);
        } catch (err) {
            lastError = err;
        }
    }
    // The `new Error(...)` fallback covers an EnvelopedData with zero recipientInfos (the loop body
    // never runs, so `lastError` stays its initial `undefined`) - not reachable through this module's
    // own encryptForRecipients(), which always adds at least one recipient in practice, but kept as a
    // defensive fallback since `lastError` could otherwise surface as a non-Error thrown value.
    throw lastError instanceof Error ? lastError : new Error("No recipient slot in this EnvelopedData could be decrypted with this key.");
}
