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
// differently - see that repo's LocalX509CertificateAuthority.ts). The raw (`crypto`, `crypto.subtle`)
// three-argument form, not `new pkijs.CryptoEngine({...})` - pkijs's own `CryptoEngine` class doesn't
// actually satisfy its own `ICryptoEngine` interface (a real type-definition inconsistency in pkijs
// itself, confirmed via `tsc --noEmit`: `generateKey`'s Ed25519/X25519 overloads don't line up between
// the two), so passing an instance of it here fails to compile even though it works at runtime.
pkijs.setEngine("rapidmx", crypto, crypto.subtle);

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
 * Builds an *opaque* (content embedded, not detached) CMS `SignedData` structure over `content`.
 * Used only when the signed message is going to be encrypted immediately afterward (`buildMessage()`
 * in `smimeMessage.ts` composes this with `encryptForRecipients()` for the combined sign-then-encrypt
 * case) — the spec's "Digital Signatures" section requires *detached* signing only "for
 * signature-only messages"; once the whole thing is being encrypted regardless, there is no legacy
 * client ever exposed to this intermediate opaque layer, so embedding the content here (simpler than
 * building a second detached `multipart/signed` entity solely to immediately encrypt it) is
 * conformant, not a shortcut around that requirement.
 */
export async function signOpaque(content: Uint8Array, signingCertDer: Uint8Array, signingPrivateKey: CryptoKey): Promise<Uint8Array> {
    const cert = parseCertificate(signingCertDer);
    const signedData = new pkijs.SignedData({
        encapContentInfo: new pkijs.EncapsulatedContentInfo({
            eContentType: pkijs.ContentInfo.DATA,
            eContent: new asn1js.OctetString({ valueHex: toArrayBuffer(content) }),
        }),
        signerInfos: [
            new pkijs.SignerInfo({
                sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
            }),
        ],
        certificates: [cert],
    });
    await signedData.sign(signingPrivateKey, 0, DIGEST_ALGORITHM);

    const contentInfo = new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.SIGNED_DATA, content: signedData.toSchema(true) });
    return new Uint8Array(contentInfo.toSchema().toBER());
}

export interface VerifyOpaqueResult extends VerifyResult {
    /** The embedded content, recovered from the SignedData structure - only present when `valid`. */
    content?: Uint8Array;
}

/** Verifies an opaque CMS signature (as produced by `signOpaque()`) and recovers its embedded
 * content — unlike `verifyDetached()`, the content isn't supplied separately by the caller, since the
 * whole point of an opaque signature is that it carries its own content. */
export async function verifyOpaque(signedDer: Uint8Array): Promise<VerifyOpaqueResult> {
    let contentInfo: pkijs.ContentInfo;
    try {
        contentInfo = pkijs.ContentInfo.fromBER(toArrayBuffer(signedDer));
    } catch {
        return { valid: false };
    }
    if (contentInfo.contentType !== pkijs.ContentInfo.SIGNED_DATA) {
        return { valid: false };
    }

    let signedData: pkijs.SignedData;
    let valid: boolean;
    try {
        signedData = new pkijs.SignedData({ schema: contentInfo.content });
        valid = await signedData.verify({ signer: 0 });
    } catch {
        return { valid: false };
    }

    // Same defensive, not-reachable-through-signOpaque()'s-own-path branch as verifyDetached() above -
    // see that function's identical comment.
    const signerCertificate = signedData.certificates?.[0];
    const signerCertificateDer =
        signerCertificate && signerCertificate instanceof pkijs.Certificate
            ? new Uint8Array(signerCertificate.toSchema().toBER())
            : undefined;
    // No external `data` is ever passed to verify() in this function - a detached signature (no
    // eContent) can only ever fail to verify here, never succeed, so `valid` being true guarantees
    // eContent is present; this isn't optional defensive handling for a case that can't occur.
    // `.getValue()`, not `.valueBlock.valueHexView` directly - eContent commonly round-trips as a
    // *constructed* OctetString (an outer OctetString wrapping one or more inner primitive OctetString
    // chunks, standard per RFC 5652), and only `.getValue()` transparently concatenates those chunks;
    // reading `.valueBlock.valueHexView` directly is only correct for a primitive OctetString and
    // silently returns empty bytes otherwise (confirmed by direct reproduction).
    const content = valid ? new Uint8Array(signedData.encapContentInfo.eContent!.getValue()) : undefined;
    return { valid, signerCertificateDer, content };
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

/** SHA-256 fingerprint of a DER certificate, hex encoded — matches `keyvaultApi.ts`'s own `PublicKey.
 * fingerprint` format exactly, so a value computed here is directly comparable against one already on
 * a `Mailbox`/`Contact` record. Used by `messageSecurity.ts` to compare a received message's embedded
 * signer certificate against a pinned `Contact` key per the spec's Trust Model (TOFU) — `verifyDetached()`/
 * `verifyOpaque()` only prove a signature is mathematically valid, never that the certificate belongs to
 * who the message claims (see `VerifyResult`'s own doc comment). */
export async function computeCertFingerprint(certDer: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(DIGEST_ALGORITHM, toArrayBuffer(certDer));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
